import { describe, expect, it } from "vitest";
import type { GameEvent } from "../types";
import { engine } from "./index";
import { autoRotateUntilEnd, cfg, ev, kids } from "./testing";

const SEVEN = kids("a", "b", "c", "d", "e", "f", "g");

describe("simulated games", () => {
  it("7 kids / 4 on field converge near-equal over a full game", () => {
    const config = cfg();
    const seeds = [ev.start(0), ...["a", "b", "c", "d"].map((id) => ev.subIn(id, 0))];
    const events = autoRotateUntilEnd(SEVEN, config, seeds, 0);
    const s = engine.computeState(events, config, SEVEN);
    const ps = Object.values(s.players);
    const played = ps.map((p) => p.playedSec);

    // Conservation: the field is fully occupied from kickoff to the whistle.
    expect(played.reduce((x, y) => x + y, 0)).toBe(config.playersOnField * config.gameLengthSec);
    expect(ps.every((p) => p.playedSec > 0 && p.shifts >= 1)).toBe(true);

    // Continuous target is 4/7 of the game; atomic 5-minute stints can't land
    // exactly on it, but everyone must finish within one stint of it. Stints can
    // overshoot the cap by a few alarms when several kids hit maxStint on the
    // same tick (the cap pulls one kid per alarm).
    for (const p of ps) {
      expect(Math.abs(p.playedSec - p.targetSec)).toBeLessThanOrEqual(config.subIntervalSec);
      expect(p.longestStintSec).toBeLessThanOrEqual(
        config.maxStintSec + 2 * config.subIntervalSec,
      );
    }
    const spread = Math.max(...played) - Math.min(...played);
    expect(spread).toBeLessThanOrEqual(2 * config.subIntervalSec);
  });

  it("refusal -> declined_wait excluded from denominator -> MARK_READY recovery ranks correctly", () => {
    // 45-minute game: gives the post-recovery equilibrium enough alarms to
    // separate the skipper from his teammates despite stint quantization.
    const config = cfg({ gameLengthSec: 2700 });
    const seeds: GameEvent[] = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      // t=300 alarm says IN: e. He refuses; coach falls back to f.
      ev.subOut("a", 300),
      ev.decline("e", 300),
      ev.subIn("f", 300),
      // Parent says he's ready at halftime.
      ev.ready("e", 600),
    ];
    const midDecline = engine.computeState(seeds.slice(0, 7), config, SEVEN);
    expect(midDecline.players.e.availability).toBe("declined_wait");

    // Recovery ranking at t=600: most paid-up on-field kid out (b/c/d tied at
    // 600s vs fresh f; roster order picks b), e next IN over g (both ratio-0
    // never-stinted, roster order).
    const afterReady = engine.computeState(seeds, config, SEVEN);
    expect(engine.suggestOut(afterReady, config)).toBe("b");
    expect(engine.suggestIn(afterReady, config)).toBe("e");

    const events = autoRotateUntilEnd(SEVEN, config, seeds, 600);
    const s = engine.computeState(events, config, SEVEN);

    expect(s.players.e.declines).toBe(1);
    expect(s.players.e.availability).toBe("available");
    // The skipped window cost e exactly that stretch of accrual (rate was 4/6).
    const post = config.gameLengthSec - 600; // ready at 600, rate back to 4/7
    expect(s.players.e.targetSec).toBeCloseTo(300 * (4 / 7) + post * (4 / 7), 6);
    expect(s.players.g.targetSec).toBeCloseTo(
      300 * (4 / 7) + 300 * (4 / 6) + post * (4 / 7),
      6,
    );
    expect(s.players.e.targetSec).toBeLessThan(
      Math.min(...["a", "b", "c", "d", "f", "g"].map((id) => s.players[id].targetSec)),
    );
    // Receipt: the skipper finishes no higher than any teammate (strict ordering
    // isn't always expressible — stint quantization can produce exact ties), the
    // field separates him from the pack, and nobody runs past their own target.
    const mates = ["a", "b", "c", "d", "f", "g"].map((id) => s.players[id].playedSec);
    expect(s.players.e.playedSec).toBeLessThanOrEqual(Math.min(...mates));
    expect(Math.max(...mates)).toBeGreaterThan(s.players.e.playedSec);
    for (const p of Object.values(s.players)) {
      expect(p.playedSec).toBeLessThanOrEqual(p.targetSec + config.subIntervalSec);
    }
    expect(Object.values(s.players).reduce((x, p) => x + p.playedSec, 0)).toBe(
      config.playersOnField * config.gameLengthSec,
    );
  });

  it("late arrival mid-game accrues only from arrival and gets slotted in fairly", () => {
    const config = cfg();
    const seeds: GameEvent[] = [
      ev.setAvail("g", 0, false),
      ev.start(0),
      ...["a", "b", "c", "d"].map((id) => ev.subIn(id, 0)),
      ev.setAvail("g", 900, true),
    ];
    const beforeArrival = engine.computeState(
      seeds.filter((e) => e.atSec < 900),
      config,
      SEVEN,
    );
    expect(beforeArrival.players.g.targetSec).toBe(0);
    expect(engine.rankInCandidates(beforeArrival).some((c) => c.playerId === "g")).toBe(false);

    const justAfter = engine.computeState(seeds, config, SEVEN);
    expect(justAfter.players.g.availability).toBe("available");
    expect(justAfter.players.g.targetSec).toBe(0);
    // g ties with fellow never-played e and f at ratio 0; roster order rules.
    expect(engine.suggestIn(justAfter, config)).toBe("e");
    expect(engine.rankInCandidates(justAfter).slice(0, 3).map((c) => c.playerId)).toEqual([
      "e",
      "f",
      "g",
    ]);

    const events = autoRotateUntilEnd(SEVEN, config, seeds, 900);
    const s = engine.computeState(events, config, SEVEN);
    expect(s.players.g.playedSec).toBeGreaterThan(0);
    expect(s.players.g.shifts).toBeGreaterThanOrEqual(1);
    expect(s.players.g.targetSec).toBeCloseTo(1500 * (4 / 7), 6);
    expect(Math.abs(s.players.g.playedSec - s.players.g.targetSec)).toBeLessThanOrEqual(
      config.subIntervalSec,
    );
    expect(Object.values(s.players).reduce((x, p) => x + p.playedSec, 0)).toBe(
      config.playersOnField * config.gameLengthSec,
    );
  });

  it("early departure freezes the leaver's target and speeds teammates' accrual", () => {
    const config = cfg();
    const seeds: GameEvent[] = [
      ev.start(0),
      ...["a", "b", "c", "d"].map((id) => ev.subIn(id, 0)),
      ev.subOut("d", 900),
      ev.setAvail("d", 900, false),
    ];
    const events = autoRotateUntilEnd(SEVEN, config, seeds, 900);
    const s = engine.computeState(events, config, SEVEN);

    expect(s.players.d.playedSec).toBe(900);
    expect(s.players.d.targetSec).toBeCloseTo(900 * (4 / 7), 6);
    // Teammates accrue at the higher post-departure rate for the rest.
    expect(s.players.g.targetSec).toBeCloseTo(900 * (4 / 7) + 1500 * (4 / 6), 6);
    expect(engine.rankInCandidates(s).some((c) => c.playerId === "d")).toBe(false);
    // Field runs a man short only until the next alarm backfills (900->1200).
    expect(
      Object.values(s.players)
        .filter((p) => p.playerId !== "d")
        .reduce((x, p) => x + p.playedSec, 0),
    ).toBe(config.playersOnField * config.gameLengthSec - 900 - 300);
  });

  it("uneven division (5 kids, 2 on field) minimizes spread without runaway minutes", () => {
    const config = cfg({
      playersOnField: 2,
      gameLengthSec: 1800,
      subIntervalSec: 300,
      maxStintSec: 600,
      shieldSec: 180,
    });
    const five = kids("a", "b", "c", "d", "e");
    const seeds = [ev.start(0), ev.subIn("a", 0), ev.subIn("b", 0)];
    const events = autoRotateUntilEnd(five, config, seeds, 0);
    const s = engine.computeState(events, config, five);
    const played = Object.values(s.players).map((p) => p.playedSec);

    expect(played.reduce((x, y) => x + y, 0)).toBe(2 * config.gameLengthSec);
    expect(Math.max(...played) - Math.min(...played)).toBeLessThanOrEqual(
      2 * config.subIntervalSec,
    );
    for (const p of Object.values(s.players)) {
      expect(Math.abs(p.playedSec - p.targetSec)).toBeLessThanOrEqual(2 * config.subIntervalSec);
      expect(p.playedSec).toBeGreaterThan(0);
    }
  });

  it("missed subs self-correct: over-target kids surface as next OUT", () => {
    const config = cfg({ subIntervalSec: 300, maxStintSec: 3600, shieldSec: 60 });
    const seeds = [ev.start(0), ...["a", "b", "c", "d"].map((id) => ev.subIn(id, 0))];
    // Coach misses alarms; first swap happens at 900 with a-d all over target.
    const afterFirstSwap = engine.computeState(
      [...seeds, ev.subOut("a", 900), ev.subIn("e", 900)],
      config,
      SEVEN,
    );
    expect(engine.suggestOut(afterFirstSwap, config)).toBe("b");
    const afterSecondSwap = engine.computeState(
      [
        ...seeds,
        ev.subOut("a", 900),
        ev.subIn("e", 900),
        ev.subOut("b", 1200),
        ev.subIn("f", 1200),
      ],
      config,
      SEVEN,
    );
    expect(engine.suggestOut(afterSecondSwap, config)).toBe("c");
  });
});
