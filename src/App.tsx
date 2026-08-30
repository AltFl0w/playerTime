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
import { lateArrivalCredit } from "./lib/lateCredit";
import { fmtClock } from "./lib/format";
import { SetupScreen } from "./ui/SetupScreen";
import { PreGameScreen } from "./ui/PreGameScreen";
import { LiveScreen, type LiveAlarm } from "./ui/LiveScreen";
import { ReportScreen } from "./ui/ReportScreen";
import { Toast } from "./ui/Toast";
import { A2HSNudge } from "./ui/A2HSNudge";
import { btnPrimary } from "./ui/bits";

type Screen = "setup" | "pregame" | "live" | "report";

const EMPTY_EVENTS: GameEvent[] = [];

// Line-change clock: SUB_IN/OUT from an applied swap, not a leave (OUT+gone).
function lastAppliedShiftSec(events: GameEvent[]): number {
  let t = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== "SUB_IN" && e.type !== "SUB_OUT") continue;
    const n = events[i + 1];
    const leavePair =
      e.type === "SUB_OUT" &&
      n?.type === "SET_AVAILABILITY" &&
      n.available === false &&
      n.playerId === e.playerId &&
      n.atSec === e.atSec;
    if (!leavePair) t = e.atSec;
  }
  return t;
}

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
  // Restore an alarm that was showing when the app was refreshed/relaunched —
  // the banner comes back; sound waits for the next gesture (iOS rule anyway).
  const [alarm, setAlarm] = useState<LiveAlarm | null>(() => store.game?.alarm ?? null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  // Game-sec the interval alarm is satisfied up to. The NEXT alarm is due one
  // interval after max(this, last sub) — a manual line change resets the sub
  // clock instead of the alarm ringing 30 seconds after fresh legs went in.
  const alarmDoneRef = useRef<number>(
    // Persisted value wins: the elapsed-derived fallback assumes everything
    // up to now already rang, which silently swallows an alarm that was open
    // (or due) at the moment of a refresh.
    store.game?.alarmDoneAtSec ??
      ((store.game?.events.length ?? 0) > 0
        ? engine.computeState(store.game?.events ?? EMPTY_EVENTS, store.config, store.roster)
            .elapsedSec +
          (store.game?.runningSinceMs
            ? Math.max(0, Math.floor((Date.now() - store.game.runningSinceMs) / 1000))
            : 0)
        : 0),
  );
  const [undoUntilMs, setUndoUntilMs] = useState(0);
  const alarmOpenRef = useRef(!!store.game?.alarm);

  function showToast(text: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (undoUntilMs <= Date.now()) return;
    const id = window.setTimeout(() => setUndoUntilMs(0), undoUntilMs - Date.now());
    return () => window.clearTimeout(id);
  }, [undoUntilMs]);

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
  // the missed render is discarded, not credited to the quarter. The
  // fired-already guard is the log itself (a PAUSE at exactly the boundary),
  // not a ref — a ref starts empty on every mount, so a refresh in Q2+ would
  // re-fire and backdate a bogus PAUSE, erasing real minutes.
  useEffect(() => {
    if (!clockRunning || !game || baseState.ended) return;
    // Clamp to the final whistle: reopened long after full time, the clock
    // stops at game length instead of crediting phantom quarters.
    const boundary = Math.min(
      Math.floor(elapsedSec / quarterLenSec) * quarterLenSec,
      quarterLenSec * Math.max(1, store.config.quarterCount),
    );
    const alreadyPaused = events.some((e) => e.type === "PAUSE" && e.atSec === boundary);
    if (boundary > 0 && elapsedSec >= boundary && !alreadyPaused) {
      stopAlarm();
      setAlarm(null);
      alarmOpenRef.current = false;
      // A boundary can coincide with a due sub alarm — mark the alarm clock
      // satisfied up to the break so the siren can't hijack the water-break
      // dock, and the next sub rings one full interval into the new quarter.
      alarmDoneRef.current = Math.max(alarmDoneRef.current, boundary);
      pushEvents([{ type: "PAUSE", atSec: boundary }]);
      patchGame((g) => ({
        ...g,
        runningSinceMs: null,
        alarm: null,
        alarmDoneAtSec: Math.max(g.alarmDoneAtSec ?? 0, boundary),
      }));
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

  // One shift clock: NEXT SUB is interval after kickoff or the last applied
  // line change. Leftover kids do not drag it to 0:00. Pause freezes elapsed
  // so the number holds instead of going blank.
  const subIntervalSec = Math.max(1, store.config.subIntervalSec);
  const shiftStartedAtSec = game?.shiftStartedAtSec ?? lastAppliedShiftSec(events);
  const nextSubDueSec = shiftStartedAtSec + subIntervalSec;
  const nextSubInSec = Math.max(0, nextSubDueSec - elapsedSec);

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
    // Invariant: while the clock runs, runningSinceMs is the wall instant of
    // the LAST event in the log. Appended events are stamped "as of now", so
    // the replayed elapsed advances to this instant — the wall offset must
    // restart here too, or the open segment is counted twice. (This was the
    // game-clock jumping forward on every sub.)
    const t = Date.now();
    patchGame((g) => ({
      ...g,
      events: [...g.events, ...newEvents],
      runningSinceMs: g.runningSinceMs == null ? null : t,
    }));
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
    // Starters: presentIds arrives in the order the coach marked kids at the
    // field, so the first playersOnField arrivals start. The first interval
    // alarm rebalances from there.
    const rosterIds = new Set(store.roster.map((p) => p.id));
    const starters = presentIds
      .filter((id) => rosterIds.has(id))
      .slice(0, Math.max(0, store.config.playersOnField));
    for (const id of starters) {
      evts.push({ type: "SUB_IN", atSec: 0, playerId: id });
    }
    evts.push({ type: "START", atSec: 0 });
    alarmDoneRef.current = 0;
    stopAlarm();
    setAlarm(null);
    alarmOpenRef.current = false;
    setUndoUntilMs(0);
    setStore((s) => ({
      ...s,
      game: {
        events: evts,
        runningSinceMs: t,
        startedAtMs: t,
        pendingSwaps: [],
        alarmDoneAtSec: 0,
        alarm: null,
        shiftStartedAtSec: 0,
      },
    }));
    setNow(t);
    setScreen("live");
  }

  function pauseToggle() {
    if (!game || baseState.ended) return;
    if (clockRunning) {
      // Fresh read, not the render-cached elapsedSec: tapped right after the
      // phone wakes, the cached value predates the whole background span and
      // stamping with it would erase that time from the game.
      pushEvents([{ type: "PAUSE", atSec: currentElapsedSec() }]);
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
    pushEvents([{ type: "END", atSec: currentElapsedSec() }]);
    patchGame((g) => ({ ...g, runningSinceMs: null, alarm: null }));
    setScreen("report");
  }

  function newGame() {
    setStore((s) => ({ ...s, game: null }));
    setScreen("pregame");
  }

  // Beep once when the shift clock hits zero. Mute or apply — it does not
  // nag, and it does not pre-stage a swap. Heat-cap alarms are gone.
  useEffect(() => {
    if (screen !== "live" || !game || !clockRunning || state.ended) return;
    if (alarmOpenRef.current) return;
    if (elapsedSec >= nextSubDueSec && nextSubDueSec > alarmDoneRef.current) {
      alarmDoneRef.current = nextSubDueSec;
      patchGame((g) => ({ ...g, alarmDoneAtSec: nextSubDueSec }));
      openAlarm({ kind: "interval", outId: null, inId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSec, screen, game, clockRunning, state.ended, nextSubDueSec]);

  function openAlarm(a: LiveAlarm) {
    alarmOpenRef.current = true;
    setAlarm(a);
    patchGame((g) => ({ ...g, alarm: a }));
    startAlarm();
  }

  function dismissAlarm() {
    alarmOpenRef.current = false;
    stopAlarm();
    unlockAudio();
    setAlarm(null);
    patchGame((g) => ({ ...g, alarm: null }));
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
    patchGame((g) => ({ ...g, shiftStartedAtSec: at }));
    setUndoUntilMs(Date.now() + 8000);
    dismissAlarm();
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
    if (!game) return;
    const idx = [...game.events]
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.type === "SUB_IN" && e.playerId === wrongId)
      .map(({ i }) => i)
      .pop();
    if (idx === undefined) return;
    // "On the bench now" isn't "on the bench then": if the named kid was on
    // the field at that SUB_IN, the rewrite replays as a no-op and his later
    // SUB_OUT empties the slot — the stint's minutes silently vanish.
    const then = engine.computeState(game.events.slice(0, idx), store.config, store.roster);
    if (then.players[rightId]?.onField) {
      showToast(
        `${byId.get(rightId)?.name.split(" ")[0] ?? "They"} was on the field then — pick who was on the bench`,
      );
      return;
    }
    patchGame((g) => ({
      ...g,
      events: g.events.map((e, i) =>
        i === idx && e.type === "SUB_IN" ? { ...e, playerId: rightId } : e,
      ),
    }));
    showToast(
      `Fixed — that was ${byId.get(rightId)?.name.split(" ")[0] ?? "them"}, not ${byId.get(wrongId)?.name.split(" ")[0] ?? ""}`,
    );
  }

  function undoLast() {
    if (!game || alarm) return;
    const result = undoLastCoachAction(game);
    if (!result) return;
    // Removing events rewinds the replayed elapsed, but real game time hasn't
    // moved — backdate the anchor so replay + wall offset still sum to now.
    const trueElapsed = currentElapsedSec();
    patchGame(() => {
      const g = result.game;
      const shiftStartedAtSec = lastAppliedShiftSec(g.events);
      if (g.runningSinceMs == null) return { ...g, shiftStartedAtSec };
      const replayed = engine.computeState(g.events, store.config, store.roster).elapsedSec;
      return {
        ...g,
        shiftStartedAtSec,
        runningSinceMs: Date.now() - Math.max(0, trueElapsed - replayed) * 1000,
      };
    });
    setUndoUntilMs(0);
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
            alarmDoneRef.current = 0;
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
            onSetAvailability={(id, available) => {
              const at = currentElapsedSec();
              if (available) {
                const credit = lateArrivalCredit(state, id);
                pushEvents([
                  {
                    type: "SET_AVAILABILITY",
                    atSec: at,
                    playerId: id,
                    available: true,
                    ...(credit > 0 ? { creditSec: credit } : {}),
                  },
                ]);
                if (credit > 0) {
                  const first = byId.get(id)?.name.split(" ")[0] ?? "Player";
                  showToast(`${first} in — counted as ${fmtClock(credit)}`);
                }
              } else {
                pushEvents([{ type: "SET_AVAILABILITY", atSec: at, playerId: id, available: false }]);
              }
            }}
            onLeaveGame={leaveGame}
            onFixMistake={fixMistake}
            onAdjustTime={(id, deltaSec) =>
              pushEvents([
                { type: "ADJUST_TIME", atSec: currentElapsedSec(), playerId: id, deltaSec },
              ])
            }
            nextSubInSec={nextSubInSec}
            canUndo={undoUntilMs > Date.now() && lastUndoableSlice(events) !== null}
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
