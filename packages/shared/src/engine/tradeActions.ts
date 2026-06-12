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

  const nowMs = Date.now();
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
): ApplyActionResult {
  const nowMs = Date.now();
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
): ApplyActionResult {
  const nowMs = Date.now();
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
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_phase";

  const nowMs = Date.now();
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

export function expirePendingTradeOffers(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const pendingOffers = (state.tradeOffers ?? []).filter(
    (offer) => offer.status === "pending" && offer.expiresAt <= nowMs,
  );
  if (pendingOffers.length === 0) return null;

  const newState = deepClone(state);
  const logs: LogEntry[] = [];
  for (const offer of newState.tradeOffers ?? []) {
    if (offer.status !== "pending" || offer.expiresAt > nowMs) continue;
    offer.status = "expired";
    logs.push({
      playerId: null,
      actionType: "trade_expired",
      payload: tradeLogPayload(offer),
    });
  }
  newState.tradeOffers = pruneTradeOffers(newState.tradeOffers ?? []);

  return { state: newState, logEntries: logs };
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

function validateTransferTiles(
  state: InternalGameState,
  ownerId: string,
  transfer: TradeOfferTransfer,
): void {
  for (const tilePosition of transfer.tilePositions) {
    const tileState = state.tiles.find(
      (tile) => String(tile.position) === String(tilePosition),
    );
    if (!tileState || tileState.ownerId !== ownerId) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
    if (tileState.mortgaged) {
      throw TradeErrorKeys.TILE_MORTGAGED;
    }
    if (
      isActionBlockedByContracts(state.activeContracts ?? [], {
        type: "sell_tile",
        playerId: ownerId,
        tileId: String(tilePosition),
      }).blocked
    ) {
      throw TradeErrorKeys.INVALID_TERMS;
    }
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
