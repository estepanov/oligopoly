import {
  AFFINITY_IDS,
  canNullifyDisruptionWithBiotech,
  getPlayerAffinityId,
  markAffinityUsed,
} from "./affinity.js";
import { resolvePendingDisruptionCard } from "./disruptionEvents.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateMachine.js";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function getPlayer(state: InternalGameState, playerId: string) {
  return state.players.find((player) => player.playerId === playerId);
}

export function handleUseAffinity(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const affinityId = action.affinityId;
  if (!affinityId || getPlayerAffinityId(state, playerId) !== affinityId) {
    throw "game.invalid_action";
  }

  const player = getPlayer(state, playerId)!;
  if (player.usedAffinityIds?.includes(affinityId)) {
    throw "game.invalid_action";
  }

  if (affinityId === AFFINITY_IDS.consumer_insights) {
    const targetPlayerId = action.targetPlayerId;
    if (!targetPlayerId || targetPlayerId === playerId) {
      throw "game.invalid_action";
    }
    const target = getPlayer(state, targetPlayerId);
    if (!target) throw "game.invalid_action";

    const newState = deepClone(state);
    markAffinityUsed(newState, playerId, affinityId);
    const logs: LogEntry[] = [
      {
        playerId,
        actionType: "capital_revealed",
        payload: {
          targetPlayerId,
          capital: target.capital,
          affinityId,
        },
      },
    ];
    return { state: newState, logEntries: logs };
  }

  throw "game.invalid_action";
}

export function handleDisruptionNullifyResponse(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  const pending = state.pendingDisruptionNullify;
  if (!pending || pending.drawingPlayerId !== playerId) {
    throw "game.not_your_turn";
  }

  if (action.type === "use_affinity") {
    if (action.affinityId !== AFFINITY_IDS.biotech_ip) {
      throw "game.invalid_action";
    }
    if (!canNullifyDisruptionWithBiotech(state, playerId, pending.cardId)) {
      throw "game.invalid_action";
    }
    return resolvePendingDisruptionCard(state, true);
  }

  return resolvePendingDisruptionCard(state, false);
}
