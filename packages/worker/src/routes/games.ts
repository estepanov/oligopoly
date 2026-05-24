import { zValidator } from "@hono/zod-validator";
import { applyGameAction, type EngineGameState } from "@oligopoly/shared";
import type { GameLogEntry, GameSummary } from "@oligopoly/validation";
import { GameActionSchema, GameStatusSchema } from "@oligopoly/validation";
import { Hono } from "hono";
import {
  type PersistedGameState,
  toClientGameState,
} from "../gameStateView.js";

type Bindings = {
  ALLOWED_ORIGINS?: string;
  KV?: KVNamespace;
  DB?: D1Database;
};

type Variables = {
  userId?: string;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };

export const gameRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /api/games
// Returns a paginated list of games. Supports ?status=active|completed.
// Auth is optional; when the user is authenticated, results are filtered
// to games the user participates in.
// ---------------------------------------------------------------------------
gameRoutes.get("/", async (c) => {
  const statusParam = c.req.query("status");
  const parsed = GameStatusSchema.safeParse(statusParam);
  if (statusParam !== undefined && !parsed.success) {
    return c.json({ error: "Invalid status value" }, 400);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ games: [] as GameSummary[] });
  }

  const subject = c.get("userId");

  let query: string;
  let params: (string | null)[];

  if (subject) {
    // Filter to games the requesting user is a participant in.
    if (parsed.success) {
      query =
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE status = ? AND player_ids_json LIKE ? ORDER BY started_at DESC LIMIT 50";
      params = [parsed.data, `%${subject}%`];
    } else {
      query =
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE player_ids_json LIKE ? ORDER BY started_at DESC LIMIT 50";
      params = [`%${subject}%`];
    }
  } else {
    if (parsed.success) {
      query =
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE status = ? ORDER BY started_at DESC LIMIT 50";
      params = [parsed.data];
    } else {
      query =
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games ORDER BY started_at DESC LIMIT 50";
      params = [];
    }
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<{
      id: string;
      status: string;
      player_ids_json: string;
      started_at: number;
      ended_at: number | null;
      winner_id: string | null;
    }>();

  const games: GameSummary[] = results.map((row) => ({
    id: row.id,
    status: row.status as GameSummary["status"],
    playerCount: (JSON.parse(row.player_ids_json) as string[]).length,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    winnerId: row.winner_id ?? null,
  }));

  return c.json({ games });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id
// Returns a single game summary; 404 if not found.
// ---------------------------------------------------------------------------
gameRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env?.DB;

  if (!db) {
    return c.json({ error: "Not found" }, 404);
  }

  const row = await db
    .prepare(
      "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      status: string;
      player_ids_json: string;
      started_at: number;
      ended_at: number | null;
      winner_id: string | null;
    }>();

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const summary: GameSummary = {
    id: row.id,
    status: row.status as GameSummary["status"],
    playerCount: (JSON.parse(row.player_ids_json) as string[]).length,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    winnerId: row.winner_id ?? null,
  };

  return c.json(summary);
});

// ---------------------------------------------------------------------------
// POST /api/games/:id/actions
// Authoritative game transition: validate GameAction, apply engine, persist.
// ---------------------------------------------------------------------------
gameRoutes.post(
  "/:id/actions",
  zValidator("json", GameActionSchema),
  async (c) => {
    const id = c.req.param("id");
    const subject = c.get("userId");

    if (!subject) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: "Not found" }, 404);
    }

    const row = await db
      .prepare(
        "SELECT id, status, player_ids_json, state_json FROM games WHERE id = ?",
      )
      .bind(id)
      .first<{
        id: string;
        status: string;
        player_ids_json: string;
        state_json: string | null;
      }>();

    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }

    if (row.status !== "active") {
      return c.json({ error: "Game is not active" }, 409);
    }

    const playerIds = JSON.parse(row.player_ids_json) as string[];
    if (!playerIds.includes(subject)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const persisted: EngineGameState = row.state_json
      ? (JSON.parse(row.state_json) as EngineGameState)
      : { gameId: id, round: 0 };

    const action = c.req.valid("json");
    const outcome = applyGameAction(persisted, action, {
      actorId: subject,
      rollDice: rollSecureDice,
    });

    if (!outcome.ok) {
      return c.json({ error: outcome.errorKey }, 400);
    }

    const logId = crypto.randomUUID();
    const now = Date.now();
    const round = outcome.state.round ?? 1;

    await db.batch([
      db
        .prepare("UPDATE games SET state_json = ? WHERE id = ?")
        .bind(JSON.stringify(outcome.state), id),
      db
        .prepare(
          `INSERT INTO game_log (id, game_id, round, player_id, action_type, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          logId,
          id,
          round,
          subject,
          outcome.logActionType,
          JSON.stringify(outcome.logPayload),
          now,
        ),
    ]);

    const clientState = toClientGameState(
      outcome.state as PersistedGameState,
      "player",
      subject,
    );

    return c.json({ state: clientState });
  },
);

// ---------------------------------------------------------------------------
// GET /api/games/:id/state
// Returns the current game state snapshot.
// Auth required (user must be a player or spectator).
// 403 for non-participants; 404 if game not found.
// ---------------------------------------------------------------------------
gameRoutes.get("/:id/state", async (c) => {
  const id = c.req.param("id");
  const subject = c.get("userId");

  if (!subject) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Not found" }, 404);
  }

  const row = await db
    .prepare("SELECT id, player_ids_json, state_json FROM games WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      player_ids_json: string;
      state_json: string | null;
    }>();

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const playerIds = JSON.parse(row.player_ids_json) as string[];
  const isPlayer = playerIds.includes(subject);

  // If not a player, check whether spectator mode is enabled
  if (!isPlayer) {
    const state: PersistedGameState = row.state_json
      ? (JSON.parse(row.state_json) as PersistedGameState)
      : { gameId: id, round: 0 };

    const spectatorEnabled = state.settings?.spectatorMode === "enabled";
    if (!spectatorEnabled) {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json(toClientGameState(state, "spectator", subject));
  }

  const state: PersistedGameState = row.state_json
    ? (JSON.parse(row.state_json) as PersistedGameState)
    : { gameId: id, round: 0 };

  return c.json(toClientGameState(state, "player", subject));
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/log
// Returns the action log for a game.
// Auth required for private games (treated as: auth required, player check).
// ---------------------------------------------------------------------------
gameRoutes.get("/:id/log", async (c) => {
  const id = c.req.param("id");
  const subject = c.get("userId");

  if (!subject) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Not found" }, 404);
  }

  const game = await db
    .prepare("SELECT id, player_ids_json FROM games WHERE id = ?")
    .bind(id)
    .first<{ id: string; player_ids_json: string }>();

  if (!game) {
    return c.json({ error: "Not found" }, 404);
  }

  const playerIds = JSON.parse(game.player_ids_json) as string[];
  if (!playerIds.includes(subject)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { results } = await db
    .prepare(
      "SELECT id, game_id, round, player_id, action_type, payload_json, created_at FROM game_log WHERE game_id = ? ORDER BY created_at ASC",
    )
    .bind(id)
    .all<{
      id: string;
      game_id: string;
      round: number;
      player_id: string | null;
      action_type: string;
      payload_json: string | null;
      created_at: number;
    }>();

  const log: GameLogEntry[] = results.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    round: row.round,
    playerId: row.player_id ?? null,
    actionType: row.action_type,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    createdAt: row.created_at,
  }));

  return c.json({ log });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/replay
// Returns the full ordered action log for replay purposes.
// Auth required; 404 if game is still active (not completed).
// ---------------------------------------------------------------------------
gameRoutes.get("/:id/replay", async (c) => {
  const id = c.req.param("id");
  const subject = c.get("userId");

  if (!subject) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Not found" }, 404);
  }

  const game = await db
    .prepare("SELECT id, status, player_ids_json FROM games WHERE id = ?")
    .bind(id)
    .first<{ id: string; status: string; player_ids_json: string }>();

  if (!game) {
    return c.json({ error: "Not found" }, 404);
  }

  if (game.status !== "completed") {
    return c.json({ error: "Not found" }, 404);
  }

  const playerIds = JSON.parse(game.player_ids_json) as string[];
  if (!playerIds.includes(subject)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { results } = await db
    .prepare(
      "SELECT id, game_id, round, player_id, action_type, payload_json, created_at FROM game_log WHERE game_id = ? ORDER BY created_at ASC",
    )
    .bind(id)
    .all<{
      id: string;
      game_id: string;
      round: number;
      player_id: string | null;
      action_type: string;
      payload_json: string | null;
      created_at: number;
    }>();

  const replay: GameLogEntry[] = results.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    round: row.round,
    playerId: row.player_id ?? null,
    actionType: row.action_type,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    createdAt: row.created_at,
  }));

  return c.json({ replay });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/ws
// WebSocket upgrade for real-time game events.
// Returns 501 — Durable Object implementation is a separate issue.
// ---------------------------------------------------------------------------
gameRoutes.get("/:id/ws", (c) => {
  return c.json({ error: "WebSocket support not yet implemented" }, 501);
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/spectate
// Alias for /ws with spectator flag.
// Returns 501 — Durable Object implementation is a separate issue.
// ---------------------------------------------------------------------------
gameRoutes.get("/:id/spectate", (c) => {
  return c.json({ error: "WebSocket support not yet implemented" }, 501);
});

function rollSecureDice(): [number, number] {
  const u = new Uint8Array(2);
  crypto.getRandomValues(u);
  return [(u[0] % 6) + 1, (u[1] % 6) + 1];
}
