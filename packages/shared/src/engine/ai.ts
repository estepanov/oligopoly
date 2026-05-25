import type { AiPersonality, GameAction } from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import { isAiControlledActor, resolveAiPersonality } from "./aiControl.js";
import type { InternalGameState } from "./gameStateMachine.js";

export type AiDecision = {
  actorId: string;
  personality: AiPersonality;
  action: GameAction;
};

const defaultPersonality: AiPersonality = "opportunist";

function currentPlayerId(state: InternalGameState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
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

export function chooseAiAction(state: InternalGameState): AiDecision | null {
  const actorId = currentPlayerId(state);
  if (!actorId) return null;

  if (!isAiControlledActor(state, actorId)) return null;

  const personality = resolveAiPersonality(state, actorId) ?? defaultPersonality;

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
