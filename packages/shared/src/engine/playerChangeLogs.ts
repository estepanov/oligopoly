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
 * Per-turn snapshot for `player_state_changed` diffs — one field per
 * {@link PLAYER_STATE_CHANGE_FIELD_KEYS} entry (kept explicit so registry
 * `snapshot` functions stay assignable without circular mapped types).
 */
export interface PlayerChangeSnapshot {
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

type _AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

type _PlayerChangeSnapshotKeysMatchTuple = _AssertEqual<
  keyof PlayerChangeSnapshot,
  PlayerStateChangeFieldKey
>;
const _enforcePlayerChangeSnapshotKeys: _PlayerChangeSnapshotKeysMatchTuple = true;
void _enforcePlayerChangeSnapshotKeys;

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
 * Single registry per {@link PLAYER_STATE_CHANGE_FIELD_KEYS} entry: normalized
 * snapshot slice + diff against the prior snapshot. Adding a field extends
 * this object and TypeScript enforces both halves.
 */
const PLAYER_STATE_CHANGE_REGISTRY: {
  [K in PlayerStateChangeFieldKey]: {
    snapshot: (player: InternalPlayerState) => PlayerChangeSnapshot[K];
    diff: (
      prev: PlayerChangeSnapshot,
      player: InternalPlayerState,
    ) => Pick<PlayerStateChangesBody, K> | null;
  };
} = {
  capital: {
    snapshot: (player) => player.capital,
    diff(prev, player) {
      if (player.capital === prev.capital) return null;
      return {
        capital: {
          before: prev.capital,
          after: player.capital,
          delta: player.capital - prev.capital,
        },
      };
    },
  },
  position: {
    snapshot: (player) => player.position,
    diff(prev, player) {
      if (String(player.position) === String(prev.position)) return null;
      return {
        position: { before: prev.position, after: player.position },
      };
    },
  },
  actionPointsRemaining: {
    snapshot: (player) => player.actionPointsRemaining,
    diff(prev, player) {
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
  },
  trustworthiness: {
    snapshot: (player) => player.trustworthiness,
    diff(prev, player) {
      if (player.trustworthiness === prev.trustworthiness) return null;
      return {
        trustworthiness: {
          before: prev.trustworthiness,
          after: player.trustworthiness,
          delta: player.trustworthiness - prev.trustworthiness,
        },
      };
    },
  },
  inRegulation: {
    snapshot: (player) => player.inRegulation,
    diff(prev, player) {
      if (player.inRegulation === prev.inRegulation) return null;
      return {
        inRegulation: {
          before: prev.inRegulation,
          after: player.inRegulation,
        },
      };
    },
  },
  syndicateId: {
    snapshot: (player) => player.syndicateId ?? null,
    diff(prev, player) {
      const after = player.syndicateId ?? null;
      if (after === prev.syndicateId) return null;
      return {
        syndicateId: { before: prev.syndicateId, after },
      };
    },
  },
  outstandingDebt: {
    snapshot: (player) => player.outstandingDebt ?? 0,
    diff(prev, player) {
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
  },
  ownedTilePositions: {
    snapshot: (player) => player.ownedTilePositions.map(String).sort(),
    diff(prev, player) {
      const diff = diffStringSets(
        prev.ownedTilePositions,
        player.ownedTilePositions.map(String).sort(),
      );
      if (diff.added.length === 0 && diff.removed.length === 0) return null;
      return { ownedTilePositions: diff };
    },
  },
  mortgagedTilePositions: {
    snapshot: (player) => player.mortgagedTilePositions.map(String).sort(),
    diff(prev, player) {
      const diff = diffStringSets(
        prev.mortgagedTilePositions,
        player.mortgagedTilePositions.map(String).sort(),
      );
      if (diff.added.length === 0 && diff.removed.length === 0) return null;
      return { mortgagedTilePositions: diff };
    },
  },
  developmentTokens: {
    snapshot: (player) => ({ ...player.developmentTokens }),
    diff(prev, player) {
      const deltas = diffDevelopmentTokens(
        prev.developmentTokens,
        player.developmentTokens,
      );
      if (deltas.length === 0) return null;
      return { developmentTokens: deltas };
    },
  },
};

function buildSnapshot(player: InternalPlayerState): PlayerChangeSnapshot {
  const row = {
    capital: PLAYER_STATE_CHANGE_REGISTRY.capital.snapshot(player),
    position: PLAYER_STATE_CHANGE_REGISTRY.position.snapshot(player),
    actionPointsRemaining:
      PLAYER_STATE_CHANGE_REGISTRY.actionPointsRemaining.snapshot(player),
    trustworthiness:
      PLAYER_STATE_CHANGE_REGISTRY.trustworthiness.snapshot(player),
    inRegulation: PLAYER_STATE_CHANGE_REGISTRY.inRegulation.snapshot(player),
    syndicateId: PLAYER_STATE_CHANGE_REGISTRY.syndicateId.snapshot(player),
    outstandingDebt:
      PLAYER_STATE_CHANGE_REGISTRY.outstandingDebt.snapshot(player),
    ownedTilePositions:
      PLAYER_STATE_CHANGE_REGISTRY.ownedTilePositions.snapshot(player),
    mortgagedTilePositions:
      PLAYER_STATE_CHANGE_REGISTRY.mortgagedTilePositions.snapshot(player),
    developmentTokens:
      PLAYER_STATE_CHANGE_REGISTRY.developmentTokens.snapshot(player),
  } satisfies PlayerChangeSnapshot;
  return row;
}

/** Emit schema-shaped diff body for one player (contract tests + callers). */
export function buildPlayerStateChangesBody(
  previous: PlayerChangeSnapshot,
  player: InternalPlayerState,
): PlayerStateChangesBody {
  const changes: PlayerStateChangesBody = {};
  for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
    const partial = PLAYER_STATE_CHANGE_REGISTRY[key].diff(previous, player);
    if (partial) {
      Object.assign(changes, partial);
    }
  }
  return changes;
}

export function snapshotPlayerChanges(
  state: InternalGameState,
): Map<string, PlayerChangeSnapshot> {
  return new Map(
    state.players.map((player) => [player.playerId, buildSnapshot(player)]),
  );
}

function buildPlayerChangeLogs(
  before: Map<string, PlayerChangeSnapshot>,
  state: InternalGameState,
): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const player of state.players) {
    const previous = before.get(player.playerId);
    if (!previous) continue;

    const changes = buildPlayerStateChangesBody(previous, player);

    if (Object.keys(changes).length > 0) {
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
