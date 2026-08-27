import type { GameConfig, GameEvent, GameState, Player, PlayerId, PlayerTimeState } from "../types";
import { fmtClock, fmtMinutes } from "./format";

// A spread this small reads as "equal enough" to a parent — not a bug to explain.
const FAIR_SPREAD_SEC = 90;
const ON_TARGET_TOLERANCE_SEC = 30;

type Row = { p: Player; st: PlayerTimeState };

export type ReportRow = {
  id: string;
  name: string;
  firstName: string;
  playedSec: number;
  targetSec: number;
  deltaSec: number; // played - target
  onTarget: boolean;
};

export type ReportSummary = {
  formatLabel: string; // "4v4"
  elapsedLabel: string; // fmtClock(elapsedSec)
  verdict: string;
  dateLine: string;
  rows: ReportRow[]; // most minutes first, same as screen
  notes: string[];
};

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

export function buildReportSummary(
  roster: Player[],
  config: GameConfig,
  state: GameState,
  elapsedSec: number,
  events: GameEvent[],
  startedAtMs: number | null,
): ReportSummary {
  const rows: Row[] = roster
    .map((p) => ({ p, st: state.players[p.id] }))
    .filter((r): r is Row => !!r.st)
    .sort((a, b) => b.st.playedSec - a.st.playedSec);

  // Kids marked absent the whole game never had a fairness stake in it —
  // leave them out of the verdict entirely.
  const eligibleRows = rows.filter((r) => !(r.st.targetSec === 0 && r.st.playedSec === 0));

  const { lateAt, leftAt } = buildAttendanceNotes(events);

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

  return {
    formatLabel: `${config.playersOnField}v${config.playersOnField}`,
    elapsedLabel: fmtClock(elapsedSec),
    verdict,
    dateLine,
    rows: rows.map(({ p, st }) => {
      const deltaSec = Math.round(st.playedSec - st.targetSec);
      return {
        id: p.id,
        name: p.name,
        firstName: p.name.split(" ")[0],
        playedSec: st.playedSec,
        targetSec: st.targetSec,
        deltaSec,
        onTarget: Math.abs(deltaSec) <= ON_TARGET_TOLERANCE_SEC,
      };
    }),
    notes,
  };
}

export function formatReportText(s: ReportSummary): string {
  const lines: string[] = [`PlayerTime · ${s.formatLabel} · ${s.elapsedLabel}`, s.verdict];
  if (s.dateLine) lines.push(s.dateLine);

  if (s.rows.length > 0) {
    lines.push("");
    const nameWidth = Math.max(4, ...s.rows.map((r) => r.firstName.length));
    for (const row of s.rows) {
      const mins = `${fmtMinutes(row.playedSec)} min`;
      const status = row.onTarget
        ? "on target"
        : `${row.deltaSec > 0 ? "+" : "−"}${fmtClock(Math.abs(row.deltaSec))}`;
      lines.push(`${row.firstName.padEnd(nameWidth)}  ${mins}    ${status}`);
    }
  }

  if (s.notes.length > 0) {
    lines.push("");
    for (const note of s.notes) lines.push(note);
  }

  return lines.join("\n");
}
