import { zValidator } from "@hono/zod-validator";
import {
  ACTION_POINTS_PER_TURN,
  AFFINITY_CARD_IDS,
  getStartingCapital,
  initTileStates,
  OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  OPTIONAL_RULES_REGISTRY,
  TRUSTWORTHINESS_DEFAULT,
} from "@oligopoly/shared";
import {
  CreateLobbyInputSchema,
  LobbyErrorKeys,
  UpdateLobbySettingsInputSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";
import { broadcastLobbyEvent } from "../realtime/notify.js";
import { upgradeWebSocket } from "../realtime/upgrade.js";
import { notifyGameSchedule } from "../services/gameAi.js";
import { kickInGamePlayerToAi } from "../services/gameKick.js";
import {
  buildAiPlayersFromSlots,
  countTotalSeats,
  MAX_TOTAL_PLAYERS,
  mergePlayerIdsWithAi,
  parseAiSlots,
  validateCreateAiSlots,
  validateSeatCapacity,
} from "../services/lobbyAi.js";

type Bindings = {
  DB?: D1Database;
  KV?: KVNamespace;
  LOBBY_ROOM?: DurableObjectNamespace;
  GAME_ROOM?: DurableObjectNamespace;
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
  ai_slots_json: string | null;
};

type LobbyPlayerRow = {
  lobby_id: string;
  user_id: string;
  is_admin: number;
  joined_at: number;
};

const generateId = () => crypto.randomUUID();
const MAX_WAITING_LOBBIES_PER_USER = 2;

/**
 * Return the minimum rank tier required by a set of optional rule IDs and
 * optional market-event card IDs.  Returns 1 (the lowest tier) when no
 * rank-gated entries are selected.
 */
const getRequiredRankTier = (
  optionalRuleIds: string[],
  optionalMarketEventCardIds: string[],
): number => {
  let max = 1;
  for (const ruleId of optionalRuleIds) {
    const entry =
      OPTIONAL_RULES_REGISTRY[ruleId as keyof typeof OPTIONAL_RULES_REGISTRY];
    if (entry && entry.requiredRankTier > max) {
      max = entry.requiredRankTier;
    }
  }
  for (const cardId of optionalMarketEventCardIds) {
    const entry =
      OPTIONAL_MARKET_EVENT_CARDS_REGISTRY[
        cardId as keyof typeof OPTIONAL_MARKET_EVENT_CARDS_REGISTRY
      ];
    if (entry && entry.requiredRankTier > max) {
      max = entry.requiredRankTier;
    }
  }
  return max;
};

/**
 * Look up a user's rank tier from the user_ranks table.  Returns tier 1
 * (Market Novice) when the row is missing.
 */
const getUserRankTier = async (
  db: D1Database,
  userId: string,
): Promise<number> => {
  const row = await db
    .prepare("SELECT rank_tier FROM user_ranks WHERE user_id = ?")
    .bind(userId)
    .first<{ rank_tier: number }>();
  return row?.rank_tier ?? 1;
};

const getSubject = (c: {
  get: (key: string) => string | undefined;
}): string | null => {
  return c.get("userId") ?? null;
};

const getActiveGameIdForLobby = async (
  db: D1Database,
  lobbyId: string,
): Promise<string | undefined> => {
  const row = await db
    .prepare(
      "SELECT id FROM games WHERE lobby_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    )
    .bind(lobbyId)
    .first<{ id: string }>();
  return row?.id;
};

const toLobbyResponse = (
  row: LobbyRow,
  players: LobbyPlayerRow[] = [],
  gameId?: string,
) => ({
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
  aiSlots: parseAiSlots(row.ai_slots_json),
  ...(gameId ? { gameId } : {}),
});

const buildLobbyResponse = async (
  db: D1Database,
  row: LobbyRow,
  players: LobbyPlayerRow[] = [],
) => {
  const gameId =
    row.status === "in_game"
      ? await getActiveGameIdForLobby(db, row.id)
      : undefined;
  return toLobbyResponse(row, players, gameId);
};

type LeaveLobbyResponse = {
  lobbyId: string;
  deleted: boolean;
  lobby?: Awaited<ReturnType<typeof buildLobbyResponse>>;
};

const publishLobbyUpdate = async (
  env: Bindings,
  lobbyId: string,
  payload: unknown,
) => {
  await broadcastLobbyEvent(env.LOBBY_ROOM, lobbyId, {
    type: "lobby.updated",
    sentAt: Date.now(),
    lobbyId,
    payload,
  });
};

const isWaitingLobbyStatus = (status: string) => status === "waiting";

const compareLobbyPlayers = (a: LobbyPlayerRow, b: LobbyPlayerRow) =>
  a.joined_at - b.joined_at || a.user_id.localeCompare(b.user_id);

const getLobbyById = async (db: D1Database, lobbyId: string) => {
  return db
    .prepare("SELECT * FROM lobbies WHERE id = ?")
    .bind(lobbyId)
    .first<LobbyRow>();
};

const listLobbyPlayers = async (db: D1Database, lobbyId: string) => {
  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(lobbyId)
    .all<LobbyPlayerRow>();

  return playersResult.results;
};

const listUserLobbyMemberships = async (db: D1Database, userId: string) => {
  const membershipsResult = await db
    .prepare("SELECT * FROM lobby_players WHERE user_id = ?")
    .bind(userId)
    .all<LobbyPlayerRow>();

  const memberships = await Promise.all(
    membershipsResult.results.map(async (membership) => {
      const lobby = await getLobbyById(db, membership.lobby_id);
      if (!lobby) {
        return null;
      }
      return { lobby, membership };
    }),
  );

  return memberships
    .filter(
      (
        membership,
      ): membership is { lobby: LobbyRow; membership: LobbyPlayerRow } =>
        membership !== null,
    )
    .sort((a, b) => {
      if (a.membership.is_admin !== b.membership.is_admin) {
        return b.membership.is_admin - a.membership.is_admin;
      }
      return (
        b.lobby.created_at - a.lobby.created_at ||
        b.lobby.id.localeCompare(a.lobby.id)
      );
    });
};

const countWaitingLobbyMemberships = async (db: D1Database, userId: string) => {
  const memberships = await listUserLobbyMemberships(db, userId);
  return memberships.filter(({ lobby }) => isWaitingLobbyStatus(lobby.status))
    .length;
};

const pickReplacementHost = (players: LobbyPlayerRow[]) => {
  const adminCandidates = players
    .filter((player) => player.is_admin === 1)
    .sort(compareLobbyPlayers);

  if (adminCandidates.length > 0) {
    return adminCandidates[0];
  }

  return [...players].sort(compareLobbyPlayers)[0] ?? null;
};

const leaveLobby = async (
  db: D1Database,
  lobby: LobbyRow,
  userId: string,
): Promise<LeaveLobbyResponse> => {
  const players = await listLobbyPlayers(db, lobby.id);
  const remainingPlayers = players.filter(
    (player) => player.user_id !== userId,
  );

  const statements = [
    db
      .prepare("DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
      .bind(lobby.id, userId),
  ];

  if (remainingPlayers.length === 0) {
    statements.push(
      db.prepare("DELETE FROM lobbies WHERE id = ?").bind(lobby.id),
    );
    await db.batch(statements);
    return {
      lobbyId: lobby.id,
      deleted: true,
    };
  }

  let updatedLobby = lobby;
  let updatedPlayers = remainingPlayers;

  if (lobby.host_id === userId) {
    const replacementHost = pickReplacementHost(remainingPlayers);

    if (replacementHost) {
      if (replacementHost.is_admin !== 1) {
        statements.push(
          db
            .prepare(
              "UPDATE lobby_players SET is_admin = 1 WHERE lobby_id = ? AND user_id = ?",
            )
            .bind(lobby.id, replacementHost.user_id),
        );
        updatedPlayers = remainingPlayers.map((player) =>
          player.user_id === replacementHost.user_id
            ? { ...player, is_admin: 1 }
            : player,
        );
      }

      statements.push(
        db
          .prepare("UPDATE lobbies SET host_id = ? WHERE id = ?")
          .bind(replacementHost.user_id, lobby.id),
      );
      updatedLobby = {
        ...lobby,
        host_id: replacementHost.user_id,
      };
    }
  }

  await db.batch(statements);

  return {
    lobbyId: lobby.id,
    deleted: false,
    lobby: await buildLobbyResponse(db, updatedLobby, updatedPlayers),
  };
};

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

  const waitingMembershipCount = await countWaitingLobbyMemberships(
    db,
    subject,
  );
  if (waitingMembershipCount >= MAX_WAITING_LOBBIES_PER_USER) {
    return c.json({ error: LobbyErrorKeys.MEMBERSHIP_LIMIT_REACHED }, 409);
  }

  const body = c.req.valid("json");
  if (!validateCreateAiSlots(body.maxPlayers, body.aiSlots.length)) {
    return c.json({ error: LobbyErrorKeys.FULL }, 409);
  }

  // Enforce rank-gate: host must meet the minimum rank tier for selected rules/cards
  const requiredTier = getRequiredRankTier(
    body.optionalRuleIds,
    body.optionalMarketEventCardIds,
  );
  if (requiredTier > 1) {
    const hostTier = await getUserRankTier(db, subject);
    if (hostTier < requiredTier) {
      return c.json({ error: LobbyErrorKeys.RANK_TOO_LOW }, 403);
    }
  }

  const id = generateId();
  const now = Date.now();

  await db.batch([
    db
      .prepare(
        `INSERT INTO lobbies (id, name, host_id, status, max_players, is_private, optional_rule_ids_json, created_at,
          turn_timeout, auction_bid_window, auction_settle_delay, auction_type,
          voice_video_enabled, spectator_mode, market_event_deck_json,
          optional_event_card_ids_json, currency_name, currency_symbol, currency_multiplier,
          ai_slots_json)
         VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(body.aiSlots),
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
    ai_slots_json: JSON.stringify(body.aiSlots),
  };

  const players: LobbyPlayerRow[] = [
    { lobby_id: id, user_id: subject, is_admin: 1, joined_at: now },
  ];

  return c.json(toLobbyResponse(lobby, players), 201);
});

// GET /mine — List the current user's waiting lobbies
lobbyRoutes.get("/mine", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const memberships = await listUserLobbyMemberships(db, subject);
  const lobbies = await Promise.all(
    memberships
      .filter(({ lobby }) => isWaitingLobbyStatus(lobby.status))
      .map(async ({ lobby }) =>
        toLobbyResponse(lobby, await listLobbyPlayers(db, lobby.id)),
      ),
  );

  return c.json({
    lobbies,
    nextCursor: null,
  });
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

  return c.json(await buildLobbyResponse(db, lobby, playersResult.results));
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

  const waitingMembershipCount = await countWaitingLobbyMemberships(
    db,
    subject,
  );
  if (waitingMembershipCount >= MAX_WAITING_LOBBIES_PER_USER) {
    return c.json({ error: LobbyErrorKeys.MEMBERSHIP_LIMIT_REACHED }, 409);
  }

  if (
    countTotalSeats(players.length, parseAiSlots(lobby.ai_slots_json)) >=
    lobby.max_players
  ) {
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

  const joinResponse = toLobbyResponse(lobby, updatedPlayers);
  await publishLobbyUpdate(c.env, id, joinResponse);
  return c.json(joinResponse);
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

  const waitingMembershipCount = await countWaitingLobbyMemberships(
    db,
    subject,
  );
  if (waitingMembershipCount >= MAX_WAITING_LOBBIES_PER_USER) {
    return c.json({ error: LobbyErrorKeys.MEMBERSHIP_LIMIT_REACHED }, 409);
  }

  if (
    countTotalSeats(players.length, parseAiSlots(lobby.ai_slots_json)) >=
    lobby.max_players
  ) {
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

  const tokenJoinResponse = toLobbyResponse(lobby, updatedPlayers);
  await publishLobbyUpdate(c.env, id, tokenJoinResponse);
  return c.json(tokenJoinResponse);
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

// DELETE /:id/leave — Leave a waiting lobby, deleting it if it becomes empty
lobbyRoutes.delete("/:id/leave", async (c) => {
  const subject = getSubject(c);
  if (!subject) {
    return c.json({ error: LobbyErrorKeys.AUTH_REQUIRED }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const lobby = await getLobbyById(db, id);

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

  if (!player) {
    return c.json({ error: LobbyErrorKeys.NOT_IN_LOBBY }, 404);
  }

  return c.json(await leaveLobby(db, lobby, subject));
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

    // Enforce rank-gate when optional rules or cards are being changed
    if (
      body.optionalRuleIds !== undefined ||
      body.optionalMarketEventCardIds !== undefined
    ) {
      const effectiveRuleIds =
        body.optionalRuleIds ??
        (lobby.optional_rule_ids_json
          ? JSON.parse(lobby.optional_rule_ids_json)
          : []);
      const effectiveCardIds =
        body.optionalMarketEventCardIds ??
        (lobby.optional_event_card_ids_json
          ? JSON.parse(lobby.optional_event_card_ids_json)
          : []);
      const requiredTier = getRequiredRankTier(
        effectiveRuleIds,
        effectiveCardIds,
      );
      if (requiredTier > 1) {
        const adminTier = await getUserRankTier(db, subject);
        if (adminTier < requiredTier) {
          return c.json({ error: LobbyErrorKeys.RANK_TOO_LOW }, 403);
        }
      }
    }

    if (body.maxPlayers !== undefined) {
      const countResult = await db
        .prepare("SELECT COUNT(*) as cnt FROM lobby_players WHERE lobby_id = ?")
        .bind(id)
        .first<{ cnt: number }>();
      const aiSlots = body.aiSlots ?? parseAiSlots(lobby.ai_slots_json);
      if (
        countResult &&
        !validateSeatCapacity(countResult.cnt, aiSlots, body.maxPlayers)
      ) {
        return c.json({ error: LobbyErrorKeys.FULL }, 409);
      }
    }

    if (body.aiSlots !== undefined) {
      const playersResult = await db
        .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
        .bind(id)
        .all<LobbyPlayerRow>();
      const maxPlayers = body.maxPlayers ?? lobby.max_players;
      if (
        !validateSeatCapacity(
          playersResult.results.length,
          body.aiSlots,
          maxPlayers,
        )
      ) {
        return c.json({ error: LobbyErrorKeys.FULL }, 409);
      }
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

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
      // null resets to full deck; array sets a custom selection
      values.push(
        body.marketEventDeckCardIds === null
          ? null
          : JSON.stringify(body.marketEventDeckCardIds),
      );
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
    if (body.aiSlots !== undefined) {
      updates.push("ai_slots_json = ?");
      values.push(JSON.stringify(body.aiSlots));
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

  if (lobby.status === "in_game") {
    await kickInGamePlayerToAi(db, id, uid, c.env?.GAME_ROOM);
  }

  await db
    .prepare("DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .bind(id, uid)
    .run();

  const playersResult = await db
    .prepare("SELECT * FROM lobby_players WHERE lobby_id = ?")
    .bind(id)
    .all<LobbyPlayerRow>();

  const kickResponse = await buildLobbyResponse(
    db,
    lobby,
    playersResult.results,
  );
  await publishLobbyUpdate(c.env, id, kickResponse);
  return c.json(kickResponse);
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
  const aiSlots = parseAiSlots(lobby.ai_slots_json);
  const totalSeats = countTotalSeats(lobbyPlayers.length, aiSlots);
  if (totalSeats < 2) {
    return c.json({ error: LobbyErrorKeys.NOT_ENOUGH_PLAYERS }, 409);
  }
  if (totalSeats > Math.min(lobby.max_players, MAX_TOTAL_PLAYERS)) {
    return c.json({ error: LobbyErrorKeys.FULL }, 409);
  }

  const gameId = generateId();
  const gameStartedLogId = generateId();
  const now = Date.now();
  const aiPlayers = buildAiPlayersFromSlots(id, aiSlots);

  // Randomize turn order
  const playerIds = mergePlayerIdsWithAi(
    lobbyPlayers.map((p) => p.user_id),
    aiPlayers,
  ).sort(() => Math.random() - 0.5);

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
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: playerIds,
    freeMarketPool: 0,
    affinityAssignments: playerAffinityMap,
    pendingBuyTilePosition: null as number | string | null,
    lastDiceRoll: null as [number, number] | null,
    winnerId: null as string | null,
    eliminatedPlayerIds: [] as string[],
    aiPlayers,
    tiles: initTileStates(),
    players: playerIds.map((pid, idx) => {
      const aiPlayer = aiPlayers.find((ai) => ai.playerId === pid);
      return {
        playerId: pid,
        kind: aiPlayer ? "ai" : "human",
        displayName: aiPlayer?.name,
        aiPersonality: aiPlayer?.personality,
        position: 0,
        capital: startingCapital,
        ownedTilePositions: [] as (number | string)[],
        mortgagedTilePositions: [] as (number | string)[],
        developmentTokens: {} as Record<string, number>,
        trustworthiness: TRUSTWORTHINESS_DEFAULT,
        actionPointsRemaining: idx === 0 ? ACTION_POINTS_PER_TURN : 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      };
    }),
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
      spectatorMode: lobby.spectator_mode ?? "disabled",
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
          aiPlayers,
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

  const startResponse = {
    ...(await buildLobbyResponse(db, updated, lobbyPlayers)),
    gameId,
  };
  await publishLobbyUpdate(c.env, id, startResponse);

  const { affinityAssignments: _affinity, ...publicInitialState } =
    initialState;
  await notifyGameSchedule(c.env?.GAME_ROOM, gameId, publicInitialState);

  return c.json(startResponse);
});

// GET /:id/ws — WebSocket upgrade for live lobby events.
lobbyRoutes.get("/:id/ws", (c) => {
  const id = c.req.param("id") ?? "";
  return upgradeWebSocket(c, {
    room: c.env?.LOBBY_ROOM,
    roomId: id,
    roomParam: "lobbyId",
    roomParamValue: id,
    fallbackEvent: {
      type: "lobby.snapshot",
      lobbyId: id,
      payload: { lobbyId: id, connected: true },
    },
  });
});
