import { zValidator } from "@hono/zod-validator";
import {
  CreateLobbyInputSchema,
  LobbyErrorKeys,
  UpdateLobbySettingsInputSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";

type Bindings = {
  DB?: D1Database;
  KV?: KVNamespace;
};

type Variables = {
  userId?: string;
};

type LobbyRow = {
  id: string;
  name: string;
  host_id: string;
  status: string;
  max_players: number;
  is_private: number;
  optional_rule_ids_json: string | null;
  created_at: number;
};

type LobbyPlayerRow = {
  lobby_id: string;
  user_id: string;
  is_admin: number;
  joined_at: number;
};

const generateId = () => crypto.randomUUID();

const getSubject = (c: {
  get: (key: string) => string | undefined;
}): string | null => {
  return c.get("userId") ?? null;
};

const toLobbyResponse = (row: LobbyRow, players: LobbyPlayerRow[] = []) => ({
  id: row.id,
  name: row.name,
  hostId: row.host_id,
  status: row.status,
  maxPlayers: row.max_players,
  isPrivate: row.is_private === 1,
  optionalRuleIds: row.optional_rule_ids_json
    ? JSON.parse(row.optional_rule_ids_json)
    : [],
  createdAt: row.created_at,
  players: players.map((p) => ({
    userId: p.user_id,
    isAdmin: p.is_admin === 1,
    joinedAt: p.joined_at,
  })),
});

export const lobbyRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// POST /  — Create a lobby
lobbyRoutes.post("/", zValidator("json", CreateLobbyInputSchema), async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const body = c.req.valid("json");
  const id = generateId();
  const now = Date.now();

  await db.batch([
    db
      .prepare(
        `INSERT INTO lobbies (id, name, host_id, status, max_players, is_private, optional_rule_ids_json, created_at)
         VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.name,
        subject,
        body.maxPlayers,
        body.isPrivate ? 1 : 0,
        JSON.stringify(body.optionalRuleIds),
        now,
      ),
    db
      .prepare(
        `INSERT INTO lobby_players (lobby_id, user_id, is_admin, joined_at) VALUES (?, ?, 1, ?)`,
      )
      .bind(id, subject, now),
  ]);

  const lobby = {
    id,
    name: body.name,
    host_id: subject,
    status: "waiting",
    max_players: body.maxPlayers,
    is_private: body.isPrivate ? 1 : 0,
    optional_rule_ids_json: JSON.stringify(body.optionalRuleIds),
    created_at: now,
  } satisfies LobbyRow;

  const players: LobbyPlayerRow[] = [
    { lobby_id: id, user_id: subject, is_admin: 1, joined_at: now },
  ];

  return c.json(toLobbyResponse(lobby, players), 201);
});

// GET /  — List public lobbies (status: waiting)
lobbyRoutes.get("/", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const cursor = c.req.query("cursor");
  const limit = 20;

  let rows: LobbyRow[];
  if (cursor) {
    const sepIdx = cursor.indexOf(":");
    const cursorTime = Number(cursor.slice(0, sepIdx));
    const cursorId = cursor.slice(sepIdx + 1);
    const result = await db
      .prepare(
        `SELECT * FROM lobbies WHERE status = 'waiting' AND is_private = 0 AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .bind(cursorTime, cursorTime, cursorId, limit + 1)
      .all<LobbyRow>();
    rows = result.results;
  } else {
    const result = await db
      .prepare(
        `SELECT * FROM lobbies WHERE status = 'waiting' AND is_private = 0 ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .bind(limit + 1)
      .all<LobbyRow>();
    rows = result.results;
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore ? `${lastItem.created_at}:${lastItem.id}` : null;

  return c.json({
    lobbies: items.map((row) => toLobbyResponse(row)),
    nextCursor,
  });
});

// GET /:id — Get lobby by ID
lobbyRoutes.get("/:id", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  return c.json(toLobbyResponse(lobby, playersResult.results));
});

// POST /:id/join — Join a public lobby
lobbyRoutes.post("/:id/join", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  if (lobby.is_private === 1) {
    return c.json({ error: LobbyErrorKeys.PRIVATE }, 403);
  }

  if (lobby.status !== "waiting") {
    return c.json({ error: LobbyErrorKeys.ALREADY_STARTED }, 409);
  }

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  const players = playersResult.results;

  if (players.some((p) => p.user_id === subject)) {
    return c.json({ error: LobbyErrorKeys.ALREADY_JOINED }, 409);
  }

  if (players.length >= lobby.max_players) {
    return c.json({ error: LobbyErrorKeys.FULL }, 409);
  }

  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO lobby_players (lobby_id, user_id, is_admin, joined_at) VALUES (?, ?, 0, ?)",
    )
    .bind(id, subject, now)
    .run();

  const updatedPlayers: LobbyPlayerRow[] = [
    ...players,
    { lobby_id: id, user_id: subject, is_admin: 0, joined_at: now },
  ];

  return c.json(toLobbyResponse(lobby, updatedPlayers));
});

// POST /:id/join/:token — Join a private lobby via invite token
lobbyRoutes.post("/:id/join/:token", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  const kv = c.env?.KV;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const token = c.req.param("token");

  if (!kv) {
    return c.json({ error: LobbyErrorKeys.INVALID_TOKEN }, 403);
  }

  const tokenLobbyId = await kv.get(`lobby:invite:${token}`);
  if (tokenLobbyId !== id) {
    return c.json({ error: LobbyErrorKeys.INVALID_TOKEN }, 403);
  }

  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  if (lobby.status !== "waiting") {
    return c.json({ error: LobbyErrorKeys.ALREADY_STARTED }, 409);
  }

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  const players = playersResult.results;

  if (players.some((p) => p.user_id === subject)) {
    return c.json({ error: LobbyErrorKeys.ALREADY_JOINED }, 409);
  }

  if (players.length >= lobby.max_players) {
    return c.json({ error: LobbyErrorKeys.FULL }, 409);
  }

  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO lobby_players (lobby_id, user_id, is_admin, joined_at) VALUES (?, ?, 0, ?)",
    )
    .bind(id, subject, now)
    .run();

  const updatedPlayers: LobbyPlayerRow[] = [
    ...players,
    { lobby_id: id, user_id: subject, is_admin: 0, joined_at: now },
  ];

  return c.json(toLobbyResponse(lobby, updatedPlayers));
});

// POST /:id/invite — Generate an invite token (admin only)
lobbyRoutes.post("/:id/invite", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  const kv = c.env?.KV;
  if (!db || !kv) {
    return c.json({ error: "Database or KV not configured" }, 500);
  }

  const id = c.req.param("id");

  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  const player = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, subject)
    .first<LobbyPlayerRow>();

  if (!player || player.is_admin !== 1) {
    return c.json({ error: LobbyErrorKeys.NOT_ADMIN }, 403);
  }

  const token = generateId();
  const ttlSeconds = 3600;
  await kv.put(`lobby:invite:${token}`, id, { expirationTtl: ttlSeconds });

  return c.json({ token, expiresInSeconds: ttlSeconds });
});

// PUT /:id/settings — Update lobby settings (admin only)
lobbyRoutes.put(
  "/:id/settings",
  zValidator("json", UpdateLobbySettingsInputSchema),
  async (c) => {
    const subject = getSubject(c);
    if (!subject) {
      return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const id = c.req.param("id");

    const lobby = await db
      .prepare("SELECT * FROM lobbies WHERE id = ?")
      .bind(id)
      .first<LobbyRow>();

    if (!lobby) {
      return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
    }

    if (lobby.status !== "waiting") {
      return c.json({ error: LobbyErrorKeys.ALREADY_STARTED }, 409);
    }

    const player = await db
      .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
      .bind(id, subject)
      .first<LobbyPlayerRow>();

    if (!player || player.is_admin !== 1) {
      return c.json({ error: LobbyErrorKeys.NOT_ADMIN }, 403);
    }

    const body = c.req.valid("json");

    if (body.maxPlayers !== undefined) {
      const countResult = await db
        .prepare("SELECT COUNT(*) as cnt FROM lobby_players WHERE lobby_id = ?")
        .bind(id)
        .first<{ cnt: number }>();
      if (countResult && body.maxPlayers < countResult.cnt) {
        return c.json({ error: LobbyErrorKeys.FULL }, 409);
      }
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.maxPlayers !== undefined) {
      updates.push("max_players = ?");
      values.push(body.maxPlayers);
    }
    if (body.isPrivate !== undefined) {
      updates.push("is_private = ?");
      values.push(body.isPrivate ? 1 : 0);
    }
    if (body.optionalRuleIds !== undefined) {
      updates.push("optional_rule_ids_json = ?");
      values.push(JSON.stringify(body.optionalRuleIds));
    }

    if (updates.length > 0) {
      values.push(id);
      await db
        .prepare(`UPDATE lobbies SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
    }

    const updated = await db
      .prepare("SELECT * FROM lobbies WHERE id = ?")
      .bind(id)
      .first<LobbyRow>();

    const playersResult = await db
      .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
      .bind(id)
      .all<LobbyPlayerRow>();

    return c.json(toLobbyResponse(updated as LobbyRow, playersResult.results));
  },
);

// POST /:id/admin/:uid — Promote player to admin (owner only)
lobbyRoutes.post("/:id/admin/:uid", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const uid = c.req.param("uid");

  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  if (lobby.host_id !== subject) {
    return c.json({ error: LobbyErrorKeys.NOT_OWNER }, 403);
  }

  const targetPlayer = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, uid)
    .first<LobbyPlayerRow>();

  if (!targetPlayer) {
    return c.json({ error: LobbyErrorKeys.PLAYER_NOT_FOUND }, 404);
  }

  await db
    .prepare(
      "UPDATE lobby_players SET is_admin = 1 WHERE lobby_id = ? AND user_id = ?",
    )
    .bind(id, uid)
    .run();

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  return c.json(toLobbyResponse(lobby, playersResult.results));
});

// DELETE /:id/player/:uid — Remove player from lobby (admin only)
lobbyRoutes.delete("/:id/player/:uid", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const uid = c.req.param("uid");

  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  const player = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, subject)
    .first<LobbyPlayerRow>();

  if (!player || player.is_admin !== 1) {
    return c.json({ error: LobbyErrorKeys.NOT_ADMIN }, 403);
  }

  const targetPlayer = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, uid)
    .first<LobbyPlayerRow>();

  if (!targetPlayer) {
    return c.json({ error: LobbyErrorKeys.PLAYER_NOT_FOUND }, 404);
  }

  if (uid === lobby.host_id) {
    return c.json({ error: LobbyErrorKeys.NOT_OWNER }, 403);
  }

  await db
    .prepare("DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, uid)
    .run();

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  return c.json(toLobbyResponse(lobby, playersResult.results));
});

// POST /:id/start — Start the game (admin only, min 2 players)
lobbyRoutes.post("/:id/start", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");

  const lobby = await db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(id)
    .first<LobbyRow>();

  if (!lobby) {
    return c.json({ error: LobbyErrorKeys.NOT_FOUND }, 404);
  }

  if (lobby.status !== "waiting") {
    return c.json({ error: LobbyErrorKeys.ALREADY_STARTED }, 409);
  }

  const player = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, subject)
    .first<LobbyPlayerRow>();

  if (!player || player.is_admin !== 1) {
    return c.json({ error: LobbyErrorKeys.NOT_ADMIN }, 403);
  }

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  const lobbyPlayers = playersResult.results;
  if (lobbyPlayers.length < 2) {
    return c.json({ error: LobbyErrorKeys.NOT_ENOUGH_PLAYERS }, 409);
  }

  const gameId = generateId();
  const gameStartedLogId = generateId();
  const now = Date.now();
  const playerIds = [...lobbyPlayers]
    .sort((a, b) => a.joined_at - b.joined_at)
    .map((p) => p.user_id);

  await db.batch([
    db
      .prepare(
        `INSERT INTO games (id, lobby_id, status, started_at, ended_at, winner_id, player_ids_json, state_json)
         VALUES (?, ?, 'active', ?, NULL, NULL, ?, ?)`,
      )
      .bind(
        gameId,
        id,
        now,
        JSON.stringify(playerIds),
        JSON.stringify({ gameId, round: 1 }),
      ),
    db
      .prepare(
        `INSERT INTO game_log (id, game_id, round, player_id, action_type, payload_json, created_at)
         VALUES (?, ?, 1, NULL, 'game_started', ?, ?)`,
      )
      .bind(
        gameStartedLogId,
        gameId,
        JSON.stringify({ lobbyId: id, startedBy: subject, playerIds }),
        now,
      ),
    db.prepare("UPDATE lobbies SET status = 'in_game' WHERE id = ?").bind(id),
  ]);

  const updated = {
    ...lobby,
    status: "in_game",
  };

  return c.json({
    ...toLobbyResponse(updated, lobbyPlayers),
    gameId,
  });
});

// GET /:id/ws — WebSocket stub (returns 501)
lobbyRoutes.get("/:id/ws", (c) => {
  return c.json(
    { error: "WebSocket not implemented — Durable Object pending" },
    501,
  );
});
