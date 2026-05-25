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
    await processGameCompletion(
      db,
      options.kv,
      gameId,
      result.state,
      now,
    );
  }

  const publicState = publicStateForBroadcast(result.state);
  await broadcastGameEvent(options.gameRoom, gameId, {
    type: "game.action_applied",
    sentAt: now,
    gameId,
    actorId: options.actorId ?? options.aiMeta?.aiPlayerId ?? "system",
    action: options.aiMeta?.action,
    logEntries: result.logEntries,
    state: publicState,
  });
}

function publicStateForBroadcast(state: ApplyActionResult["state"]) {
  const { affinityAssignments: _affinity, pendingAuction, ...rest } = state;
  if (!pendingAuction) {
    return rest;
  }

  return {
    ...rest,
    pendingAuction: redactPendingAuctionForBroadcast(pendingAuction),
  };
}

export function toActionResponse(
  result: ApplyActionResult,
  subject: string | null,
  extra: Record<string, unknown> = {},
) {
  if (!subject) {
    const { affinityAssignments: _affinity, ...publicState } = result.state;
    return {
      ...publicStateForBroadcast(result.state),
      logEntries: result.logEntries,
      ...extra,
    };
  }

  return {
    ...toClientGameState(result.state as PersistedGameState, "player", subject),
    logEntries: result.logEntries,
    ...extra,
  };
}
