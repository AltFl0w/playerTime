// Shared contracts between the engine (pure logic) and UI layers.
// Engine owns behavior; UI owns rendering + persistence. Change with both in mind.

export type PlayerId = string;

export type Availability = "available" | "inactive" | "declined_wait";

export interface Player {
  id: PlayerId;
  name: string;
  number?: number;
  photoDataUrl?: string;
  note?: string;
}

export interface GameConfig {
  playersOnField: number;
  gameLengthSec: number;
  quarterCount: number;
  subIntervalSec: number;
  maxStintSec: number;
  shieldSec: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  playersOnField: 4,
  gameLengthSec: 40 * 60,
  quarterCount: 4,
  subIntervalSec: 5 * 60,
  maxStintSec: 10 * 60,
  shieldSec: 3 * 60,
};

export type GameEvent =
  | { type: "START"; atSec: number }
  | { type: "PAUSE"; atSec: number }
  | { type: "RESUME"; atSec: number }
  | { type: "END"; atSec: number }
  | { type: "SUB_IN"; atSec: number; playerId: PlayerId }
  | { type: "SUB_OUT"; atSec: number; playerId: PlayerId }
  | { type: "DECLINE"; atSec: number; playerId: PlayerId }
  | { type: "MARK_READY"; atSec: number; playerId: PlayerId }
  | { type: "SET_AVAILABILITY"; atSec: number; playerId: PlayerId; available: boolean }
  | { type: "ADJUST_TIME"; atSec: number; playerId: PlayerId; deltaSec: number };

export interface PlayerTimeState {
  playerId: PlayerId;
  playedSec: number;
  targetSec: number;
  ratio: number;
  onField: boolean;
  availability: Availability;
  currentStintSec: number;
  shifts: number;
  declines: number;
  longestStintSec: number;
  // Why: suggestIn's tie-break ("earlier last-stint end wins") needs when the player
  // last came off; not derivable from the other fields. Optional so existing
  // constructors stay valid. Set by computeState on SUB_OUT.
  lastStintEndedSec?: number;
}

export interface GameState {
  clockRunning: boolean;
  elapsedSec: number;
  ended: boolean;
  players: Record<PlayerId, PlayerTimeState>;
  forcedSwap: boolean; // someone on field hit maxStintSec
}

// Public engine API (implemented in src/engine/index.ts)
export interface EngineApi {
  computeState(events: GameEvent[], config: GameConfig, roster: Player[]): GameState;
  suggestOut(state: GameState, config: GameConfig): PlayerId | null;
  suggestIn(state: GameState, config: GameConfig): PlayerId | null;
  rankOutCandidates(
    state: GameState,
    config: GameConfig,
  ): Array<{ playerId: PlayerId; ratio: number; eligible: boolean }>;
  rankInCandidates(state: GameState): Array<{ playerId: PlayerId; ratio: number }>;
}
