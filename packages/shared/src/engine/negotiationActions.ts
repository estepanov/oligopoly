import { NegotiationErrorKeys } from "@oligopoly/validation";
import {
  canCreateBindingContract,
  clampTrustworthiness,
  HANDSHAKE_BREACH_PENALTY,
} from "../index.js";
import {
  validateContributionWeights,
  validateRevenueSplit,
} from "./charter.js";
import { createNegotiationThread } from "./coordinationPhase.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { isActionBlockedByContracts } from "./negotiation.js";
import { ACTION_COSTS } from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import type { BindingContract } from "./types.js";

export function handleStartNegotiation(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const targets = action.targetPlayerIds;
  if (!targets || targets.length === 0) throw "game.invalid_action";

  const partyIds = [...new Set([playerId, ...targets])];
  const player = getPlayer(state, playerId);
  if (
    !player ||
    player.actionPointsRemaining < ACTION_COSTS.INITIATE_NEGOTIATION
  ) {
    throw "game.insufficient_ap";
  }

  const newState = createNegotiationThread(
    deepClone(state),
    playerId,
    partyIds,
  );
  const actor = getPlayer(newState, playerId)!;
  actor.actionPointsRemaining -= ACTION_COSTS.INITIATE_NEGOTIATION;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "negotiation_started",
      payload: { partyIds },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function handleSignContract(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  const contractId = action.contractId;
  if (!contractId) throw "game.invalid_action";

  const contract = (state.activeContracts ?? []).find(
    (entry) => entry.id === contractId,
  );
  if (!contract || contract.status !== "active") {
    throw NegotiationErrorKeys.CONTRACT_INVALID_TERMS;
  }

  const offerer = getPlayer(state, contract.partyA);
  if (!offerer || !canCreateBindingContract(offerer.trustworthiness)) {
    throw NegotiationErrorKeys.BINDING_NOT_ALLOWED_LOW_TRUST;
  }

  if (contract.partyA !== playerId && contract.partyB !== playerId) {
    throw "game.invalid_action";
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "contract_signed",
      payload: { contractId },
    },
  ];

  return { state: deepClone(state), logEntries: logs };
}

export function handleBreakHandshake(
  state: InternalGameState,
  playerId: string,
  _action: GameActionInput,
): ApplyActionResult {
  const newState = deepClone(state);
  const player = getPlayer(newState, playerId);
  if (!player) throw "game.invalid_action";

  player.trustworthiness = clampTrustworthiness(
    player.trustworthiness + HANDSHAKE_BREACH_PENALTY,
  );

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "handshake_broken",
      payload: { penalty: HANDSHAKE_BREACH_PENALTY },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function assertActionNotBlockedByContracts(
  state: InternalGameState,
  playerId: string,
  action: { type: string; tileId?: string },
): void {
  const blocked = isActionBlockedByContracts(state.activeContracts ?? [], {
    ...action,
    playerId,
  });
  if (blocked.blocked) {
    throw NegotiationErrorKeys.ACTION_BLOCKED_BY_CONTRACT;
  }
}

export function registerActiveContract(
  state: InternalGameState,
  contract: BindingContract,
): InternalGameState {
  const newState = deepClone(state);
  if (!newState.activeContracts) {
    newState.activeContracts = [];
  }
  newState.activeContracts.push(contract);
  return newState;
}
