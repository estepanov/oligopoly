import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { formSyndicateApCost, getSyndicateForPlayer } from "./syndicate.js";
import { applyWinIfThresholdCrossed } from "./winResolution.js";

export function handleFormSyndicate(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const memberIds = action.memberIds;
  if (!memberIds || memberIds.length < 2) throw "game.invalid_action";
  if (!memberIds.includes(playerId)) throw "game.invalid_action";

  const uniqueMembers = [...new Set(memberIds)];
  if (uniqueMembers.length !== memberIds.length) throw "game.invalid_action";

  for (const memberId of memberIds) {
    if (!state.players.some((player) => player.playerId === memberId)) {
      throw "game.invalid_action";
    }
    if (getSyndicateForPlayer(state, memberId)) {
      throw "game.invalid_action";
    }
  }

  const apCost = formSyndicateApCost(state, playerId);
  const player = getPlayer(state, playerId)!;
  if (player.actionPointsRemaining < apCost) throw "game.insufficient_ap";

  const newState = deepClone(state);
  if (!newState.syndicates) {
    newState.syndicates = {};
  }

  const syndicateId = `syndicate-${newState.gameId}-${Object.keys(newState.syndicates).length + 1}`;
  newState.syndicates[syndicateId] = {
    syndicateId,
    adminId: playerId,
    memberIds: [...memberIds],
  };

  for (const memberId of memberIds) {
    const member = getPlayer(newState, memberId)!;
    member.syndicateId = syndicateId;
  }

  const actor = getPlayer(newState, playerId)!;
  actor.actionPointsRemaining -= apCost;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "syndicate_formed",
      payload: { syndicateId, memberIds },
    },
  ];

  applyWinIfThresholdCrossed(newState, logs);

  return { state: newState, logEntries: logs };
}
