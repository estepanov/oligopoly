import type { AiPersonality, GameAction } from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import { isAiControlledActor, resolveAiPersonality } from "./aiControl.js";
import {
  getActiveEligibleBidders,
  hasAuctionSubmission,
  suggestAiAuctionBid,
} from "./auction.js";
import { isLiveAuction } from "./auctionMode.js";
import { phaseHasOwnDeadline } from "./deadlines.js";
import type { InternalGameState } from "./gameStateTypes.js";
import {
  aiTradeProposalAction,
  aiTradeResponseAction,
  findNextAiTradeActor,
} from "./tradeAi.js";

export type AiDecision = {
  actorId: string;
  personality: AiPersonality;
  action: GameAction;
};

const defaultPersonality: AiPersonality = "opportunist";

function currentPlayerId(state: InternalGameState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
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

  // Off-turn trade-inbox responses run only when the current phase has no
  // deadline of its own. During an auction window the phase actor wins so a
  // pending trade can't stall live bidding (see `phaseHasOwnDeadline`).
  if (!phaseHasOwnDeadline(state)) {
    const tradeResponse = aiTradeResponseAction(state, actorId, personality);
    if (tradeResponse) {
      return { actorId, personality, action: tradeResponse };
    }
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

/**
 * Single canonical "which AI actor (if any) owes an action right now?" used by
 * BOTH the inline AI loop (`chooseAiAction`/`stepGameAiTurn`) and the Durable
 * Object orchestration (`GameRoom.syncAfterStateChange`), so the DO reliably
 * wakes trade-inbox AI too — not just auction/current-turn AI.
 *
 * Priority (highest first):
 *   1. A phase actor when the phase drives its own deadline (auction windows) —
 *      a pending trade must not preempt live bidding.
 *   2. An off-turn trade-inbox recipient (deterministic earliest-expiring).
 *   3. Any remaining phase actor, then the current-turn actor.
 */
export function findNextAiActor(state: InternalGameState): string | null {
  if (phaseHasOwnDeadline(state)) {
    const phaseActor = findNextAiActorForPhase(state);
    if (phaseActor) return phaseActor;
  }

  const tradeActor = findNextAiTradeActor(state);
  if (tradeActor) return tradeActor;

  const phaseActor = findNextAiActorForPhase(state);
  if (phaseActor) return phaseActor;

  const actorId = currentPlayerId(state);
  return actorId && isAiControlledActor(state, actorId) ? actorId : null;
}

/** True when any AI actor owes an action — the canonical "is there AI work?". */
export function hasAiWork(state: InternalGameState): boolean {
  return findNextAiActor(state) !== null;
}

export function chooseAiAction(state: InternalGameState): AiDecision | null {
  const actorId = findNextAiActor(state);
  return actorId ? chooseAiActionForPlayer(state, actorId) : null;
}
