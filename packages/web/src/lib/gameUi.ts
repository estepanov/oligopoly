import {
  ACTION_COSTS,
  AFFINITY_IDS,
  type AffinityContext,
  applyAcquisitionCostAffinity,
  canCreateBindingContract,
  formSyndicateApCost,
  getTileByPosition,
  hasSectorControl,
  type InternalGameState,
  isActionBlockedByContracts,
  isAiControlledActor as isAiControlledActorShared,
  MAX_DEVELOPMENT_TOKENS,
} from "@oligopoly/shared";
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

export function isAiControlledActor(
  state: GameState,
  actorId: string | null,
): boolean {
  if (!actorId) return false;
  return isAiControlledActorShared(state as InternalGameState, actorId);
}

/**
 * Merge server `affinityAssignments` with the viewer's `myAffinityCardId` when
 * the subject is the viewer and the server has not yet populated that slot.
 */
export function effectiveAffinityContext(
  state: GameState,
  subjectPlayerId: string | null,
  viewerPlayerId: string | null,
): AffinityContext {
  const assignments: Record<string, string> = {
    ...(state.affinityAssignments ?? {}),
  };
  if (
    subjectPlayerId &&
    viewerPlayerId &&
    subjectPlayerId === viewerPlayerId &&
    state.myAffinityCardId &&
    assignments[subjectPlayerId] === undefined
  ) {
    assignments[subjectPlayerId] = state.myAffinityCardId;
  }
  return { affinityAssignments: assignments };
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
  if (
    previous?.gameId &&
    incoming.gameId &&
    previous.gameId !== incoming.gameId
  ) {
    return incoming;
  }
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

function isActionTurn(state: GameState, myPlayerId: string | null): boolean {
  return state.phase === "action" && isMyTurn(state, myPlayerId);
}

export function tileStateByPosition(
  state: GameState,
  position: number | string | null | undefined,
): NonNullable<GameState["tiles"]>[number] | undefined {
  if (position === null || position === undefined) return undefined;
  return state.tiles?.find(
    (tile) => String(tile.position) === String(position),
  );
}

function acquisitionCostForPlayer(
  state: GameState,
  buyerPlayerId: string,
  position: number | string,
): number | null {
  const tile = getTileByPosition(position);
  if (!tile || tile.cost === null) return null;
  return applyAcquisitionCostAffinity(
    effectiveAffinityContext(state, buyerPlayerId, buyerPlayerId),
    buyerPlayerId,
    tile.sectorId,
    tile.cost,
  );
}

export type PendingPurchaseDecision = {
  tilePosition: number | string;
  acquisitionCost: number | null;
  playerCapital: number | null;
  cashAfterPurchase: number | null;
  canAfford: boolean;
};

export function pendingPurchaseDecision(
  state: GameState,
  myPlayerId: string | null,
): PendingPurchaseDecision | null {
  if (
    state.phase !== "waiting_for_buy" ||
    state.pendingBuyTilePosition === null ||
    state.pendingBuyTilePosition === undefined
  ) {
    return null;
  }

  const player = myPlayerId ? playerById(state, myPlayerId) : undefined;
  const acquisitionCost = myPlayerId
    ? acquisitionCostForPlayer(state, myPlayerId, state.pendingBuyTilePosition)
    : null;
  const playerCapital = player?.capital ?? null;
  const cashAfterPurchase =
    acquisitionCost !== null &&
    playerCapital !== null &&
    playerCapital >= acquisitionCost
      ? playerCapital - acquisitionCost
      : null;

  return {
    tilePosition: state.pendingBuyTilePosition,
    acquisitionCost,
    playerCapital,
    cashAfterPurchase,
    canAfford: cashAfterPurchase !== null,
  };
}

export function canBuyPendingTile(
  state: GameState,
  myPlayerId: string | null,
): boolean {
  if (!isMyTurn(state, myPlayerId) || state.phase !== "waiting_for_buy") {
    return false;
  }
  return pendingPurchaseDecision(state, myPlayerId)?.canAfford ?? false;
}

export type TileOwnershipActionGates = {
  canDevelopGate: boolean;
  canMortgageGate: boolean;
  canRedeemGate: boolean;
};

/**
 * Single evaluation of phase/turn/tile ownership gates for develop / mortgage /
 * redeem. Callers combine with capital and computed costs (see `getTileEconomics`).
 */
export function getTileOwnershipActionGates(
  state: GameState,
  playerId: string,
  position: number | string,
): TileOwnershipActionGates {
  if (!isActionTurn(state, playerId)) {
    return {
      canDevelopGate: false,
      canMortgageGate: false,
      canRedeemGate: false,
    };
  }
  const player = playerById(state, playerId);
  const tile = getTileByPosition(position);
  const tileState = tileStateByPosition(state, position);
  const hasFullSectorControl = Boolean(
    state.players &&
      state.tiles &&
      tile?.type === "sector_tile" &&
      tile.sectorId &&
      hasSectorControl(
        {
          players: state.players,
          syndicates: state.syndicates,
          tiles: state.tiles,
        },
        playerId,
        tile.sectorId,
      ),
  );
  return {
    canDevelopGate: Boolean(
      player &&
        tile?.type === "sector_tile" &&
        tileState?.ownerId === playerId &&
        hasFullSectorControl &&
        !tileState.mortgaged &&
        tileState.developmentTokens < MAX_DEVELOPMENT_TOKENS &&
        player.actionPointsRemaining >= ACTION_COSTS.DEVELOP_TILE,
    ),
    canMortgageGate: Boolean(
      tile?.cost !== null &&
        tile?.cost !== undefined &&
        tileState?.ownerId === playerId &&
        !tileState.mortgaged,
    ),
    canRedeemGate: Boolean(
      tileState?.ownerId === playerId && tileState.mortgaged === true,
    ),
  };
}

export function canPayDebt(state: GameState, playerId: string): boolean {
  const player = playerById(state, playerId);
  return Boolean(
    player && (player.outstandingDebt ?? 0) > 0 && player.capital > 0,
  );
}

export function canFormSyndicate(state: GameState, playerId: string): boolean {
  const player = playerById(state, playerId);
  return Boolean(
    isActionTurn(state, playerId) &&
      player &&
      !player.syndicateId &&
      player.actionPointsRemaining >=
        formSyndicateApCost(
          effectiveAffinityContext(state, playerId, playerId),
          playerId,
        ) &&
      otherHumanPlayers(state, playerId).some((other) => !other.syndicateId),
  );
}

export function canCallDissolutionVote(
  state: GameState,
  playerId: string,
): boolean {
  const player = playerById(state, playerId);
  const vote = state.pendingSyndicateVote;
  return Boolean(
    isActionTurn(state, playerId) &&
      player?.syndicateId &&
      player.actionPointsRemaining >= ACTION_COSTS.CALL_SYNDICATE_VOTE &&
      !(
        vote?.syndicateId === player.syndicateId &&
        vote.votes[playerId] === true
      ),
  );
}

export function canStartNegotiation(
  state: GameState,
  playerId: string,
): boolean {
  const player = playerById(state, playerId);
  return Boolean(
    isActionTurn(state, playerId) &&
      player &&
      player.actionPointsRemaining >= ACTION_COSTS.INITIATE_NEGOTIATION &&
      otherHumanPlayers(state, playerId).length > 0,
  );
}

export function contractEligibleTilesForPlayer(
  state: GameState,
  playerId: string,
) {
  return ownedTilesForPlayer(state, playerId).filter((tile) => {
    const tileState = tileStateByPosition(state, tile.position);
    return tileState?.ownerId === playerId && !tileState.mortgaged;
  });
}

export function canProposeBindingContract(
  state: GameState,
  playerId: string,
): boolean {
  const player = playerById(state, playerId);
  return Boolean(
    isActionTurn(state, playerId) &&
      player &&
      canCreateBindingContract(player.trustworthiness) &&
      otherHumanPlayers(state, playerId).length > 0 &&
      contractEligibleTilesForPlayer(state, playerId).length > 0,
  );
}

export function auctionEligibleTilesForPlayer(
  state: GameState,
  playerId: string,
) {
  if (!isActionTurn(state, playerId)) return [];
  const player = playerById(state, playerId);
  if (!player || player.actionPointsRemaining < ACTION_COSTS.INITIATE_AUCTION) {
    return [];
  }
  return ownedTilesForPlayer(state, playerId).filter((tile) => {
    const boardTile = getTileByPosition(tile.position);
    const tileState = tileStateByPosition(state, tile.position);
    if (
      !boardTile ||
      boardTile.cost === null ||
      tileState?.ownerId !== playerId ||
      tileState.mortgaged
    ) {
      return false;
    }
    return !isActionBlockedByContracts(state.activeContracts ?? [], {
      type: "initiate_auction",
      playerId,
      tileId: String(tile.position),
    }).blocked;
  });
}

export function canUseConsumerInsights(
  state: GameState,
  playerId: string,
): boolean {
  const player = playerById(state, playerId);
  return Boolean(
    isActionTurn(state, playerId) &&
      state.myAffinityCardId === AFFINITY_IDS.consumer_insights &&
      !player?.usedAffinityIds?.includes(AFFINITY_IDS.consumer_insights) &&
      otherHumanPlayers(state, playerId).length > 0,
  );
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
