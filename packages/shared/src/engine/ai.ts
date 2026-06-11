import type {
  AiPersonality,
  GameAction,
  TradeOffer,
} from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import { isAiControlledActor, resolveAiPersonality } from "./aiControl.js";
import {
  getActiveEligibleBidders,
  hasAuctionSubmission,
  suggestAiAuctionBid,
} from "./auction.js";
import { isLiveAuction } from "./auctionMode.js";
import type { InternalGameState } from "./gameStateTypes.js";
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from "./setup.js";
import { MAX_TRADE_COUNTERS, tradeTransferValue } from "./tradeActions.js";

export type AiDecision = {
  actorId: string;
  personality: AiPersonality;
  action: GameAction;
};

const defaultPersonality: AiPersonality = "opportunist";

function currentPlayerId(state: InternalGameState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

function tradeMarginForRecipient(offer: TradeOffer): number {
  return tradeTransferValue(offer.gives) - tradeTransferValue(offer.receives);
}

function acceptanceMargin(personality: AiPersonality): number {
  switch (personality) {
    case "loyalist":
      return 0;
    case "disruptor":
      return -25;
    default:
      return 10;
  }
}

function pendingIncomingTradeForAi(
  state: InternalGameState,
  actorId: string,
): TradeOffer | null {
  const now = Date.now();
  return (
    (state.tradeOffers ?? []).find(
      (offer) =>
        offer.status === "pending" &&
        offer.recipientId === actorId &&
        offer.expiresAt > now,
    ) ?? null
  );
}

function findNextAiTradeActor(state: InternalGameState): string | null {
  const now = Date.now();
  let selected: TradeOffer | null = null;
  for (const offer of state.tradeOffers ?? []) {
    if (offer.status !== "pending" || offer.expiresAt <= now) continue;
    if (!isAiControlledActor(state, offer.recipientId)) continue;
    if (
      !selected ||
      offer.expiresAt < selected.expiresAt ||
      (offer.expiresAt === selected.expiresAt &&
        offer.createdAt < selected.createdAt)
    ) {
      selected = offer;
    }
  }
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

function aiTradeResponseAction(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
): GameAction | null {
  const offer = pendingIncomingTradeForAi(state, actorId);
  if (!offer) return null;

  if (tradeMarginForRecipient(offer) >= acceptanceMargin(personality)) {
    return { type: "accept_trade", offerId: offer.id };
  }

  const counter = counterTradeAction(state, offer);
  if (counter) return counter;

  return { type: "reject_trade", offerId: offer.id };
}

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
    default:
      return 0.8;
  }
}

function aiTradeProposalAction(
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
      !state.eliminatedPlayerIds.includes(player.playerId) &&
      player.ownedTilePositions.some((position) => {
        const tile = state.tiles.find(
          (entry) => String(entry.position) === String(position),
        );
        return tile?.ownerId === player.playerId && !tile.mortgaged;
      }),
  );
  if (!target) return null;

  const targetTile = target.ownedTilePositions
    .map((position) => {
      const tileState = state.tiles.find(
        (entry) => String(entry.position) === String(position),
      );
      const tile = getTileByPosition(position);
      if (tileState?.ownerId !== target.playerId || tileState.mortgaged) {
        return null;
      }
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

export function findNextAiAuctionActor(
  state: InternalGameState,
): string | null {
  if (state.phase !== "waiting_for_auction_bids" || !state.pendingAuction) {
    return null;
  }

  for (const playerId of getActiveEligibleBidders(state)) {
    if (!isAiControlledActor(state, playerId)) continue;
    if (isLiveAuction(state.pendingAuction)) {
      if (suggestAiAuctionBid(state, playerId) !== "pass") {
        return playerId;
      }
      continue;
    }
    if (hasAuctionSubmission(state.pendingAuction, playerId)) continue;
    return playerId;
  }

  return null;
}

function deterministicDice(
  state: InternalGameState,
  actorId: string,
): [number, number] {
  const seed = `${state.gameId}:${state.round}:${actorId}:${state.lastDiceRoll?.join("-") ?? "start"}`;
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  // Use the UNSIGNED right shift so the second die stays in 1..6. A signed
  // `>>` can produce a negative value for large hashes, yielding invalid dice
  // (e.g. -4) and negative board positions during AI / timeout-takeover rolls.
  return [((hash % 6) + 1) as 1, (((hash >>> 3) % 6) + 1) as 1];
}

function shouldKeepPeekedMarketEvent(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
): boolean {
  const peek = state.pendingInsiderPeek;
  if (!peek) return true;

  const seed = `${state.gameId}:${state.round}:${actorId}:${personality}:${peek.cardId}:${peek.trigger}`;
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash % 2 === 0;
}

function shouldBuy(
  state: InternalGameState,
  actorId: string,
  personality: AiPersonality,
): boolean {
  const player = state.players.find((p) => p.playerId === actorId);
  const position = state.pendingBuyTilePosition;
  if (!player || position === null) return false;

  const tile = getTileByPosition(position);
  if (!tile?.cost || player.capital < tile.cost) return false;

  const reserve = personality === "disruptor" ? 100 : 200;
  if (personality === "loyalist") {
    return player.capital - tile.cost >= reserve;
  }
  return player.capital >= tile.cost;
}

export function chooseAiActionForPlayer(
  state: InternalGameState,
  actorId: string,
): AiDecision | null {
  if (!isAiControlledActor(state, actorId)) return null;

  const personality =
    resolveAiPersonality(state, actorId) ?? defaultPersonality;

  const tradeResponse = aiTradeResponseAction(state, actorId, personality);
  if (tradeResponse) {
    return { actorId, personality, action: tradeResponse };
  }

  if (state.phase === "waiting_for_auction_bids" && state.pendingAuction) {
    if (
      !isLiveAuction(state.pendingAuction) &&
      hasAuctionSubmission(state.pendingAuction, actorId)
    ) {
      return null;
    }
    if (!getActiveEligibleBidders(state).includes(actorId)) return null;

    const submission = suggestAiAuctionBid(state, actorId);
    if (submission === "pass") {
      if (isLiveAuction(state.pendingAuction)) return null;
      return {
        actorId,
        personality,
        action: {
          type: "auction_pass",
          tilePosition: state.pendingAuction.tilePosition,
        },
      };
    }

    return {
      actorId,
      personality,
      action: {
        type: "auction_bid",
        tilePosition: state.pendingAuction.tilePosition,
        amount: submission,
      },
    };
  }

  if (actorId !== currentPlayerId(state)) return null;

  if (state.phase === "waiting_for_insider_peek" && state.pendingInsiderPeek) {
    return {
      actorId,
      personality,
      action: shouldKeepPeekedMarketEvent(state, actorId, personality)
        ? { type: "insider_keep_market_event" }
        : { type: "insider_discard_market_event" },
    };
  }

  if (state.phase === "waiting_for_market_event") {
    return {
      actorId,
      personality,
      action: { type: "draw_market_event" },
    };
  }

  if (state.phase === "waiting_for_roll" || state.phase === "rolling_doubles") {
    return {
      actorId,
      personality,
      action: { type: "roll_dice", result: deterministicDice(state, actorId) },
    };
  }

  if (
    state.phase === "waiting_for_buy" &&
    state.pendingBuyTilePosition !== null
  ) {
    return {
      actorId,
      personality,
      action: shouldBuy(state, actorId, personality)
        ? { type: "buy_tile", tilePosition: state.pendingBuyTilePosition }
        : { type: "decline_tile", tilePosition: state.pendingBuyTilePosition },
    };
  }

  if (state.phase === "waiting_for_path_choice") {
    return {
      actorId,
      personality,
      action: {
        type: "path_choice",
        choice: personality === "disruptor" ? "diagonal" : "perimeter",
      },
    };
  }

  if (state.phase === "action") {
    const tradeProposal = aiTradeProposalAction(state, actorId, personality);
    if (tradeProposal) {
      return { actorId, personality, action: tradeProposal };
    }
    return { actorId, personality, action: { type: "end_turn" } };
  }

  return null;
}

const AI_PHASE_ACTOR_FINDERS: Record<
  string,
  (state: InternalGameState) => string | null
> = {
  waiting_for_auction_bids: findNextAiAuctionActor,
};

export function findNextAiActorForPhase(
  state: InternalGameState,
): string | null {
  const finder = AI_PHASE_ACTOR_FINDERS[state.phase];
  return finder ? finder(state) : null;
}

export function chooseAiAction(state: InternalGameState): AiDecision | null {
  const tradeActor = findNextAiTradeActor(state);
  if (tradeActor) {
    return chooseAiActionForPlayer(state, tradeActor);
  }

  const phaseActor = findNextAiActorForPhase(state);
  if (phaseActor) {
    return chooseAiActionForPlayer(state, phaseActor);
  }

  const actorId = currentPlayerId(state);
  return actorId ? chooseAiActionForPlayer(state, actorId) : null;
}
