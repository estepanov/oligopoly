import {
  clampTrustworthiness,
  THREAD_EXPIRY_PENALTY,
} from "../trustConstants.js";
import type { InternalGameState, LogEntry } from "./gameStateTypes.js";
import { calcThreadExpiry, isThreadExpired } from "./negotiation.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { tickRateCardPressureResets } from "./rateCards.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { triggerFinalRoundIfNeeded } from "./winResolution.js";

const DEBT_SPIRAL_INTEREST_RATE = 0.1;

/** Clears per-round transient flags (frozen tiles, manipulation usage). */
export function clearPerRoundTransientState(state: InternalGameState): void {
  for (const player of state.players) {
    player.marketManipulationUsedThisRound = false;
  }
  state.frozenTilePositions = [];
}

export function processCoordinationPhase(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  let newState = deepClone(state);

  if (isOptionalRuleEnabled(newState.settings, "debt_spiral")) {
    for (const player of newState.players) {
      const debt = player.outstandingDebt ?? 0;
      if (debt > 0) {
        const interest = Math.floor(debt * DEBT_SPIRAL_INTEREST_RATE);
        player.outstandingDebt = debt + interest;
        logs.push({
          playerId: player.playerId,
          actionType: "debt_interest",
          payload: { interest, total: player.outstandingDebt },
        });
      }
    }
  }

  clearPerRoundTransientState(newState);
  newState = tickRateCardPressureResets(newState, logs);
  newState = expireNegotiationThreads(newState, logs);

  for (const player of newState.players) {
    player.coordinationAcknowledged = false;
  }

  newState = triggerFinalRoundIfNeeded(newState, logs);

  logs.push({
    playerId: null,
    actionType: "coordination_phase_complete",
    payload: { round: newState.round },
  });

  return newState;
}

function expireNegotiationThreads(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  const threads = state.negotiationThreads;
  if (!threads?.length) return state;

  const newState = deepClone(state);
  for (const thread of newState.negotiationThreads ?? []) {
    if (thread.status !== "open") continue;
    if (!isThreadExpired(thread, newState.round)) continue;
    thread.status = "expired";
    for (const partyId of thread.partyIds) {
      const player = getPlayer(newState, partyId);
      if (player) {
        player.trustworthiness = clampTrustworthiness(
          player.trustworthiness + THREAD_EXPIRY_PENALTY,
        );
      }
    }
    logs.push({
      playerId: null,
      actionType: "negotiation_expired",
      payload: { threadId: thread.id, partyIds: thread.partyIds },
    });
  }
  return newState;
}

export function createNegotiationThread(
  state: InternalGameState,
  creatorId: string,
  partyIds: string[],
): InternalGameState {
  const newState = deepClone(state);
  if (!newState.negotiationThreads) {
    newState.negotiationThreads = [];
  }
  const id = `thread-${newState.gameId}-${newState.negotiationThreads.length + 1}`;
  newState.negotiationThreads.push({
    id,
    createdBy: creatorId,
    partyIds: [...new Set(partyIds)],
    status: "open",
    startedRound: newState.round,
    expiresAfterRound: calcThreadExpiry(newState.round),
    visibility: isOptionalRuleEnabled(newState.settings, "open_negotiation")
      ? "open"
      : "private",
  });
  return newState;
}
