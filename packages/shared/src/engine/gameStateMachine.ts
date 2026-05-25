// ---------------------------------------------------------------------------
// Game State Machine — dispatcher, normalization, and tile bootstrap.
// Action implementations live in gameStateActionHandlers.ts.
// ---------------------------------------------------------------------------

import { ALL_TILES } from "../config/board.js";
import {
  handleDisruptionNullifyResponse,
  handleUseAffinity,
} from "./affinityActions.js";
import {
  computeAuctionBidDeadline,
  computeAuctionSettleDeadline,
} from "./auctionTiming.js";
import { handlePayDebt } from "./debtActions.js";
import { normalizeDisruptionDeck } from "./disruptionEvents.js";
import {
  handleAuctionBid,
  handleAuctionPass,
  handleBuyTile,
  handleDeclineTile,
  handleDevelopTile,
  handleDrawMarketEvent,
  handleEndTurn,
  handleMortgageTile,
  handlePathChoice,
  handleRedeemTile,
  handleRollDice,
} from "./gameStateActionHandlers.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  InternalTileState,
} from "./gameStateTypes.js";
import {
  handleBreakHandshake,
  handleProposeHandshake,
  handleSignHandshake,
} from "./handshakeActions.js";
import {
  handleInsiderDiscardMarketEvent,
  handleInsiderKeepMarketEvent,
  normalizeMarketEventDeck,
} from "./marketEvents.js";
import {
  handleProposeContract,
  handleSignContract,
  handleStartNegotiation,
} from "./negotiationActions.js";
import {
  handleHostileTakeover,
  handleMarketManipulation,
} from "./optionalRuleActions.js";
import { handleInitiateAuction } from "./playerAuctionActions.js";
import { handleEndCoordination, handleSetRateCard } from "./rateCardActions.js";
import { handleFormSyndicate } from "./syndicateActions.js";
import { handleCallVote } from "./syndicateVoteActions.js";

export type {
  ApplyActionResult,
  GameActionInput,
  InternalAiPlayerState,
  InternalGameState,
  InternalPlayerState,
  InternalTileState,
  LogEntry,
} from "./gameStateTypes.js";

export function initTileStates(): InternalTileState[] {
  return ALL_TILES.filter(
    (t) =>
      t.type === "sector_tile" ||
      t.type === "sector_hub" ||
      t.type === "utility",
  ).map((t) => ({
    position: t.position,
    ownerId: null,
    mortgaged: false,
    developmentTokens: 0,
  }));
}

export function normalizeGameState(raw: unknown): InternalGameState {
  const state = raw as unknown as InternalGameState;
  if (!state.tiles || state.tiles.length === 0) {
    state.tiles = initTileStates();
  }
  if (!state.pendingBuyTilePosition && state.pendingBuyTilePosition !== null) {
    state.pendingBuyTilePosition = null;
  }
  if (!state.lastDiceRoll) {
    state.lastDiceRoll = null;
  }
  if (!state.winnerId) {
    state.winnerId = null;
  }
  if (!state.eliminatedPlayerIds) {
    state.eliminatedPlayerIds = [];
  }
  if (!state.kickedPlayerIds) {
    state.kickedPlayerIds = [];
  }
  if (!state.affinityAssignments) {
    state.affinityAssignments = {};
  }
  if (!state.pendingAuction) {
    state.pendingAuction = undefined;
  } else if (
    state.phase === "waiting_for_auction_bids" &&
    state.pendingAuction.bidDeadlineAt === undefined
  ) {
    state.pendingAuction.bidDeadlineAt = computeAuctionBidDeadline(
      Date.now(),
      state.settings,
    );
  } else if (
    state.phase === "waiting_for_auction_settle" &&
    state.pendingAuction.settleDeadlineAt === undefined
  ) {
    state.pendingAuction.settleDeadlineAt = computeAuctionSettleDeadline(
      Date.now(),
      state.settings,
    );
  }
  normalizeMarketEventDeck(state);
  normalizeDisruptionDeck(state);
  if (state.phase === "market_event") {
    state.phase = "waiting_for_market_event";
  }
  return state;
}

type PhaseActionHandler = (
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
) => ApplyActionResult;

const PHASE_ACTION_ROUTES: Record<
  string,
  Record<string, PhaseActionHandler>
> = {
  waiting_for_disruption_nullify: {
    use_affinity: (state, playerId, action) =>
      handleDisruptionNullifyResponse(state, playerId, action),
    accept_disruption: (state, playerId, action) =>
      handleDisruptionNullifyResponse(state, playerId, action),
  },
  waiting_for_insider_peek: {
    insider_keep_market_event: (state, playerId) =>
      handleInsiderKeepMarketEvent(state, playerId),
    insider_discard_market_event: (state, playerId) =>
      handleInsiderDiscardMarketEvent(state, playerId),
  },
  syndicate_coordination: {
    set_rate_card: (state, playerId, action) =>
      handleSetRateCard(state, playerId, action),
    end_coordination: (state, playerId) =>
      handleEndCoordination(state, playerId),
  },
};

const GLOBAL_ACTION_ROUTES: Record<string, PhaseActionHandler> = {
  auction_bid: (state, playerId, action) =>
    handleAuctionBid(state, playerId, action),
  auction_pass: (state, playerId, action) =>
    handleAuctionPass(state, playerId, action),
};

function applySpecialActionRoute(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult | null {
  const phaseRoutes = PHASE_ACTION_ROUTES[state.phase];
  const phaseHandler = phaseRoutes?.[action.type];
  if (phaseHandler) {
    return phaseHandler(state, playerId, action);
  }
  if (phaseRoutes) {
    throw "game.invalid_phase";
  }

  const globalHandler = GLOBAL_ACTION_ROUTES[action.type];
  if (!globalHandler) {
    return null;
  }
  return globalHandler(state, playerId, action);
}

function withPrimaryLogIndex(
  result: ApplyActionResult,
  playerId: string,
  actionType: string,
): ApplyActionResult {
  if (result.primaryLogIndex !== undefined) {
    return result;
  }

  const actorLogIndex = result.logEntries.findIndex(
    (entry) => entry.playerId === playerId,
  );
  if (actorLogIndex >= 0) {
    return { ...result, primaryLogIndex: actorLogIndex };
  }

  const matchingTypeIndex = result.logEntries.findIndex(
    (entry) => entry.actionType === actionType,
  );
  if (matchingTypeIndex >= 0) {
    return { ...result, primaryLogIndex: matchingTypeIndex };
  }

  return result.logEntries.length > 0
    ? { ...result, primaryLogIndex: 0 }
    : result;
}

export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  const specialResult = applySpecialActionRoute(state, playerId, action);
  if (specialResult !== null) {
    return withPrimaryLogIndex(specialResult, playerId, action.type);
  }

  const currentPid = state.turnOrder[state.currentPlayerIndex];
  if (playerId !== currentPid) {
    throw "game.not_your_turn";
  }

  switch (action.type) {
    case "roll_dice":
      return withPrimaryLogIndex(
        handleRollDice(state, playerId, action),
        playerId,
        action.type,
      );
    case "buy_tile":
      return withPrimaryLogIndex(
        handleBuyTile(state, playerId, action),
        playerId,
        action.type,
      );
    case "decline_tile":
      return withPrimaryLogIndex(
        handleDeclineTile(state, playerId, action),
        playerId,
        action.type,
      );
    case "end_turn":
      return withPrimaryLogIndex(
        handleEndTurn(state, playerId),
        playerId,
        action.type,
      );
    case "path_choice":
      return withPrimaryLogIndex(
        handlePathChoice(state, playerId, action),
        playerId,
        action.type,
      );
    case "develop_tile":
      return withPrimaryLogIndex(
        handleDevelopTile(state, playerId, action),
        playerId,
        action.type,
      );
    case "mortgage_tile":
      return withPrimaryLogIndex(
        handleMortgageTile(state, playerId, action),
        playerId,
        action.type,
      );
    case "redeem_tile":
      return withPrimaryLogIndex(
        handleRedeemTile(state, playerId, action),
        playerId,
        action.type,
      );
    case "draw_market_event":
      return withPrimaryLogIndex(
        handleDrawMarketEvent(state, playerId),
        playerId,
        action.type,
      );
    case "form_syndicate":
      return withPrimaryLogIndex(
        handleFormSyndicate(state, playerId, action),
        playerId,
        action.type,
      );
    case "use_affinity":
      return withPrimaryLogIndex(
        handleUseAffinity(state, playerId, action),
        playerId,
        action.type,
      );
    case "start_negotiation":
      return withPrimaryLogIndex(
        handleStartNegotiation(state, playerId, action),
        playerId,
        action.type,
      );
    case "propose_contract":
      return withPrimaryLogIndex(
        handleProposeContract(state, playerId, action),
        playerId,
        action.type,
      );
    case "sign_contract":
      return withPrimaryLogIndex(
        handleSignContract(state, playerId, action),
        playerId,
        action.type,
      );
    case "propose_handshake":
      return withPrimaryLogIndex(
        handleProposeHandshake(state, playerId, action),
        playerId,
        action.type,
      );
    case "sign_handshake":
      return withPrimaryLogIndex(
        handleSignHandshake(state, playerId, action),
        playerId,
        action.type,
      );
    case "break_handshake":
      return withPrimaryLogIndex(
        handleBreakHandshake(state, playerId, action),
        playerId,
        action.type,
      );
    case "call_vote":
      return withPrimaryLogIndex(
        handleCallVote(state, playerId, action),
        playerId,
        action.type,
      );
    case "hostile_takeover":
      return withPrimaryLogIndex(
        handleHostileTakeover(state, playerId, action),
        playerId,
        action.type,
      );
    case "market_manipulation":
      return withPrimaryLogIndex(
        handleMarketManipulation(state, playerId, action),
        playerId,
        action.type,
      );
    case "initiate_auction":
      return withPrimaryLogIndex(
        handleInitiateAuction(state, playerId, action),
        playerId,
        action.type,
      );
    case "pay_debt":
      return withPrimaryLogIndex(
        handlePayDebt(state, playerId, action),
        playerId,
        action.type,
      );
    default:
      throw "game.invalid_action";
  }
}
