// ---------------------------------------------------------------------------
// Game State Machine — dispatcher, normalization, and tile bootstrap.
// Action implementations live in gameStateActionHandlers.ts.
// ---------------------------------------------------------------------------

import type { GamePhase } from "@oligopoly/validation";
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
type GameActionType = GameActionInput["type"];
type NonTurnActionType =
  | "accept_disruption"
  | "auction_bid"
  | "auction_pass"
  | "end_coordination"
  | "insider_discard_market_event"
  | "insider_keep_market_event"
  | "set_rate_card";
type TurnActionType = Exclude<GameActionType, NonTurnActionType>;

const PHASE_ACTION_ROUTES: Partial<
  Record<GamePhase, Partial<Record<GameActionType, PhaseActionHandler>>>
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

const GLOBAL_ACTION_ROUTES = {
  auction_bid: (state, playerId, action) =>
    handleAuctionBid(state, playerId, action),
  auction_pass: (state, playerId, action) =>
    handleAuctionPass(state, playerId, action),
} satisfies Record<"auction_bid" | "auction_pass", PhaseActionHandler>;
const GLOBAL_ACTION_ROUTES_BY_TYPE: Partial<
  Record<GameActionType, PhaseActionHandler>
> = GLOBAL_ACTION_ROUTES;

const TURN_ACTION_ROUTES = {
  roll_dice: (state, playerId, action) =>
    handleRollDice(state, playerId, action),
  buy_tile: (state, playerId, action) => handleBuyTile(state, playerId, action),
  decline_tile: (state, playerId, action) =>
    handleDeclineTile(state, playerId, action),
  end_turn: (state, playerId) => handleEndTurn(state, playerId),
  path_choice: (state, playerId, action) =>
    handlePathChoice(state, playerId, action),
  develop_tile: (state, playerId, action) =>
    handleDevelopTile(state, playerId, action),
  mortgage_tile: (state, playerId, action) =>
    handleMortgageTile(state, playerId, action),
  redeem_tile: (state, playerId, action) =>
    handleRedeemTile(state, playerId, action),
  draw_market_event: (state, playerId) =>
    handleDrawMarketEvent(state, playerId),
  form_syndicate: (state, playerId, action) =>
    handleFormSyndicate(state, playerId, action),
  use_affinity: (state, playerId, action) =>
    handleUseAffinity(state, playerId, action),
  start_negotiation: (state, playerId, action) =>
    handleStartNegotiation(state, playerId, action),
  propose_contract: (state, playerId, action) =>
    handleProposeContract(state, playerId, action),
  sign_contract: (state, playerId, action) =>
    handleSignContract(state, playerId, action),
  propose_handshake: (state, playerId, action) =>
    handleProposeHandshake(state, playerId, action),
  sign_handshake: (state, playerId, action) =>
    handleSignHandshake(state, playerId, action),
  break_handshake: (state, playerId, action) =>
    handleBreakHandshake(state, playerId, action),
  call_vote: (state, playerId, action) =>
    handleCallVote(state, playerId, action),
  hostile_takeover: (state, playerId, action) =>
    handleHostileTakeover(state, playerId, action),
  market_manipulation: (state, playerId, action) =>
    handleMarketManipulation(state, playerId, action),
  initiate_auction: (state, playerId, action) =>
    handleInitiateAuction(state, playerId, action),
  pay_debt: (state, playerId, action) => handlePayDebt(state, playerId, action),
} satisfies Record<TurnActionType, PhaseActionHandler>;
const TURN_ACTION_ROUTES_BY_TYPE: Partial<
  Record<GameActionType, PhaseActionHandler>
> = TURN_ACTION_ROUTES;

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

  const globalHandler = GLOBAL_ACTION_ROUTES_BY_TYPE[action.type];
  if (!globalHandler) {
    return null;
  }
  return globalHandler(state, playerId, action);
}

function withPrimaryLogIndex(
  result: ApplyActionResult,
  playerId: string,
  _actionType: string,
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

  if (result.logEntries.length > 0) {
    return { ...result, primaryLogIndex: 0 };
  }
  return result;
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

  const turnHandler = TURN_ACTION_ROUTES_BY_TYPE[action.type];
  if (!turnHandler) {
    throw "game.invalid_action";
  }
  return withPrimaryLogIndex(
    turnHandler(state, playerId, action),
    playerId,
    action.type,
  );
}
