import type { GameConfig, GameState, PlayerId } from "../types";

interface OutCandidate {
  playerId: PlayerId;
  ratio: number;
  eligible: boolean;
  hitMax: boolean;
  stint: number;
  order: number;
}

// `||` chain tolerates NaN from Infinity - Infinity (equal infinite ratios) and
// -Infinity - -Infinity (equal never-played lastEnds): NaN falls through to the
// next key instead of poisoning the sort.
function byOutSelection(a: OutCandidate, b: OutCandidate): number {
  return (
    Number(b.hitMax) - Number(a.hitMax) || b.ratio - a.ratio || b.stint - a.stint || a.order - b.order
  );
}

export function rankOutCandidates(
  state: GameState,
  config: GameConfig,
): Array<{ playerId: PlayerId; ratio: number; eligible: boolean }> {
  const order = new Map<PlayerId, number>();
  Object.keys(state.players).forEach((id, i) => order.set(id, i));

  const decorated: OutCandidate[] = Object.values(state.players)
    .filter((p) => p.onField)
    .map((p) => ({
      playerId: p.playerId,
      ratio: p.ratio,
      // Heat cap overrides shields; otherwise fresh subs are protected.
      eligible: state.forcedSwap || p.currentStintSec >= config.shieldSec,
      hitMax: p.currentStintSec >= config.maxStintSec,
      stint: p.currentStintSec,
      order: order.get(p.playerId) ?? Number.MAX_SAFE_INTEGER,
    }));

  const eligible = decorated.filter((c) => c.eligible).sort(byOutSelection);
  const shielded = decorated.filter((c) => !c.eligible).sort(byOutSelection);
  return eligible.concat(shielded).map(({ playerId, ratio, eligible: elg }) => ({
    playerId,
    ratio,
    eligible: elg,
  }));
}

export function suggestOut(state: GameState, config: GameConfig): PlayerId | null {
  for (const c of rankOutCandidates(state, config)) {
    if (c.eligible) return c.playerId;
  }
  return null;
}

interface InCandidate {
  playerId: PlayerId;
  ratio: number;
  lastEnd: number;
  order: number;
}

export function rankInCandidates(state: GameState): Array<{ playerId: PlayerId; ratio: number }> {
  const order = new Map<PlayerId, number>();
  Object.keys(state.players).forEach((id, i) => order.set(id, i));

  const decorated: InCandidate[] = Object.values(state.players)
    .filter((p) => !p.onField && p.availability === "available")
    .map((p) => ({
      playerId: p.playerId,
      ratio: p.ratio,
      // Never-stinted kids have "ended" before the game started -> win ties.
      lastEnd: p.lastStintEndedSec ?? Number.NEGATIVE_INFINITY,
      order: order.get(p.playerId) ?? Number.MAX_SAFE_INTEGER,
    }));

  decorated.sort((a, b) => a.ratio - b.ratio || a.lastEnd - b.lastEnd || a.order - b.order);
  return decorated.map(({ playerId, ratio }) => ({ playerId, ratio }));
}

export function suggestIn(state: GameState, _config: GameConfig): PlayerId | null {
  const ranked = rankInCandidates(state);
  return ranked.length > 0 ? ranked[0].playerId : null;
}
