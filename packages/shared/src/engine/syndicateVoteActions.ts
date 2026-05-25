import { clampTrustworthiness } from "../trustConstants.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { ACTION_COSTS } from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { getSyndicateForPlayer } from "./syndicate.js";

const DISSOLUTION_TRUST_PENALTY = -2;

export function handleCallVote(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";
  if (action.voteType !== "dissolve_syndicate") throw "game.invalid_action";

  const syndicate = getSyndicateForPlayer(state, playerId);
  if (!syndicate) throw "game.invalid_action";

  const player = getPlayer(state, playerId);
  if (!player) throw "game.invalid_action";

  const existingVote =
    state.pendingSyndicateVote?.syndicateId === syndicate.syndicateId
      ? state.pendingSyndicateVote
      : null;
  if (existingVote?.votes[playerId]) {
    throw "game.invalid_action";
  }

  if (player.actionPointsRemaining < ACTION_COSTS.CALL_SYNDICATE_VOTE) {
    throw "game.insufficient_ap";
  }

  const newState = deepClone(state);
  const actor = getPlayer(newState, playerId)!;
  actor.actionPointsRemaining -= ACTION_COSTS.CALL_SYNDICATE_VOTE;

  const vote =
    newState.pendingSyndicateVote?.syndicateId === syndicate.syndicateId
      ? newState.pendingSyndicateVote
      : {
          syndicateId: syndicate.syndicateId,
          voteType: "dissolve_syndicate" as const,
          votes: {},
        };

  vote.votes[playerId] = true;
  newState.pendingSyndicateVote = vote;

  const allVoted = syndicate.memberIds.every(
    (memberId) => vote.votes[memberId] === true,
  );

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "syndicate_vote_cast",
      payload: {
        syndicateId: syndicate.syndicateId,
        voteType: action.voteType,
        unanimous: allVoted,
      },
    },
  ];

  if (allVoted) {
    for (const memberId of syndicate.memberIds) {
      const member = getPlayer(newState, memberId);
      if (member) {
        member.syndicateId = null;
        member.trustworthiness = clampTrustworthiness(
          member.trustworthiness + DISSOLUTION_TRUST_PENALTY,
        );
      }
    }
    delete newState.syndicates?.[syndicate.syndicateId];
    if (newState.charters) {
      delete newState.charters[syndicate.syndicateId];
    }
    newState.pendingSyndicateVote = null;
    logs.push({
      playerId: null,
      actionType: "syndicate_dissolved",
      payload: {
        syndicateId: syndicate.syndicateId,
        trustPenalty: DISSOLUTION_TRUST_PENALTY,
      },
    });
  }

  return { state: newState, logEntries: logs };
}
