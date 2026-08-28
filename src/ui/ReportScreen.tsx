import type { GameConfig, GameEvent, GameState, Player, PlayerId, PlayerTimeState } from "../types";
import { fmtClock, fmtMinutes } from "../lib/format";
import { buildReportSummary } from "../lib/report";
import { shareReport } from "../lib/reportShare";
import { Avatar, SectionTitle } from "./bits";

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  events: GameEvent[];
  startedAtMs: number | null;
  onNewGame: () => void;
  onNotice: (text: string) => void;
}

type Row = { p: Player; st: PlayerTimeState };

const ON_TARGET_TOLERANCE_SEC = 30;

// Replays SUB_IN/SUB_OUT into per-kid [start, end] stint ranges for the
// timeline strip. Event atSec values are already game-clock seconds (they
// only advance while the clock runs), so pause gaps need no extra handling.
function buildStintTimelines(
  events: GameEvent[],
  finalElapsedSec: number,
): Map<PlayerId, Array<[number, number]>> {
  const ordered = events.slice().sort((a, b) => a.atSec - b.atSec);
  const open = new Map<PlayerId, number>();
  const timelines = new Map<PlayerId, Array<[number, number]>>();
  const close = (id: PlayerId, endSec: number) => {
    const start = open.get(id);
    if (start === undefined) return;
    const list = timelines.get(id) ?? [];
    list.push([start, endSec]);
    timelines.set(id, list);
    open.delete(id);
  };
  for (const ev of ordered) {
    if (ev.type === "SUB_IN") {
      if (!open.has(ev.playerId)) open.set(ev.playerId, ev.atSec);
    } else if (ev.type === "SUB_OUT") {
      close(ev.playerId, ev.atSec);
    } else if (ev.type === "END") {
      for (const id of Array.from(open.keys())) close(id, ev.atSec);
    }
  }
  // No END logged (shouldn't happen for a real game, but guards demo/test
  // fixtures) — close whatever's still open at the final second instead of
  // dropping the kid's last stint from the strip.
  for (const id of Array.from(open.keys())) close(id, finalElapsedSec);
  return timelines;
}

export function ReportScreen({
  roster,
  config,
  state,
  elapsedSec,
  events,
  startedAtMs,
  onNewGame,
  onNotice,
}: Props) {
  const rows: Row[] = roster
    .map((p) => ({ p, st: state.players[p.id] }))
    .filter((r): r is Row => !!r.st)
    .sort((a, b) => b.st.playedSec - a.st.playedSec);

  const summary = buildReportSummary(roster, config, state, elapsedSec, events, startedAtMs);
  const finalSec = Math.max(1, elapsedSec);
  const timelines = buildStintTimelines(events, finalSec);

  const quarterLenSec = Math.max(1, Math.round(config.gameLengthSec / Math.max(1, config.quarterCount)));
  const quarterTicks = Array.from(
    { length: Math.max(0, config.quarterCount - 1) },
    (_, i) => (i + 1) * quarterLenSec,
  ).filter((t) => t < finalSec);

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-xl border border-hairline2 bg-card p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
          final · {summary.formatLabel} · {summary.elapsedLabel}
        </div>
        <h1 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.02em]">{summary.verdict}</h1>
        {summary.dateLine && <p className="mt-1 text-sm text-neutral-500">{summary.dateLine}</p>}
      </header>

      {/* Rotation chart: the whole team on one screen, one line per kid —
          who played when (strip), how much (minutes), and how fair (delta).
          Dense on purpose: the coach scans it, no scrolling. */}
      <section className="rounded-xl border border-hairline2 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionTitle>Playing time</SectionTitle>
          <span className="text-[10px] font-semibold text-neutral-400">
            Q1{config.quarterCount > 1 ? `–Q${config.quarterCount}` : ""} · bars = on field
          </span>
        </div>
        {rows.length === 0 && <p className="text-neutral-400">No players recorded.</p>}
        <div className="flex flex-col divide-y divide-hairline">
          {rows.map(({ p, st }) => {
            const deltaSec = Math.round(st.playedSec - st.targetSec);
            const onTarget = Math.abs(deltaSec) <= ON_TARGET_TOLERANCE_SEC;
            const stints = timelines.get(p.id) ?? [];
            return (
              <div key={p.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                <Avatar player={p} className="h-8 w-8" />
                <div className="w-[4.5rem] shrink-0 truncate text-sm font-bold">
                  {p.name.split(" ")[0]}
                </div>
                <div
                  className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline"
                  role="img"
                  aria-label={`${fmtMinutes(st.playedSec)} min played, target ${fmtMinutes(st.targetSec)} min`}
                >
                  {stints.map(([s, e], i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 rounded-full bg-ink"
                      style={{
                        left: `${(s / finalSec) * 100}%`,
                        width: `${Math.max(0.6, ((e - s) / finalSec) * 100)}%`,
                      }}
                    />
                  ))}
                  {quarterTicks.map((t) => (
                    <div
                      key={t}
                      className="absolute inset-y-0 w-px bg-white/80"
                      style={{ left: `${(t / finalSec) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex w-[4.75rem] shrink-0 flex-col items-end">
                  <span className="text-base font-bold leading-tight tabular-nums">
                    {fmtMinutes(st.playedSec)}
                    <span className="text-[10px] font-bold text-neutral-400"> min</span>
                  </span>
                  <span
                    className={`text-[10px] font-extrabold tabular-nums ${
                      onTarget ? "text-faintink" : deltaSec > 0 ? "text-stagedin" : "text-stagedout"
                    }`}
                  >
                    {onTarget ? "on target" : `${deltaSec > 0 ? "+" : "−"}${fmtClock(Math.abs(deltaSec))}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {summary.notes.length > 0 && (
        <section className="rounded-xl border border-hairline2 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">Game notes</div>
          <div className="mt-1 flex flex-col gap-0.5">
            {summary.notes.map((n, i) => (
              <p key={i} className="py-0.5 text-sm font-medium text-mutedink">
                {n}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Same dock pattern as the live screen: the screen's commits live in
          the thumb zone — Share is the star, New game the quiet neighbor. */}
      <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNewGame}
            className="min-h-[52px] shrink-0 rounded-[11px] border border-hairline2 bg-card px-[18px] text-[14px] font-medium text-mutedink active:scale-[0.98]"
          >
            New game
          </button>
          <button
            type="button"
            onClick={async () => {
              const result = await shareReport(summary);
              if (result === "copied") onNotice("Copied — paste in the parent chat");
              if (result === "unavailable") onNotice("Screenshot this card for the parent group chat.");
            }}
            className="min-h-[52px] flex-1 rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99]"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
