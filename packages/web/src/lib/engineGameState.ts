import type { InternalGameState } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";

/**
 * Server-persisted game snapshots align with the shared engine shape; use at
 * trust boundaries where APIs return `GameState` but engine helpers need
 * `InternalGameState`.
 */
export function engineGameState(state: GameState): InternalGameState {
  return state as InternalGameState;
}
