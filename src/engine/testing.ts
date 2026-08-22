import type { GameConfig, GameEvent, Player } from "../types";
import { DEFAULT_CONFIG } from "../types";
import { engine } from "./index";

export const kid = (id: string, name = id): Player => ({ id, name });

export const kids = (...ids: string[]): Player[] => ids.map((id) => kid(id));

export const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ ...DEFAULT_CONFIG, ...over });

export const ev = {
  start: (atSec: number): GameEvent => ({ type: "START", atSec }),
  pause: (atSec: number): GameEvent => ({ type: "PAUSE", atSec }),
  resume: (atSec: number): GameEvent => ({ type: "RESUME", atSec }),
  end: (atSec: number): GameEvent => ({ type: "END", atSec }),
  subIn: (playerId: string, atSec: number): GameEvent => ({ type: "SUB_IN", atSec, playerId }),
  subOut: (playerId: string, atSec: number): GameEvent => ({ type: "SUB_OUT", atSec, playerId }),
  decline: (playerId: string, atSec: number): GameEvent => ({ type: "DECLINE", atSec, playerId }),
  ready: (playerId: string, atSec: number): GameEvent => ({ type: "MARK_READY", atSec, playerId }),
  setAvail: (playerId: string, atSec: number, available: boolean): GameEvent => ({
    type: "SET_AVAILABILITY",
    atSec,
    playerId,
    available,
  }),
};

// Appends coach-follows-the-alarm rotations (one OUT + one IN per tick, chosen by
// the engine's own suggestions) from the first subInterval multiple after
// `afterSec` up to (not including) gameLengthSec, then ends the game.
//
// The engine is event-sourced (no wall clock), so state only advances to the
// last logged event. To evaluate suggestions "as of" tick t we compute against
// a transient log ending in PAUSE@t — a zero-length freeze that closes accrual
// exactly at t. It is never persisted, so the next evaluation replays cleanly.
export function autoRotateUntilEnd(
  roster: Player[],
  config: GameConfig,
  seedEvents: GameEvent[],
  afterSec: number,
): GameEvent[] {
  const events = seedEvents.slice();
  for (let t = config.subIntervalSec; t < config.gameLengthSec; t += config.subIntervalSec) {
    if (t <= afterSec) continue;
    const s = engine.computeState([...events, ev.pause(t)], config, roster);
    // One alarm-driven swap, then backfill any empty slots (early departures,
    // absences) so the modelled coach keeps the field fully staffed.
    const inQueue = engine.rankInCandidates(s);
    let onCount = Object.values(s.players).filter((p) => p.onField).length;
    let qi = 0;
    const out = engine.suggestOut(s, config);
    if (out !== null) {
      events.push(ev.subOut(out, t));
      onCount -= 1;
    }
    while (onCount < config.playersOnField && qi < inQueue.length) {
      events.push(ev.subIn(inQueue[qi].playerId, t));
      qi += 1;
      onCount += 1;
    }
  }
  events.push(ev.end(config.gameLengthSec));
  return events;
}
