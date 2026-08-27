import type { GameConfig, GameEvent, Player } from "../types";
import { DEFAULT_CONFIG } from "../types";
import { autoRotateUntilEnd, ev } from "../engine/testing";
import type { Store } from "../store";

// Demo fixture for testing on a real phone. Dev-only: the UI that loads this
// is gated behind import.meta.env.DEV, so production builds never see it.

const DEMO_IDS = ["demo-1", "demo-2", "demo-3", "demo-4", "demo-5", "demo-6", "demo-7"];

export const DEMO_ROSTER: Player[] = [
  { id: "demo-1", name: "Ava", number: 2, note: "ponytail, fast" },
  { id: "demo-2", name: "Benji", number: 5 },
  { id: "demo-3", name: "Carlos", number: 7, note: "left footed" },
  { id: "demo-4", name: "Dana", number: 8 },
  { id: "demo-5", name: "Ellie", number: 9, note: "blonde hair, glasses" },
  { id: "demo-6", name: "Finn", number: 11, note: "meltdown-prone, needs warning before subs" },
  { id: "demo-7", name: "Gia", number: 13, note: "usually late" },
];

// Storyline exercised by the demo game:
// - Gia (demo-7) arrives ~8 min in (late arrival)
// - Finn (demo-6) refuses his first turn at the 10-min mark, parent gets him
//   ready ~4 min later (declined_wait -> MARK_READY recovery)
// - Everything else auto-rotates via the engine to a full 40-min game
export function buildDemoGame(config: GameConfig = DEFAULT_CONFIG) {
  const roster = DEMO_ROSTER;
  const [ava, benji, carlos, dana, ellie, finn, gia] = DEMO_IDS;

  const events: GameEvent[] = [
    ...roster.map((p) => ev.setAvail(p.id, 0, true)),
    ev.subIn(ava, 0),
    ev.subIn(benji, 0),
    ev.subIn(carlos, 0),
    ev.subIn(dana, 0),
    ev.start(0),
    // window 1 — ellie is off-field (dana is already on)
    ev.subOut(ava, 300),
    ev.subIn(ellie, 300),
    // Gia shows up mid-window 2
    ev.setAvail(gia, 480, true),
    // window 2 — gia is off-field (carlos is already on)
    ev.subOut(benji, 600),
    ev.subIn(gia, 600),
    // Finn's first turn comes up and he's having none of it
    ev.decline(finn, 620),
    // Parent reports Finn is ready; he goes in at the next natural window
    ev.ready(finn, 900),
  ];

  return {
    events: autoRotateUntilEnd(roster, config, events, 900),
    runningSinceMs: null,
    startedAtMs: Date.now() - 50 * 60 * 1000,
    pendingSwaps: [],
  };
}

export function demoStore(): Store {
  return { version: 1, roster: DEMO_ROSTER.map((p) => ({ ...p })), config: { ...DEFAULT_CONFIG }, game: buildDemoGame(), sunMode: false };
}
