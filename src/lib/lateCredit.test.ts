import { describe, expect, it } from "vitest";
import { computeState } from "../engine/state";
import { cfg, ev, kids } from "../engine/testing";
import { lateArrivalCredit, shownSec } from "./lateCredit";

const roster = kids("joey", "joshua", "stetson", "paxton", "ethan", "mckay", "noah");

describe("lateArrivalCredit", () => {
  it("stays 0 when someone present still hasn't been on", () => {
    // First four start; ethan+mckay on bench never-on; noah arrives.
    const s = computeState(
      [
        ev.setAvail("joey", 0, true),
        ev.setAvail("joshua", 0, true),
        ev.setAvail("stetson", 0, true),
        ev.setAvail("paxton", 0, true),
        ev.setAvail("ethan", 0, true),
        ev.setAvail("mckay", 0, true),
        ev.setAvail("noah", 0, false),
        ev.subIn("joey", 0),
        ev.subIn("joshua", 0),
        ev.subIn("stetson", 0),
        ev.subIn("paxton", 0),
        ev.start(0),
        ev.pause(180),
      ],
      cfg(),
      roster,
    );
    expect(lateArrivalCredit(s, "noah")).toBe(0);
  });

  it("gives the team average once everyone present has been on", () => {
    const s = computeState(
      [
        ev.setAvail("joey", 0, true),
        ev.setAvail("joshua", 0, true),
        ev.setAvail("stetson", 0, true),
        ev.setAvail("paxton", 0, true),
        ev.setAvail("ethan", 0, true),
        ev.setAvail("mckay", 0, true),
        ev.setAvail("noah", 0, false),
        ev.subIn("joey", 0),
        ev.subIn("joshua", 0),
        ev.subIn("stetson", 0),
        ev.subIn("paxton", 0),
        ev.start(0),
        ev.subOut("joey", 300),
        ev.subOut("joshua", 300),
        ev.subOut("stetson", 300),
        ev.subIn("ethan", 300),
        ev.subIn("mckay", 300),
        ev.subIn("joey", 300), // everyone except noah has a shift
        ev.pause(600),
      ],
      cfg(),
      roster,
    );
    // joey 300+300=600, joshua/stetson 300, paxton 600, ethan/mckay 300
    const credit = lateArrivalCredit(s, "noah");
    expect(credit).toBeGreaterThan(0);
    const presentPlayed = ["joey", "joshua", "stetson", "paxton", "ethan", "mckay"].map(
      (id) => s.players[id].playedSec,
    );
    const avg = Math.round(presentPlayed.reduce((a, b) => a + b, 0) / 6);
    expect(credit).toBe(avg);
  });
});

describe("credit does not inflate real minutes", () => {
  it("stores creditSec and leaves playedSec at 0", () => {
    const s = computeState(
      [ev.start(0), ev.setAvail("noah", 600, true, 240), ev.pause(600)],
      cfg(),
      roster,
    );
    expect(s.players.noah.playedSec).toBe(0);
    expect(s.players.noah.creditSec).toBe(240);
    expect(shownSec(s.players.noah.playedSec, s.players.noah.creditSec)).toBe(240);
  });
});
