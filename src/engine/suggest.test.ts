import { describe, expect, it } from "vitest";
import { engine } from "./index";
import { computeState } from "./state";
import { cfg, ev, kids } from "./testing";

describe("suggestOut: shield", () => {
  it("blocks fresh subs even when they have the highest ratio", () => {
    // x was inactive early so his target is tiny and his ratio towers over y's.
    const config = cfg({ playersOnField: 2, shieldSec: 60, maxStintSec: 600 });
    const roster = kids("w", "x", "y", "z");
    const base = [
      ev.start(0),
      ev.setAvail("x", 0, false),
      ev.subIn("y", 0),
      ev.setAvail("x", 299, true),
      ev.subIn("x", 299),
    ];

    const at350 = computeState([...base, ev.end(350)], config, roster);
    expect(at350.players.x.currentStintSec).toBe(51); // under shield
    expect(at350.players.x.ratio).toBeGreaterThan(at350.players.y.ratio);
    expect(engine.suggestOut(at350, config)).toBe("y");
    expect(engine.rankOutCandidates(at350, config).map((c) => c.playerId)).toEqual(["y", "x"]);
    expect(engine.rankOutCandidates(at350, config)[1].eligible).toBe(false);

    const at599 = computeState([...base, ev.end(599)], config, roster);
    expect(at599.forcedSwap).toBe(false);
    expect(engine.suggestOut(at599, config)).toBe("x"); // shield passed: highest ratio wins
  });

  it("returns null when every on-field kid is still shielded", () => {
    const s = computeState(
      [ev.start(0), ev.subIn("a", 0), ev.end(100)],
      cfg({ playersOnField: 1, shieldSec: 180 }),
      kids("a"),
    );
    expect(engine.suggestOut(s, cfg({ playersOnField: 1, shieldSec: 180 }))).toBeNull();
    expect(engine.rankOutCandidates(s, cfg({ playersOnField: 1, shieldSec: 180 }))[0].eligible).toBe(false);
  });
});

describe("suggestOut: heat cap", () => {
  it("forcedSwap outranks higher-ratio players as an absolute override", () => {
    const config = cfg({ playersOnField: 2, shieldSec: 60, maxStintSec: 600 });
    const roster = kids("w", "x", "y", "z");
    const base = [
      ev.start(0),
      ev.setAvail("x", 0, false),
      ev.subIn("y", 0),
      ev.setAvail("x", 299, true),
      ev.subIn("x", 299),
    ];

    const at600 = computeState([...base, ev.end(600)], config, roster);
    expect(at600.forcedSwap).toBe(true);
    // y just hit the cap; x still has the far higher ratio but the cap is absolute.
    expect(at600.players.x.ratio).toBeGreaterThan(at600.players.y.ratio);
    const ranked = engine.rankOutCandidates(at600, config);
    expect(ranked[0].playerId).toBe("y");
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[1].playerId).toBe("x");
    expect(engine.suggestOut(at600, config)).toBe("y");
  });
});

describe("suggestOut: ratio ordering and nulls", () => {
  it("picks the highest-ratio eligible player; null with nobody on field", () => {
    // Rate clamps to 1 with only 2 available kids, so played == elapsed for both.
    const config = cfg({ playersOnField: 4 });
    const roster = kids("a", "b");
    const s = computeState([ev.start(0), ev.subIn("a", 0), ev.subIn("b", 300), ev.end(600)], config, roster);
    expect(s.players.a.ratio).toBeCloseTo(1, 9);
    expect(engine.suggestOut(s, config)).toBe("a"); // highest ratio (also longest stint)
    const empty = computeState([ev.start(0), ev.end(100)], config, roster);
    expect(engine.suggestOut(empty, config)).toBeNull();
  });
});

describe("suggestIn: eligibility and ordering", () => {
  it("considers only available off-field players", () => {
    const roster = kids("v", "w", "x", "y", "z");
    const events = [
      ev.start(0),
      ev.subIn("v", 0),
      ev.subIn("w", 0),
      ev.decline("x", 10),
      ev.setAvail("y", 20, false),
      ev.end(30),
    ];
    const s = computeState(events, cfg({ playersOnField: 2 }), roster);
    expect(engine.rankInCandidates(s).map((c) => c.playerId)).toEqual(["z"]);
    expect(engine.suggestIn(s, cfg({ playersOnField: 2 }))).toBe("z");

    const full = computeState([...events.slice(0, -1), ev.subIn("z", 40)], cfg({ playersOnField: 2 }), roster);
    expect(engine.suggestIn(full, cfg({ playersOnField: 2 }))).toBeNull();
  });

  it("breaks ratio ties by earlier last-stint end, then roster order", () => {
    const config = cfg({ playersOnField: 2 });
    // a plays [0,300], b plays [300,600]: equal minutes, equal ratios, but a came
    // off at 300 while b came off at 600, so a has waited longer. d anchors the
    // second slot the whole game; c relieves d from 600.
    const events = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("d", 0),
      ev.subOut("a", 300),
      ev.subIn("b", 300),
      ev.subOut("b", 600),
      ev.subIn("c", 600),
      ev.end(750),
    ];
    const s = computeState(events, config, kids("a", "b", "c", "d"));
    expect(s.players.a.playedSec).toBe(s.players.b.playedSec);
    expect(s.players.a.ratio).toBeCloseTo(s.players.b.ratio, 9);
    expect(s.players.a.lastStintEndedSec).toBe(300);
    expect(s.players.b.lastStintEndedSec).toBe(600);
    expect(engine.suggestIn(s, cfg({ playersOnField: 2 }))).toBe("a");
    expect(engine.rankInCandidates(s).slice(0, 2).map((c) => c.playerId)).toEqual(["a", "b"]);

    // Never-stinted kids count as "ended before the game" and win ties first.
    const withF = computeState(events, config, kids("a", "b", "c", "d", "f"));
    expect(engine.rankInCandidates(withF)[0].playerId).toBe("f");
    expect(engine.rankInCandidates(withF).slice(1, 3).map((c) => c.playerId)).toEqual(["a", "b"]);
  });

  it("falls through to roster order when ends are also tied", () => {
    const config = cfg({ playersOnField: 2 });
    const s = computeState(
      [ev.start(0), ev.subIn("b", 0), ev.subIn("c", 0), ev.subOut("b", 300), ev.subOut("c", 300), ev.end(600)],
      config,
      kids("b", "c"),
    );
    expect(s.players.b.ratio).toBeCloseTo(s.players.c.ratio, 9);
    expect(s.players.b.lastStintEndedSec).toBe(s.players.c.lastStintEndedSec);
    expect(engine.suggestIn(s, cfg({ playersOnField: 2 }))).toBe("b");
  });
});

describe("engine api shape", () => {
  it("exposes exactly the EngineApi surface", () => {
    expect(Object.keys(engine).sort()).toEqual(
      ["computeState", "rankInCandidates", "rankOutCandidates", "suggestIn", "suggestOut"],
    );
  });
});
