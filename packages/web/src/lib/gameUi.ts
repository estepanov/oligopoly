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
    (state.phase === "waiting_for_auction_bids" ||
      state.phase === "waiting_for_auction_settle") &&
    Boolean(state.pendingAuction)
  );
}

export function isSealedAuctionPhase(state: GameState): boolean {
  return (
    isAuctionPhase(state) && state.pendingAuction?.auctionType === "sealed_bids"
  );
}

export function isOpenAuctionPhase(state: GameState): boolean {
  return (
    isAuctionPhase(state) && state.pendingAuction?.auctionType === "open_bids"
  );
}

export function isLiveAuctionPhase(state: GameState): boolean {
  return (
    isAuctionPhase(state) &&
    state.pendingAuction?.auctionType === "live_bidding"
  );
}

export function currentAuctionHighBid(state: GameState): number {
  const auction = state.pendingAuction;
  if (!auction) return 0;
  const floor = (auction.tieBreakMinBid ?? 1) - 1;
  let high = floor;
  for (const value of Object.values(auction.submissions)) {
    if (typeof value === "number" && value > high) {
      high = value;
    }
  }
  return high;
}

export function isAuctionBiddingPhase(state: GameState): boolean {
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
  if (
    state.pendingAuction.auctionType === "open_bids" ||
    state.pendingAuction.auctionType === "live_bidding"
  ) {
    return Object.hasOwn(state.pendingAuction.submissions, myPlayerId);
  }
  return state.pendingAuction.mySubmission !== undefined;
}

/** Merge broadcast-safe realtime snapshots with viewer-only fields already loaded over authenticated HTTP. */
export function mergeAuctionClientView(
  previous: GameState | null,
  incoming: GameState,
): GameState {
  const prevAuction = previous?.pendingAuction;
  const nextAuction = incoming.pendingAuction;
  if (
    !prevAuction?.mySubmission ||
    !nextAuction ||
    nextAuction.auctionType === "open_bids" ||
    nextAuction.auctionType === "live_bidding"
  ) {
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

export function isCoordinationPhase(state: GameState): boolean {
  return state.phase === "syndicate_coordination";
}

export function playerNeedsCoordinationAck(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId || !isCoordinationPhase(state)) return false;
  const player = playerById(state, myPlayerId);
  return player?.coordinationAcknowledged !== true;
}

export function syndicateAdminIdForPlayer(
  state: GameState,
  myPlayerId: string | null,
): string | null {
  if (!myPlayerId || !state.syndicates) return null;
  const player = playerById(state, myPlayerId);
  const syndicateId = player?.syndicateId;
  if (!syndicateId) return null;
  return state.syndicates[syndicateId]?.adminId ?? null;
}

export function isSyndicateAdmin(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!myPlayerId) return false;
  return syndicateAdminIdForPlayer(state, myPlayerId) === myPlayerId;
}

export function otherHumanPlayers(
  state: GameState,
  myPlayerId: string | null,
): PlayerState[] {
  if (!myPlayerId) return [];
  return (state.players ?? []).filter((p) => p.playerId !== myPlayerId);
}

export function isDisruptionNullifyPhase(state: GameState): boolean {
  return state.phase === "waiting_for_disruption_nullify";
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
