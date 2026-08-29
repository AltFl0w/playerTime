"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { engine } from "./engine";
import type { GameEvent, GameState, PlayerId } from "./types";
import {
  emptyStore,
  loadStore,
  saveStore,
  type GameRecord,
  type Store,
} from "./store";
import { demoStore } from "./testing/demo";
import { startAlarm, stopAlarm, unlockAudio } from "./lib/alarm";
import { useWakeLock } from "./lib/wakeLock";
import { useLiveHistoryTrap } from "./lib/historyTrap";
import { formatUndone, lastUndoableSlice, undoLastCoachAction } from "./lib/undo";
import { SetupScreen } from "./ui/SetupScreen";
import { PreGameScreen } from "./ui/PreGameScreen";
import { LiveScreen, type LiveAlarm } from "./ui/LiveScreen";
import { ReportScreen } from "./ui/ReportScreen";
import { Toast } from "./ui/Toast";
import { A2HSNudge } from "./ui/A2HSNudge";
import { btnPrimary } from "./ui/bits";

type Screen = "setup" | "pregame" | "live" | "report";

const EMPTY_EVENTS: GameEvent[] = [];

const ROOT_CLASSES =
  "pt-app min-h-dvh bg-canvas px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-ink";

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [screen, setScreen] = useState<Screen>(() =>
    store.game
      ? store.game.events.some((e) => e.type === "END")
        ? "report"
        : "live"
      : store.roster.length === 0
        ? "setup"
        : "pregame",
  );
  const [now, setNow] = useState(() => Date.now());
  const [alarm, setAlarm] = useState<LiveAlarm | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const intervalFiredRef = useRef<number>(
    Math.floor(
      (store.game?.events.length ?? 0) > 0
        ? (engine.computeState(store.game?.events ?? EMPTY_EVENTS, store.config, store.roster)
            .elapsedSec +
            (store.game?.runningSinceMs
              ? Math.max(0, Math.floor((Date.now() - store.game.runningSinceMs) / 1000))
              : 0)) /
            Math.max(1, store.config.subIntervalSec)
        : 0,
    ),
  );
  const prevForcedRef = useRef(false);
  const alarmOpenRef = useRef(false);

  function showToast(text: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    saveStore(store);
  }, [store]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("pt-sun", store.sunMode);
  }, [store.sunMode]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") unlockAudio();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const game = store.game;
  const events = game?.events ?? EMPTY_EVENTS;

  const baseState = useMemo(
    () => engine.computeState(events, store.config, store.roster),
    [events, store.config, store.roster],
  );

  // Authoritative time = event-derived elapsed + wall offset since the open
  // segment began; survives refreshes via the persisted runningSinceMs.
  const clockRunning = !!game && baseState.clockRunning && !baseState.ended;

  useWakeLock(screen === "live" && !!game && !baseState.ended);
  useLiveHistoryTrap(screen === "live" && !!game && !baseState.ended);

  useEffect(() => {
    // Pregame gets the same scroll lock as live: the coach is glancing at this
    // screen right up to kickoff and a rubber-banding page reads as broken.
    const live =
      (screen === "live" && !!game && !baseState.ended) || screen === "pregame";
    document.documentElement.classList.toggle("pt-live", live);
    return () => document.documentElement.classList.remove("pt-live");
  }, [screen, game, baseState.ended]);

  useEffect(() => {
    if (screen !== "live") return;
    const onDown = () => unlockAudio();
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [screen]);
  const elapsedSec =
    baseState.elapsedSec +
    (game?.runningSinceMs ? Math.max(0, Math.floor((now - game.runningSinceMs) / 1000)) : 0);

  // Quarter pacing: the app is the timekeeper. At each boundary it pauses
  // itself (water break — clock AND stints freeze) until the coach starts the
  // next quarter; at the final whistle it offers the report.
  const quarterLenSec = Math.max(
    1,
    Math.round(store.config.gameLengthSec / Math.max(1, store.config.quarterCount)),
  );
  const quarter = Math.max(
    1,
    Math.min(store.config.quarterCount, Math.ceil(elapsedSec / quarterLenSec)),
  );
  // A break is any pause that lands exactly on a boundary (auto or manual).
  const atBreak =
    !!game && !baseState.ended && !clockRunning && elapsedSec > 0 && elapsedSec % quarterLenSec === 0;
  const isFinalBreak = atBreak && quarter >= store.config.quarterCount;

  // Auto-pause exactly once per boundary, detected by crossing rather than
  // landing exactly on it — a sleeping screen can skip the exact second.
  // Backdated to the boundary: the app is the timekeeper, so overshoot from
  // the missed render is discarded, not credited to the quarter.
  const autoPausedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!clockRunning || !game || baseState.ended) return;
    const boundary = Math.floor(elapsedSec / quarterLenSec) * quarterLenSec;
    if (boundary > 0 && elapsedSec >= boundary && autoPausedAtRef.current !== boundary) {
      autoPausedAtRef.current = boundary;
      stopAlarm();
      setAlarm(null);
      alarmOpenRef.current = false;
      pushEvents([{ type: "PAUSE", atSec: boundary }]);
      patchGame((g) => ({ ...g, runningSinceMs: null }));
    }
  });

  // The engine is a pure function of events with no "now" parameter, so while
  // the clock runs we ask it for the world frozen at *this second* by computing
  // against a temporary PAUSE. Real log stays untouched.
  const state: GameState = useMemo(() => {
    if (!clockRunning) return baseState;
    return engine.computeState(
      [...events, { type: "PAUSE", atSec: elapsedSec }],
      store.config,
      store.roster,
    );
  }, [baseState, clockRunning, events, elapsedSec, store.config, store.roster]);

  useEffect(() => {
    if (screen !== "live" || !clockRunning) return;
    // Poll at 250ms for resume responsiveness, but only commit a state update
    // when the displayed second actually changes — elapsedSec ticks once a
    // second, so the other three polls a second would otherwise re-render
    // the whole live screen for nothing.
    const id = setInterval(() => {
      setNow((prev) => {
        const t = Date.now();
        const since = game?.runningSinceMs;
        if (!since) return t;
        const prevSec = Math.max(0, Math.floor((prev - since) / 1000));
        const nextSec = Math.max(0, Math.floor((t - since) / 1000));
        return prevSec === nextSec ? prev : t;
      });
    }, 250);
    return () => clearInterval(id);
  }, [screen, clockRunning, game?.runningSinceMs]);

  function patchGame(fn: (g: GameRecord) => GameRecord) {
    setStore((s) => (s.game ? { ...s, game: fn(s.game) } : s));
  }

  // Event stamps use fresh wall time, not the render-cached `now` — a stale
  // tick (backgrounded tab, iOS timer suspension) must never date an event
  // in the past, and the display snaps forward with it via setNow.
  function currentElapsedSec(): number {
    const t = Date.now();
    setNow(t);
    return (
      baseState.elapsedSec +
      (game?.runningSinceMs ? Math.max(0, Math.floor((t - game.runningSinceMs) / 1000)) : 0)
    );
  }

  function pushEvents(newEvents: GameEvent[]) {
    patchGame((g) => ({ ...g, events: [...g.events, ...newEvents] }));
  }

  function startGame(presentIds: string[]) {
    const t = Date.now();
    const evts: GameEvent[] = store.roster.map(
      (p): GameEvent => ({
        type: "SET_AVAILABILITY",
        atSec: 0,
        playerId: p.id,
        available: presentIds.includes(p.id),
      }),
    );
    // Starters: first playersOnField present kids by roster order. The first
    // interval alarm rebalances from there.
    const starters = store.roster.filter((p) => presentIds.includes(p.id)).slice(
      0,
      Math.max(0, store.config.playersOnField),
    );
    for (const p of starters) {
      evts.push({ type: "SUB_IN", atSec: 0, playerId: p.id });
    }
    evts.push({ type: "START", atSec: 0 });
    intervalFiredRef.current = 0;
    prevForcedRef.current = false;
    stopAlarm();
    setAlarm(null);
    alarmOpenRef.current = false;
    setStore((s) => ({
      ...s,
      game: { events: evts, runningSinceMs: t, startedAtMs: t, pendingSwaps: [] },
    }));
    setNow(t);
    setScreen("live");
  }

  function pauseToggle() {
    if (!game || baseState.ended) return;
    if (clockRunning) {
      pushEvents([{ type: "PAUSE", atSec: elapsedSec }]);
      patchGame((g) => ({ ...g, runningSinceMs: null }));
    } else {
      const t = Date.now();
      pushEvents([{ type: "RESUME", atSec: elapsedSec }]);
      patchGame((g) => ({ ...g, runningSinceMs: t }));
      setNow(t);
    }
  }

  function endGame() {
    stopAlarm();
    setAlarm(null);
    alarmOpenRef.current = false;
    pushEvents([{ type: "END", atSec: elapsedSec }]);
    patchGame((g) => ({ ...g, runningSinceMs: null }));
    setScreen("report");
  }

  function newGame() {
    setStore((s) => ({ ...s, game: null }));
    setScreen("pregame");
  }

  // Alarm orchestration: forced heat cap outranks the interval alarm. Either
  // way the alarm just beeps and pre-stages a suggestion on the board — the
  // coach edits by tapping and applies at the whistle.
  useEffect(() => {
    const wasForced = prevForcedRef.current;
    const forcedNow = !!state.forcedSwap;

    if (screen !== "live" || !game || !clockRunning || state.ended) return;
    if (alarmOpenRef.current) return;
    prevForcedRef.current = forcedNow;

    const idx = Math.floor(elapsedSec / Math.max(1, store.config.subIntervalSec));
    if (forcedNow && !wasForced) {
      openAlarm({ kind: "forced", outId: topSuggestOut(), inId: topSuggestIn() });
    } else if (idx > intervalFiredRef.current) {
      intervalFiredRef.current = idx;
      openAlarm({ kind: "interval", outId: topSuggestOut(), inId: topSuggestIn() });
    }
  }, [state, elapsedSec, screen, game, clockRunning, store.config]);

  // Shield nudges but never blanks the suggestion: with everyone fresh
  // (early game) fall back to the least-bad pull.
  function topSuggestOut(): PlayerId | null {
    const ranked = engine.rankOutCandidates(state, store.config);
    return ranked.find((c) => c.eligible)?.playerId ?? ranked[0]?.playerId ?? null;
  }

  function topSuggestIn(): PlayerId | null {
    return engine.rankInCandidates(state)[0]?.playerId ?? null;
  }

  function openAlarm(a: LiveAlarm) {
    alarmOpenRef.current = true;
    setAlarm(a);
    startAlarm();
  }

  function dismissAlarm() {
    alarmOpenRef.current = false;
    stopAlarm();
    unlockAudio();
    setAlarm(null);
  }

  // One batch for a whole line change: all OUTs then all INs at this second.
  function applyChange(outIds: PlayerId[], inIds: PlayerId[]) {
    const at = currentElapsedSec();
    // Sending a declined kid in IS the ready signal. Everything one gesture
    // produces shares one atSec and one push, so Undo reverts it as a unit.
    const readies = inIds.filter((id) => state.players[id]?.availability === "declined_wait");
    const evts: GameEvent[] = [
      ...readies.map((playerId): GameEvent => ({ type: "MARK_READY", atSec: at, playerId })),
      ...outIds.map((playerId): GameEvent => ({ type: "SUB_OUT", atSec: at, playerId })),
      ...inIds.map((playerId): GameEvent => ({ type: "SUB_IN", atSec: at, playerId })),
    ];
    if (evts.length === 0) return;
    pushEvents(evts);
    const n = outIds.length + inIds.length;
    showToast(n === 1 ? "Done" : `Changed ${outIds.length}↔${inIds.length}`);
  }

  // "Hurt / going home": pull from the field (if on it) and mark gone in one
  // batch at one atSec — Undo restores both together.
  function leaveGame(id: PlayerId) {
    const at = currentElapsedSec();
    const evts: GameEvent[] = [];
    if (state.players[id]?.onField) evts.push({ type: "SUB_OUT", atSec: at, playerId: id });
    evts.push({ type: "SET_AVAILABILITY", atSec: at, playerId: id, available: false });
    pushEvents(evts);
    showToast(`${byId.get(id)?.name.split(" ")[0] ?? "Player"} out of the game`);
  }

  // "Wrong kid" repair: the tapped kid never actually went in — someone else
  // did. Rewrite his most recent SUB_IN to the right kid; the engine replay
  // moves the whole stint's minutes automatically.
  function fixMistake(wrongId: PlayerId, rightId: PlayerId) {
    patchGame((g) => {
      const idx = [...g.events]
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.type === "SUB_IN" && e.playerId === wrongId)
        .map(({ i }) => i)
        .pop();
      if (idx === undefined) return g;
      const events = g.events.map((e, i) =>
        i === idx && e.type === "SUB_IN" ? { ...e, playerId: rightId } : e,
      );
      return { ...g, events };
    });
    showToast(
      `Fixed — that was ${byId.get(rightId)?.name.split(" ")[0] ?? "them"}, not ${byId.get(wrongId)?.name.split(" ")[0] ?? ""}`,
    );
  }

  function undoLast() {
    if (!game || alarm) return;
    const result = undoLastCoachAction(game);
    if (!result) return;
    patchGame(() => result.game);
    showToast(formatUndone(result.undone, (id) => byId.get(id)?.name ?? ""));
  }

  function toggleSun() {
    setStore((s) => ({ ...s, sunMode: !s.sunMode }));
  }

  const byId = useMemo(() => new Map(store.roster.map((p) => [p.id, p])), [store.roster]);

  return (
    <div className={ROOT_CLASSES}>
      {(screen === "setup" || screen === "pregame") && (
        <div className="mx-auto mb-3 max-w-md">
          <A2HSNudge />
        </div>
      )}
      {screen === "setup" && (
        <SetupScreen
          roster={store.roster}
          onSave={(p) =>
            setStore((s) => ({
              ...s,
              roster: s.roster.some((x) => x.id === p.id)
                ? s.roster.map((x) => (x.id === p.id ? p : x))
                : [...s.roster, p],
            }))
          }
          onDelete={(id) =>
            setStore((s) => ({ ...s, roster: s.roster.filter((p) => p.id !== id) }))
          }
          onNext={() => setScreen("pregame")}
          onLoadDemo={() => {
            setStore(demoStore());
            setScreen("report");
          }}
          onEraseAll={() => {
            stopAlarm();
            setAlarm(null);
            alarmOpenRef.current = false;
            intervalFiredRef.current = 0;
            prevForcedRef.current = false;
                    setStore(emptyStore());
            setScreen("setup");
          }}
        />
      )}

      {screen === "pregame" && (
        <PreGameScreen
          roster={store.roster}
          config={store.config}
          onConfigChange={(config) => setStore((s) => ({ ...s, config }))}
          onStart={startGame}
          onBackToSetup={() => setScreen("setup")}
          sunMode={store.sunMode}
          onSunToggle={toggleSun}
        />
      )}

      {screen === "live" && game && (
        <>
          {!alarm && (
            <div className="mx-auto mb-3 max-w-md text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                PlayerTime
              </span>
            </div>
          )}
          <LiveScreen
            roster={store.roster}
            config={store.config}
            state={state}
            elapsedSec={elapsedSec}
            clockRunning={clockRunning}
            quarter={quarter}
            atBreak={atBreak}
            isFinalBreak={isFinalBreak}
            alarm={alarm}
            onDismissAlarm={dismissAlarm}
            onPauseToggle={pauseToggle}
            onEnd={endGame}
            onApplyChange={applyChange}
            onMarkReady={(id) =>
              pushEvents([{ type: "MARK_READY", atSec: currentElapsedSec(), playerId: id }])
            }
            onDecline={(id) =>
              pushEvents([{ type: "DECLINE", atSec: currentElapsedSec(), playerId: id }])
            }
            onSetAvailability={(id, available) =>
              pushEvents([
                { type: "SET_AVAILABILITY", atSec: currentElapsedSec(), playerId: id, available },
              ])
            }
            onLeaveGame={leaveGame}
            onFixMistake={fixMistake}
            canUndo={!alarm && lastUndoableSlice(events) !== null}
            onUndo={undoLast}
            sunMode={store.sunMode}
            onSunToggle={toggleSun}
          />
        </>
      )}

      {screen === "report" && game && (
        <ReportScreen
          roster={store.roster}
          config={store.config}
          state={baseState}
          elapsedSec={baseState.elapsedSec}
          events={game.events}
          startedAtMs={game.startedAtMs}
          onNewGame={newGame}
          onNotice={showToast}
        />
      )}

      {/* Safety net: shouldn't happen, but never strand the coach */}
      {(screen === "live" || screen === "report") && !game && (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-neutral-400">No active game.</p>
          <button type="button" onClick={() => setScreen("pregame")} className={`${btnPrimary} w-auto px-8`}>
            Go to pre-game
          </button>        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
