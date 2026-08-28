import { useEffect, useRef, useState } from "react";
import { engine } from "../engine";
import type { GameConfig, GameState, Player, PlayerTimeState } from "../types";
import { fmtClock } from "../lib/format";
import { SunToggle } from "./bits";
import { ConfirmSheet } from "./ConfirmSheet";

export interface LiveAlarm {
  kind: "interval" | "forced";
  outId: string | null;
  inId: string | null;
}

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  clockRunning: boolean;
  quarter: number;
  atBreak: boolean;
  isFinalBreak: boolean;
  alarm: LiveAlarm | null;
  onDismissAlarm: () => void;
  onPauseToggle: () => void;
  onEnd: () => void;
  onApplyChange: (outIds: string[], inIds: string[]) => void;
  onMarkReady: (id: string) => void;
  onDecline: (id: string) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onLeaveGame: (id: string) => void;
  onFixMistake: (wrongId: string, rightId: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  sunMode: boolean;
  onSunToggle: () => void;
}

type Row = { p: Player; st: PlayerTimeState };

// Board rules (learned on the sideline, don't regress):
// - Positions are fixed roster order. Nothing re-sorts or animates while the
//   game runs; staging changes a chip's border/fill/pill instantly, in place.
// - Tap = stage (field kid OFF, bench kid IN); tap again = un-stage. One
//   button applies the whole line change. Long-press holds the rare actions.
// - The countdown to the end of the quarter owns the header.

// Long-press without breaking normal taps: fire at 450ms of stillness, then
// swallow the click that follows pointer-up.
function useLongPress(onLong: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 450);
    },
    onPointerUp: () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    onPointerLeave: () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    onClickCapture: (e: React.SyntheticEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
  };
}

function Chip({
  player,
  staged,
  stagedLabel,
  time,
  pill,
  dim,
  onTap,
  onLong,
  big,
}: {
  player: Player;
  staged: boolean;
  stagedLabel: "OFF" | "IN";
  time: React.ReactNode;
  pill: string | null;
  dim?: boolean;
  onTap: () => void;
  onLong: () => void;
  big?: boolean;
}) {
  const lp = useLongPress(onLong);
  const stagedCls =
    stagedLabel === "OFF"
      ? "border-stagedout-line bg-stagedout-soft"
      : "border-stagedin-line bg-stagedin-soft";
  const nameCls = staged
    ? stagedLabel === "OFF"
      ? "text-stagedout"
      : "text-stagedin"
    : "text-ink";
  return (
    <button
      type="button"
      {...lp}
      onClick={onTap}
      className={`relative flex flex-col items-start gap-[3px] rounded-xl border px-[13px] pb-[11px] pt-[13px] text-left active:scale-[0.98] ${
        big ? "min-h-[98px]" : "min-h-[92px]"
      } ${
        staged ? stagedCls : "border-hairline2 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      } ${dim ? "opacity-55" : ""}`}
    >
      {staged ? (
        <span
          className={`absolute right-2.5 top-2.5 rounded-full px-[9px] py-[3px] text-[10px] font-bold tracking-[0.05em] text-white ${
            stagedLabel === "OFF" ? "bg-stagedout" : "bg-stagedin"
          }`}
        >
          {stagedLabel}
        </span>
      ) : (
        pill && (
          <span className="absolute right-2.5 top-2.5 rounded-full border border-hairline2 bg-canvas px-2 py-[2.5px] text-[10px] font-semibold tracking-[0.04em] text-mutedink">
            {pill}
          </span>
        )
      )}
      <span
        className={`font-semibold leading-[1.15] tracking-[-0.02em] ${
          big ? "text-[17px]" : "text-[15.5px]"
        } ${nameCls}`}
      >
        {player.name.split(" ")[0]}
      </span>
      <span className="mt-auto text-[12.5px] tabular-nums text-mutedink">{time}</span>
    </button>
  );
}

function SheetButton({
  label,
  tone = "plain",
  onClick,
}: {
  label: string;
  tone?: "plain" | "good" | "danger";
  onClick: () => void;
}) {
  const cls =
    tone === "good"
      ? "bg-stagedin-soft text-stagedin"
      : tone === "danger"
        ? "bg-stagedout-soft text-stagedout"
        : "bg-canvas text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[52px] rounded-[11px] text-[15px] font-semibold active:scale-[0.98] ${cls}`}
    >
      {label}
    </button>
  );
}

export function LiveScreen({
  roster,
  config,
  state,
  elapsedSec,
  clockRunning,
  quarter,
  atBreak,
  isFinalBreak,
  alarm,
  onDismissAlarm,
  onPauseToggle,
  onEnd,
  onApplyChange,
  onMarkReady,
  onDecline,
  onSetAvailability,
  onLeaveGame,
  onFixMistake,
  canUndo,
  onUndo,
  sunMode,
  onSunToggle,
}: Props) {
  const [stagedOut, setStagedOut] = useState<string[]>([]);
  const [stagedIn, setStagedIn] = useState<string[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [fixFor, setFixFor] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null);

  const byId = new Map(roster.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const p of roster) {
    const st = state.players[p.id];
    if (st) rows.push({ p, st });
  }

  const fieldRows = rows.filter(({ st }) => st.onField);
  const benchRows = rows.filter(
    ({ st }) => !st.onField && (st.availability === "available" || st.availability === "declined_wait"),
  );
  const awayRows = rows.filter(({ st }) => !st.onField && st.availability === "inactive");

  const suggestOutId = engine.suggestOut(state, config);
  const suggestInId = engine.suggestIn(state, config);

  // An alarm pre-stages the engine's suggestion — but never stomps a change
  // the coach already started building.
  const alarmKey = alarm ? `${alarm.kind}:${alarm.outId}:${alarm.inId}` : null;
  const stagedEmpty = stagedOut.length === 0 && stagedIn.length === 0;
  const stagedEmptyRef = useRef(stagedEmpty);
  stagedEmptyRef.current = stagedEmpty;
  useEffect(() => {
    if (!alarmKey || !alarm) return;
    if (!stagedEmptyRef.current) return;
    if (alarm.outId && state.players[alarm.outId]?.onField) setStagedOut([alarm.outId]);
    if (alarm.inId && !state.players[alarm.inId]?.onField) setStagedIn([alarm.inId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmKey]);

  function toggleOut(id: string) {
    setStagedOut((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function toggleIn(id: string) {
    setStagedIn((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function clearStaged() {
    setStagedOut([]);
    setStagedIn([]);
  }

  const outN = stagedOut.length;
  const inN = stagedIn.length;
  const resulting = fieldRows.length - outN + inN;
  const overCap = resulting > config.playersOnField;
  const short = resulting < config.playersOnField;

  function applyStaged() {
    if (outN + inN === 0 || overCap) return;
    onApplyChange(stagedOut, stagedIn);
    clearStaged();
    if (alarm) onDismissAlarm();
  }

  const quarterLenSec = Math.max(1, Math.round(config.gameLengthSec / Math.max(1, config.quarterCount)));
  const intoQuarter = elapsedSec - (quarter - 1) * quarterLenSec;
  const quarterLeft = Math.max(0, quarterLenSec - intoQuarter);
  const nextAlarmIn = Math.max(
    0,
    (Math.floor(elapsedSec / config.subIntervalSec) + 1) * config.subIntervalSec - elapsedSec,
  );

  const actionRow = actionId ? rows.find((r) => r.p.id === actionId) ?? null : null;
  const fixRow = fixFor ? rows.find((r) => r.p.id === fixFor) ?? null : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header: countdown owns it; totals sit small on the right */}
      <div className="-mx-4 flex items-end justify-between border-b border-hairline px-5 pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] font-semibold tracking-[0.02em] text-faintink">
            Q{quarter}
          </span>
          <span className="text-[44px] font-bold leading-none tracking-[-0.045em] tabular-nums text-ink">
            {atBreak || state.ended ? "0:00" : fmtClock(quarterLeft)}
          </span>
          <span className="text-[11px] font-semibold tracking-[0.05em] text-faintink">
            {clockRunning ? "LEFT" : atBreak ? "BREAK" : "PAUSED"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-right text-[12px] leading-[1.7] text-faintink">
            <div>
              game <span className="font-medium tabular-nums text-mutedink">{fmtClock(elapsedSec)}</span>
            </div>
            <div>
              next sub{" "}
              <span className="font-medium tabular-nums text-mutedink">
                {clockRunning ? fmtClock(nextAlarmIn) : "—"}
              </span>
            </div>
          </div>
          <SunToggle on={sunMode} onToggle={onSunToggle} />
        </div>
      </div>

      {/* Alarm banner — beep + suggestion pre-staged; the clock stays visible */}
      {alarm && (
        <div className="pt-banner flex items-center gap-3 rounded-xl border border-hairline2 bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              alarm.kind === "forced" ? "bg-stagedout" : "bg-ink"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">
              {alarm.kind === "forced" ? "Long stint — swap soon" : "Sub time"}
            </div>
            <div className="text-[12px] text-mutedink">
              suggestion staged — tap kids to change it
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissAlarm}
            className="min-h-[44px] shrink-0 rounded-[10px] border border-hairline2 bg-card px-4 text-[13px] font-semibold text-mutedink active:scale-[0.98]"
          >
            Quiet
          </button>
        </div>
      )}

      {/* Break card */}
      {atBreak && (
        <section className="rounded-xl border border-hairline2 bg-card p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            {isFinalBreak ? "full time" : `quarter ${quarter} done`}
          </div>
          <div className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {isFinalBreak ? "Great game, coach" : "Water break"}
          </div>
          <button
            type="button"
            onClick={isFinalBreak ? onEnd : onPauseToggle}
            className="mt-4 min-h-[52px] w-full rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99]"
          >
            {isFinalBreak ? "See report" : `Start Q${quarter + 1}`}
          </button>
        </section>
      )}

      {/* ON FIELD — fixed 2×2 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            On field
          </span>
          <span className="text-[12px] text-faintink">tap — comes off · hold — more</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {fieldRows.map(({ p, st }) => (
            <Chip
              key={p.id}
              player={p}
              big
              staged={stagedOut.includes(p.id)}
              stagedLabel="OFF"
              time={
                <>
                  {fmtClock(st.currentStintSec)}{" "}
                  <span className="text-[10.5px] tracking-[0.02em] text-faintink">on</span> ·{" "}
                  {fmtClock(st.playedSec)}{" "}
                  <span className="text-[10.5px] tracking-[0.02em] text-faintink">total</span>
                </>
              }
              pill={p.id === suggestOutId ? "longest on" : null}
              onTap={() => toggleOut(p.id)}
              onLong={() => setActionId(p.id)}
            />
          ))}
          {fieldRows.length < config.playersOnField &&
            Array.from({ length: config.playersOnField - fieldRows.length }).map((_, i) => (
              <div
                key={`open-${i}`}
                className="flex min-h-[98px] items-center justify-center rounded-xl border border-dashed border-hairline2 text-[13px] font-medium text-faintink"
              >
                open spot
              </div>
            ))}
        </div>
      </section>

      {/* BENCH — fixed row */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            Bench
          </span>
          <span className="text-[12px] text-faintink">tap — goes in</span>
        </div>
        {benchRows.length === 0 ? (
          <p className="px-0.5 text-[13px] text-faintink">Nobody on the bench.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {benchRows.map(({ p, st }) => {
              const declined = st.availability === "declined_wait";
              return (
                <Chip
                  key={p.id}
                  player={p}
                  staged={stagedIn.includes(p.id)}
                  stagedLabel="IN"
                  time={
                    <>
                      {fmtClock(st.playedSec)}{" "}
                      <span className="text-[10.5px] tracking-[0.02em] text-faintink">total</span>
                    </>
                  }
                  pill={declined ? "sat out" : p.id === suggestInId ? "least played" : null}
                  dim={declined}
                  onTap={() => toggleIn(p.id)}
                  onLong={() => setActionId(p.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* NOT HERE */}
      {awayRows.length > 0 && (
        <section>
          <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            Not here — tap when they arrive
          </div>
          <div className="grid grid-cols-3 gap-2">
            {awayRows.map(({ p }) => (
              <button
                type="button"
                key={p.id}
                onClick={() => onSetAvailability(p.id, true)}
                className="flex min-h-[52px] items-center justify-center rounded-xl border border-hairline bg-card text-[15px] font-semibold text-faintink active:scale-[0.98]"
              >
                {p.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setConfirmEnd(true)}
        className="min-h-[44px] w-full rounded-[11px] text-[13px] font-semibold text-faintink"
      >
        End game
      </button>

      {/* Dock: apply the staged change when one exists, otherwise pause/undo */}
      <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {outN + inN > 0 ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearStaged}
              className="min-h-[52px] shrink-0 rounded-[11px] border border-hairline2 bg-card px-[18px] text-[14px] font-medium text-mutedink active:scale-[0.98]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyStaged}
              disabled={overCap}
              className="min-h-[52px] flex-1 rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99] disabled:border disabled:border-hairline disabled:bg-canvas disabled:text-faintink"
            >
              {overCap ? (
                "Too many going in — pick who comes off"
              ) : (
                <>
                  Make the change{" "}
                  <span className="tabular-nums text-white/70">
                    {outN} for {inN}
                  </span>
                  {short ? " — field goes short" : ""}
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {canUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="min-h-[52px] shrink-0 rounded-[11px] border border-hairline2 bg-card px-[18px] text-[14px] font-medium text-mutedink active:scale-[0.98]"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={onPauseToggle}
              className={`min-h-[52px] flex-1 rounded-[11px] text-[15px] font-semibold active:scale-[0.99] ${
                clockRunning
                  ? "border border-hairline2 bg-card text-ink"
                  : "bg-ink text-white"
              }`}
            >
              {clockRunning ? "Pause" : "Play"}
            </button>
          </div>
        )}
      </div>

      {/* Long-press actions */}
      {actionRow && !fixFor && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setActionId(null)}>
          <div
            className="w-full rounded-t-2xl border-t border-hairline bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">
              {actionRow.p.name.split(" ")[0]}
            </div>
            <div className="flex flex-col gap-2">
              {actionRow.st.availability === "declined_wait" && (
                <SheetButton
                  label="Ready to play again"
                  tone="good"
                  onClick={() => {
                    onMarkReady(actionRow.p.id);
                    setActionId(null);
                  }}
                />
              )}
              {!actionRow.st.onField && actionRow.st.availability === "available" && (
                <SheetButton
                  label="Won't go in right now"
                  onClick={() => {
                    onDecline(actionRow.p.id);
                    setStagedIn((s) => s.filter((x) => x !== actionRow.p.id));
                    setActionId(null);
                  }}
                />
              )}
              {actionRow.st.onField && (
                <SheetButton
                  label="Wrong kid — someone else went in"
                  onClick={() => {
                    setFixFor(actionRow.p.id);
                    setActionId(null);
                  }}
                />
              )}
              {actionRow.st.availability !== "inactive" && (
                <SheetButton
                  label="Leaves the game (hurt / going home)"
                  tone="danger"
                  onClick={() => {
                    setConfirmLeaveId(actionRow.p.id);
                    setActionId(null);
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => setActionId(null)}
                className="min-h-[44px] text-[13px] font-semibold text-faintink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mistake repair: reassign the current stint to who really went in */}
      {fixRow && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setFixFor(null)}>
          <div
            className="w-full rounded-t-2xl border-t border-hairline bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-[17px] font-semibold tracking-[-0.02em]">
              Who actually went in instead of {fixRow.p.name.split(" ")[0]}?
            </div>
            <p className="mb-3 text-[13px] leading-snug text-mutedink">
              The whole stint moves to the right kid — every number recomputes.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {benchRows
                .filter(({ st }) => st.availability === "available")
                .map(({ p }) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      onFixMistake(fixRow.p.id, p.id);
                      setFixFor(null);
                      clearStaged();
                    }}
                    className="min-h-[52px] rounded-[11px] border border-hairline2 bg-card text-[15px] font-semibold active:scale-[0.98]"
                  >
                    {p.name.split(" ")[0]}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setFixFor(null)}
              className="mt-3 min-h-[44px] w-full text-[13px] font-semibold text-faintink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmEnd && (
        <ConfirmSheet
          title="End the game and show the report?"
          confirmLabel="End game"
          danger
          onConfirm={() => {
            setConfirmEnd(false);
            onEnd();
          }}
          onCancel={() => setConfirmEnd(false)}
        />
      )}

      {confirmLeaveId && (
        <ConfirmSheet
          title={`Take ${byId.get(confirmLeaveId)?.name ?? "this player"} out of the game (injury/leaving)?`}
          confirmLabel="Leave game"
          danger
          onConfirm={() => {
            // One confirm covers on-field kids too: pull + mark gone together.
            const goes = confirmLeaveId;
            setConfirmLeaveId(null);
            setStagedOut((s) => s.filter((x) => x !== goes));
            setStagedIn((s) => s.filter((x) => x !== goes));
            onLeaveGame(goes);
          }}
          onCancel={() => setConfirmLeaveId(null)}
        />
      )}
    </div>
  );
}
