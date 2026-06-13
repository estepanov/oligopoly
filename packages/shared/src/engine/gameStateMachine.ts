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
  expirePendingTradeOffers,
  handleAcceptTrade,
  handleCounterTrade,
  handleProposeTrade,
  handleRejectTrade,
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

type PhaseActionHandler = (
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number,
) => ApplyActionResult;
type GameActionType = GameActionInput["type"];
type NonTurnActionType =
  | "accept_trade"
  | "accept_disruption"
  | "auction_bid"
  | "auction_pass"
  | "counter_trade"
  | "insider_discard_market_event"
  | "insider_keep_market_event"
  | "reject_trade";
type TurnActionType = Exclude<GameActionType, NonTurnActionType>;

const ASYNC_TRADE_RESPONSE_ROUTES = {
  accept_trade: (state, playerId, action, nowMs) =>
    handleAcceptTrade(state, playerId, action, nowMs),
  reject_trade: (state, playerId, action, nowMs) =>
    handleRejectTrade(state, playerId, action, nowMs),
} satisfies Record<"accept_trade" | "reject_trade", PhaseActionHandler>;

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

const GLOBAL_ACTION_ROUTES = {
  ...ASYNC_TRADE_RESPONSE_ROUTES,
  auction_bid: (state, playerId, action) =>
    handleAuctionBid(state, playerId, action),
  auction_pass: (state, playerId, action) =>
    handleAuctionPass(state, playerId, action),
  counter_trade: (state, playerId, action, nowMs) =>
    handleCounterTrade(state, playerId, action, nowMs),
} satisfies Record<
  | "auction_bid"
  | "auction_pass"
  | "accept_trade"
  | "reject_trade"
  | "counter_trade",
  PhaseActionHandler
>;
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
  propose_trade: (state, playerId, action, nowMs) =>
    handleProposeTrade(state, playerId, action, nowMs),
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

const TRADE_RESPONSE_ACTION_TYPES = new Set<GameActionType>([
  "accept_trade",
  "reject_trade",
  "counter_trade",
]);

/**
 * True when `action` is a trade response targeting an offer that the
 * pre-action expiry pass just flipped to `expired`. The player's response is a
 * no-op against a now-expired offer, but the expiry itself must still persist —
 * see `applyAction` for why we return the expiry result instead of routing the
 * (doomed) response handler, which would throw `OFFER_NOT_PENDING` and discard
 * the expiry.
 */
function targetsOfferExpiredByPreAction(
  action: GameActionInput,
  expiryResult: ApplyActionResult | null,
): boolean {
  if (!expiryResult || !TRADE_RESPONSE_ACTION_TYPES.has(action.type)) {
    return false;
  }
  const offerId = action.offerId;
  if (!offerId) return false;
  return (expiryResult.state.tradeOffers ?? []).some(
    (offer) => offer.id === offerId && offer.status === "expired",
  );
}

export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  // Single canonical pre-action expiry pass: reconcile any pending trade offers
  // whose deadline has passed BEFORE routing the action, using one `nowMs` clock
  // for the whole action. This keeps "stale pending offers until the alarm
  // fires" from leaking into action handling, and is threaded into the trade
  // handlers below so a single action observes a single clock.
  const nowMs = Date.now();
  const expiryResult = expirePendingTradeOffers(state, nowMs);
  const workingState = expiryResult?.state ?? state;
  const expiryLogs = expiryResult?.logEntries ?? [];

  // If a trade RESPONSE targets an offer the pre-action pass just expired, the
  // response is a no-op — but the expiry must still persist. Return the expiry
  // result rather than routing the response handler (which would throw
  // `OFFER_NOT_PENDING` and discard the persisted `expired` status + log).
  if (expiryResult && targetsOfferExpiredByPreAction(action, expiryResult)) {
    return finalizePrimaryLogIndex(expiryResult);
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
  const turnResult = turnHandler(workingState, playerId, action, nowMs);
  return withPlayerChangeLogs(
    before,
    mergeExpiryLogs(expiryLogs, finalizePrimaryLogIndex(turnResult)),
  );
}
