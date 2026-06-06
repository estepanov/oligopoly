// ---------------------------------------------------------------------------
// Player change diff logs — appended after successful applyAction results.
// ---------------------------------------------------------------------------

import type {
  ApplyActionResult,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";

interface PlayerChangeSnapshot {
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

function buildPlayerChangeLogs(
  before: Map<string, PlayerChangeSnapshot>,
  state: InternalGameState,
): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const player of state.players) {
    const previous = before.get(player.playerId);
    if (!previous) continue;

    const ownedTiles = diffStringSets(
      previous.ownedTilePositions,
      player.ownedTilePositions.map(String).sort(),
    );
    const mortgagedTiles = diffStringSets(
      previous.mortgagedTilePositions,
      player.mortgagedTilePositions.map(String).sort(),
    );
    const developmentTokens = diffDevelopmentTokens(
      previous.developmentTokens,
      player.developmentTokens,
    );
    const changes: Record<string, unknown> = {};

    if (player.capital !== previous.capital) {
      changes.capital = {
        before: previous.capital,
        after: player.capital,
        delta: player.capital - previous.capital,
      };
    }
    if (String(player.position) !== String(previous.position)) {
      changes.position = { before: previous.position, after: player.position };
    }
    if (player.actionPointsRemaining !== previous.actionPointsRemaining) {
      changes.actionPointsRemaining = {
        before: previous.actionPointsRemaining,
        after: player.actionPointsRemaining,
        delta: player.actionPointsRemaining - previous.actionPointsRemaining,
      };
    }
    if (player.trustworthiness !== previous.trustworthiness) {
      changes.trustworthiness = {
        before: previous.trustworthiness,
        after: player.trustworthiness,
        delta: player.trustworthiness - previous.trustworthiness,
      };
    }
    if (player.inRegulation !== previous.inRegulation) {
      changes.inRegulation = {
        before: previous.inRegulation,
        after: player.inRegulation,
      };
    }
    if ((player.syndicateId ?? null) !== (previous.syndicateId ?? null)) {
      changes.syndicateId = {
        before: previous.syndicateId ?? null,
        after: player.syndicateId ?? null,
      };
    }
    if ((player.outstandingDebt ?? 0) !== previous.outstandingDebt) {
      changes.outstandingDebt = {
        before: previous.outstandingDebt,
        after: player.outstandingDebt ?? 0,
        delta: (player.outstandingDebt ?? 0) - previous.outstandingDebt,
      };
    }
    if (ownedTiles.added.length > 0 || ownedTiles.removed.length > 0) {
      changes.ownedTilePositions = ownedTiles;
    }
    if (mortgagedTiles.added.length > 0 || mortgagedTiles.removed.length > 0) {
      changes.mortgagedTilePositions = mortgagedTiles;
    }
    if (developmentTokens.length > 0) {
      changes.developmentTokens = developmentTokens;
    }

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
