import { useEffect, useMemo, useRef, useState } from "react";
import { engine } from "./engine";
import type { GameEvent, GameState, PlayerId } from "./types";
import {
  emptyStore,
  loadStore,
  saveStore,
  uid,
  type GameRecord,
  type PendingSwap,
  type Store,
} from "./store";
import { demoStore } from "./testing/demo";
import { startAlarm, stopAlarm, unlockAudio } from "./lib/alarm";
import { useWakeLock } from "./lib/wakeLock";
import { SetupScreen } from "./ui/SetupScreen";
import { PreGameScreen } from "./ui/PreGameScreen";
import { LiveScreen } from "./ui/LiveScreen";
import { ReportScreen } from "./ui/ReportScreen";
import { SwapAlarmModal } from "./ui/SwapAlarmModal";
import { Toast } from "./ui/Toast";
import { btnPrimary } from "./ui/bits";

type Screen = "setup" | "pregame" | "live" | "report";

interface ActiveAlarm {
  kind: "interval" | "forced" | "pending";
  pendingId?: string;
  outId: PlayerId | null;
  inId: PlayerId | null;
  outDone: boolean;
  // true once the IN kid was confirmed in OR refused
  inDone: boolean;
}

const EMPTY_EVENTS: GameEvent[] = [];

const ROOT_CLASSES =
  "min-h-dvh bg-[#f3f5f8] px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-[#1a1a1e]";

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
  const [alarm, setAlarm] = useState<ActiveAlarm | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Non-blocking swap confirmation — the coach's next tap must never wait.
  function showToast(text: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  // Suppression state for alarms. Interval counter initializes from the loaded
  // clock so a mid-game refresh doesn't blast stale alarms. Must include the
  // wall-clock offset since runningSinceMs — event-derived elapsed alone
  // under-counts a reload mid-segment and fires a stale SUB TIME alarm.
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
  const alertedPendingRef = useRef<Set<string>>(new Set());
  const alarmOpenRef = useRef(false);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
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
    alertedPendingRef.current = new Set();
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

  // Alarm orchestration: priority pending-due > forced heat cap > interval.
  useEffect(() => {
    const wasForced = prevForcedRef.current;
    const forcedNow = !!state.forcedSwap;

    if (screen !== "live" || !game || !clockRunning || state.ended) return;
    if (alarmOpenRef.current) return;
    prevForcedRef.current = forcedNow;

    const due = game.pendingSwaps.find(
      (ps) => ps.dueElapsedSec <= elapsedSec && !alertedPendingRef.current.has(ps.id),
    );
    if (due) {
      alertedPendingRef.current.add(due.id);
      openAlarm({
        kind: "pending",
        pendingId: due.id,
        outId: due.outPlayerId,
        inId: due.inPlayerId,
        outDone: false,
        inDone: false,
      });
      return;
    }

    const idx = Math.floor(elapsedSec / Math.max(1, store.config.subIntervalSec));
    if (forcedNow && !wasForced) {
      openAlarm({
        kind: "forced",
        outId: engine.suggestOut(state, store.config),
        inId: engine.suggestIn(state, store.config),
        outDone: false,
        inDone: false,
      });
    } else if (idx > intervalFiredRef.current) {
      intervalFiredRef.current = idx;
      openAlarm({
        kind: "interval",
        outId: engine.suggestOut(state, store.config),
        inId: engine.suggestIn(state, store.config),
        outDone: false,
        inDone: false,
      });
    }
  }, [state, elapsedSec, screen, game, clockRunning, store.config]);

  function openAlarm(a: ActiveAlarm) {
    alarmOpenRef.current = true;
    setAlarm(a);
    startAlarm();
  }

  function settleAlarm(patch: Partial<ActiveAlarm>) {
    if (!alarm) return;
    const next = { ...alarm, ...patch };
    const outResolved = !next.outId || next.outDone;
    const inResolved = !next.inId || next.inDone;
    const fullyResolved = outResolved && inResolved;
    if (fullyResolved) {
      alarmOpenRef.current = false;
      stopAlarm();
      // A resolved scheduled swap is done — drop it so the tile stops pulsing "NOW".
      if (alarm.kind === "pending" && alarm.pendingId) {
        const pendingId = alarm.pendingId;
        patchGame((g) => ({
          ...g,
          pendingSwaps: g.pendingSwaps.filter((ps) => ps.id !== pendingId),
        }));
      }
    }
    setAlarm(fullyResolved ? null : next);
  }

  function dismissAlarm() {
    alarmOpenRef.current = false;
    stopAlarm();
    setAlarm(null);
  }

  function confirmOut() {
    if (!alarm?.outId || alarm.outDone) return;
    pushEvents([{ type: "SUB_OUT", atSec: elapsedSec, playerId: alarm.outId }]);
    settleAlarm({ outDone: true });
    showToast(`${byId.get(alarm.outId)?.name.split(" ")[0] ?? "Player"} off`);
  }

  function confirmIn() {
    if (!alarm?.inId || alarm.inDone) return;
    pushEvents([{ type: "SUB_IN", atSec: elapsedSec, playerId: alarm.inId }]);
    settleAlarm({ inDone: true });
    showToast(`${byId.get(alarm.inId)?.name.split(" ")[0] ?? "Player"} on`);
  }

  // One-tap "Swapped!": both sides settle in a single call — two sequential
  // settleAlarm calls would each read the same stale `alarm` and clobber
  // the other's done flag.
  function confirmBoth() {
    if (!alarm) return;
    const evts: GameEvent[] = [];
    if (alarm.outId && !alarm.outDone)
      evts.push({ type: "SUB_OUT", atSec: elapsedSec, playerId: alarm.outId });
    if (alarm.inId && !alarm.inDone)
      evts.push({ type: "SUB_IN", atSec: elapsedSec, playerId: alarm.inId });
    if (evts.length === 0) return;
    pushEvents(evts);
    settleAlarm({ outDone: true, inDone: true });
    showToast("Swapped");
  }

  function refuseIn() {
    if (!alarm?.inId || alarm.inDone) return;
    pushEvents([{ type: "DECLINE", atSec: elapsedSec, playerId: alarm.inId }]);
    settleAlarm({ inDone: true });
    showToast(`${byId.get(alarm.inId)?.name.split(" ")[0] ?? "Player"} skipped`);
  }

  const byId = useMemo(() => new Map(store.roster.map((p) => [p.id, p])), [store.roster]);
  const alarmOutPlayer = alarm?.outId ? byId.get(alarm.outId) ?? null : null;
  const alarmInPlayer = alarm?.inId ? byId.get(alarm.inId) ?? null : null;

  const alarmTitle =
    alarm?.kind === "forced"
      ? "FORCED SWAP"
      : alarm?.kind === "pending"
        ? "Scheduled swap"
        : "SUB TIME";
  const alarmSubtitle =
    alarm?.kind === "forced"
      ? "heat cap reached — this sub can't wait"
      : alarm?.kind === "pending"
        ? "the swap you scheduled is up"
        : `every ${Math.round(store.config.subIntervalSec / 60)} min rotation`;

  return (
    <div className={ROOT_CLASSES}>
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
            alertedPendingRef.current = new Set();
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
            pendingSwaps={game.pendingSwaps}
            onPauseToggle={pauseToggle}
            onEnd={endGame}
            onSubOut={(id) => pushEvents([{ type: "SUB_OUT", atSec: elapsedSec, playerId: id }])}
            onSubIn={(id) => pushEvents([{ type: "SUB_IN", atSec: elapsedSec, playerId: id }])}
            onMarkReady={(id) =>
              pushEvents([{ type: "MARK_READY", atSec: elapsedSec, playerId: id }])
            }
            onDecline={(id) => pushEvents([{ type: "DECLINE", atSec: elapsedSec, playerId: id }])}
            onSetAvailability={(id, available) =>
              pushEvents([
                { type: "SET_AVAILABILITY", atSec: elapsedSec, playerId: id, available },
              ])
            }
            onScheduleSwap={(outId, inId, delayMin) =>
              patchGame((g) => ({
                ...g,
                pendingSwaps: [
                  ...g.pendingSwaps,
                  {
                    id: uid(),
                    outPlayerId: outId,
                    inPlayerId: inId,
                    dueElapsedSec: elapsedSec + delayMin * 60,
                  } satisfies PendingSwap,
                ],
              }))
            }
            onCancelPending={(id) =>
              patchGame((g) => ({
                ...g,
                pendingSwaps: g.pendingSwaps.filter((ps) => ps.id !== id),
              }))
            }
            onFirePending={(id) => {
              // Re-open the alarm for a dead "NOW" row — dismissing the
              // original alarm left it due but unreachable otherwise.
              if (alarmOpenRef.current) return;
              const ps = game.pendingSwaps.find((p) => p.id === id);
              if (!ps) return;
              alertedPendingRef.current.add(ps.id);
              openAlarm({
                kind: "pending",
                pendingId: ps.id,
                outId: ps.outPlayerId,
                inId: ps.inPlayerId,
                outDone: false,
                inDone: false,
              });
            }}
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

      {alarm && screen === "live" && (
        <SwapAlarmModal
          title={alarmTitle}
          subtitle={alarmSubtitle}
          outPlayer={alarmOutPlayer}
          inPlayer={alarmInPlayer}
          outDone={alarm.outDone}
          inDone={alarm.inDone}
          onConfirmOut={confirmOut}
          onConfirmBoth={confirmBoth}
          onConfirmIn={confirmIn}
          onRefuseIn={refuseIn}
          onDismiss={dismissAlarm}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
