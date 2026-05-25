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

export function normalizeGameState(
  raw: Record<string, unknown>,
): InternalGameState {
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

function applyPhaseActionRoute(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult | null {
  const phaseRoutes = PHASE_ACTION_ROUTES[state.phase];
  if (!phaseRoutes) {
    return null;
  }
  const handler = phaseRoutes[action.type];
  if (!handler) {
    throw "game.invalid_phase";
  }
  return handler(state, playerId, action);
}

export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  if (action.type === "auction_bid") {
    return handleAuctionBid(state, playerId, action);
  }
  if (action.type === "auction_pass") {
    return handleAuctionPass(state, playerId, action);
  }

  const phaseResult = applyPhaseActionRoute(state, playerId, action);
  if (phaseResult !== null) {
    return phaseResult;
  }

  const currentPid = state.turnOrder[state.currentPlayerIndex];
  if (playerId !== currentPid) {
    throw "game.not_your_turn";
  }

  switch (action.type) {
    case "roll_dice":
      return handleRollDice(state, playerId, action);
    case "buy_tile":
      return handleBuyTile(state, playerId, action);
    case "decline_tile":
      return handleDeclineTile(state, playerId, action);
    case "end_turn":
      return handleEndTurn(state, playerId);
    case "path_choice":
      return handlePathChoice(state, playerId, action);
    case "develop_tile":
      return handleDevelopTile(state, playerId, action);
    case "mortgage_tile":
      return handleMortgageTile(state, playerId, action);
    case "redeem_tile":
      return handleRedeemTile(state, playerId, action);
    case "draw_market_event":
      return handleDrawMarketEvent(state, playerId);
    case "form_syndicate":
      return handleFormSyndicate(state, playerId, action);
    case "use_affinity":
      return handleUseAffinity(state, playerId, action);
    case "start_negotiation":
      return handleStartNegotiation(state, playerId, action);
    case "propose_contract":
      return handleProposeContract(state, playerId, action);
    case "sign_contract":
      return handleSignContract(state, playerId, action);
    case "propose_handshake":
      return handleProposeHandshake(state, playerId, action);
    case "sign_handshake":
      return handleSignHandshake(state, playerId, action);
    case "break_handshake":
      return handleBreakHandshake(state, playerId, action);
    case "call_vote":
      return handleCallVote(state, playerId, action);
    case "hostile_takeover":
      return handleHostileTakeover(state, playerId, action);
    case "market_manipulation":
      return handleMarketManipulation(state, playerId, action);
    case "initiate_auction":
      return handleInitiateAuction(state, playerId, action);
    case "pay_debt":
      return handlePayDebt(state, playerId, action);
    default:
      throw "game.invalid_action";
  }
}
