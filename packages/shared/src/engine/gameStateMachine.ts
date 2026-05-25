// ---------------------------------------------------------------------------
// Game State Machine
// Pure, server-authoritative game state transition engine.
// Takes current state + action -> returns new state or error string.
// ---------------------------------------------------------------------------

import {
  ALL_TILES,
  CORNER_POSITIONS,
  DIAGONAL_TILES,
  getTileByPosition,
} from "../config/board.js";
import {
  AFFINITY_IDS,
  applyAcquisitionCostAffinity,
  applyLastMileLogisticsTraverseBonus,
  hasPlayerAffinity,
} from "./affinity.js";
import {
  handleDisruptionNullifyResponse,
  handleUseAffinity,
} from "./affinityActions.js";
import { recordAuctionSubmission, startDeclineAuction } from "./auction.js";
import {
  computeAuctionBidDeadline,
  computeAuctionSettleDeadline,
} from "./auctionTiming.js";
import { processCoordinationPhase } from "./coordinationPhase.js";
import { handlePayDebt } from "./debtActions.js";
import {
  isDiagonalChoice,
  isDoubles,
  moveOnPerimeter,
  rollPathChoiceDie,
  TRIPLE_DOUBLES_LIMIT,
} from "./dice.js";
import {
  disruptionDrawCount,
  drawAndResolveDisruptionCards,
  normalizeDisruptionDeck,
  resolveBlackMarketRelay,
  resolveFlashCrash,
} from "./disruptionEvents.js";
import { collectFreeMarketPool } from "./freeMarket.js";
import {
  drawAndResolveMarketEvent,
  normalizeMarketEventDeck,
} from "./marketEvents.js";
import { calculateMortgageValue, calculateRedemptionCost } from "./mortgage.js";
import {
  handleBreakHandshake,
  handleProposeContract,
  handleSignContract,
  handleStartNegotiation,
} from "./negotiationActions.js";
import {
  isOptionalRuleEnabled,
  regulationPenaltiesEnabled,
} from "./optionalRulesEngine.js";
import { resolvePostMovePhase } from "./phaseHelpers.js";
import { handleInitiateAuction } from "./playerAuctionActions.js";
import { handleEndCoordination, handleSetRateCard } from "./rateCardActions.js";
import {
  recordOpposingSectorLanding,
  revokeRateCardsForMortgage,
} from "./rateCards.js";
import { calculateDevelopmentCost, MAX_DEVELOPMENT_TOKENS } from "./rent.js";
import { settleRentPayment } from "./rentPayment.js";
import {
  computeAffinityRentBonusForTile,
  computeTileRent,
} from "./rentResolution.js";
import {
  ACTION_COSTS,
  ACTION_POINTS_PER_TURN,
  CORPORATE_TAX_I,
  CORPORATE_TAX_II,
  GOVERNMENT_GRANT,
  PASS_START_BONUS,
} from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { areSameSyndicate } from "./syndicate.js";
import { handleFormSyndicate } from "./syndicateActions.js";
import {
  applyWinIfThresholdCrossed,
  markFinalRoundTurnComplete,
} from "./winResolution.js";

export type {
  ApplyActionResult,
  GameActionInput,
  InternalAiPlayerState,
  InternalGameState,
  InternalPlayerState,
  InternalTileState,
  LogEntry,
} from "./gameStateTypes.js";

import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  InternalPlayerState,
  InternalTileState,
  LogEntry,
} from "./gameStateTypes.js";

// ---------------------------------------------------------------------------
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
// Core State Machine
// ---------------------------------------------------------------------------

/**
 * Initialize tile states from the board config. Called when game starts
 * and the initial state doesn't include tiles yet.
 */
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

/**
 * Convert a raw state_json from DB into our internal format,
 * ensuring all fields exist.
 */
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
  // Legacy phase aliases
  if (state.phase === "market_event") {
    state.phase = "waiting_for_market_event";
  }
  return state;
}

/**
 * Apply a game action to the current state. Returns new state + log entries.
 * Throws a string error key on invalid actions.
 */
export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  if (state.phase === "waiting_for_disruption_nullify") {
    if (action.type === "use_affinity" || action.type === "accept_disruption") {
      return handleDisruptionNullifyResponse(state, playerId, action);
    }
    throw "game.invalid_phase";
  }

  if (action.type === "auction_bid") {
    return handleAuctionBid(state, playerId, action);
  }
  if (action.type === "auction_pass") {
    return handleAuctionPass(state, playerId, action);
  }

  if (state.phase === "syndicate_coordination") {
    switch (action.type) {
      case "set_rate_card":
        return handleSetRateCard(state, playerId, action);
      case "end_coordination":
        return handleEndCoordination(state, playerId);
      default:
        throw "game.invalid_phase";
    }
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
    case "break_handshake":
      return handleBreakHandshake(state, playerId, action);
    case "initiate_auction":
      return handleInitiateAuction(state, playerId, action);
    case "pay_debt":
      return handlePayDebt(state, playerId, action);
    default:
      throw "game.invalid_action";
  }
}
