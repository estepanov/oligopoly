import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { drawTurnStartMarketEvent } from "./marketEvents.js";
import { syndicateQualifiesForRateCard, upsertRateCard } from "./rateCards.js";
import { deepClone } from "./stateUtils.js";
import { getSyndicateForPlayer } from "./syndicate.js";

const RATE_CARD_PHASES = new Set(["action", "rolling_doubles"]);

export function handleSetRateCard(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (!RATE_CARD_PHASES.has(state.phase)) {
    throw "game.invalid_phase";
  }

  const sectorId = action.sectorId;
  const multiplier = action.multiplier;
  if (!sectorId || multiplier === undefined) {
    throw "game.invalid_action";
  }

  const syndicate = getSyndicateForPlayer(state, playerId);
  if (!syndicate || syndicate.adminId !== playerId) {
    throw "game.invalid_action";
  }

  if (!syndicateQualifiesForRateCard(state, syndicate.syndicateId, sectorId)) {
    throw "game.invalid_action";
  }

  const newState = deepClone(state);
  newState.rateCards = upsertRateCard(
    newState,
    syndicate.syndicateId,
    sectorId,
    multiplier,
  );

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "rate_card_set",
      payload: { sectorId, multiplier, syndicateId: syndicate.syndicateId },
    },
  ];

  return { state: newState, logEntries: logs };
}

/** After a full player round, advance to the first surviving seat and run turn-start market event. */
export function advanceToFirstPlayerOfNewRound(
  state: InternalGameState,
  logs: LogEntry[],
): ApplyActionResult {
  const newState = deepClone(state);
  const firstActiveIndex = newState.turnOrder.findIndex(
    (id) => !newState.eliminatedPlayerIds.includes(id),
  );
  if (firstActiveIndex < 0) {
    return { state: newState, logEntries: logs };
  }
  newState.currentPlayerIndex = firstActiveIndex;
  newState.lastDiceRoll = null;
  newState.pendingBuyTilePosition = null;
  logs.push({
    playerId: null,
    actionType: "round_phase_advanced",
    payload: { phase: "waiting_for_market_event", round: newState.round },
  });
  const firstPlayerId = newState.turnOrder[firstActiveIndex];
  const drawResult = drawTurnStartMarketEvent(newState, firstPlayerId);
  logs.push(...drawResult.logEntries);
  return { state: drawResult.state, logEntries: logs };
}
