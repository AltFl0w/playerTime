import type { EngineApi } from "../types";
import { computeState } from "./state";
import { rankInCandidates, rankOutCandidates, suggestIn, suggestOut } from "./suggest";

export { computeState, rankInCandidates, rankOutCandidates, suggestIn, suggestOut };

export const engine: EngineApi = {
  computeState,
  suggestOut,
  suggestIn,
  rankOutCandidates,
  rankInCandidates,
};

export default engine;
