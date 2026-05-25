import { NegotiationErrorKeys } from "@oligopoly/validation";
import {
  validateContributionWeights,
  validateRevenueSplit,
} from "./charter.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import {
  formSyndicateApCost,
  getSyndicateForPlayer,
  type SyndicateCharterState,
} from "./syndicate.js";
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

  const charter = action.charter as SyndicateCharterState | undefined;
  if (charter) {
    const splitCheck = validateRevenueSplit(charter.revenueSplit);
    if (!splitCheck.valid)
      throw splitCheck.errorKey ?? NegotiationErrorKeys.CHARTER_INVALID_SPLIT;
    const weightCheck = validateContributionWeights(
      charter.contributionWeights,
    );
    if (!weightCheck.valid)
      throw (
        weightCheck.errorKey ?? NegotiationErrorKeys.CHARTER_INVALID_WEIGHTS
      );
  }

  const syndicateId = `syndicate-${newState.gameId}-${Object.keys(newState.syndicates).length + 1}`;
  newState.syndicates[syndicateId] = {
    syndicateId,
    adminId: playerId,
    memberIds: [...memberIds],
    charter: charter
      ? { ...charter, ratifiedAt: charter.ratifiedAt ?? Date.now() }
      : undefined,
  };

  if (charter && newState.charters) {
    newState.charters[syndicateId] = charter;
  } else if (charter) {
    newState.charters = { [syndicateId]: charter };
  }

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
