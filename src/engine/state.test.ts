import { describe, expect, it } from "vitest";
import type { GameEvent } from "../types";
import { computeState } from "./state";
import { engine } from "./index";
import { cfg, ev, kids } from "./testing";

const SEVEN = kids("a", "b", "c", "d", "e", "f", "g");

describe("computeState: empty / degenerate inputs", () => {
  it("empty events and empty roster produce a clean idle state", () => {
    const s = computeState([], cfg(), []);
    expect(s.clockRunning).toBe(false);
    expect(s.elapsedSec).toBe(0);
    expect(s.ended).toBe(false);
    expect(s.forcedSwap).toBe(false);
    expect(s.players).toEqual({});
    expect(engine.suggestOut(s, cfg())).toBeNull();
    expect(engine.suggestIn(s, cfg())).toBeNull();
    expect(engine.rankOutCandidates(s, cfg())).toEqual([]);
    expect(engine.rankInCandidates(s)).toEqual([]);
  });

  it("empty events with a roster zero every player and do not throw", () => {
    const s = computeState([], cfg(), SEVEN);
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
      const p = s.players[id];
      expect(p.playedSec).toBe(0);
      expect(p.targetSec).toBe(0);
      expect(p.ratio).toBe(0);
      expect(p.onField).toBe(false);
      expect(p.availability).toBe("available");
      expect(p.currentStintSec).toBe(0);
      expect(p.shifts).toBe(0);
      expect(p.declines).toBe(0);
      expect(p.longestStintSec).toBe(0);
      expect(p.lastStintEndedSec).toBeUndefined();
    }
    expect(engine.suggestOut(s, cfg())).toBeNull();
    // Equal never-played candidates; roster order breaks the tie.
    expect(engine.suggestIn(s, cfg())).toBe("a");
  });

  it("events referencing players not on the roster are tolerated", () => {
    const events = [ev.start(0), ev.subIn("ghost", 10), ev.decline("ghost2", 20), ev.end(30)];
    const s = computeState(events, cfg(), []);
    expect(s.players["ghost"].onField).toBe(true);
    expect(s.players["ghost"].shifts).toBe(1);
    expect(s.players["ghost2"].availability).toBe("declined_wait");
    expect(s.players["ghost2"].declines).toBe(1);
  });
});

describe("computeState: clock", () => {
  it("advances only between START/RESUME and PAUSE/END", () => {
    const base = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.pause(300),
    ];
    const paused = computeState(base, cfg(), SEVEN);
    expect(paused.clockRunning).toBe(false);
    expect(paused.elapsedSec).toBe(300);

    const s = computeState(
      [...base, ev.resume(600), ev.subOut("a", 900), ev.end(900)],
      cfg(),
      SEVEN,
    );
    expect(s.clockRunning).toBe(false);
    expect(s.ended).toBe(true);
    // 0-300 plus 600-900; the pause gap is frozen.
    expect(s.elapsedSec).toBe(600);
  });

  it("PAUSE freezes stints and played seconds as well as the clock", () => {
    const events = [ev.start(0), ev.subIn("a", 0), ev.pause(300), ev.resume(600), ev.end(900)];
    const s = computeState(events, cfg({ playersOnField: 1 }), kids("a"));
    expect(s.elapsedSec).toBe(600);
    expect(s.players.a.playedSec).toBe(600);
    expect(s.players.a.currentStintSec).toBe(600);
  });

  it("does nothing before START (pre-game availability toggles)", () => {
    const events = [ev.setAvail("g", 10, false), ev.setAvail("f", 20, false)];
    const s = computeState(events, cfg(), SEVEN);
    expect(s.elapsedSec).toBe(0);
    expect(s.clockRunning).toBe(false);
    expect(s.players.g.availability).toBe("inactive");
  });
});

describe("computeState: target accrual integral", () => {
  it("integrates rate = playersOnField / activeCount across segments", () => {
    const events = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.end(600),
    ];
    const s = computeState(events, cfg(), SEVEN);
    expect(s.players.a.targetSec).toBeCloseTo(600 * (4 / 7), 9);
    // Waiting but available kids accrue identically.
    expect(s.players.g.targetSec).toBeCloseTo(600 * (4 / 7), 9);
  });

  it("declined_wait shrinks the denominator for teammates and freezes the decliner", () => {
    const events = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.decline("e", 0),
      ev.ready("e", 600),
      ev.end(1200),
    ];
    const s = computeState(events, cfg(), SEVEN);
    // 0-600 at 4/6 (active=6 while e is declined) + 600-1200 at 4/7 (all seven).
    expect(s.players.a.targetSec).toBeCloseTo(600 * (4 / 6) + 600 * (4 / 7), 9);
    // e accrues nothing while declined, then resumes at 4/7.
    expect(s.players.e.targetSec).toBeCloseTo(600 * (4 / 7), 9);
  });

  it("unavailable players do not accrue target", () => {
    const events = [ev.start(0), ev.setAvail("e", 0, false), ev.subIn("a", 0), ev.end(600)];
    const s = computeState(events, cfg(), SEVEN);
    expect(s.players.e.targetSec).toBe(0);
    expect(s.players.a.targetSec).toBeCloseTo(600 * (4 / 6), 9);
  });

  it("clamps share rate when fewer kids than field slots", () => {
    const events = [ev.start(0), ev.subIn("a", 0), ev.subIn("b", 0), ev.end(600)];
    const s = computeState(events, cfg(), kids("a", "b"));
    // rate = min(4, 2)/2 = 1 -> target tracks elapsed exactly.
    expect(s.players.a.targetSec).toBe(600);
    expect(s.players.a.playedSec).toBe(600);
    expect(s.players.b.targetSec).toBe(600);
  });
});

describe("computeState: stints", () => {
  it("accumulates between SUB_IN and SUB_OUT and resets per stint", () => {
    const events = [ev.start(0), ev.subIn("a", 0), ev.subOut("a", 300), ev.subIn("a", 600), ev.end(900)];
    const s = computeState(events, cfg({ playersOnField: 1 }), kids("a"));
    const p = s.players.a;
    expect(p.playedSec).toBe(600);
    expect(p.currentStintSec).toBe(300);
    expect(p.longestStintSec).toBe(300);
    expect(p.shifts).toBe(2);
    expect(p.lastStintEndedSec).toBe(300);
  });

  it("sets forcedSwap only while an on-field stint reaches maxStintSec", () => {
    const one = cfg({ playersOnField: 1, maxStintSec: 600 });
    expect(
      computeState([ev.start(0), ev.subIn("a", 0), ev.end(599)], one, kids("a")).forcedSwap,
    ).toBe(false);
    expect(
      computeState([ev.start(0), ev.subIn("a", 0), ev.end(600)], one, kids("a")).forcedSwap,
    ).toBe(true);
    // Long past stint does not force a swap once they are off.
    expect(
      computeState([ev.start(0), ev.subIn("a", 0), ev.subOut("a", 700), ev.end(700)], one, kids("a"))
        .forcedSwap,
    ).toBe(false);
  });
});

describe("computeState: availability transitions", () => {
  const run = (tail: GameEvent[]) => computeState([ev.start(0), ...tail, ev.end(100)], cfg(), SEVEN);

  it("DECLINE -> declined_wait, MARK_READY -> available", () => {
    let s = run([ev.decline("e", 10)]);
    expect(s.players.e.availability).toBe("declined_wait");
    expect(s.players.e.declines).toBe(1);
    s = run([ev.decline("e", 10), ev.ready("e", 20)]);
    expect(s.players.e.availability).toBe("available");
    expect(s.players.e.declines).toBe(1);
  });

  it("SET_AVAILABILITY toggles available/inactive directly", () => {
    let s = run([ev.setAvail("e", 10, false)]);
    expect(s.players.e.availability).toBe("inactive");
    s = run([ev.setAvail("e", 10, false), ev.setAvail("e", 20, true)]);
    expect(s.players.e.availability).toBe("available");
    // Explicit set also clears declined_wait.
    s = run([ev.decline("e", 10), ev.setAvail("e", 20, true)]);
    expect(s.players.e.availability).toBe("available");
  });
});

describe("computeState: ordering robustness", () => {
  const refusalGame = (): GameEvent[] => [
    ev.start(0),
    ev.subIn("a", 0),
    ev.subIn("b", 0),
    ev.subIn("c", 0),
    ev.subIn("d", 0),
    ev.subOut("a", 300),
    ev.decline("e", 300),
    ev.subIn("f", 300),
    ev.ready("e", 600),
    ev.subOut("b", 900),
    ev.subIn("a", 900),
    ev.end(2400),
  ];

  it("out-of-order logs sort back to identical state", () => {
    const sorted = refusalGame();
    const shuffled = [
      sorted[9],
      sorted[3],
      sorted[0],
      sorted[11],
      sorted[6],
      sorted[2],
      sorted[8],
      sorted[1],
      sorted[10],
      sorted[4],
      sorted[7],
      sorted[5],
    ];
    const s1 = computeState(sorted, cfg(), SEVEN);
    const s2 = computeState(shuffled, cfg(), SEVEN);
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s1));
  });

  it("same-timestamp events keep their log order (stable sort)", () => {
    const inThenOut = [ev.start(0), ev.subIn("b", 300), ev.subOut("b", 300)];
    const outThenIn = [ev.start(0), ev.subOut("b", 300), ev.subIn("b", 300)];
    const one = cfg({ playersOnField: 1 });
    const s1 = computeState(inThenOut, one, kids("b"));
    const s2 = computeState(outThenIn, one, kids("b"));
    expect(s1.players.b.onField).toBe(false);
    expect(s1.players.b.shifts).toBe(1);
    // OUT of a non-on-field kid is ignored defensively.
    expect(s2.players.b.onField).toBe(true);
    expect(s2.players.b.currentStintSec).toBe(0);
  });
});
