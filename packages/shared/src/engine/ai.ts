import type { AiPersonality, GameAction } from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import { isAiControlledActor, resolveAiPersonality } from "./aiControl.js";
import {
  getActiveEligibleBidders,
  hasAuctionSubmission,
  suggestAiAuctionBid,
} from "./auction.js";
import { isLiveAuction } from "./auctionMode.js";
import type { InternalGameState } from "./gameStateTypes.js";

export type AiDecision = {
  actorId: string;
  personality: AiPersonality;
  action: GameAction;
};

const defaultPersonality: AiPersonality = "opportunist";

function currentPlayerId(state: InternalGameState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

export function findNextAiCoordinationActor(
  state: InternalGameState,
): string | null {
  if (state.phase !== "syndicate_coordination") return null;

  for (const playerId of state.turnOrder) {
    if (state.eliminatedPlayerIds.includes(playerId)) continue;
    if (!isAiControlledActor(state, playerId)) continue;
    const player = state.players.find((p) => p.playerId === playerId);
    if (player?.coordinationAcknowledged) continue;
    return playerId;
  }

  return null;
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
  return [((hash % 6) + 1) as 1, (((hash >> 3) % 6) + 1) as 1];
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

  if (state.phase === "syndicate_coordination") {
    const player = state.players.find((p) => p.playerId === actorId);
    if (player?.coordinationAcknowledged) return null;
    return { actorId, personality, action: { type: "end_coordination" } };
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
    return { actorId, personality, action: { type: "end_turn" } };
  }

  return null;
}

const AI_PHASE_ACTOR_FINDERS: Record<
  string,
  (state: InternalGameState) => string | null
> = {
  waiting_for_auction_bids: findNextAiAuctionActor,
  syndicate_coordination: findNextAiCoordinationActor,
};

export function findNextAiActorForPhase(
  state: InternalGameState,
): string | null {
  const finder = AI_PHASE_ACTOR_FINDERS[state.phase];
  return finder ? finder(state) : null;
}

export function chooseAiAction(state: InternalGameState): AiDecision | null {
  const phaseActor = findNextAiActorForPhase(state);
  if (phaseActor) {
    return chooseAiActionForPlayer(state, phaseActor);
  }

  const actorId = currentPlayerId(state);
  return actorId ? chooseAiActionForPlayer(state, actorId) : null;
}
