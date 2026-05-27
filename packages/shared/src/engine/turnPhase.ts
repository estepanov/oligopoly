import type { InternalGameState } from "./gameStateTypes.js";
import { ACTION_POINTS_PER_TURN } from "./setup.js";
import { getPlayer } from "./stateUtils.js";

export function currentTurnPlayerId(
  state: InternalGameState,
): string | undefined {
  const idx = state.currentPlayerIndex;
  if (idx < 0 || idx >= state.turnOrder.length) {
    return undefined;
  }
  return state.turnOrder[idx];
}

export function enterWaitingForRoll(
  state: InternalGameState,
  playerId: string,
): void {
  state.phase = "waiting_for_roll";
  const actor = getPlayer(state, playerId);
  if (!actor) {
    return;
  }
  actor.actionPointsRemaining = actor.inRegulation ? 0 : ACTION_POINTS_PER_TURN;
}

export function enterWaitingForRollForCurrentTurn(
  state: InternalGameState,
): void {
  const actorId = currentTurnPlayerId(state);
  if (!actorId) {
    state.phase = "waiting_for_roll";
    return;
  }
  enterWaitingForRoll(state, actorId);
}
