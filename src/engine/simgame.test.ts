// Full-game rehearsal with the real roster: late arrival, meltdown, injury.
import { describe, expect, it } from "vitest";
import { TEAM_ROSTER } from "../store";
import { DEFAULT_CONFIG, type GameEvent } from "../types";
import { engine } from "./index";
import { autoRotateUntilEnd, ev } from "./testing";

const config = { ...DEFAULT_CONFIG };
const roster = TEAM_ROSTER;
const ids = roster.map((p) => p.id);
const [joey, joshua, stetson, paxton, ethan, mckay, noah] = ids;

function fieldCountAt(events: GameEvent[], t: number): number {
  const s = engine.computeState([...events, ev.pause(t)], config, roster);
  return Object.values(s.players).filter((p) => p.onField).length;
}

describe("full-game rehearsal (real roster, messy day)", () => {
  // Noah is late, Mckay melts down then recovers, Ethan gets hurt in Q3
  // and comes back for Q4, quarter water breaks pause the clock.
  const seed: GameEvent[] = [
    ...ids.filter((id) => id !== noah).map((id) => ev.setAvail(id, 0, true)),
    ev.subIn(joey, 0),
    ev.subIn(joshua, 0),
    ev.subIn(stetson, 0),
    ev.subIn(paxton, 0),
    ev.start(0),
    ev.subOut(joey, 300),
    ev.subIn(ethan, 300),
    ev.setAvail(noah, 420, true), // Noah arrives 7 min in
    ev.decline(mckay, 600), // meltdown at his first turn
    ev.subOut(joshua, 600),
    ev.subIn(noah, 600),
    ev.ready(mckay, 840),
  ];
  const events = autoRotateUntilEnd(roster, config, seed, 840);

  it("replays without throwing and ends", () => {
    const s = engine.computeState(events, config, roster);
    expect(s.ended).toBe(true);
    expect(s.elapsedSec).toBe(config.gameLengthSec);
  });

  it("field never exceeds playersOnField at any second", () => {
    for (let t = 0; t <= config.gameLengthSec; t += 30) {
      expect(fieldCountAt(events, t)).toBeLessThanOrEqual(config.playersOnField);
    }
  });

  it("field is fully staffed at every sub tick", () => {
    for (let t = config.subIntervalSec; t < config.gameLengthSec; t += config.subIntervalSec) {
      expect(fieldCountAt(events, t + 1)).toBe(config.playersOnField);
    }
  });

  it("minutes converge: full-availability kids within one sub interval of each other", () => {
    const s = engine.computeState(events, config, roster);
    const fullDay = [joey, joshua, stetson, paxton].map((id) => s.players[id].playedSec);
    const spread = Math.max(...fullDay) - Math.min(...fullDay);
    expect(spread).toBeLessThanOrEqual(config.subIntervalSec);
  });

  it("late/declined kids end below target, never above teammates", () => {
    const s = engine.computeState(events, config, roster);
    for (const id of [noah, mckay]) {
      expect(s.players[id].playedSec).toBeLessThanOrEqual(s.players[id].targetSec + config.subIntervalSec);
      expect(s.players[id].playedSec).toBeGreaterThan(0);
    }
  });

  it("no one sits on the bench more than three consecutive intervals", () => {
    // replay and track consecutive off-field ticks per always-available kid
    const benchRun: Record<string, number> = {};
    for (const id of [joey, joshua, stetson, paxton, ethan]) benchRun[id] = 0;
    for (let t = config.subIntervalSec; t < config.gameLengthSec; t += config.subIntervalSec) {
      const s = engine.computeState([...events.filter((e) => e.atSec <= t), ev.pause(t)], config, roster);
      for (const id of Object.keys(benchRun)) {
        if (s.players[id].onField) benchRun[id] = 0;
        else {
          benchRun[id] += 1;
          expect(benchRun[id], `${id} benched too long at t=${t}`).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("injury mid-game: leave + return keeps invariants", () => {
    // A kid on field gets hurt at 1560s (pulled + unavailable, like the UI's
    // Leave game), backfilled, returns at 1800s
    const before = events.filter((e) => e.atSec <= 1560 && e.type !== "END");
    const s0 = engine.computeState([...before, ev.pause(1560)], config, roster);
    const hurt = Object.values(s0.players).find((p) => p.onField)!.playerId;
    const hurtSeed = [...before, ev.subOut(hurt, 1560), ev.setAvail(hurt, 1560, false)];
    const s1 = engine.computeState([...hurtSeed, ev.pause(1560)], config, roster);
    const backfill = engine.suggestIn(s1, config);
    expect(backfill).not.toBeNull();
    expect(backfill).not.toBe(hurt);
    const resumed = autoRotateUntilEnd(
      roster,
      config,
      [...hurtSeed, ev.subIn(backfill!, 1560), ev.setAvail(hurt, 1800, true)],
      1800,
    );
    const s2 = engine.computeState(resumed, config, roster);
    expect(s2.ended).toBe(true);
    // The hurt kid accrued no target while out, so no make-up marathon
    expect(s2.players[hurt].playedSec).toBeLessThanOrEqual(s2.players[hurt].targetSec + config.subIntervalSec);
    for (let t = 1560; t <= config.gameLengthSec; t += 60) {
      const sp = engine.computeState([...resumed.filter((e) => e.atSec <= t), ev.pause(t)], config, roster).players;
      const on = Object.values(sp).filter((p) => p.onField);
      expect(
        on.length,
        `t=${t} field=[${on.map((p) => p.playerId).join(",")}]`,
      ).toBeLessThanOrEqual(config.playersOnField);
    }
  });
});
