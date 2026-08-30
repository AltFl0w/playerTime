import { DEFAULT_CONFIG, type GameConfig, type GameEvent, type Player, type PlayerId } from "./types";

export interface PendingSwap {
  id: string;
  outPlayerId: PlayerId;
  inPlayerId: PlayerId;
  // UI-side only (never an event): game-clock second when the alarm surfaces it.
  dueElapsedSec: number;
}

export interface GameRecord {
  events: GameEvent[];
  // Wall-clock ms when the currently open clock segment began (START/RESUME).
  // Null while paused/ended. Lets a refresh recover exact elapsed time.
  runningSinceMs: number | null;
  startedAtMs: number | null;
  pendingSwaps: PendingSwap[];
  // Game-sec the interval alarm has been satisfied up to, and the alarm
  // currently showing (if any) — persisted so a refresh mid-alarm re-shows
  // the reminder instead of silently eating it. Optional: absent on
  // pre-existing games. (Alarm is a structural copy of ui LiveAlarm — the
  // store can't import from ui.)
  alarmDoneAtSec?: number;
  alarm?: { kind: "interval" | "forced"; outId: string | null; inId: string | null } | null;
  // Game-sec the current 5-minute shift began (kickoff or last applied line
  // change). NEXT SUB = this + interval. Not derived from leftover stints —
  // that made the timer 0:00 the moment a partial swap landed.
  shiftStartedAtSec?: number;
}

export interface Store {
  version: 1;
  roster: Player[];
  config: GameConfig;
  game: GameRecord | null;
  sunMode: boolean;
}

const STORAGE_KEY = "playertime:v1";

export const TEAM_ROSTER: Player[] = [
  { id: "p-joey", name: "Joey" },
  { id: "p-joshua", name: "Joshua" },
  { id: "p-stetson", name: "Stetson" },
  { id: "p-paxton", name: "Paxton" },
  { id: "p-ethan", name: "Ethan" },
  { id: "p-mckay", name: "Mckay" },
  { id: "p-noah", name: "Noah" },
];

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyStore(): Store {
  return {
    version: 1,
    roster: TEAM_ROSTER.map((p) => ({ ...p })),
    config: { ...DEFAULT_CONFIG },
    game: null,
    sunMode: false,
  };
}

// Version-mismatched or corrupt data is discarded wholesale rather than
// partially trusted — a future schema change must never crash the sideline.
export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.roster)) return emptyStore();
    // Recognize the real team by our stable seeded ids, not by a kid's name —
    // renaming a kid must never look like test data and wipe the roster.
    const hasTeam = parsed.roster.some((p) => p && typeof p.id === "string" && p.id.startsWith("p-"));
    if (!hasTeam) {
      return {
        ...emptyStore(),
        config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
        sunMode: parsed.sunMode === true,
      };
    }
    return {
      version: 1,
      roster: parsed.roster,
      config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
      game: parsed.game ?? null,
      sunMode: parsed.sunMode === true,
    };
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // private mode / quota exceeded — app still works in memory
  }
}
