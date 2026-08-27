import { engine } from "../engine";
import type { GameConfig, GameState, Player } from "../types";
import type { InChip, OutChip } from "./SwapChips";

export function buildSwapChips(
  state: GameState,
  config: GameConfig,
  roster: Player[],
): {
  outCandidates: OutChip[];
  inCandidates: InChip[];
  topOutId: string | null;
  topInId: string | null;
} {
  const byId = new Map(roster.map((p) => [p.id, p]));

  const rankedOut = engine.rankOutCandidates(state, config);
  // Shield nudges, never blanks the OFF side: with everyone fresh (early game)
  // fall back to the least-bad pull, or Next-up taps degrade into one-sided
  // "Send in"s that overfill the field.
  const topOutId =
    rankedOut.find((c) => c.eligible)?.playerId ?? rankedOut[0]?.playerId ?? null;
  const outCandidates: OutChip[] = rankedOut.flatMap((c) => {
    const st = state.players[c.playerId];
    const p = byId.get(c.playerId);
    if (!st || !p) return [];
    const suggested = c.playerId === topOutId;
    return [
      {
        player: p,
        stintSec: st.currentStintSec,
        playedSec: st.playedSec,
        suggested,
        reason: suggested
          ? st.currentStintSec >= config.maxStintSec
            ? "over heat cap"
            : "most time on"
          : undefined,
        fresh: !c.eligible,
      },
    ];
  });

  const rankedIn = engine.rankInCandidates(state);
  const topInId = rankedIn[0]?.playerId ?? null;
  const inCandidates: InChip[] = rankedIn.flatMap((c) => {
    const st = state.players[c.playerId];
    const p = byId.get(c.playerId);
    if (!st || !p) return [];
    const suggested = c.playerId === topInId;
    return [
      {
        player: p,
        playedSec: st.playedSec,
        suggested,
        reason: suggested ? "least played" : undefined,
      },
    ];
  });

  return { outCandidates, inCandidates, topOutId, topInId };
}
