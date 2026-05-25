import type { InternalGameState, InternalPlayerState } from "./gameStateTypes.js";

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function getPlayer(
  state: InternalGameState,
  playerId: string,
): InternalPlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

export { getPlayer as getPlayerFromState };
