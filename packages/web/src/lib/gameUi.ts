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

/**
 * Short, action-oriented guidance for the player whose turn it is, based on the
 * current phase. Returns null when there is no specific prompt (e.g. it is not
 * the player's turn, or a dedicated panel already covers the phase).
 *
 * This is intentionally a small, standalone phase→message map. It is kept
 * separate from the per-button enable/disable logic in GamePlayControls (which
 * also depends on non-phase state like pending purchases, owned tiles and busy
 * flags); folding both into one capability table would add indirection without
 * removing real duplication.
 */
export function turnGuidance(
  state: GameState,
  myPlayerId: string | null,
): string | null {
  if (!isMyTurn(state, myPlayerId)) return null;
  switch (state.phase) {
    case "waiting_for_market_event":
      return "Draw the market event to start the round.";
    case "waiting_for_roll":
      return "Roll the dice to move.";
    case "rolling_doubles":
      return "You rolled doubles — roll again!";
    case "waiting_for_buy":
      return "Buy this tile or decline it (declining starts an auction).";
    case "waiting_for_path_choice":
      return "Choose the perimeter or diagonal path.";
    case "action":
      return "Develop or mortgage your tiles, make a deal, then end your turn.";
    default:
      return null;
  }
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
