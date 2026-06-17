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
  LogEntry,
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
import {
  snapshotPlayerChanges,
  withPlayerChangeLogs,
} from "./playerChangeLogs.js";
import { handleSetRateCard } from "./rateCardActions.js";
import { handleFormSyndicate } from "./syndicateActions.js";
import { handleCallVote } from "./syndicateVoteActions.js";
import {
  handleAcceptTrade,
  handleCounterTrade,
  handleProposeTrade,
  handleRejectTrade,
  reconcileTradeOffersBeforeAction,
} from "./tradeActions.js";

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
  if (!state.winSummary) {
    state.winSummary = null;
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
  if (!state.tradeOffers) {
    state.tradeOffers = [];
  }
  normalizeMarketEventDeck(state);
  normalizeDisruptionDeck(state);
  if (state.phase === "market_event") {
    state.phase = "waiting_for_market_event";
  }
  // Legacy: older saves used a dedicated syndicate_coordination phase before
  // the first turn of the new round. Resume at turn-start market draw.
  if ((state.phase as string) === "syndicate_coordination") {
    const firstActiveIndex = state.turnOrder.findIndex(
      (id) => !state.eliminatedPlayerIds.includes(id),
    );
    state.currentPlayerIndex =
      firstActiveIndex >= 0 ? firstActiveIndex : state.currentPlayerIndex;
    state.phase = "waiting_for_market_event";
  }
  return state;
}

// Only the trade handlers (propose/accept/reject/counter + expiry) read `nowMs`;
// every other route closure simply omits the trailing param (a function of
// fewer args still satisfies this type), so the uniform signature costs no churn
// while keeping the clock injectable for trade/expiry determinism.
type PhaseActionHandler = (
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number,
) => ApplyActionResult;
type GameActionType = GameActionInput["type"];
// Non-turn (global-scoped) actions: the actor need not be the active player.
// The trade portion is DERIVED from `TRADE_ACTION_ROUTES` (entries with
// `scope: "global"` — see `GlobalTradeActionType`) so it can't drift from the
// routing metadata. The auction/insider async types are separate concerns (not
// in `TRADE_ACTION_ROUTES`) and stay listed explicitly here.
type NonTurnActionType =
  | GlobalTradeActionType
  | "accept_disruption"
  | "auction_bid"
  | "auction_pass"
  | "insider_discard_market_event"
  | "insider_keep_market_event";
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
};

type TradeActionType =
  | "propose_trade"
  | "accept_trade"
  | "reject_trade"
  | "counter_trade";

// SINGLE SOURCE OF TRUTH for trade-action routing rules. Each entry declares the
// dispatcher scope (whether the actor must be the active player) and whether the
// action is gated to the `action` phase, alongside its handler. The dispatcher
// derives BOTH the global/turn registration AND the action-phase gate from this
// table, so the otherwise-fragile combinations (e.g. counter_trade is globally
// routed yet only valid during an action phase) live in ONE place and can't be
// broken by editing a handler. See oligopoly_game_rules.md for the rules.
const TRADE_ACTION_ROUTES = {
  // Turn action costing 1 AP: only the active player, only in the action phase.
  propose_trade: {
    scope: "turn",
    requiresActionPhase: true,
    handler: (state, playerId, action, nowMs) =>
      handleProposeTrade(state, playerId, action, nowMs),
  },
  // Recipient-driven; valid in ANY phase and off-turn.
  accept_trade: {
    scope: "global",
    requiresActionPhase: false,
    handler: (state, playerId, action, nowMs) =>
      handleAcceptTrade(state, playerId, action, nowMs),
  },
  reject_trade: {
    scope: "global",
    requiresActionPhase: false,
    handler: (state, playerId, action, nowMs) =>
      handleRejectTrade(state, playerId, action, nowMs),
  },
  // Recipient-driven (globally routed, off-turn ok) BUT only during an action
  // phase — the one place this combination is expressed.
  counter_trade: {
    scope: "global",
    requiresActionPhase: true,
    handler: (state, playerId, action, nowMs) =>
      handleCounterTrade(state, playerId, action, nowMs),
  },
} satisfies Record<
  TradeActionType,
  {
    scope: "turn" | "global";
    requiresActionPhase: boolean;
    handler: PhaseActionHandler;
  }
>;

// Trade actions declared `scope: "global"` in the metadata above are NON-turn
// actions (the recipient need not be the active player). Derived at the type
// level from `TRADE_ACTION_ROUTES` (which uses `satisfies` so each entry's
// literal `scope` is preserved) so `NonTurnActionType` can't drift from the
// declared routing rules. Auction/insider async types are separate (see below).
type GlobalTradeActionType = {
  [K in TradeActionType]: (typeof TRADE_ACTION_ROUTES)[K]["scope"] extends "global"
    ? K
    : never;
}[TradeActionType];

// Typed list of trade-action keys derived directly from the routing metadata, so
// derivations below iterate the keys without a hand-maintained parallel list.
// `TRADE_ACTION_ROUTES` keys are exactly the `TradeActionType` union (`Object.keys`
// only widens them to `string`).
const TRADE_ACTION_TYPES = Object.keys(
  TRADE_ACTION_ROUTES,
) as TradeActionType[];

// Set of trade actions gated to the action phase, derived from the metadata so
// the gate stays in lockstep with the declared rules.
const ACTION_PHASE_GATED_TRADE_TYPES = new Set<GameActionType>(
  TRADE_ACTION_TYPES.filter(
    (type) => TRADE_ACTION_ROUTES[type].requiresActionPhase,
  ),
);

// Phase gate derived from the metadata: trade actions flagged
// `requiresActionPhase` throw `game.invalid_phase` outside the action phase,
// enforced centrally so a handler edit can't contradict the declared rule.
function enforceTradeActionPhaseGate(
  state: InternalGameState,
  actionType: GameActionType,
): void {
  if (
    ACTION_PHASE_GATED_TRADE_TYPES.has(actionType) &&
    state.phase !== "action"
  ) {
    throw "game.invalid_phase";
  }
}

function globalTradeRoutes(): Partial<
  Record<GameActionType, PhaseActionHandler>
> {
  const routes: Partial<Record<GameActionType, PhaseActionHandler>> = {};
  for (const type of TRADE_ACTION_TYPES) {
    const route = TRADE_ACTION_ROUTES[type];
    if (route.scope === "global") {
      routes[type] = route.handler;
    }
  }
  return routes;
}

// Async responses valid in any phase: auction bids/passes and the trade actions
// declared `scope: "global"` in `TRADE_ACTION_ROUTES`. Consulted before the
// phase-gated throw in `applySpecialActionRoute` so trade responses route from
// the special `waiting_for_*` phases too.
const GLOBAL_ACTION_ROUTES_BY_TYPE: Partial<
  Record<GameActionType, PhaseActionHandler>
> = {
  auction_bid: (state, playerId, action) =>
    handleAuctionBid(state, playerId, action),
  auction_pass: (state, playerId, action) =>
    handleAuctionPass(state, playerId, action),
  ...globalTradeRoutes(),
};

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
  propose_trade: TRADE_ACTION_ROUTES.propose_trade.handler,
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
  set_rate_card: (state, playerId, action) =>
    handleSetRateCard(state, playerId, action),
} satisfies Record<TurnActionType, PhaseActionHandler>;
const TURN_ACTION_ROUTES_BY_TYPE: Partial<
  Record<GameActionType, PhaseActionHandler>
> = TURN_ACTION_ROUTES;

function applySpecialActionRoute(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number,
): ApplyActionResult | null {
  const phaseRoutes = PHASE_ACTION_ROUTES[state.phase];
  const phaseHandler = phaseRoutes?.[action.type];
  if (phaseHandler) {
    return phaseHandler(state, playerId, action, nowMs);
  }

  // Global async responses (auction bids/passes, trade accept/reject/counter)
  // are valid in any phase, including the special "waiting_for_*" phases — so
  // consult them BEFORE the phase-gated throw. This keeps the trade-response
  // routing in one place instead of re-spreading it into each special phase.
  const globalHandler = GLOBAL_ACTION_ROUTES_BY_TYPE[action.type];
  if (globalHandler) {
    // Central, metadata-driven action-phase gate (e.g. counter_trade is global
    // but only valid during an action phase). No-op for ungated actions.
    enforceTradeActionPhaseGate(state, action.type);
    return globalHandler(state, playerId, action, nowMs);
  }

  if (phaseRoutes) {
    throw "game.invalid_phase";
  }

  return null;
}

function finalizePrimaryLogIndex(result: ApplyActionResult): ApplyActionResult {
  if (result.primaryLogIndex !== undefined) {
    return result;
  }
  if (result.logEntries.length === 1) {
    return { ...result, primaryLogIndex: 0 };
  }
  return result;
}

function mergeExpiryLogs(
  expiryLogs: LogEntry[],
  result: ApplyActionResult,
): ApplyActionResult {
  if (expiryLogs.length === 0) {
    return result;
  }
  return {
    ...result,
    logEntries: [...expiryLogs, ...result.logEntries],
  };
}

export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  // Injectable clock: defaults to wall time, but callers (and tests) can pass a
  // fixed `nowMs` so trade-offer expiry reconciliation is deterministic and
  // consistent with scheduler-driven expiry.
  nowMs: number = Date.now(),
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  const { workingState, expiryLogs, shortCircuitResult } =
    reconcileTradeOffersBeforeAction(state, action, nowMs);
  if (shortCircuitResult) {
    return finalizePrimaryLogIndex(shortCircuitResult);
  }

  const before = snapshotPlayerChanges(workingState);
  const specialResult = applySpecialActionRoute(
    workingState,
    playerId,
    action,
    nowMs,
  );
  if (specialResult !== null) {
    return withPlayerChangeLogs(
      before,
      mergeExpiryLogs(expiryLogs, finalizePrimaryLogIndex(specialResult)),
    );
  }

  const currentPid = workingState.turnOrder[workingState.currentPlayerIndex];
  if (playerId !== currentPid) {
    throw "game.not_your_turn";
  }

  const turnHandler = TURN_ACTION_ROUTES_BY_TYPE[action.type];
  if (!turnHandler) {
    throw "game.invalid_action";
  }
  // Central, metadata-driven action-phase gate for turn-scoped trade actions
  // (e.g. propose_trade). Applied after the not-your-turn check to preserve the
  // original error ordering (off-turn → not_your_turn, not invalid_phase).
  enforceTradeActionPhaseGate(workingState, action.type);
  const turnResult = turnHandler(workingState, playerId, action, nowMs);
  return withPlayerChangeLogs(
    before,
    mergeExpiryLogs(expiryLogs, finalizePrimaryLogIndex(turnResult)),
  );
}
