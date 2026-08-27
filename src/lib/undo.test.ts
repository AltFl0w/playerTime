import { describe, expect, it } from "vitest";
import { engine } from "../engine";
import { cfg, ev, kids } from "../engine/testing";
import type { GameEvent } from "../types";
import type { GameRecord, PendingSwap } from "../store";
import { formatUndone, lastUndoableSlice, undoLastCoachAction } from "./undo";

const FOUR = ["a", "b", "c", "d"] as const;

function starters(atSec = 0): GameEvent[] {
  return FOUR.map((id) => ev.subIn(id, atSec));
}

function rec(events: GameEvent[], pendingSwaps: PendingSwap[] = []): GameRecord {
  return { events, runningSinceMs: null, startedAtMs: 1, pendingSwaps };
}

function names(id: string): string {
  return ({ a: "Ava Chen", b: "Benji", e: "Ellie Park", f: "Finn" } as Record<string, string>)[id] ?? id;
}

describe("lastUndoableSlice / undoLastCoachAction", () => {
  it("[SET_AVAIL*n, SUB_IN*starters, START] → null", () => {
    const events = [
      ev.setAvail("a", 0, true),
      ev.setAvail("b", 0, true),
      ev.setAvail("c", 0, true),
      ev.setAvail("d", 0, true),
      ev.setAvail("e", 0, true),
      ...starters(),
      ev.start(0),
    ];
    expect(lastUndoableSlice(events)).toBeNull();
    expect(undoLastCoachAction(rec(events))).toBeNull();
  });

  it("trailing PAUSE after SUB_OUT → pops SUB_OUT, keeps PAUSE", () => {
    const events = [ev.start(0), ...starters(), ev.subOut("a", 300), ev.pause(300)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.subOut("a", 300)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters(), ev.pause(300)]);
    expect(lastUndoableSlice(events)).toEqual({ start: 5, end: 5 });
  });

  it("consecutive same-atSec SUB_OUT+SUB_IN → pops both", () => {
    const events = [ev.start(0), ...starters(), ev.subOut("a", 300), ev.subIn("e", 300)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.subOut("a", 300), ev.subIn("e", 300)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters()]);
  });

  it("same pair different atSec → pops only last SUB_IN", () => {
    const events = [ev.start(0), ...starters(), ev.subOut("a", 300), ev.subIn("e", 301)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.subIn("e", 301)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters(), ev.subOut("a", 300)]);
  });

  it("SUB_OUT then DECLINE same second → pops only DECLINE", () => {
    const events = [ev.start(0), ...starters(), ev.subOut("a", 300), ev.decline("e", 300)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.decline("e", 300)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters(), ev.subOut("a", 300)]);
  });

  it("SUB_OUT + SET_AVAILABILITY false same player/same atSec → pops both", () => {
    const events = [ev.start(0), ...starters(), ev.subOut("a", 300), ev.setAvail("a", 300, false)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.subOut("a", 300), ev.setAvail("a", 300, false)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters()]);
  });

  it("SET_AVAILABILITY true after START → pops that one", () => {
    const events = [ev.start(0), ...starters(), ev.setAvail("e", 480, true)];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.setAvail("e", 480, true)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters()]);
  });

  it("MARK_READY with matching pendingSwaps IN row → event popped AND pending dropped", () => {
    const events = [ev.start(0), ...starters(), ev.ready("e", 300)];
    const keep: PendingSwap = { id: "keep", outPlayerId: "b", inPlayerId: "f", dueElapsedSec: 300 };
    const drop: PendingSwap = { id: "drop", outPlayerId: "a", inPlayerId: "e", dueElapsedSec: 300 };
    const result = undoLastCoachAction(rec(events, [keep, drop]));
    expect(result).not.toBeNull();
    expect(result!.undone).toEqual([ev.ready("e", 300)]);
    expect(result!.game.events).toEqual([ev.start(0), ...starters()]);
    expect(result!.game.pendingSwaps).toEqual([keep]);
  });

  it("START/PAUSE/RESUME/END never in undone", () => {
    const events = [
      ev.start(0),
      ...starters(),
      ev.pause(300),
      ev.resume(300),
      ev.subOut("a", 420),
      ev.pause(420),
      ev.end(600),
    ];
    const result = undoLastCoachAction(rec(events));
    expect(result).not.toBeNull();
    expect(result!.undone.every((e) => e.type !== "START" && e.type !== "PAUSE" && e.type !== "RESUME" && e.type !== "END")).toBe(
      true,
    );
    expect(result!.undone).toEqual([ev.subOut("a", 420)]);
    expect(result!.game.events.filter((e) => e.type === "START" || e.type === "PAUSE" || e.type === "RESUME" || e.type === "END")).toEqual(
      [ev.start(0), ev.pause(300), ev.resume(300), ev.pause(420), ev.end(600)],
    );

    const clockOnly = [ev.start(0), ev.pause(10), ev.resume(10), ev.end(20)];
    expect(lastUndoableSlice(clockOnly)).toBeNull();
    expect(undoLastCoachAction(rec(clockOnly))).toBeNull();
  });

  it("replay: computeState(afterUndo) equals computeState(events before the undone tap)", () => {
    const roster = kids("a", "b", "c", "d", "e");
    const config = cfg();
    const before = [ev.start(0), ...starters(), ev.pause(300)];
    const withSwap = [...before, ev.subOut("a", 300), ev.subIn("e", 300)];
    const result = undoLastCoachAction(rec(withSwap));
    expect(result).not.toBeNull();
    expect(engine.computeState(result!.game.events, config, roster)).toEqual(
      engine.computeState(before, config, roster),
    );
  });
});

describe("formatUndone", () => {
  it("labels swap, leave, and single taps; empty nameOf → Player", () => {
    expect(formatUndone([ev.subOut("a", 1), ev.subIn("e", 1)], names)).toBe("Undid swap");
    expect(formatUndone([ev.subOut("a", 1), ev.setAvail("a", 1, false)], names)).toBe("Undid Ava left");
    expect(formatUndone([ev.subOut("a", 1)], names)).toBe("Undid Ava off");
    expect(formatUndone([ev.subIn("e", 1)], names)).toBe("Undid Ellie on");
    expect(formatUndone([ev.decline("f", 1)], names)).toBe("Undid Finn skipped");
    expect(formatUndone([ev.ready("e", 1)], names)).toBe("Undid Ellie ready");
    expect(formatUndone([ev.setAvail("e", 1, true)], names)).toBe("Undid Ellie arrived");
    expect(formatUndone([ev.setAvail("a", 1, false)], names)).toBe("Undid Ava left");
    expect(formatUndone([ev.pause(1)], names)).toBe("Undid last tap");
    expect(formatUndone([ev.subIn("a", 1)], () => "")).toBe("Undid Player on");
  });
});
