import type { GameConfig, GameEvent, GameState, Player, PlayerId, PlayerTimeState } from "../types";
import { fmtClock, fmtMinutes } from "../lib/format";
import { Avatar, SectionTitle, btnPrimary } from "./bits";

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  events: GameEvent[];
  startedAtMs: number | null;
  onNewGame: () => void;
}

type Row = { p: Player; st: PlayerTimeState };

// A spread this small reads as "equal enough" to a parent — not a bug to explain.
const FAIR_SPREAD_SEC = 90;
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

// A late SET_AVAILABILITY(true) or a mid-game SET_AVAILABILITY(false) is a
// coach-relevant attendance quirk, not just internal bookkeeping — surface it.
function buildAttendanceNotes(events: GameEvent[]): {
  lateAt: Map<PlayerId, number>;
  leftAt: Map<PlayerId, number>;
} {
  const ordered = events.slice().sort((a, b) => a.atSec - b.atSec);
  const lateAt = new Map<PlayerId, number>();
  const leftAt = new Map<PlayerId, number>();
  const seenAvailable = new Set<PlayerId>();
  for (const ev of ordered) {
    if (ev.type !== "SET_AVAILABILITY") continue;
    if (ev.available) {
      if (!seenAvailable.has(ev.playerId) && ev.atSec > 0) lateAt.set(ev.playerId, ev.atSec);
      seenAvailable.add(ev.playerId);
    } else if (ev.atSec > 0 && !leftAt.has(ev.playerId)) {
      leftAt.set(ev.playerId, ev.atSec);
    }
  }
  return { lateAt, leftAt };
}

export function ReportScreen({
  roster,
  config,
  state,
  elapsedSec,
  events,
  startedAtMs,
  onNewGame,
}: Props) {
  const rows: Row[] = roster
    .map((p) => ({ p, st: state.players[p.id] }))
    .filter((r): r is Row => !!r.st)
    .sort((a, b) => b.st.playedSec - a.st.playedSec);

  // Kids marked absent the whole game never had a fairness stake in it —
  // leave them out of the verdict entirely.
  const eligibleRows = rows.filter((r) => !(r.st.targetSec === 0 && r.st.playedSec === 0));

  const { lateAt, leftAt } = buildAttendanceNotes(events);
  const finalSec = Math.max(1, elapsedSec);
  const timelines = buildStintTimelines(events, finalSec);

  const quarterLenSec = Math.max(1, Math.round(config.gameLengthSec / Math.max(1, config.quarterCount)));
  const quarterTicks = Array.from(
    { length: Math.max(0, config.quarterCount - 1) },
    (_, i) => (i + 1) * quarterLenSec,
  ).filter((t) => t < finalSec);

  // Every kid's bar shares one scale so the row-to-row comparison (the whole
  // point of the screen) is visually honest, not just a per-kid percentage.
  const scale = Math.max(1, ...rows.map((r) => r.st.playedSec), ...rows.map((r) => r.st.targetSec));

  // The payoff line: is this the even game the app promised?
  let verdict = "No playing time recorded.";
  if (eligibleRows.length > 0) {
    const spread =
      Math.max(...eligibleRows.map((r) => r.st.playedSec)) -
      Math.min(...eligibleRows.map((r) => r.st.playedSec));
    if (spread <= FAIR_SPREAD_SEC) {
      verdict = `Even game — everyone within ${fmtClock(spread)}`;
    } else {
      // targetSec already accounts for late arrival / limited availability,
      // so the real outlier is whoever's furthest below their OWN target —
      // not just whoever happened to play the fewest raw minutes.
      const worst = eligibleRows.reduce((min, r) =>
        r.st.playedSec - r.st.targetSec < min.st.playedSec - min.st.targetSec ? r : min,
      );
      const deltaSec = Math.round(worst.st.targetSec - worst.st.playedSec);
      if (deltaSec > 15) {
        const reason = lateAt.has(worst.p.id)
          ? "arrived late"
          : leftAt.has(worst.p.id)
            ? "left early"
            : undefined;
        verdict = `${worst.p.name.split(" ")[0]} played ${fmtClock(deltaSec)} less${reason ? ` — ${reason}` : ""}`;
      } else {
        const maxRow = eligibleRows.reduce((mx, r) => (r.st.playedSec > mx.st.playedSec ? r : mx));
        const minRow = eligibleRows.reduce((mn, r) => (r.st.playedSec < mn.st.playedSec ? r : mn));
        verdict = `Playing time varied — ${fmtClock(spread)} between ${maxRow.p.name.split(" ")[0]} and ${minRow.p.name.split(" ")[0]}`;
      }
    }
  }

  const dateLine = startedAtMs
    ? new Date(startedAtMs).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";

  const notes: string[] = [
    ...Array.from(lateAt.entries()).map(([id, atSec]) => {
      const name = roster.find((p) => p.id === id)?.name ?? "A player";
      return `${name} arrived at ${fmtClock(atSec)}`;
    }),
    ...Array.from(leftAt.entries()).map(([id, atSec]) => {
      const name = roster.find((p) => p.id === id)?.name ?? "A player";
      return `${name} left at ${fmtClock(atSec)}`;
    }),
    ...rows
      .filter((r) => r.st.declines > 0)
      .map((r) => `${r.p.name} declined ${r.st.declines} shift${r.st.declines === 1 ? "" : "s"}`),
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[7px] bg-white p-5 text-center shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
        <div className="text-xs font-bold uppercase tracking-widest text-[#2563eb]">
          final · {config.playersOnField}v{config.playersOnField} · {fmtClock(elapsedSec)}
        </div>
        <h1 className="mt-2 text-2xl font-black leading-snug">{verdict}</h1>
        {dateLine && <p className="mt-1 text-sm text-neutral-500">{dateLine}</p>}
      </header>

      <section className="flex flex-col gap-3 rounded-[7px] bg-white p-4 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
        <SectionTitle>Playing time</SectionTitle>
        {rows.length === 0 && <p className="text-neutral-400">No players recorded.</p>}
        {rows.map(({ p, st }) => {
          const deltaSec = Math.round(st.playedSec - st.targetSec);
          const onTarget = Math.abs(deltaSec) <= ON_TARGET_TOLERANCE_SEC;
          const fillPct = Math.min(100, (st.playedSec / scale) * 100);
          const targetPct = Math.min(100, (st.targetSec / scale) * 100);
          const stints = timelines.get(p.id) ?? [];
          return (
            <div key={p.id} className="rounded-[7px] bg-[#f1f3f6] p-4">
              <div className="flex items-center gap-4">
                <Avatar player={p} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-extrabold">{p.name}</div>
                  <div className="text-sm tabular-nums text-neutral-500">
                    {st.shifts} shift{st.shifts === 1 ? "" : "s"} · longest {fmtClock(st.longestStintSec)}
                  </div>
                  {/* Played (fill) against fair target (tick) — one shared scale
                      across every row makes the comparison honest, and an
                      overplayed kid's fill simply runs past their own tick. */}
                  <div
                    className="relative mt-2 h-2 overflow-hidden rounded-full bg-hairline"
                    role="img"
                    aria-label={`${fmtMinutes(st.playedSec)} min played, target ${fmtMinutes(st.targetSec)} min`}
                  >
                    <div className="h-full rounded-full bg-[#1a1a1e]" style={{ width: `${fillPct}%` }} />
                    <div className="absolute inset-y-0 w-[2px] bg-[#2563eb]" style={{ left: `${targetPct}%` }} />
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-3xl font-black tabular-nums text-[#1a1a1e]">
                    {fmtMinutes(st.playedSec)}
                  </div>
                  <div
                    className={`text-xs font-extrabold tabular-nums ${
                      onTarget ? "text-neutral-400" : deltaSec > 0 ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {onTarget ? "on target" : `${deltaSec > 0 ? "+" : "−"}${fmtClock(Math.abs(deltaSec))}`}
                  </div>
                </div>
              </div>

              {/* When they were actually on the field — the "when did my kid
                  play" answer a parent scans for at a glance. */}
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-hairline">
                {stints.map(([s, e], i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 rounded-full bg-[#2563eb]"
                    style={{
                      left: `${(s / finalSec) * 100}%`,
                      width: `${Math.max(0.6, ((e - s) / finalSec) * 100)}%`,
                    }}
                  />
                ))}
                {quarterTicks.map((t) => (
                  <div
                    key={t}
                    className="absolute inset-y-0 w-px bg-white/70"
                    style={{ left: `${(t / finalSec) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {notes.length > 0 && (
        <section className="rounded-[7px] bg-accenttint p-4 ring-1 ring-accent/20">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-700/70">Game notes</div>
          <div className="mt-1 flex flex-col gap-0.5">
            {notes.map((n, i) => (
              <p key={i} className="py-0.5 text-sm font-bold text-orange-700">
                {n}
              </p>
            ))}
          </div>
        </section>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={onNewGame} className={btnPrimary}>
          New game
        </button>
        <p className="mt-3 text-center text-xs text-neutral-400">
          Screenshot this card for the parent group chat.
        </p>
      </div>
    </div>
  );
}
