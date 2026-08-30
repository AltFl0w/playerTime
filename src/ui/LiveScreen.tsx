import { useRef, useState } from "react";
import { type GameConfig, type GameState, type Player, type PlayerTimeState } from "../types";
import { fmtClock } from "../lib/format";
import { shownSec } from "../lib/lateCredit";
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
  onAdjustTime: (id: string, deltaSec: number) => void;
  nextSubInSec: number;
  canUndo: boolean;
  onUndo: () => void;
  sunMode: boolean;
  onSunToggle: () => void;
}

type Row = { p: Player; st: PlayerTimeState };

// Board rules (learned on the sideline, don't regress):
// - Tap = stage (field kid OFF, bench kid IN); tap again = un-stage. One
//   button applies the whole line change. Long-press holds the rare actions.
// - Corners mark the suggestion. They are never a selection and never arm
//   the swap button — the coach taps when they want it.
// - NEXT SUB is a shift clock from the last applied change. Always a number.

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
  hinted,
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
  /** Next-swap forecast: colored corner only, never a selection. */
  hinted?: boolean;
  onTap: () => void;
  onLong: () => void;
  big?: boolean;
}) {
  const lp = useLongPress(onLong);
  const isOff = stagedLabel === "OFF";
  const colorCls = isOff ? "border-stagedout" : "border-stagedin";
  const nameCls = staged ? (isOff ? "text-stagedout" : "text-stagedin") : "text-ink";
  return (
    <button
      type="button"
      {...lp}
      onClick={onTap}
      className={`relative flex flex-col items-start gap-[3px] rounded-xl border-2 bg-card px-[13px] pb-[11px] pt-[13px] text-left transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
        big ? "min-h-[98px]" : "min-h-[92px]"
      } ${
        staged ? colorCls : "border-hairline2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      } ${dim ? "opacity-55" : ""}`}
    >
      {hinted && !staged && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -left-[2px] -top-[2px] h-8 w-8 rounded-tl-xl border-l-[4px] border-t-[4px] ${colorCls}`}
        />
      )}
      <div className="flex w-full items-start justify-between gap-1">
        <span
          className={`min-w-0 truncate font-semibold leading-[1.15] tracking-[-0.02em] ${
            big ? "text-[17px]" : "text-[15.5px]"
          } ${nameCls}`}
        >
          {player.name.split(" ")[0]}
        </span>
        {staged ? (
          <span
            className={`shrink-0 rounded-full px-[9px] py-[3px] text-[10px] font-bold tracking-[0.05em] text-white ${
              isOff ? "bg-stagedout" : "bg-stagedin"
            }`}
          >
            {stagedLabel}
          </span>
        ) : (
          pill && (
            <span
              className={`max-w-[55%] truncate rounded-full border border-hairline2 bg-canvas py-[2.5px] font-semibold tracking-[0.04em] text-mutedink ${
                big ? "px-2 text-[10px]" : "px-1.5 text-[8.5px]"
              }`}
            >
              {pill}
            </span>
          )
        )}
      </div>
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
  // Bordered fills: on the white sheet, an unbordered near-white row reads as
  // loose text, not a button — every action must look pressable.
  const cls =
    tone === "good"
      ? "border-stagedin-line bg-stagedin-soft text-stagedin"
      : tone === "danger"
        ? "border-stagedout-line bg-stagedout-soft text-stagedout"
        : "border-hairline2 bg-canvas text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[52px] rounded-[11px] border text-[15px] font-semibold active:scale-[0.98] ${cls}`}
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
  onAdjustTime,
  nextSubInSec,
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
  const [overflowOpen, setOverflowOpen] = useState(false);

  const byId = new Map(roster.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const p of roster) {
    const st = state.players[p.id];
    if (st) rows.push({ p, st });
  }

  // Each board leads with who the coach acts on next: field most-shown
  // first (who's due off), bench least-shown first (who goes in) — declined
  // kids sink below the available ones. shownSec includes late-arrival credit
  // so a kid who showed up at 12:00 isn't stuck looking like 0:00.
  const shownOf = (st: PlayerTimeState) => shownSec(st.playedSec, st.creditSec);
  const byShownDesc = (a: Row, b: Row) => shownOf(b.st) - shownOf(a.st);
  const fieldRows = rows.filter(({ st }) => st.onField).sort(byShownDesc);
  const benchRows = rows
    .filter(
      ({ st }) =>
        !st.onField && (st.availability === "available" || st.availability === "declined_wait"),
    )
    .sort(
      (a, b) =>
        Number(a.st.availability === "declined_wait") -
          Number(b.st.availability === "declined_wait") || shownOf(a.st) - shownOf(b.st),
    );
  const awayRows = rows.filter(({ st }) => !st.onField && st.availability === "inactive");

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
  const nextAlarmIn = nextSubInSec;

  // Suggestion only: empty the bench. N waiting → N corners off (most
  // minutes, including late credit) and N corners on. Never a selection.
  const waitingIn = benchRows.filter(({ st }) => st.availability === "available");
  const nextSwapN = state.ended ? 0 : Math.min(fieldRows.length, waitingIn.length);
  const nextOutIds = new Set(fieldRows.slice(0, nextSwapN).map(({ p }) => p.id));
  const nextInIds = new Set(waitingIn.slice(0, nextSwapN).map(({ p }) => p.id));

  const actionRow = actionId ? rows.find((r) => r.p.id === actionId) ?? null : null;
  const fixRow = fixFor ? rows.find((r) => r.p.id === fixFor) ?? null : null;

  return (
    <div
      className="flex min-h-full flex-col gap-5"
      onPointerDownCapture={() => {
        if (alarm) onDismissAlarm();
      }}
      onTouchStartCapture={() => {
        if (alarm) onDismissAlarm();
      }}
    >
      {/* Header: NEXT SUB is the star. When the alarm is live it turns red
          and says NOW — that's the visual, not a flash. Tap anywhere mutes. */}
      <div className="-mx-4 flex items-end justify-between border-b border-hairline px-5 pb-4">
        <div className="flex flex-col gap-1">
          <span
            className={`text-[11px] font-semibold tracking-[0.05em] ${
              alarm ? "text-stagedout" : "text-faintink"
            }`}
          >
            {alarm ? "SUB NOW" : "NEXT SUB"}
          </span>
          <span
            className={`text-[44px] font-bold leading-none tracking-[-0.045em] tabular-nums ${
              alarm ? "text-stagedout" : clockRunning ? "text-ink" : "text-neutral-400"
            }`}
          >
            {alarm ? "NOW" : fmtClock(nextAlarmIn)}
          </span>
          {alarm && (
            <span className="pt-1 text-[12px] font-medium text-stagedout">tap anywhere to mute</span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {/* Same stacked shape as NEXT SUB: label on top, number under it. */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold tracking-[0.05em] text-faintink">
              Q{quarter} · {clockRunning ? "LEFT" : atBreak ? "BREAK" : "PAUSED"}
            </span>
            <span className="text-[44px] font-bold leading-none tracking-[-0.045em] tabular-nums text-neutral-400">
              {atBreak || state.ended ? "0:00" : fmtClock(quarterLeft)}
            </span>
          </div>
          <button
            type="button"
            aria-label="More"
            onClick={() => setOverflowOpen(true)}
            className="min-h-[44px] min-w-[36px] rounded-[10px] border border-hairline2 bg-card text-[16px] font-bold text-mutedink active:scale-[0.98]"
          >
            ⋯
          </button>
        </div>
      </div>

      {/* Break strip — the board stays: water break is when the next lineup
          gets planned. The Start button lives in the dock. */}
      {atBreak && (
        <div className="flex items-center gap-3 rounded-xl border border-hairline2 bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-ink" />
          <div className="min-w-0 flex-1">
            <span className="text-[14px] font-semibold text-ink">
              {isFinalBreak ? "Full time" : `Quarter ${quarter} done — water break`}
            </span>
            <span className="ml-2 text-[12px] text-mutedink">
              {isFinalBreak ? "great game, coach" : "clock and stints frozen"}
            </span>
          </div>
        </div>
      )}

      {/* ON FIELD — fixed 2×2 */}
      <section>
        {/* No inline gesture coaching — the legend lives in the ⋯ sheet. */}
        <div className="mb-2 px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            On field
          </span>
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
                  {fmtClock(shownOf(st))}{" "}
                  <span className="text-[10.5px] tracking-[0.02em] text-faintink">total</span>
                </>
              }
              pill={null}
              hinted={nextOutIds.has(p.id)}
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
        <div className="mb-2 px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            Bench
          </span>
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
                      {fmtClock(shownOf(st))}{" "}
                      <span className="text-[10.5px] tracking-[0.02em] text-faintink">total</span>
                    </>
                  }
                  pill={declined ? "sat out" : null}
                  dim={declined}
                  hinted={nextInIds.has(p.id)}
                  onTap={() => toggleIn(p.id)}
                  onLong={() => setActionId(p.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* NOT HERE — rare, so name-only mini chips that barely spend space */}
      {awayRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            not here
          </span>
          {awayRows.map(({ p }) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onSetAvailability(p.id, true)}
              className="min-h-[36px] rounded-full border border-hairline bg-card px-3 text-[13px] font-semibold text-faintink active:scale-[0.98]"
            >
              {p.name.split(" ")[0]} · arrived?
            </button>
          ))}
        </div>
      )}

      {/* Dock: staged change > quarter start > pause. Alarm is a mute strip
          above the buttons — it never hijacks them or preloads a swap. */}
      <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {alarm && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDismissAlarm();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDismissAlarm();
            }}
            className="mb-2 flex min-h-[52px] w-full items-center justify-center rounded-[11px] border-2 border-stagedout bg-card text-[15px] font-semibold text-stagedout active:scale-[0.96]"
          >
            Mute
          </button>
        )}
        {outN + inN > 0 ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={applyStaged}
              disabled={overCap}
              className="min-h-[52px] w-full rounded-[11px] bg-ink text-[15px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.96] disabled:border disabled:border-hairline disabled:bg-canvas disabled:text-faintink"
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
            <button
              type="button"
              onClick={clearStaged}
              className="min-h-[44px] w-full text-[13px] font-semibold text-mutedink active:scale-[0.98]"
            >
              Clear picks
            </button>
          </div>
        ) : atBreak ? (
          <button
            type="button"
            onClick={isFinalBreak ? onEnd : onPauseToggle}
            className="min-h-[52px] w-full rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99]"
          >
            {isFinalBreak ? "See report" : `Start Q${quarter + 1}`}
          </button>
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
        <div className="pt-1.5 text-center text-[12px] text-faintink">
          game <span className="font-medium tabular-nums text-mutedink">{fmtClock(elapsedSec)}</span>
        </div>
      </div>

      {/* Header overflow: once-a-game actions kept out of the main column */}
      {overflowOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setOverflowOpen(false)}>
          <div
            className="w-full rounded-t-2xl border-t border-hairline bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <div className="flex min-h-[44px] items-center justify-between rounded-[11px] border border-hairline2 bg-canvas px-3.5">
                <span className="text-[15px] font-semibold">Sun mode</span>
                <SunToggle on={sunMode} onToggle={onSunToggle} />
              </div>
              <p className="px-1 text-[12px] leading-snug text-faintink">
                Tap a kid to stage a sub · hold a kid for fixes and more
              </p>
              <SheetButton
                label="End game — see report"
                tone="danger"
                onClick={() => {
                  setOverflowOpen(false);
                  setConfirmEnd(true);
                }}
              />
              <button
                type="button"
                onClick={() => setOverflowOpen(false)}
                className="min-h-[44px] text-[13px] font-semibold text-faintink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-press actions */}
      {actionRow && !fixFor && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setActionId(null)}>
          <div
            className="w-full rounded-t-2xl border-t border-hairline bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Who + where, stacked left; the X is the one way out — no
                Cancel row eating a whole line at the bottom. Played time
                lives only in its card below. */}
            <div className="mb-3 flex items-start justify-between border-b border-hairline pb-3">
              <div>
                <div className="text-[20px] font-bold leading-tight tracking-[-0.02em]">
                  {actionRow.p.name.split(" ")[0]}
                </div>
                <div className="text-[12px] font-semibold text-mutedink">
                  {actionRow.st.onField
                    ? `on field · ${fmtClock(actionRow.st.currentStintSec)} this stint`
                    : actionRow.st.availability === "declined_wait"
                      ? "bench · sitting out"
                      : "bench"}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setActionId(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-hairline2 bg-card text-[15px] font-bold text-mutedink active:scale-[0.96]"
              >
                ✕
              </button>
            </div>
            {/* Two columns, two jobs: actions on the left, the played-time
                correction on the right with its steppers under the number —
                not three full-width slabs in a stack. */}
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 flex-col gap-2">
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
                    label="Wrong kid"
                    onClick={() => {
                      setFixFor(actionRow.p.id);
                      setActionId(null);
                    }}
                  />
                )}
                {actionRow.st.availability !== "inactive" && (
                  <SheetButton
                    label="Left game"
                    tone="danger"
                    onClick={() => {
                      setConfirmLeaveId(actionRow.p.id);
                      setActionId(null);
                    }}
                  />
                )}
              </div>
              {/* Played-time correction: applied immediately — the number
                  re-renders from the replayed state, so what the coach sees
                  is what's recorded. */}
              <div className="flex-1 rounded-[11px] border border-hairline2 bg-canvas p-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                  played total
                </div>
                <div className="text-[24px] font-extrabold leading-tight tabular-nums">
                  {fmtClock(shownOf(actionRow.st))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    aria-label="subtract 30 seconds played"
                    onClick={() => onAdjustTime(actionRow.p.id, -30)}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-[9px] border border-hairline2 bg-card text-[13px] font-bold active:scale-[0.96]"
                  >
                    −30s
                  </button>
                  <button
                    type="button"
                    aria-label="add 30 seconds played"
                    onClick={() => onAdjustTime(actionRow.p.id, 30)}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-[9px] border border-hairline2 bg-card text-[13px] font-bold active:scale-[0.96]"
                  >
                    +30s
                  </button>
                </div>
              </div>
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
