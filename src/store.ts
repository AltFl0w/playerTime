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
}

export interface Store {
  version: 1;
  roster: Player[];
  config: GameConfig;
  game: GameRecord | null;
  sunMode: boolean;
}

const STORAGE_KEY = "playertime:v1";

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyStore(): Store {
  return { version: 1, roster: [], config: { ...DEFAULT_CONFIG }, game: null, sunMode: false };
}

// Version-mismatched or corrupt data is discarded wholesale rather than
// partially trusted — a future schema change must never crash the sideline.
export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.roster)) return emptyStore();
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
