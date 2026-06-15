import {
  TradeErrorKeys,
  type TradeOffer,
  type TradeOfferTransfer,
} from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { transferCapital } from "./marketEventPrimitives.js";
import { isActionBlockedByContracts } from "./negotiation.js";
import { revokeUnqualifiedRateCards } from "./rateCards.js";
import { ACTION_COSTS } from "./setup.js";
import { deepClone, getPlayer, transferTileOwnership } from "./stateUtils.js";
import type { BindingContract } from "./types.js";
import { applyWinIfThresholdCrossed } from "./winResolution.js";

export const DEFAULT_TRADE_TIMEOUT_MINUTES = 5;
export const MAX_TRADE_COUNTERS = 2;
export const TRADE_OFFER_HISTORY_LIMIT = 20;

type TradeValidationContext = {
  proposer: InternalPlayerState;
  recipient: InternalPlayerState;
  gives: TradeOfferTransfer;
  receives: TradeOfferTransfer;
};

export function tradeTransferValue(transfer: TradeOfferTransfer): number {
  return (
    transfer.capital +
    transfer.tilePositions.reduce<number>(
      (total, position) => total + (getTileByPosition(position)?.cost ?? 0),
      0,
    )
  );
}

export function handleProposeTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_phase";

  const recipientId = action.recipientId;
  if (!recipientId || recipientId === playerId) {
    throw TradeErrorKeys.INVALID_PARTY;
  }

  const proposer = getPlayer(state, playerId);
  const recipient = getPlayer(state, recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;
  if (isEliminated(state, playerId) || isEliminated(state, recipientId)) {
    throw TradeErrorKeys.INVALID_PARTY;
  }
  if (proposer.actionPointsRemaining < ACTION_COSTS.PROPOSE_TRADE) {
    throw "game.insufficient_ap";
  }

  const gives = normalizeTransfer(action.gives);
  const receives = normalizeTransfer(action.receives);
  validateTradeTerms(state, { proposer, recipient, gives, receives });

  const offer = buildTradeOffer(state, {
    proposerId: playerId,
    recipientId,
    gives,
    receives,
    nowMs,
    timeoutMinutes: action.timeoutMinutes,
    counterCount: 0,
  });

  const newState = deepClone(state);
  const workingProposer = getPlayer(newState, playerId);
  if (!workingProposer) throw TradeErrorKeys.INVALID_PARTY;
  workingProposer.actionPointsRemaining -= ACTION_COSTS.PROPOSE_TRADE;
  newState.tradeOffers = pruneTradeOffers([
    ...(newState.tradeOffers ?? []),
    offer,
  ]);

  return {
    state: newState,
    logEntries: [
      {
        playerId,
        actionType: "trade_proposed",
        payload: tradeLogPayload(offer),
      },
    ],
  };
}

export function handleAcceptTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const offer = pendingOfferForResponse(state, playerId, action.offerId, nowMs);

  const proposer = getPlayer(state, offer.proposerId);
  const recipient = getPlayer(state, offer.recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;

  validateTradeTerms(state, {
    proposer,
    recipient,
    gives: offer.gives,
    receives: offer.receives,
  });

  const newState = deepClone(state);
  const workingOffer = findTradeOffer(newState, offer.id);
  if (!workingOffer) throw TradeErrorKeys.OFFER_NOT_FOUND;

  applyTradeSettlement(newState, workingOffer);
  workingOffer.status = "accepted";
  newState.tradeOffers = pruneTradeOffers(newState.tradeOffers ?? []);

  // Intentional: although the asset transfers are publicly observable in state,
  // the `trade_accepted` log line carries the full terms and stays private to the
  // two parties (redacted by `redactLogEntriesForViewer`). We deliberately do not
  // emit a public "trade completed" line — keeping the negotiated terms private is
  // the conservative choice.
  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "trade_accepted",
      payload: tradeLogPayload(workingOffer),
    },
  ];

  let settledState = revokeUnqualifiedRateCards(newState, logs, {
    type: "trade",
  });
  settledState = applyWinIfThresholdCrossed(settledState, logs);
  return { state: settledState, logEntries: logs };
}

export function handleRejectTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const offer = pendingOfferForResponse(
    state,
    playerId,
    action.offerId,
    nowMs,
    {
      allowExpired: true,
    },
  );
  const newState = deepClone(state);
  const workingOffer = findTradeOffer(newState, offer.id);
  if (!workingOffer) throw TradeErrorKeys.OFFER_NOT_FOUND;
  workingOffer.status = isOfferExpired(workingOffer, nowMs)
    ? "expired"
    : "rejected";
  newState.tradeOffers = pruneTradeOffers(newState.tradeOffers ?? []);

  return {
    state: newState,
    logEntries: [
      {
        playerId,
        actionType:
          workingOffer.status === "expired"
            ? "trade_expired"
            : "trade_rejected",
        payload: tradeLogPayload(workingOffer),
      },
    ],
  };
}

export function handleCounterTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  // No phase gate: countering is a recipient's RESPONSE to a pending offer (same
  // category as accept/reject), valid off-turn in any phase. Unlike
  // `handleProposeTrade`, it does not spend an action point, so it is registered
  // in `GLOBAL_ACTION_ROUTES` rather than the turn/action route table.
  const offer = pendingOfferForResponse(state, playerId, action.offerId, nowMs);
  if (offer.counterCount >= MAX_TRADE_COUNTERS) {
    throw TradeErrorKeys.COUNTER_LIMIT_REACHED;
  }

  const proposer = getPlayer(state, playerId);
  const recipient = getPlayer(state, offer.proposerId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;
  if (isEliminated(state, playerId) || isEliminated(state, offer.proposerId)) {
    throw TradeErrorKeys.INVALID_PARTY;
  }

  const gives = normalizeTransfer(action.gives);
  const receives = normalizeTransfer(action.receives);
  validateTradeTerms(state, { proposer, recipient, gives, receives });

  const counterOffer = buildTradeOffer(state, {
    proposerId: playerId,
    recipientId: offer.proposerId,
    gives,
    receives,
    nowMs,
    timeoutMinutes: action.timeoutMinutes,
    counterCount: offer.counterCount + 1,
    parentOfferId: offer.id,
  });

  const newState = deepClone(state);
  const workingOffer = findTradeOffer(newState, offer.id);
  if (!workingOffer) throw TradeErrorKeys.OFFER_NOT_FOUND;
  workingOffer.status = "countered";
  newState.tradeOffers = pruneTradeOffers([
    ...(newState.tradeOffers ?? []),
    counterOffer,
  ]);

  return {
    state: newState,
    logEntries: [
      {
        playerId,
        actionType: "trade_countered",
        payload: tradeLogPayload(counterOffer),
      },
    ],
  };
}

/**
 * Shared "flip pending→expired + emit `trade_expired` log + prune" loop, in
 * place on `state`. The two public expiry paths differ ONLY in which pending
 * offers they select (timed expiry vs game-over expires all), so both delegate
 * here. Returns the number of offers expired.
 */
function expireSelectedTradeOffers(
  state: InternalGameState,
  shouldExpire: (offer: TradeOffer) => boolean,
  logs: LogEntry[],
): number {
  let expired = 0;
  for (const offer of state.tradeOffers ?? []) {
    if (offer.status !== "pending" || !shouldExpire(offer)) continue;
    offer.status = "expired";
    expired += 1;
    logs.push({
      playerId: null,
      actionType: "trade_expired",
      payload: tradeLogPayload(offer),
    });
  }
  state.tradeOffers = pruneTradeOffers(state.tradeOffers ?? []);
  return expired;
}

export function expirePendingTradeOffers(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const newState = deepClone(state);
  const logs: LogEntry[] = [];
  const expired = expireSelectedTradeOffers(
    newState,
    (offer) => offer.expiresAt <= nowMs,
    logs,
  );
  if (expired === 0) return null;

  return { state: newState, logEntries: logs };
}

/**
 * Terminate every still-`pending` trade offer when the game ends. Called from
 * `finalizeWin` (the single chokepoint for ALL win paths) so no offer is left
 * dangling after `game_over` — `applyAction` rejects every later action with
 * `game.completed`, and the DO clears trade-offer alarms, so without this an
 * offer could stay `pending` forever. Mutates `state` in place and appends a
 * `trade_expired` log entry per offer (a terminal status already understood by
 * the trade desk and redacted to the two parties by `redactLogEntriesForViewer`).
 */
export function expirePendingTradeOffersForGameOver(
  state: InternalGameState,
  logs: LogEntry[],
): void {
  // Game over expires EVERY pending offer regardless of `expiresAt`.
  expireSelectedTradeOffers(state, () => true, logs);
}

export function nextTradeOfferExpiry(state: InternalGameState): number | null {
  const expiries = (state.tradeOffers ?? [])
    .filter((offer) => offer.status === "pending")
    .map((offer) => offer.expiresAt);
  return expiries.length ? Math.min(...expiries) : null;
}

function applyTradeSettlement(
  state: InternalGameState,
  offer: TradeOffer,
): void {
  const proposer = getPlayer(state, offer.proposerId);
  const recipient = getPlayer(state, offer.recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;

  transferCapital(proposer, recipient, offer.gives.capital);
  transferCapital(recipient, proposer, offer.receives.capital);

  for (const tilePosition of offer.gives.tilePositions) {
    if (
      !transferTileOwnership(
        state,
        offer.proposerId,
        offer.recipientId,
        tilePosition,
      )
    ) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
  }

  for (const tilePosition of offer.receives.tilePositions) {
    if (
      !transferTileOwnership(
        state,
        offer.recipientId,
        offer.proposerId,
        tilePosition,
      )
    ) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
  }
}

function pruneTradeOffers(offers: TradeOffer[]): TradeOffer[] {
  const pending = offers.filter((offer) => offer.status === "pending");
  const resolved = offers.filter((offer) => offer.status !== "pending");
  return [...resolved.slice(-TRADE_OFFER_HISTORY_LIMIT), ...pending];
}

function nextTradeOfferSequence(state: InternalGameState): number {
  const prefix = `trade-${state.gameId}-`;
  let maxSequence = 0;
  for (const offer of state.tradeOffers ?? []) {
    if (!offer.id.startsWith(prefix)) continue;
    const sequence = Number.parseInt(offer.id.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }
  return maxSequence + 1;
}

function buildTradeOffer(
  state: InternalGameState,
  params: {
    proposerId: string;
    recipientId: string;
    gives: TradeOfferTransfer;
    receives: TradeOfferTransfer;
    nowMs: number;
    timeoutMinutes: number | undefined;
    counterCount: number;
    parentOfferId?: string;
  },
): TradeOffer {
  const timeoutMinutes = params.timeoutMinutes ?? DEFAULT_TRADE_TIMEOUT_MINUTES;
  return {
    id: `trade-${state.gameId}-${nextTradeOfferSequence(state)}`,
    gameId: state.gameId,
    proposerId: params.proposerId,
    recipientId: params.recipientId,
    gives: params.gives,
    receives: params.receives,
    status: "pending",
    createdAt: params.nowMs,
    expiresAt: params.nowMs + timeoutMinutes * 60_000,
    counterCount: params.counterCount,
    ...(params.parentOfferId ? { parentOfferId: params.parentOfferId } : {}),
  };
}

function normalizeTransfer(
  transfer: TradeOfferTransfer | undefined,
): TradeOfferTransfer {
  return {
    capital: transfer?.capital ?? 0,
    tilePositions: transfer?.tilePositions ?? [],
  };
}

function validateTradeTerms(
  state: InternalGameState,
  { proposer, recipient, gives, receives }: TradeValidationContext,
): void {
  if (!hasTransferValue(gives) && !hasTransferValue(receives)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (hasDuplicatePositions(gives.tilePositions)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (hasDuplicatePositions(receives.tilePositions)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (
    proposer.capital < gives.capital ||
    recipient.capital < receives.capital
  ) {
    throw TradeErrorKeys.INSUFFICIENT_CAPITAL;
  }

  validateTransferTiles(state, proposer.playerId, gives);
  validateTransferTiles(state, recipient.playerId, receives);
}

/**
 * Minimal structural shape needed to evaluate tile-tradeability. Both the
 * engine's `InternalGameState` and the client `GameState` satisfy it, so the web
 * trade desk can call the shared predicate without an unsafe cast.
 */
type TradeableTileStateView = {
  tiles?: Array<{
    position: number | string;
    ownerId?: string | null;
    mortgaged?: boolean;
  }>;
  activeContracts?: BindingContract[];
  players?: Array<{
    playerId: string;
    ownedTilePositions: Array<number | string>;
  }>;
};

/**
 * Single canonical tile-tradeability contract: a tile may be put on the trade
 * desk only when `playerId` owns it, it is not mortgaged, and it is not blocked
 * from sale by an active binding `sell_tile` contract. This is the positive
 * predicate behind `validateTransferTiles` (which throws specific error keys),
 * the web trade-desk helper, and the trade AI's target selection — so the rules
 * live in ONE place and can't drift.
 */
export function isTileTradeable(
  state: TradeableTileStateView,
  playerId: string,
  position: number | string,
): boolean {
  const tileState = state.tiles?.find(
    (tile) => String(tile.position) === String(position),
  );
  if (!tileState || tileState.ownerId !== playerId || tileState.mortgaged) {
    return false;
  }
  return !isActionBlockedByContracts(state.activeContracts ?? [], {
    type: "sell_tile",
    playerId,
    tileId: String(position),
  }).blocked;
}

/**
 * All positions `playerId` could legally offer in a trade (owned, not
 * mortgaged, not contract-locked), preserving the player's ownership order.
 */
export function listTradeableTilePositions(
  state: TradeableTileStateView,
  playerId: string,
): Array<number | string> {
  const player = state.players?.find((entry) => entry.playerId === playerId);
  if (!player) return [];
  return player.ownedTilePositions.filter((position) =>
    isTileTradeable(state, playerId, position),
  );
}

function validateTransferTiles(
  state: InternalGameState,
  ownerId: string,
  transfer: TradeOfferTransfer,
): void {
  for (const tilePosition of transfer.tilePositions) {
    // Eligibility is decided once by the canonical predicate; only when a tile
    // is rejected do we look at its state to throw the SPECIFIC reason callers
    // and tests distinguish (not-owned vs mortgaged vs contract-locked).
    if (isTileTradeable(state, ownerId, tilePosition)) continue;
    const tileState = state.tiles.find(
      (tile) => String(tile.position) === String(tilePosition),
    );
    if (!tileState || tileState.ownerId !== ownerId) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
    if (tileState.mortgaged) {
      throw TradeErrorKeys.TILE_MORTGAGED;
    }
    // Owned + un-mortgaged but still not tradeable ⇒ blocked by a sell contract.
    throw TradeErrorKeys.INVALID_TERMS;
  }
}

function pendingOfferForResponse(
  state: InternalGameState,
  playerId: string,
  offerId: string | undefined,
  nowMs: number,
  options: { allowExpired?: boolean } = {},
): TradeOffer {
  if (!offerId) throw TradeErrorKeys.OFFER_NOT_FOUND;
  const offer = findTradeOffer(state, offerId);
  if (!offer) throw TradeErrorKeys.OFFER_NOT_FOUND;
  if (offer.status !== "pending") throw TradeErrorKeys.OFFER_NOT_PENDING;
  if (offer.recipientId !== playerId) throw TradeErrorKeys.INVALID_PARTY;
  // Mirror propose/counter: a settled/responded offer must not involve an
  // eliminated party (latent today — `eliminatedPlayerIds` isn't populated yet —
  // but kept consistent so accept/reject/counter all reject eliminated parties).
  if (
    isEliminated(state, offer.proposerId) ||
    isEliminated(state, offer.recipientId)
  ) {
    throw TradeErrorKeys.INVALID_PARTY;
  }
  if (!options.allowExpired && isOfferExpired(offer, nowMs)) {
    throw TradeErrorKeys.OFFER_EXPIRED;
  }
  return offer;
}

function isOfferExpired(offer: TradeOffer, nowMs: number): boolean {
  return offer.expiresAt <= nowMs;
}

function findTradeOffer(
  state: InternalGameState,
  offerId: string,
): TradeOffer | undefined {
  return state.tradeOffers?.find((offer) => offer.id === offerId);
}

function isEliminated(state: InternalGameState, playerId: string): boolean {
  return (state.eliminatedPlayerIds ?? []).includes(playerId);
}

function hasTransferValue(transfer: TradeOfferTransfer): boolean {
  return transfer.capital > 0 || transfer.tilePositions.length > 0;
}

function hasDuplicatePositions(positions: Array<number | string>): boolean {
  return new Set(positions.map(String)).size !== positions.length;
}

function tradeLogPayload(offer: TradeOffer): Record<string, unknown> {
  return {
    offerId: offer.id,
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    gives: offer.gives,
    receives: offer.receives,
    status: offer.status,
    expiresAt: offer.expiresAt,
    counterCount: offer.counterCount,
    parentOfferId: offer.parentOfferId,
  };
}
