import type { ApplyActionResult } from "@oligopoly/shared";
import type {
  AiPersonality,
  GameAction,
  GameLogEntry,
} from "@oligopoly/validation";
import { GameErrorKeys } from "@oligopoly/validation";
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
  notify?: boolean;
  expectedStateJson?: string | null;
  aiMeta?: {
    aiPlayerId: string;
    personality: AiPersonality;
    action: GameAction;
  };
};

type BroadcastGameState = Omit<
  ApplyActionResult["state"],
  | "affinityAssignments"
  | "pendingAuction"
  | "pendingInsiderPeek"
  | "handshakeAgreements"
  | "negotiationThreads"
  | "tradeOffers"
> & {
  pendingAuction?: ReturnType<typeof redactPendingAuctionForBroadcast>;
  negotiationThreads?: ApplyActionResult["state"]["negotiationThreads"];
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

function applyDarkPoolTransferRedaction<
  TState extends {
    players: Array<{
      playerId: string;
      ownedTilePositions: Array<number | string>;
      mortgagedTilePositions: Array<number | string>;
    }>;
    tiles: Array<{
      position: number | string;
      ownerId?: string | null;
      mortgaged?: boolean;
    }>;
  },
>(state: TState, logEntries: ApplyActionResult["logEntries"]): TState {
  const hiddenTransfer = darkPoolTransferPayload(logEntries);
  if (!hiddenTransfer) {
    return state;
  }

  const transferredTile = state.tiles.find(
    (tile) => String(tile.position) === String(hiddenTransfer.tilePosition),
  );
  const transferredTileWasMortgaged = transferredTile?.mortgaged === true;

  return {
    ...state,
    players: state.players.map((player) => {
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
    tiles: state.tiles.map((tile) =>
      String(tile.position) === String(hiddenTransfer.tilePosition)
        ? { ...tile, ownerId: hiddenTransfer.fromPlayerId }
        : tile,
    ),
  };
}

/**
 * Trade-offer redaction contract (two paths — keep in sync):
 *
 * 1. Realtime broadcast: the state that travels on `broadcastGameEvent`
 *    (`event.state`) NEVER carries `tradeOffers`. `notifyGameActionResult` (and
 *    the `game.schedule` emitters) strip the offers from `state` and place them
 *    on a SEPARATE `event.tradeOffers` field. `GameRoom.broadcast` re-injects
 *    that field into each viewer's state and runs `toClientGameState`, whose
 *    `filterTradeOffersForViewer` keeps only the viewer's own offers. So the
 *    redaction is safe-by-construction: even if a future caller forwarded
 *    `event.state` without the GameRoom override, no offer terms leak.
 * 2. HTTP responses: `toActionResponse` calls `toClientGameState` DIRECTLY for
 *    the requesting player, applying the same party-scoped filter. The
 *    no-subject fallback goes through `publicStateForBroadcast`, which also
 *    strips `tradeOffers` entirely.
 */
export function publicStateForBroadcast(
  state: ApplyActionResult["state"],
  logEntries: ApplyActionResult["logEntries"] = [],
): BroadcastGameState {
  const {
    affinityAssignments: _affinity,
    pendingAuction,
    pendingInsiderPeek: _peek,
    handshakeAgreements: _handshakes,
    negotiationThreads,
    tradeOffers: _tradeOffers,
    ...rest
  } = state;
  const openNegotiationThreads = negotiationThreads?.filter(
    (thread) => thread.visibility === "open",
  );
  const publicState = {
    ...rest,
    ...(pendingAuction
      ? { pendingAuction: redactPendingAuctionForBroadcast(pendingAuction) }
      : {}),
    ...(openNegotiationThreads?.length
      ? { negotiationThreads: openNegotiationThreads }
      : {}),
  };

  return applyDarkPoolTransferRedaction(publicState, logEntries);
}

/**
 * Single canonical broadcast-payload splitter for the trade-offer privacy
 * contract (see the doc comment above `publicStateForBroadcast`). Strips private
 * `tradeOffers` terms off the state that travels on the wire and returns them on
 * a SEPARATE field that `GameRoom.broadcast` re-injects only into the matching
 * viewer's slice (via `filterTradeOffersForViewer`). Every realtime emit path —
 * `notifyGameActionResult`, `notifyGameSchedule`, and the DO alarm/AI-loop emit
 * in `rooms.ts` — MUST go through this so the redaction can never drift.
 */
export function prepareGameBroadcastPayload<
  TState extends { tradeOffers?: unknown },
>(
  state: TState,
): { state: Omit<TState, "tradeOffers">; tradeOffers?: TState["tradeOffers"] } {
  const { tradeOffers, ...stateWithoutTradeOffers } = state;
  return {
    state: stateWithoutTradeOffers,
    ...(tradeOffers ? { tradeOffers } : {}),
  };
}

export async function persistGameActionResult(
  db: D1Database,
  gameId: string,
  result: ApplyActionResult,
  options: PersistOptions = {},
): Promise<GameLogEntry[]> {
  const now = Date.now();
  const stateJson = JSON.stringify(result.state);
  const logRows = result.logEntries.map((entry) => ({
    entry,
    apiEntry: {
      id: crypto.randomUUID(),
      gameId,
      round: result.state.round,
      playerId: entry.playerId ?? null,
      actionType: entry.actionType,
      payload: entry.payload ?? null,
      createdAt: now,
    } satisfies GameLogEntry,
  }));

  // Atomicity: the guarded state UPDATE and all follow-up writes (log INSERTs,
  // game-over/winner/lobby UPDATEs) must commit together or not at all. D1 runs
  // `batch()` as a single implicit transaction (all succeed or all roll back),
  // but it does NOT conditionally skip statements based on an earlier result.
  // To preserve optimistic-concurrency semantics we therefore gate every
  // follow-up on the row having actually been advanced to `stateJson` — when the
  // guard fails, statement[0] is a no-op, the row still holds the old state, and
  // every follow-up's `WHERE EXISTS (... state_json = stateJson)` predicate also
  // fails, so the whole batch is effectively a no-op while remaining atomic.
  const guarded = options.expectedStateJson !== undefined;

  const stateUpdate = guarded
    ? db
        .prepare(
          "UPDATE games SET state_json = ? WHERE id = ? AND state_json = ?",
        )
        .bind(stateJson, gameId, options.expectedStateJson)
    : db
        .prepare("UPDATE games SET state_json = ? WHERE id = ?")
        .bind(stateJson, gameId);

  // Predicate that is only true once the state row holds the freshly-written
  // state. Used to gate follow-ups so a lost optimistic race writes nothing.
  const appliedGuardSql = guarded
    ? " AND EXISTS (SELECT 1 FROM games WHERE id = ? AND state_json = ?)"
    : "";
  const appliedGuardBinds = guarded ? [gameId, stateJson] : [];

  const batchStatements: D1PreparedStatement[] = [stateUpdate];

  if (result.state.phase === "game_over" && result.state.winnerId) {
    batchStatements.push(
      db
        .prepare(
          `UPDATE games SET status = 'completed', winner_id = ?, ended_at = ? WHERE id = ?${appliedGuardSql}`,
        )
        .bind(result.state.winnerId, now, gameId, ...appliedGuardBinds),
    );

    batchStatements.push(
      db
        .prepare(
          `UPDATE lobbies SET status = 'finished' WHERE id = (SELECT lobby_id FROM games WHERE id = ?)${appliedGuardSql}`,
        )
        .bind(gameId, ...appliedGuardBinds),
    );
  }

  for (const { apiEntry } of logRows) {
    batchStatements.push(
      db
        .prepare(
          `INSERT INTO game_log (id, game_id, round, player_id, action_type, payload_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE 1=1${appliedGuardSql}`,
        )
        .bind(
          apiEntry.id,
          apiEntry.gameId,
          apiEntry.round,
          apiEntry.playerId,
          apiEntry.actionType,
          apiEntry.payload ? JSON.stringify(apiEntry.payload) : null,
          apiEntry.createdAt,
          ...appliedGuardBinds,
        ),
    );
  }

  const batchResults = await db.batch(batchStatements);
  if (guarded) {
    const changes = batchResults[0]?.meta?.changes ?? 0;
    if (changes === 0) {
      throw GameErrorKeys.STATE_CONFLICT;
    }
  }

  if (result.state.phase === "game_over" && result.state.winnerId) {
    await processGameCompletion(db, options.kv, gameId, result.state, now);
  }

  if (options.notify !== false) {
    await notifyGameActionResult(
      gameId,
      result,
      logRows.map(({ apiEntry }) => apiEntry),
      options,
      now,
    );
  }

  return logRows.map(({ apiEntry }) => apiEntry);
}

export async function notifyGameActionResult(
  gameId: string,
  result: ApplyActionResult,
  persistedLogEntries: GameLogEntry[],
  options: PersistOptions = {},
  sentAt: number = Date.now(),
): Promise<void> {
  const hiddenTransfer = darkPoolTransferPayload(result.logEntries);
  const baseState = hiddenTransfer
    ? applyDarkPoolTransferRedaction(result.state, result.logEntries)
    : result.state;
  // Strip private `tradeOffers` terms off the wire state and carry them on a
  // separate field (see `prepareGameBroadcastPayload`). Other per-viewer fields
  // (insider peek, handshakes, affinity, private negotiation threads) still ride
  // on `state` and are redacted per-viewer by `toClientGameState`.
  const { state: stateWithoutTradeOffers, tradeOffers } =
    prepareGameBroadcastPayload(baseState);
  const broadcastLogEntries = hiddenTransfer
    ? []
    : persistedLogEntries.filter(
        (_entry, index) => result.logEntries[index]?.broadcast !== false,
      );

  await broadcastGameEvent(options.gameRoom, gameId, {
    type: "game.action_applied",
    sentAt,
    gameId,
    actorId: options.actorId ?? options.aiMeta?.aiPlayerId ?? "system",
    logEntries: broadcastLogEntries,
    state: stateWithoutTradeOffers,
    ...(tradeOffers ? { tradeOffers } : {}),
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
      logEntries: [],
      ...extra,
    };
  }

  return {
    ...toClientGameState(result.state as PersistedGameState, "player", subject),
    logEntries: [],
    ...extra,
  };
}
