import type { ApplyActionResult } from "@oligopoly/shared";
import type { AiPersonality, GameAction } from "@oligopoly/validation";
import {
  type PersistedGameState,
  redactPendingAuctionForBroadcast,
  toClientGameState,
} from "../gameStateView.js";
import { broadcastGameEvent } from "../realtime/notify.js";
import { processGameCompletion } from "./gameCompletion.js";

type PersistOptions = {
  gameRoom?: DurableObjectNamespace;
  actorId?: string;
  kv?: KVNamespace;
  aiMeta?: {
    aiPlayerId: string;
    personality: AiPersonality;
    action: GameAction;
  };
};

type BroadcastGameState = Omit<
  ApplyActionResult["state"],
  "affinityAssignments" | "pendingAuction"
> & {
  pendingAuction?: ReturnType<typeof redactPendingAuctionForBroadcast>;
};

export function logEntriesForBroadcast(
  logEntries: ApplyActionResult["logEntries"],
) {
  if (darkPoolTransferPayload(logEntries)) {
    return [];
  }
  return logEntries
    .filter((entry) => entry.broadcast !== false)
    .map(({ broadcast: _broadcast, ...entry }) => entry);
}

type DarkPoolTransferPayload = {
  fromPlayerId: string;
  toPlayerId: string;
  tilePosition: number | string;
};

function darkPoolTransferPayload(
  logEntries: ApplyActionResult["logEntries"],
): DarkPoolTransferPayload | null {
  const hiddenTransfer = logEntries.find(
    (entry) =>
      entry.actionType === "dark_pool_transfer" && entry.broadcast === false,
  );
  if (!hiddenTransfer?.payload) {
    return null;
  }

  const { fromPlayerId, toPlayerId, tilePosition } = hiddenTransfer.payload;
  return typeof fromPlayerId === "string" &&
    typeof toPlayerId === "string" &&
    (typeof tilePosition === "number" || typeof tilePosition === "string")
    ? { fromPlayerId, toPlayerId, tilePosition }
    : null;
}

export function publicStateForBroadcast(
  state: ApplyActionResult["state"],
  logEntries: ApplyActionResult["logEntries"] = [],
): BroadcastGameState {
  const { affinityAssignments: _affinity, pendingAuction, ...rest } = state;
  const publicState = pendingAuction
    ? {
        ...rest,
        pendingAuction: redactPendingAuctionForBroadcast(pendingAuction),
      }
    : rest;

  const hiddenTransfer = darkPoolTransferPayload(logEntries);
  if (!hiddenTransfer) {
    return publicState;
  }

  const transferredTile = publicState.tiles.find(
    (tile) => String(tile.position) === String(hiddenTransfer.tilePosition),
  );
  const transferredTileWasMortgaged = transferredTile?.mortgaged === true;

  return {
    ...publicState,
    players: publicState.players.map((player) => {
      if (player.playerId === hiddenTransfer.fromPlayerId) {
        return {
          ...player,
          ownedTilePositions: player.ownedTilePositions.includes(
            hiddenTransfer.tilePosition,
          )
            ? player.ownedTilePositions
            : [...player.ownedTilePositions, hiddenTransfer.tilePosition],
          mortgagedTilePositions: transferredTileWasMortgaged
            ? player.mortgagedTilePositions.includes(
                hiddenTransfer.tilePosition,
              )
              ? player.mortgagedTilePositions
              : [...player.mortgagedTilePositions, hiddenTransfer.tilePosition]
            : player.mortgagedTilePositions,
        };
      }
      if (player.playerId === hiddenTransfer.toPlayerId) {
        return {
          ...player,
          ownedTilePositions: player.ownedTilePositions.filter(
            (position) =>
              String(position) !== String(hiddenTransfer.tilePosition),
          ),
          mortgagedTilePositions: player.mortgagedTilePositions.filter(
            (position) =>
              String(position) !== String(hiddenTransfer.tilePosition),
          ),
        };
      }
      return player;
    }),
    tiles: publicState.tiles.map((tile) =>
      String(tile.position) === String(hiddenTransfer.tilePosition)
        ? { ...tile, ownerId: hiddenTransfer.fromPlayerId }
        : tile,
    ),
  };
}

export async function persistGameActionResult(
  db: D1Database,
  gameId: string,
  result: ApplyActionResult,
  options: PersistOptions = {},
): Promise<void> {
  const now = Date.now();
  const stateJson = JSON.stringify(result.state);

  const statements = [
    db
      .prepare("UPDATE games SET state_json = ? WHERE id = ?")
      .bind(stateJson, gameId),
  ];

  if (result.state.phase === "game_over" && result.state.winnerId) {
    statements.push(
      db
        .prepare(
          "UPDATE games SET status = 'completed', winner_id = ?, ended_at = ? WHERE id = ?",
        )
        .bind(result.state.winnerId, now, gameId),
    );

    const lobbyRow = await db
      .prepare("SELECT lobby_id FROM games WHERE id = ?")
      .bind(gameId)
      .first<{ lobby_id: string }>();
    if (lobbyRow) {
      statements.push(
        db
          .prepare("UPDATE lobbies SET status = 'finished' WHERE id = ?")
          .bind(lobbyRow.lobby_id),
      );
    }
  }

  for (const entry of result.logEntries) {
    statements.push(
      db
        .prepare(
          "INSERT INTO game_log (id, game_id, round, player_id, action_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          gameId,
          result.state.round,
          entry.playerId,
          entry.actionType,
          entry.payload ? JSON.stringify(entry.payload) : null,
          now,
        ),
    );
  }

  await db.batch(statements);

  if (result.state.phase === "game_over" && result.state.winnerId) {
    await processGameCompletion(db, options.kv, gameId, result.state, now);
  }

  const publicState = publicStateForBroadcast(result.state, result.logEntries);
  await broadcastGameEvent(options.gameRoom, gameId, {
    type: "game.action_applied",
    sentAt: now,
    gameId,
    actorId: options.actorId ?? options.aiMeta?.aiPlayerId ?? "system",
    action: options.aiMeta?.action,
    logEntries: logEntriesForBroadcast(result.logEntries),
    state: publicState,
  });
}

export function toActionResponse(
  result: ApplyActionResult,
  subject: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!subject) {
    return {
      ...publicStateForBroadcast(result.state, result.logEntries),
      logEntries: logEntriesForBroadcast(result.logEntries),
      ...extra,
    };
  }

  return {
    ...toClientGameState(result.state as PersistedGameState, "player", subject),
    logEntries: result.logEntries,
    ...extra,
  };
}
