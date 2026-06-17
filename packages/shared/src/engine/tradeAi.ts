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
import { ACTION_POINTS_PER_TURN } from "./setup.js";
import {
  canCounterTrade,
  canProposeTrade,
  listTradeableTilePositions,
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
  nowMs: number,
): GameAction | null {
  // Reuse the canonical counter gating (phase/recipient/expiry/elimination/
  // counter-cap) so AI and engine share one rule set; the AI is the recipient.
  if (!canCounterTrade(state, offer.recipientId, offer.id, nowMs)) {
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

  const counter = counterTradeAction(state, offer, nowMs);
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

/**
 * The opponent the AI should propose to, chosen deterministically by walking
 * `state.turnOrder` (game order) and returning the first eligible, tradeable
 * opponent. Order-stable selection mirrors the deterministic inbox/offer
 * selection so two valid targets can't make AI behavior depend on
 * `state.players` array order.
 */
function selectProposalTargetId(
  state: InternalGameState,
  actorId: string,
): string | null {
  for (const playerId of state.turnOrder) {
    if (playerId === actorId) continue;
    if ((state.eliminatedPlayerIds ?? []).includes(playerId)) continue;
    // Use the canonical tradeability predicate so the AI never targets a
    // mortgaged or contract-locked tile (which the engine would reject with
    // `INVALID_TERMS`, wasting the propose).
    if (listTradeableTilePositions(state, playerId).length > 0) {
      return playerId;
    }
  }
  return null;
}

export function aiTradeProposalAction(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
): GameAction | null {
  // Reuse the canonical propose gating (phase/turn/AP) so AI and engine share
  // one rule set; the heuristics below are AI-only additions.
  if (!canProposeTrade(state, actorId)) return null;
  const actor = state.players.find((player) => player.playerId === actorId);
  if (!actor) return null;
  // AI-only heuristic: only propose at the start of a turn (full AP untouched),
  // so it never spends down a turn it has already partly committed elsewhere.
  const AI_PROPOSE_REQUIRES_FULL_AP = ACTION_POINTS_PER_TURN;
  if (actor.actionPointsRemaining < AI_PROPOSE_REQUIRES_FULL_AP) return null;
  if (hasPendingOutgoingTrade(state, actorId)) return null;

  const reserve = personality === "loyalist" ? 250 : 150;
  const targetId = selectProposalTargetId(state, actorId);
  if (!targetId) return null;

  const targetTile = listTradeableTilePositions(state, targetId)
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
    recipientId: targetId,
    gives: { capital: offerCapital, tilePositions: [] },
    receives: { capital: 0, tilePositions: [targetTile.position] },
  };
}
