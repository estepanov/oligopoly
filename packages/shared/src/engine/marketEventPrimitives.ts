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

export function transferCapital(
  payer: InternalPlayerState,
  receiver: InternalPlayerState,
  amount: number,
): number {
  if (amount <= 0) {
    return 0;
  }
  const payerDelta = adjustCapital(payer, -amount);
  const paid = Math.max(0, -payerDelta);
  adjustCapital(receiver, paid);
  return payerDelta;
}
