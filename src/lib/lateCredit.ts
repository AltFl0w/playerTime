import type { GameState, PlayerId } from "../types";

// A kid who walks up after the first full rotation would otherwise sit at
// 0:00 the rest of the game — the board keeps saying "least," and taking
// them off feels mean. Once everyone who's here has already been on, give
// the late arrival the team's average so they rotate with the pack.
//
// Before that first rotation, they're just another kid who hasn't gone in
// yet — leave them at zero.
export function lateArrivalCredit(state: GameState, arrivingId: PlayerId): number {
  const present = Object.values(state.players).filter(
    (p) => p.playerId !== arrivingId && p.availability !== "inactive",
  );
  if (present.length === 0) return 0;
  if (present.some((p) => p.shifts === 0 && p.playedSec <= 0)) return 0;
  const sum = present.reduce((s, p) => s + p.playedSec, 0);
  return Math.round(sum / present.length);
}

export function shownSec(playedSec: number, creditSec = 0): number {
  return playedSec + creditSec;
}
