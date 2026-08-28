import type { GameEvent } from "../types";
import type { GameRecord } from "../store";

const CLOCK = new Set<GameEvent["type"]>(["START", "PAUSE", "RESUME", "END"]);

const COACH = new Set<GameEvent["type"]>([
  "SUB_IN",
  "SUB_OUT",
  "DECLINE",
  "MARK_READY",
  "SET_AVAILABILITY",
]);

function playerIdOf(event: GameEvent): string | undefined {
  return "playerId" in event ? event.playerId : undefined;
}

function firstToken(id: string | undefined, nameOf: (id: string) => string): string {
  if (!id) return "Player";
  const token = nameOf(id).trim().split(/\s+/)[0] ?? "";
  return token || "Player";
}

// Pre-START availability + starter SUB_INs are setup, not a coach tap to rewind.
// Trailing PAUSE/RESUME/END stay put so undoing a sub doesn't un-whistle the game.
export function lastUndoableSlice(events: GameEvent[]): { start: number; end: number } | null {
  const startIdx = events.findIndex((e) => e.type === "START");
  if (startIdx === -1) return null;

  let end = events.length - 1;
  while (end > startIdx && CLOCK.has(events[end].type)) end -= 1;
  if (end <= startIdx) return null;

  const last = events[end];
  if (!COACH.has(last.type)) return null;

  const prevIdx = end - 1;
  const prev = prevIdx > startIdx ? events[prevIdx] : undefined;

  // A line change is one coach action however many kids it moved: undo the
  // whole contiguous run of SUB_IN/SUB_OUT events sharing this atSec.
  if (last.type === "SUB_IN" || last.type === "SUB_OUT") {
    let start = end;
    while (
      start - 1 > startIdx &&
      (events[start - 1].type === "SUB_IN" || events[start - 1].type === "SUB_OUT") &&
      events[start - 1].atSec === last.atSec
    ) {
      start -= 1;
    }
    return { start, end };
  }

  // Pulling a kid off the field and marking them gone is one "left" gesture.
  if (
    last.type === "SET_AVAILABILITY" &&
    last.available === false &&
    prev?.type === "SUB_OUT" &&
    prev.playerId === last.playerId &&
    prev.atSec === last.atSec
  ) {
    return { start: prevIdx, end };
  }

  return { start: end, end };
}

export function undoLastCoachAction(
  game: GameRecord,
): { game: GameRecord; undone: GameEvent[] } | null {
  const slice = lastUndoableSlice(game.events);
  if (!slice) return null;

  const { start, end } = slice;
  const undone = game.events.slice(start, end + 1);
  const newEvents = [...game.events.slice(0, start), ...game.events.slice(end + 1)];

  const readyIds = new Set<string>();
  for (const event of undone) {
    if (event.type === "MARK_READY") readyIds.add(event.playerId);
  }
  const pendingSwaps =
    readyIds.size > 0
      ? game.pendingSwaps.filter((swap) => !readyIds.has(swap.inPlayerId))
      : game.pendingSwaps;

  return {
    game: { ...game, events: newEvents, pendingSwaps },
    undone,
  };
}

export function formatUndone(undone: GameEvent[], nameOf: (id: string) => string): string {
  if (undone.length > 2 && undone.every((e) => e.type === "SUB_IN" || e.type === "SUB_OUT")) {
    return "Undid line change";
  }
  if (undone.length === 2) {
    const types = new Set(undone.map((e) => e.type));
    if (types.has("SUB_OUT") && types.has("SUB_IN")) return "Undid swap";
    const avail = undone.find((e) => e.type === "SET_AVAILABILITY");
    if (types.has("SUB_OUT") && avail?.type === "SET_AVAILABILITY" && avail.available === false) {
      return `Undid ${firstToken(playerIdOf(undone[0]), nameOf)} left`;
    }
  }

  const event = undone[0];
  if (!event) return "Undid last tap";
  const first = firstToken(playerIdOf(event), nameOf);
  switch (event.type) {
    case "SUB_OUT":
      return `Undid ${first} off`;
    case "SUB_IN":
      return `Undid ${first} on`;
    case "DECLINE":
      return `Undid ${first} skipped`;
    case "MARK_READY":
      return `Undid ${first} ready`;
    case "SET_AVAILABILITY":
      return event.available ? `Undid ${first} arrived` : `Undid ${first} left`;
    default:
      return "Undid last tap";
  }
}
