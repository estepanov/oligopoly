import {
  applyAction,
  isLoopbackUrl,
  normalizeGameState,
} from "@oligopoly/shared";
import type { GameLogEntry, GameSummary } from "@oligopoly/validation";
import {
  GameActionSchema,
  GameErrorKeys,
  GameStatusSchema,
} from "@oligopoly/validation";
import { type Context, Hono } from "hono";
import {
  type PersistedGameState,
  toClientGameState,
} from "../gameStateView.js";
import { buildEngineActionInput } from "../lib/dice.js";
import { upgradeWebSocket } from "../realtime/upgrade.js";
import { stepGameAiTurn } from "../services/gameAi.js";
import { listGames, toGameSummary } from "../services/gameListings.js";
import {
  notifyGameActionResult,
  persistGameActionResult,
  toActionResponse,
} from "../services/gamePersistence.js";
import type { OpenRouterAiEnv } from "../services/openRouterAi.js";

type Bindings = OpenRouterAiEnv & {
  ALLOWED_ORIGINS?: string;
  KV?: KVNamespace;
  DB?: D1Database;
  GAME_ROOM?: DurableObjectNamespace;
};

type Variables = {
  userId?: string;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };
type AppContext = Context<AppEnv>;

export const gameRoutes = new Hono<AppEnv>();

type TimingEntry = {
  name: string;
  duration: number;
};

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function formatServerTiming(entries: TimingEntry[]): string {
  return entries
    .map(
      (entry) => `${entry.name};dur=${Math.max(0, entry.duration).toFixed(1)}`,
    )
    .join(", ");
}

function scheduleActionSideEffect(c: AppContext, promise: Promise<void>): void {
  const guarded = promise.catch((error) => {
    console.error("Failed to notify game action result", error);
  });

  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    void guarded;
  }
}

type GameAccessRow = {
  id: string;
  player_ids_json: string;
  state_json: string | null;
};

async function loadGameAccessRow(
  db: D1Database,
  gameId: string,
): Promise<GameAccessRow | null> {
  return db
    .prepare("SELECT id, player_ids_json, state_json FROM games WHERE id = ?")
    .bind(gameId)
    .first<GameAccessRow>();
}

function gameSpectatorModeEnabled(row: GameAccessRow): boolean {
  if (!row.state_json) return false;
  const state = JSON.parse(row.state_json) as PersistedGameState;
  return state.settings?.spectatorMode === "enabled";
}

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
  const games: GameSummary[] = (
    await listGames(db, {
      status: parsed.success ? parsed.data : undefined,
      participantId: subject,
    })
  ).map(toGameSummary);

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
// POST /api/games/:id/action
// Submit a game action (roll_dice, buy_tile, decline_tile, end_turn, etc.)
// Auth required; must be the current player's turn.
// ---------------------------------------------------------------------------
gameRoutes.post("/:id/action", async (c) => {
  const actionStartedAt = nowMs();
  const timings: TimingEntry[] = [];
  const id = c.req.param("id");
  const subject = c.get("userId");

  if (!subject) {
    return c.json({ error: GameErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: GameErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const gameReadStartedAt = nowMs();
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
  timings.push({
    name: "game_read",
    duration: nowMs() - gameReadStartedAt,
  });

  if (!row) {
    return c.json({ error: GameErrorKeys.NOT_FOUND }, 404);
  }

  if (row.status !== "active") {
    return c.json({ error: GameErrorKeys.GAME_COMPLETED }, 409);
  }

  const playerIds = JSON.parse(row.player_ids_json) as string[];
  if (!playerIds.includes(subject)) {
    return c.json({ error: GameErrorKeys.NOT_PLAYER }, 403);
  }

  const rawState = row.state_json
    ? (JSON.parse(row.state_json) as Record<string, unknown>)
    : { gameId: id, round: 0 };

  const gameState = normalizeGameState(rawState);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: GameErrorKeys.INVALID_ACTION }, 400);
  }

  const parsed = GameActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: GameErrorKeys.INVALID_ACTION, detail: parsed.error.issues },
      400,
    );
  }
  const actionBody = parsed.data;

  // Enrich with server-authoritative fields (crypto dice + path-choice die for
  // roll_dice) before applying. See buildEngineActionInput for the dice policy.
  const engineInput = buildEngineActionInput(actionBody, c.req.url);

  try {
    const engineStartedAt = nowMs();
    const result = applyAction(gameState, subject, engineInput);
    timings.push({
      name: "engine",
      duration: nowMs() - engineStartedAt,
    });

    const persistStartedAt = nowMs();
    const logEntries = await persistGameActionResult(db, id, result, {
      gameRoom: c.env?.GAME_ROOM,
      actorId: subject,
      kv: c.env?.KV,
      notify: false,
    });
    timings.push({
      name: "persist",
      duration: nowMs() - persistStartedAt,
    });

    const notifyStartedAt = nowMs();
    scheduleActionSideEffect(
      c,
      notifyGameActionResult(id, result, logEntries, {
        gameRoom: c.env?.GAME_ROOM,
        actorId: subject,
        kv: c.env?.KV,
      }),
    );
    timings.push({
      name: "notify_schedule",
      duration: nowMs() - notifyStartedAt,
    });

    timings.push({
      name: "total",
      duration: nowMs() - actionStartedAt,
    });
    const response = c.json(toActionResponse(result, subject, { logEntries }));
    response.headers.set("Server-Timing", formatServerTiming(timings));
    return response;
  } catch (err) {
    if (typeof err === "string") {
      return c.json({ error: err }, 400);
    }
    return c.json(
      { error: GameErrorKeys.INVALID_ACTION, detail: String(err) },
      400,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:id/ai/step
// Advance exactly one server-owned AI action when the current actor is AI.
// ---------------------------------------------------------------------------
gameRoutes.post("/:id/ai/step", async (c) => {
  const id = c.req.param("id");
  if (!isLoopbackUrl(c.req.url)) {
    return c.json({ error: GameErrorKeys.FORBIDDEN }, 403);
  }
  if (!c.get("userId")) {
    return c.json({ error: GameErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: GameErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const step = await stepGameAiTurn(db, id, c.env?.GAME_ROOM, c.env?.KV, c.env);
  if (!step.applied) {
    if (step.reason === "not_found") {
      return c.json({ error: GameErrorKeys.NOT_FOUND }, 404);
    }
    if (step.reason === "completed") {
      return c.json({ error: GameErrorKeys.GAME_COMPLETED }, 409);
    }
    return c.json({ error: GameErrorKeys.NOT_AI_TURN }, 409);
  }

  return c.json(
    toActionResponse(step.result, null, {
      aiAction: step.decision.action,
      aiPlayerId: step.decision.actorId,
      aiPersonality: step.decision.personality,
    }),
  );
});

gameRoutes.get("/:id/ws", async (c) => {
  const id = c.req.param("id") ?? "";
  const upgradeOptions: Parameters<typeof upgradeWebSocket>[1] = {
    room: c.env?.GAME_ROOM,
    roomId: id,
    roomParam: "gameId",
    roomParamValue: id,
    fallbackEvent: {
      type: "game.snapshot",
      gameId: id,
      payload: { gameId: id, spectator: false, connected: true },
    },
  };

  if (c.req.header("Upgrade") !== "websocket") {
    return upgradeWebSocket(c, upgradeOptions);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: GameErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const subject = c.get("userId");
  if (!subject) {
    return c.json({ error: GameErrorKeys.AUTH_REQUIRED }, 401);
  }

  upgradeOptions.extraSearchParams = { viewerId: subject };

  const row = await loadGameAccessRow(db, id);
  if (!row) {
    return c.json({ error: GameErrorKeys.NOT_FOUND }, 404);
  }

  const playerIds = JSON.parse(row.player_ids_json) as string[];
  if (!playerIds.includes(subject)) {
    return c.json({ error: GameErrorKeys.NOT_PLAYER }, 403);
  }

  return upgradeWebSocket(c, upgradeOptions);
});

gameRoutes.get("/:id/spectate", async (c) => {
  const id = c.req.param("id") ?? "";
  const upgradeOptions = {
    room: c.env?.GAME_ROOM,
    roomId: id,
    roomParam: "gameId",
    roomParamValue: id,
    extraSearchParams: { spectator: "1" },
    fallbackEvent: {
      type: "game.snapshot",
      gameId: id,
      payload: { gameId: id, spectator: true, connected: true },
    },
  };

  if (c.req.header("Upgrade") !== "websocket") {
    return upgradeWebSocket(c, upgradeOptions);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: GameErrorKeys.DB_NOT_CONFIGURED }, 500);
  }

  const row = await loadGameAccessRow(db, id);
  if (!row) {
    return c.json({ error: GameErrorKeys.NOT_FOUND }, 404);
  }

  if (!gameSpectatorModeEnabled(row)) {
    return c.json({ error: GameErrorKeys.FORBIDDEN }, 403);
  }

  return upgradeWebSocket(c, upgradeOptions);
});
