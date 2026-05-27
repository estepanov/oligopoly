import {
  clampTrustworthiness,
  HANDSHAKE_BREACH_PENALTY,
} from "../trustConstants.js";
import type {
  ApplyActionResult,
  GameActionInput,
  HandshakeAgreementState,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer } from "./stateUtils.js";

function ensureHandshakes(state: InternalGameState): HandshakeAgreementState[] {
  if (!state.handshakeAgreements) {
    state.handshakeAgreements = [];
  }
  return state.handshakeAgreements;
}

export function handleProposeHandshake(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const partyB = action.partyB;
  const summary = action.summary?.trim();
  if (!partyB || partyB === playerId || !summary) throw "game.invalid_action";

  const counterparty = getPlayer(state, partyB);
  if (!counterparty) throw "game.invalid_action";

  const newState = deepClone(state);
  const handshakes = ensureHandshakes(newState);
  const handshake: HandshakeAgreementState = {
    id: `handshake-${newState.gameId}-${handshakes.length + 1}`,
    partyA: playerId,
    partyB,
    summary,
    partySignatures: { [playerId]: true },
    status: "pending",
    createdRound: newState.round,
  };
  handshakes.push(handshake);

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "handshake_proposed",
      payload: { handshakeId: handshake.id, partyB, summary },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function handleSignHandshake(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const handshakeId = action.handshakeId;
  if (!handshakeId) throw "game.invalid_action";

  const handshake = (state.handshakeAgreements ?? []).find(
    (entry) => entry.id === handshakeId,
  );
  if (!handshake || handshake.status !== "pending") {
    throw "game.invalid_action";
  }
  if (handshake.partyA !== playerId && handshake.partyB !== playerId) {
    throw "game.invalid_action";
  }

  const newState = deepClone(state);
  const entry = (newState.handshakeAgreements ?? []).find(
    (item) => item.id === handshakeId,
  );
  if (!entry) throw "game.invalid_action";

  if (entry.partySignatures?.[playerId]) {
    throw "game.invalid_action";
  }

  entry.partySignatures = { ...entry.partySignatures, [playerId]: true };
  const bothSigned =
    entry.partySignatures[entry.partyA] && entry.partySignatures[entry.partyB];
  if (bothSigned) {
    entry.status = "active";
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "handshake_signed",
      payload: { handshakeId, bothSigned: !!bothSigned },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function handleBreakHandshake(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const handshakeId = action.handshakeId;
  if (!handshakeId) throw "game.invalid_action";

  const handshake = (state.handshakeAgreements ?? []).find(
    (entry) => entry.id === handshakeId,
  );
  if (!handshake || handshake.status !== "active") {
    throw "game.invalid_action";
  }
  if (handshake.partyA !== playerId && handshake.partyB !== playerId) {
    throw "game.invalid_action";
  }

  const newState = deepClone(state);
  const entry = (newState.handshakeAgreements ?? []).find(
    (item) => item.id === handshakeId,
  );
  if (!entry) throw "game.invalid_action";

  entry.status = "broken";
  const player = getPlayer(newState, playerId);
  if (player) {
    player.trustworthiness = clampTrustworthiness(
      player.trustworthiness + HANDSHAKE_BREACH_PENALTY,
    );
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "handshake_broken",
      payload: { handshakeId, penalty: HANDSHAKE_BREACH_PENALTY },
    },
  ];

  return { state: newState, logEntries: logs };
}
