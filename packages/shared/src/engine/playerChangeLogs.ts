// ---------------------------------------------------------------------------
// Player change diff logs — appended after successful applyAction results.
// ---------------------------------------------------------------------------

import {
  PLAYER_STATE_CHANGE_FIELD_KEYS,
  type PlayerStateChangeFieldKey,
  type PlayerStateChangesBody,
} from "@oligopoly/validation";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";

/**
 * Per-turn snapshot used to build `player_state_changed` diffs. Field set must
 * stay aligned with {@link PLAYER_STATE_CHANGE_FIELD_KEYS} in validation.
 */
interface PlayerChangeSnapshot
  extends Record<PlayerStateChangeFieldKey, unknown> {
  capital: number;
  position: number | string;
  actionPointsRemaining: number;
  trustworthiness: number;
  inRegulation: boolean;
  syndicateId: string | null;
  outstandingDebt: number;
  ownedTilePositions: string[];
  mortgagedTilePositions: string[];
  developmentTokens: Record<string, number>;
}

export function snapshotPlayerChanges(
  state: InternalGameState,
): Map<string, PlayerChangeSnapshot> {
  return new Map(
    state.players.map((player) => [
      player.playerId,
      {
        capital: player.capital,
        position: player.position,
        actionPointsRemaining: player.actionPointsRemaining,
        trustworthiness: player.trustworthiness,
        inRegulation: player.inRegulation,
        syndicateId: player.syndicateId ?? null,
        outstandingDebt: player.outstandingDebt ?? 0,
        ownedTilePositions: player.ownedTilePositions.map(String).sort(),
        mortgagedTilePositions: player.mortgagedTilePositions
          .map(String)
          .sort(),
        developmentTokens: { ...player.developmentTokens },
      },
    ]),
  );
}

function diffStringSets(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((value) => !beforeSet.has(value)),
    removed: before.filter((value) => !afterSet.has(value)),
  };
}

function diffDevelopmentTokens(
  before: Record<string, number>,
  after: Record<string, number>,
) {
  const positions = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...positions]
    .map((position) => ({
      position,
      before: before[position] ?? 0,
      after: after[position] ?? 0,
    }))
    .filter((change) => change.before !== change.after);
}

/**
 * One entry per {@link PLAYER_STATE_CHANGE_FIELD_KEYS} key — exhaustiveness
 * keeps engine diffs aligned with validation + web formatting.
 */
const PLAYER_STATE_FIELD_DIFF: {
  [K in PlayerStateChangeFieldKey]: (
    prev: PlayerChangeSnapshot,
    player: InternalPlayerState,
  ) => Pick<PlayerStateChangesBody, K> | null;
} = {
  capital(prev, player) {
    if (player.capital === prev.capital) return null;
    return {
      capital: {
        before: prev.capital,
        after: player.capital,
        delta: player.capital - prev.capital,
      },
    };
  },
  position(prev, player) {
    if (String(player.position) === String(prev.position)) return null;
    return {
      position: { before: prev.position, after: player.position },
    };
  },
  actionPointsRemaining(prev, player) {
    if (player.actionPointsRemaining === prev.actionPointsRemaining)
      return null;
    return {
      actionPointsRemaining: {
        before: prev.actionPointsRemaining,
        after: player.actionPointsRemaining,
        delta: player.actionPointsRemaining - prev.actionPointsRemaining,
      },
    };
  },
  trustworthiness(prev, player) {
    if (player.trustworthiness === prev.trustworthiness) return null;
    return {
      trustworthiness: {
        before: prev.trustworthiness,
        after: player.trustworthiness,
        delta: player.trustworthiness - prev.trustworthiness,
      },
    };
  },
  inRegulation(prev, player) {
    if (player.inRegulation === prev.inRegulation) return null;
    return {
      inRegulation: {
        before: prev.inRegulation,
        after: player.inRegulation,
      },
    };
  },
  syndicateId(prev, player) {
    const after = player.syndicateId ?? null;
    if (after === prev.syndicateId) return null;
    return {
      syndicateId: { before: prev.syndicateId, after },
    };
  },
  outstandingDebt(prev, player) {
    const after = player.outstandingDebt ?? 0;
    if (after === prev.outstandingDebt) return null;
    return {
      outstandingDebt: {
        before: prev.outstandingDebt,
        after,
        delta: after - prev.outstandingDebt,
      },
    };
  },
  ownedTilePositions(prev, player) {
    const diff = diffStringSets(
      prev.ownedTilePositions,
      player.ownedTilePositions.map(String).sort(),
    );
    if (diff.added.length === 0 && diff.removed.length === 0) return null;
    return { ownedTilePositions: diff };
  },
  mortgagedTilePositions(prev, player) {
    const diff = diffStringSets(
      prev.mortgagedTilePositions,
      player.mortgagedTilePositions.map(String).sort(),
    );
    if (diff.added.length === 0 && diff.removed.length === 0) return null;
    return { mortgagedTilePositions: diff };
  },
  developmentTokens(prev, player) {
    const deltas = diffDevelopmentTokens(
      prev.developmentTokens,
      player.developmentTokens,
    );
    if (deltas.length === 0) return null;
    return { developmentTokens: deltas };
  },
};

function buildPlayerChangeLogs(
  before: Map<string, PlayerChangeSnapshot>,
  state: InternalGameState,
): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const player of state.players) {
    const previous = before.get(player.playerId);
    if (!previous) continue;

    const changes: PlayerStateChangesBody = {};
    for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
      const partial = PLAYER_STATE_FIELD_DIFF[key](previous, player);
      if (partial) {
        Object.assign(changes, partial);
      }
    }

    if (Object.keys(changes).length > 0) {
      for (const key of Object.keys(changes)) {
        if (
          !(PLAYER_STATE_CHANGE_FIELD_KEYS as readonly string[]).includes(key)
        ) {
          throw new Error(
            `player_state_changed emitted unknown key "${key}" — update PLAYER_STATE_CHANGE_FIELD_KEYS and PlayerStateChangesBodySchema`,
          );
        }
      }
      logs.push({
        playerId: player.playerId,
        actionType: "player_state_changed",
        payload: { playerId: player.playerId, changes },
      });
    }
  }
  return logs;
}

export function withPlayerChangeLogs(
  before: Map<string, PlayerChangeSnapshot>,
  result: ApplyActionResult,
): ApplyActionResult {
  const changeLogs = buildPlayerChangeLogs(before, result.state);
  if (changeLogs.length === 0) {
    return result;
  }
  return { ...result, logEntries: [...result.logEntries, ...changeLogs] };
}
