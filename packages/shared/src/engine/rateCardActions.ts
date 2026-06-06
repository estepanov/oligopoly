import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { drawTurnStartMarketEvent } from "./marketEvents.js";
import { syndicateQualifiesForRateCard, upsertRateCard } from "./rateCards.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { getSyndicateForPlayer } from "./syndicate.js";

export function handleSetRateCard(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "syndicate_coordination") {
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

export function handleEndCoordination(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  if (state.phase !== "syndicate_coordination") {
    throw "game.invalid_phase";
  }

  const newState = deepClone(state);
  const player = getPlayer(newState, playerId);
  if (!player) throw "game.invalid_action";
  player.coordinationAcknowledged = true;

  const activePlayers = newState.turnOrder.filter(
    (id) => !newState.eliminatedPlayerIds.includes(id),
  );
  const allAcked = activePlayers.every((id) => {
    const entry = getPlayer(newState, id);
    return entry?.coordinationAcknowledged;
  });

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "coordination_acknowledged",
      payload: null,
    },
  ];

  if (allAcked) {
    newState.currentPlayerIndex = 0;
    logs.push({
      playerId: null,
      actionType: "round_phase_advanced",
      payload: { phase: "waiting_for_market_event", round: newState.round },
    });
    const firstPlayerId = newState.turnOrder[0];
    if (firstPlayerId) {
      const drawResult = drawTurnStartMarketEvent(newState, firstPlayerId);
      logs.push(...drawResult.logEntries);
      return { state: drawResult.state, logEntries: logs };
    }
  }

  return { state: newState, logEntries: logs };
}
