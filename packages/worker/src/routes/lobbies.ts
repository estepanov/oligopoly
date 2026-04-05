import { zValidator } from "@hono/zod-validator";
import {
  AFFINITY_CARD_IDS,
  getStartingCapital,
  TRUSTWORTHINESS_DEFAULT,
} from "@oligopoly/shared";
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
  // Enhanced settings
  turn_timeout: string;
  auction_bid_window: string;
  auction_settle_delay: string;
  auction_type: string;
  voice_video_enabled: number;
  spectator_mode: string;
  market_event_deck_json: string | null;
  optional_event_card_ids_json: string | null;
  currency_name: string;
  currency_symbol: string;
  currency_multiplier: string;
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
  // Enhanced settings
  turnTimeout: row.turn_timeout ?? "5min",
  auctionBidWindow: row.auction_bid_window ?? "1min",
  auctionSettleDelay: row.auction_settle_delay ?? "30s",
  auctionType: row.auction_type ?? "sealed_bids",
  voiceVideoEnabled: (row.voice_video_enabled ?? 0) === 1,
  spectatorMode: row.spectator_mode ?? "disabled",
  marketEventDeckCardIds: row.market_event_deck_json
    ? JSON.parse(row.market_event_deck_json)
    : null,
  optionalMarketEventCardIds: row.optional_event_card_ids_json
    ? JSON.parse(row.optional_event_card_ids_json)
    : [],
  currencyName: row.currency_name ?? "Capital",
  currencySymbol: row.currency_symbol ?? "¤",
  currencyMultiplier: row.currency_multiplier ?? "1",
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
        `INSERT INTO lobbies (id, name, host_id, status, max_players, is_private, optional_rule_ids_json, created_at,
          turn_timeout, auction_bid_window, auction_settle_delay, auction_type,
          voice_video_enabled, spectator_mode, market_event_deck_json,
          optional_event_card_ids_json, currency_name, currency_symbol, currency_multiplier)
         VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.name,
        subject,
        body.maxPlayers,
        body.isPrivate ? 1 : 0,
        JSON.stringify(body.optionalRuleIds),
        now,
        body.turnTimeout,
        body.auctionBidWindow,
        body.auctionSettleDelay,
        body.auctionType,
        body.voiceVideoEnabled ? 1 : 0,
        body.spectatorMode,
        body.marketEventDeckCardIds
          ? JSON.stringify(body.marketEventDeckCardIds)
          : null,
        JSON.stringify(body.optionalMarketEventCardIds),
        body.currencyName,
        body.currencySymbol,
        body.currencyMultiplier,
      ),
    db
      .prepare(
        `INSERT INTO lobby_players (lobby_id, user_id, is_admin, joined_at) VALUES (?, ?, 1, ?)`,
      )
      .bind(id, subject, now),
  ]);

  const lobby: LobbyRow = {
    id,
    name: body.name,
    host_id: subject,
    status: "waiting",
    max_players: body.maxPlayers,
    is_private: body.isPrivate ? 1 : 0,
    optional_rule_ids_json: JSON.stringify(body.optionalRuleIds),
    created_at: now,
    turn_timeout: body.turnTimeout,
    auction_bid_window: body.auctionBidWindow,
    auction_settle_delay: body.auctionSettleDelay,
    auction_type: body.auctionType,
    voice_video_enabled: body.voiceVideoEnabled ? 1 : 0,
    spectator_mode: body.spectatorMode,
    market_event_deck_json: body.marketEventDeckCardIds
      ? JSON.stringify(body.marketEventDeckCardIds)
      : null,
    optional_event_card_ids_json: JSON.stringify(
      body.optionalMarketEventCardIds,
    ),
    currency_name: body.currencyName,
    currency_symbol: body.currencySymbol,
    currency_multiplier: body.currencyMultiplier,
  };

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
    if (body.turnTimeout !== undefined) {
      updates.push("turn_timeout = ?");
      values.push(body.turnTimeout);
    }
    if (body.auctionBidWindow !== undefined) {
      updates.push("auction_bid_window = ?");
      values.push(body.auctionBidWindow);
    }
    if (body.auctionSettleDelay !== undefined) {
      updates.push("auction_settle_delay = ?");
      values.push(body.auctionSettleDelay);
    }
    if (body.auctionType !== undefined) {
      updates.push("auction_type = ?");
      values.push(body.auctionType);
    }
    if (body.voiceVideoEnabled !== undefined) {
      updates.push("voice_video_enabled = ?");
      values.push(body.voiceVideoEnabled ? 1 : 0);
    }
    if (body.spectatorMode !== undefined) {
      updates.push("spectator_mode = ?");
      values.push(body.spectatorMode);
    }
    if (body.marketEventDeckCardIds !== undefined) {
      updates.push("market_event_deck_json = ?");
      values.push(JSON.stringify(body.marketEventDeckCardIds));
    }
    if (body.optionalMarketEventCardIds !== undefined) {
      updates.push("optional_event_card_ids_json = ?");
      values.push(JSON.stringify(body.optionalMarketEventCardIds));
    }
    if (body.currencyName !== undefined) {
      updates.push("currency_name = ?");
      values.push(body.currencyName);
    }
    if (body.currencySymbol !== undefined) {
      updates.push("currency_symbol = ?");
      values.push(body.currencySymbol);
    }
    if (body.currencyMultiplier !== undefined) {
      updates.push("currency_multiplier = ?");
      values.push(body.currencyMultiplier);
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

  // Randomize turn order
  const playerIds = [...lobbyPlayers]
    .sort(() => Math.random() - 0.5)
    .map((p) => p.user_id);

  // Assign random affinity cards (one per player, no duplicates)
  const availableAffinityIds = [...AFFINITY_CARD_IDS].sort(
    () => Math.random() - 0.5,
  );
  const playerAffinityMap: Record<string, string> = {};
  for (let i = 0; i < playerIds.length; i++) {
    playerAffinityMap[playerIds[i]] = availableAffinityIds[i];
  }

  // Determine if Speed Market is active
  const optionalRuleIds: string[] = lobby.optional_rule_ids_json
    ? JSON.parse(lobby.optional_rule_ids_json)
    : [];
  const speedMarketEnabled = optionalRuleIds.includes("speed_market");

  // Calculate starting capital
  const startingCapital = getStartingCapital(
    playerIds.length,
    speedMarketEnabled,
  );

  // Build initial game state
  // NOTE: affinityAssignments is stored as a separate top-level field
  // (not inside each player) so the /state endpoint can redact opponents'
  // hidden cards before returning the response.
  const initialState = {
    gameId,
    round: 1,
    phase: "market_event",
    currentPlayerIndex: 0,
    turnOrder: playerIds,
    freeMarketPool: 0,
    affinityAssignments: playerAffinityMap,
    players: playerIds.map((pid) => ({
      playerId: pid,
      position: 0,
      capital: startingCapital,
      ownedTilePositions: [] as (number | string)[],
      mortgagedTilePositions: [] as (number | string)[],
      developmentTokens: {} as Record<string, number>,
      trustworthiness: TRUSTWORTHINESS_DEFAULT,
      actionPointsRemaining: 0,
      inRegulation: false,
      doublesCount: 0,
      isOnDiagonal: false,
    })),
    settings: {
      turnTimeout: lobby.turn_timeout ?? "5min",
      auctionType: lobby.auction_type ?? "sealed_bids",
      auctionBidWindow: lobby.auction_bid_window ?? "1min",
      auctionSettleDelay: lobby.auction_settle_delay ?? "30s",
      optionalRuleIds,
      optionalMarketEventCardIds: lobby.optional_event_card_ids_json
        ? JSON.parse(lobby.optional_event_card_ids_json)
        : [],
      marketEventDeckCardIds: lobby.market_event_deck_json
        ? JSON.parse(lobby.market_event_deck_json)
        : null,
      currencyName: lobby.currency_name ?? "Capital",
      currencySymbol: lobby.currency_symbol ?? "¤",
      currencyMultiplier: lobby.currency_multiplier ?? "1",
    },
  };

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
        JSON.stringify(initialState),
      ),
    db
      .prepare(
        `INSERT INTO game_log (id, game_id, round, player_id, action_type, payload_json, created_at)
         VALUES (?, ?, 1, NULL, 'game_started', ?, ?)`,
      )
      .bind(
        gameStartedLogId,
        gameId,
        JSON.stringify({
          lobbyId: id,
          startedBy: subject,
          playerIds,
          startingCapital,
        }),
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
