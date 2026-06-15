// ---------------------------------------------------------------------------
// Trade AI heuristics — off-turn inbox responses (accept/counter/reject) and
// on-turn trade proposals. Kept separate from `ai.ts` (orchestration) the same
// way auction AI lives in `auction.ts`; `chooseAiAction` composes these.
// ---------------------------------------------------------------------------

import type {
  AiPersonality,
  GameAction,
  TradeOffer,
} from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import { isAiControlledActor } from "./aiControl.js";
import type { InternalGameState } from "./gameStateTypes.js";
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from "./setup.js";
import {
  listTradeableTilePositions,
  MAX_TRADE_COUNTERS,
  tradeTransferValue,
} from "./tradeActions.js";

function tradeMarginForRecipient(offer: TradeOffer): number {
  return tradeTransferValue(offer.gives) - tradeTransferValue(offer.receives);
}

function acceptanceMargin(personality: AiPersonality): number {
  switch (personality) {
    case "loyalist":
      return 0;
    case "disruptor":
      return -25;
    case "opportunist":
      return 10;
    default: {
      const _exhaustive: never = personality;
      return _exhaustive;
    }
  }
}

/**
 * Deterministic urgency order between two live offers: the one expiring sooner
 * wins, tie-broken by the earlier `createdAt`. Keeps offer/actor selection from
 * depending on `tradeOffers` array order so concurrent offers can't starve one
 * another.
 */
function isMoreUrgent(candidate: TradeOffer, current: TradeOffer): boolean {
  return (
    candidate.expiresAt < current.expiresAt ||
    (candidate.expiresAt === current.expiresAt &&
      candidate.createdAt < current.createdAt)
  );
}

/**
 * Walk `tradeOffers`, keep only pending + unexpired offers that match
 * `predicate`, and pick the most urgent (min `expiresAt`, tie-broken by earliest
 * `createdAt`). The single place the pending/expiry guard and deterministic
 * tie-breaking live, so offer- and actor-selection can't drift.
 */
function selectMostUrgentPendingOffer(
  state: InternalGameState,
  nowMs: number,
  predicate: (offer: TradeOffer) => boolean,
): TradeOffer | null {
  let selected: TradeOffer | null = null;
  for (const offer of state.tradeOffers ?? []) {
    if (offer.status !== "pending" || offer.expiresAt <= nowMs) continue;
    if (!predicate(offer)) continue;
    if (!selected || isMoreUrgent(offer, selected)) {
      selected = offer;
    }
  }
  return selected;
}

/**
 * The most urgent pending offer addressed to `actorId` (earliest `expiresAt`,
 * tie-broken by `createdAt`) — the single offer the AI should answer.
 */
function mostUrgentIncomingTradeForAi(
  state: InternalGameState,
  actorId: string,
  nowMs: number,
): TradeOffer | null {
  return selectMostUrgentPendingOffer(
    state,
    nowMs,
    (offer) => offer.recipientId === actorId,
  );
}

/**
 * Pick the AI recipient with the most urgent pending inbox offer. Selection is
 * deterministic: the offer with the minimum `expiresAt`, tie-broken by the
 * earliest `createdAt` — so two humans proposing to the same AI can't starve
 * one offer based on `tradeOffers` array order.
 */
export function findNextAiTradeActor(
  state: InternalGameState,
  nowMs: number = Date.now(),
): string | null {
  const selected = selectMostUrgentPendingOffer(state, nowMs, (offer) =>
    isAiControlledActor(state, offer.recipientId),
  );
  return selected?.recipientId ?? null;
}

function counterTradeAction(
  state: InternalGameState,
  offer: TradeOffer,
): GameAction | null {
  if (state.phase !== "action" || offer.counterCount >= MAX_TRADE_COUNTERS) {
    return null;
  }

  const proposer = state.players.find(
    (player) => player.playerId === offer.proposerId,
  );
  if (!proposer) return null;

  const aiGivesValue = tradeTransferValue(offer.receives);
  const humanGivesValue = tradeTransferValue(offer.gives);
  const neededCapital = Math.max(0, aiGivesValue - humanGivesValue);
  const requestedCapital =
    offer.gives.capital + Math.min(proposer.capital, neededCapital);
  if (requestedCapital <= offer.gives.capital) return null;

  return {
    type: "counter_trade",
    offerId: offer.id,
    gives: offer.receives,
    receives: {
      ...offer.gives,
      capital: requestedCapital,
    },
  };
}

export function aiTradeResponseAction(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
  nowMs: number = Date.now(),
): GameAction | null {
  const offer = mostUrgentIncomingTradeForAi(state, actorId, nowMs);
  if (!offer) return null;

  if (tradeMarginForRecipient(offer) >= acceptanceMargin(personality)) {
    return { type: "accept_trade", offerId: offer.id };
  }

  const counter = counterTradeAction(state, offer);
  if (counter) return counter;

  return { type: "reject_trade", offerId: offer.id };
}

// AI-only heuristic: an AI won't stack a second outgoing proposal while one is
// still pending. This is intentionally NOT enforced in `handleProposeTrade` for
// humans — humans are naturally throttled because each `propose_trade` costs 1
// action point (the engine cap), whereas an AI's proposal is free of that loop
// gate, so it self-limits here to avoid spamming offers.
function hasPendingOutgoingTrade(state: InternalGameState, actorId: string) {
  return (state.tradeOffers ?? []).some(
    (offer) => offer.status === "pending" && offer.proposerId === actorId,
  );
}

function tradeDiscountForPersonality(personality: AiPersonality): number {
  switch (personality) {
    case "loyalist":
      return 1;
    case "disruptor":
      return 0.65;
    case "opportunist":
      return 0.8;
    default: {
      const _exhaustive: never = personality;
      return _exhaustive;
    }
  }
}

export function aiTradeProposalAction(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
): GameAction | null {
  if (state.phase !== "action") return null;
  const actor = state.players.find((player) => player.playerId === actorId);
  if (!actor || actor.actionPointsRemaining < ACTION_COSTS.PROPOSE_TRADE) {
    return null;
  }
  if (actor.actionPointsRemaining < ACTION_POINTS_PER_TURN) return null;
  if (hasPendingOutgoingTrade(state, actorId)) return null;

  const reserve = personality === "loyalist" ? 250 : 150;
  const target = state.players.find(
    (player) =>
      player.playerId !== actorId &&
      !(state.eliminatedPlayerIds ?? []).includes(player.playerId) &&
      // Use the canonical tradeability predicate so the AI never targets a
      // mortgaged or contract-locked tile (which the engine would reject with
      // `INVALID_TERMS`, wasting the propose).
      listTradeableTilePositions(state, player.playerId).length > 0,
  );
  if (!target) return null;

  const targetTile = listTradeableTilePositions(state, target.playerId)
    .map((position) => {
      const tile = getTileByPosition(position);
      if (!tile?.cost) return null;
      return { position, cost: tile.cost };
    })
    .filter((entry): entry is { position: number | string; cost: number } =>
      Boolean(entry),
    )
    .sort((a, b) => a.cost - b.cost)[0];
  if (!targetTile) return null;

  const offerCapital = Math.max(
    1,
    Math.floor(targetTile.cost * tradeDiscountForPersonality(personality)),
  );
  if (actor.capital - offerCapital < reserve) return null;

  return {
    type: "propose_trade",
    recipientId: target.playerId,
    gives: { capital: offerCapital, tilePositions: [] },
    receives: { capital: 0, tilePositions: [targetTile.position] },
  };
}
