import type { GameConfig, GameEvent, GameState, Player, PlayerId, PlayerTimeState } from "../types";

// target 0 && played 0 -> 0; played > 0 but nothing accrued (e.g. declined while on
// field) -> Infinity so they rank as most due-out in every comparator.
export function ratioOf(playedSec: number, targetSec: number): number {
  if (targetSec <= 0) return playedSec > 0 ? Number.POSITIVE_INFINITY : 0;
  return playedSec / targetSec;
}

function blankPlayer(id: PlayerId): PlayerTimeState {
  return {
    playerId: id,
    playedSec: 0,
    targetSec: 0,
    ratio: 0,
    onField: false,
    availability: "available",
    currentStintSec: 0,
    shifts: 0,
    declines: 0,
    longestStintSec: 0,
    creditSec: 0,
  };
}

export function computeState(events: GameEvent[], config: GameConfig, roster: Player[]): GameState {
  // Stable sort: same-atSec events keep log order, which is the only tie-break
  // signal for simultaneous taps (e.g. SUB_OUT then SUB_IN of a swap).
  const ordered = events.slice().sort((a, b) => a.atSec - b.atSec);

  const players: Record<PlayerId, PlayerTimeState> = {};
  const ensure = (id: PlayerId): PlayerTimeState => {
    let p = players[id];
    if (!p) {
      p = blankPlayer(id);
      players[id] = p;
    }
    return p;
  };
  for (const member of roster) ensure(member.id);

  let running = false;
  let ended = false;
  let elapsedSec = 0;
  let prev: number | null = null;

  // Accrues clock/stints/targets over [prev, untilSec] using state as it was
  // before the event at untilSec — the event itself then mutates from its own
  // instant onward.
  const accrue = (untilSec: number): void => {
    if (prev === null || !running || untilSec <= prev) return;
    const dt = untilSec - prev;
    elapsedSec += dt;
    const list = Object.values(players);
    let activeCount = 0;
    for (const p of list) if (p.availability === "available") activeCount += 1;
    // Clamp when fewer kids available than field slots: share rate can't exceed
    // real time or targets would be unreachable.
    const rate = activeCount > 0 ? Math.min(config.playersOnField, activeCount) / activeCount : 0;
    for (const p of list) {
      if (p.availability === "available") p.targetSec += dt * rate;
      if (p.onField) {
        p.playedSec += dt;
        p.currentStintSec += dt;
      }
    }
  };

  for (const ev of ordered) {
    accrue(ev.atSec);
    prev = ev.atSec;
    switch (ev.type) {
      case "START":
        running = true;
        break;
      case "PAUSE":
        running = false;
        break;
      case "RESUME":
        running = true;
        break;
      case "END":
        running = false;
        ended = true;
        break;
      case "SUB_IN": {
        const p = ensure(ev.playerId);
        if (!p.onField) {
          p.onField = true;
          p.shifts += 1;
          p.currentStintSec = 0;
        }
        break;
      }
      case "SUB_OUT": {
        const p = ensure(ev.playerId);
        if (p.onField) {
          p.onField = false;
          p.longestStintSec = Math.max(p.longestStintSec, p.currentStintSec);
          p.lastStintEndedSec = ev.atSec;
          p.currentStintSec = 0;
        }
        break;
      }
      case "DECLINE": {
        const p = ensure(ev.playerId);
        p.declines += 1;
        p.availability = "declined_wait";
        break;
      }
      case "MARK_READY": {
        ensure(ev.playerId).availability = "available";
        break;
      }
      case "SET_AVAILABILITY": {
        const p = ensure(ev.playerId);
        p.availability = ev.available ? "available" : "inactive";
        // Credit is a live-board offset only. Never touch playedSec — the
        // report still shows what actually happened on the field.
        if (ev.available && ev.creditSec && ev.creditSec > 0) {
          p.creditSec = (p.creditSec ?? 0) + ev.creditSec;
        }
        break;
      }
      case "ADJUST_TIME": {
        // Manual bookkeeping correction ("he actually played more/less") —
        // touches only the total, never the live stint, so shields and the
        // heat cap keep working off what's physically happening on the field.
        const p = ensure(ev.playerId);
        p.playedSec = Math.max(0, p.playedSec + ev.deltaSec);
        break;
      }
    }
  }

  const list = Object.values(players);
  for (const p of list) p.ratio = ratioOf(p.playedSec, p.targetSec);
  const forcedSwap = list.some((p) => p.onField && p.currentStintSec >= config.maxStintSec);

  return { clockRunning: running, elapsedSec, ended, players, forcedSwap };
}
