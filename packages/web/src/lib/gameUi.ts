import type { GameState, PlayerState } from "@oligopoly/validation";

export function currentActorId(state: GameState): string | null {
  const order = state.turnOrder;
  const index = state.currentPlayerIndex;
  if (
    !order?.length ||
    index === undefined ||
    index < 0 ||
    index >= order.length
  ) {
    return null;
  }
  return order[index] ?? null;
}

export function playerById(
  state: GameState,
  playerId: string,
): PlayerState | undefined {
  return state.players?.find((player) => player.playerId === playerId);
}

export function isMyTurn(state: GameState, myPlayerId: string | null): boolean {
  if (!myPlayerId || state.phase === "game_over") return false;
  return currentActorId(state) === myPlayerId;
}

export function isAuctionPhase(state: GameState): boolean {
  return (
    state.phase === "waiting_for_auction_bids" && Boolean(state.pendingAuction)
  );
}

export function canParticipateInAuction(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId || !state.pendingAuction) return false;
  return state.pendingAuction.eligiblePlayerIds.includes(myPlayerId);
}

export function hasSubmittedAuction(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId || !state.pendingAuction) return false;
  const auction = state.pendingAuction as typeof state.pendingAuction & {
    mySubmission?: number | "pass";
  };
  return auction.mySubmission !== undefined;
}

export function ownedTilesForPlayer(
  state: GameState,
  playerId: string,
): Array<{
  position: number | string;
  mortgaged: boolean;
  developmentTokens: number;
}> {
  const player = playerById(state, playerId);
  if (!player) return [];

  return player.ownedTilePositions.map((position) => {
    const tileState = state.tiles?.find(
      (tile) => String(tile.position) === String(position),
    );
    return {
      position,
      mortgaged: tileState?.mortgaged ?? false,
      developmentTokens: tileState?.developmentTokens ?? 0,
    };
  });
}
