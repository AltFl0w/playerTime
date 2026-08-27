import { describe, expect, it } from "vitest";
import { engine } from "../engine";
import { cfg, ev, kid } from "../engine/testing";
import type { GameEvent, Player } from "../types";
import { buildReportSummary, formatReportText } from "./report";

function summaryOf(
  roster: Player[],
  events: GameEvent[],
  config = cfg({ playersOnField: 4 }),
  startedAtMs: number | null = null,
  elapsedSec?: number,
) {
  const state = engine.computeState(events, config, roster);
  return buildReportSummary(
    roster,
    config,
    state,
    elapsedSec ?? state.elapsedSec,
    events,
    startedAtMs,
  );
}

describe("buildReportSummary", () => {
  it("even-game verdict when spread ≤ 90s", () => {
    const roster = [kid("a", "Ava"), kid("b", "Benji"), kid("c", "Carlos"), kid("d", "Dana")];
    const events: GameEvent[] = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.end(600),
    ];
    const s = summaryOf(roster, events);
    expect(s.verdict).toBe("Even game — everyone within 0:00");
    expect(s.formatLabel).toBe("4v4");
    expect(s.elapsedLabel).toBe("10:00");
    expect(s.rows[0].firstName).toBe("Ava");
    expect(s.rows.every((r) => r.onTarget)).toBe(true);
  });

  it("outlier-below-own-target uses first name", () => {
    const roster = [
      kid("a", "Ava"),
      kid("b", "Benji"),
      kid("c", "Carlos"),
      kid("d", "Dana"),
      kid("e", "Maya Singh"),
    ];
    const events: GameEvent[] = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.end(600),
    ];
    const s = summaryOf(roster, events);
    expect(s.verdict).toBe("Maya played 8:00 less");
    expect(s.verdict).not.toContain("Singh");
  });

  it("late / left / decline notes", () => {
    const roster = [
      kid("a", "Ava"),
      kid("b", "Benji"),
      kid("c", "Carlos"),
      kid("d", "Dana"),
      kid("g", "Gia"),
      kid("f", "Finn"),
    ];
    const events: GameEvent[] = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.decline("f", 300),
      ev.setAvail("g", 480, true),
      ev.subOut("a", 600),
      ev.setAvail("a", 600, false),
      ev.end(900),
    ];
    const s = summaryOf(roster, events);
    expect(s.notes).toContain("Gia arrived at 8:00");
    expect(s.notes).toContain("Ava left at 10:00");
    expect(s.notes).toContain("Finn declined 1 shift");
  });
});

describe("formatReportText", () => {
  it("contains verdict + a kid line", () => {
    const roster = [kid("a", "Ava"), kid("b", "Benji"), kid("c", "Carlos"), kid("d", "Dana")];
    const events: GameEvent[] = [
      ev.start(0),
      ev.subIn("a", 0),
      ev.subIn("b", 0),
      ev.subIn("c", 0),
      ev.subIn("d", 0),
      ev.end(600),
    ];
    const s = summaryOf(roster, events, cfg({ playersOnField: 4 }), Date.UTC(2026, 7, 22));
    const text = formatReportText(s);
    expect(text).toContain("PlayerTime · 4v4 · 10:00");
    expect(text).toContain(s.verdict);
    expect(text).toMatch(/Ava\s+10\.0 min/);
    expect(text).toContain("on target");
    if (s.dateLine) expect(text).toContain(s.dateLine);
    expect(text.split("\n")[0]).toBe("PlayerTime · 4v4 · 10:00");
    expect(text.split("\n")[1]).toBe(s.verdict);
  });
});
