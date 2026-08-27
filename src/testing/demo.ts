import type { GameConfig, GameEvent, Player } from "../types";
import { DEFAULT_CONFIG } from "../types";
import { autoRotateUntilEnd, ev } from "../engine/testing";
import { TEAM_ROSTER, type Store } from "../store";

// Demo fixture for testing on a real phone. Dev-only: the UI that loads this
// is gated behind import.meta.env.DEV, so production builds never see it.

export const DEMO_ROSTER: Player[] = TEAM_ROSTER.map((p) => ({ ...p }));

const DEMO_IDS = DEMO_ROSTER.map((p) => p.id);

// Storyline exercised by the demo game:
// - Noah arrives ~8 min in (late arrival)
// - Mckay refuses his first turn at the 10-min mark, parent gets him
//   ready ~4 min later (declined_wait -> MARK_READY recovery)
// - Everything else auto-rotates via the engine to a full 40-min game
export function buildDemoGame(config: GameConfig = DEFAULT_CONFIG) {
  const roster = DEMO_ROSTER;
  const [joey, joshua, stetson, paxton, ethan, mckay, noah] = DEMO_IDS;

  const events: GameEvent[] = [
    ...roster.map((p) => ev.setAvail(p.id, 0, true)),
    ev.subIn(joey, 0),
    ev.subIn(joshua, 0),
    ev.subIn(stetson, 0),
    ev.subIn(paxton, 0),
    ev.start(0),
    // window 1 — ethan is off-field (paxton is already on)
    ev.subOut(joey, 300),
    ev.subIn(ethan, 300),
    // Noah shows up mid-window 2
    ev.setAvail(noah, 480, true),
    // window 2 — noah is off-field (stetson is already on)
    ev.subOut(joshua, 600),
    ev.subIn(noah, 600),
    // Mckay's first turn comes up and he's having none of it
    ev.decline(mckay, 620),
    // Parent reports Mckay is ready; he goes in at the next natural window
    ev.ready(mckay, 900),
  ];

  return {
    events: autoRotateUntilEnd(roster, config, events, 900),
    runningSinceMs: null,
    startedAtMs: Date.now() - 50 * 60 * 1000,
    pendingSwaps: [],
  };
}

export function demoStore(): Store {
  return {
    version: 1,
    roster: DEMO_ROSTER.map((p) => ({ ...p })),
    config: { ...DEFAULT_CONFIG },
    game: buildDemoGame(),
    sunMode: false,
  };
}
