import type {
  InternalGameState,
  InternalPlayerState,
} from "./gameStateTypes.js";

export function activePlayers(state: InternalGameState): InternalPlayerState[] {
  return state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
}

export function adjustCapital(
  player: InternalPlayerState,
  delta: number,
): number {
  const before = player.capital;
  player.capital = Math.max(0, player.capital + delta);
  return player.capital - before;
}
