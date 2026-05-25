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

export function activeEligibleAuctionPlayers(state: GameState): string[] {
  if (!state.pendingAuction) return [];
  const eliminated = new Set(state.eliminatedPlayerIds ?? []);
  return state.pendingAuction.eligiblePlayerIds.filter(
    (playerId) => !eliminated.has(playerId),
  );
}

export function canParticipateInAuction(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId) return false;
  return activeEligibleAuctionPlayers(state).includes(myPlayerId);
}

export function hasSubmittedAuction(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId || !state.pendingAuction) return false;
  return state.pendingAuction.mySubmission !== undefined;
}

/**
 * Broadcast WS snapshots omit viewer-specific auction fields. Preserve the
 * local player's sealed submission until settlement or a tie-break reset.
 */
export function mergeAuctionClientView(
  previous: GameState | null,
  incoming: GameState,
): GameState {
  const prevAuction = previous?.pendingAuction;
  const nextAuction = incoming.pendingAuction;
  if (!prevAuction?.mySubmission || !nextAuction) {
    return incoming;
  }
  if (nextAuction.mySubmission !== undefined) {
    return incoming;
  }
  if (
    String(prevAuction.tilePosition) !== String(nextAuction.tilePosition) ||
    (prevAuction.tieBreakRound ?? 0) !== (nextAuction.tieBreakRound ?? 0)
  ) {
    return incoming;
  }

  return {
    ...incoming,
    pendingAuction: {
      ...nextAuction,
      mySubmission: prevAuction.mySubmission,
    },
  };
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
