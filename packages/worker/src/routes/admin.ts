import { Hono } from "hono";
import { requireAdmin } from "../middleware/requireAdmin";

type Bindings = {
  DB?: D1Database;
  KV?: KVNamespace;
};

type Variables = {
  userId?: string;
  userRole?: string;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };

const generateId = () => crypto.randomUUID();

/** Parse and validate the `page` query parameter. Returns 1 for invalid input. */
function parsePage(raw: string | undefined): number {
  const n = Number(raw ?? "1");
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return 1;
  }
  return n;
}

/** Escape SQL LIKE wildcards so user input is matched literally. */
function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Helper: write an entry to the admin_audit_log table
// ---------------------------------------------------------------------------
async function writeAuditLog(
  db: D1Database,
  entry: {
    adminId: string;
    targetId: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO admin_audit_log (id, admin_id, target_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      generateId(),
      entry.adminId,
      entry.targetId,
      entry.action,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      Date.now(),
    )
    .run();
}

export const adminRoutes = new Hono<AppEnv>();

// Apply requireAdmin middleware to all admin routes
adminRoutes.use("*", requireAdmin);

// ---------------------------------------------------------------------------
// GET /users — paginated list of all users; supports ?search=
// ---------------------------------------------------------------------------
adminRoutes.get("/users", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const search = c.req.query("search");
  const page = parsePage(c.req.query("page"));
  const limit = 50;
  const offset = (page - 1) * limit;

  let query: string;
  let params: unknown[];

  if (search) {
    query =
      "SELECT id, username, email, created_at, updated_at FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const pattern = `%${escapeLike(search)}%`;
    params = [pattern, pattern, limit, offset];
  } else {
    query =
      "SELECT id, username, email, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params = [limit, offset];
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<{
      id: string;
      username: string;
      email: string | null;
      created_at: number;
      updated_at: number;
    }>();

  return c.json({
    users: results.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    page,
  });
});

// ---------------------------------------------------------------------------
// GET /users/:id — full user record including email
// ---------------------------------------------------------------------------
adminRoutes.get("/users/:id", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const row = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      username: string;
      avatar_url: string | null;
      full_name: string | null;
      email: string | null;
      locale: string;
      timezone: string | null;
      currency: string | null;
      country: string | null;
      theme_preference: string;
      created_at: number;
      updated_at: number;
    }>();

  if (!row) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    fullName: row.full_name,
    email: row.email,
    locale: row.locale,
    timezone: row.timezone,
    currency: row.currency,
    country: row.country,
    themePreference: row.theme_preference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// ---------------------------------------------------------------------------
// POST /users/:id/ban — set ban flag in KV; write audit log
// ---------------------------------------------------------------------------
adminRoutes.post("/users/:id/ban", async (c) => {
  const db = c.env?.DB;
  const kv = c.env?.KV;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }
  if (!kv) {
    return c.json({ error: "KV not configured" }, 500);
  }

  const id = c.req.param("id");
  const adminId = c.get("userId") ?? "unknown";

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await kv.put(`ban:${id}`, "1");
  await writeAuditLog(db, {
    adminId,
    targetId: id,
    action: "ban_user",
  });

  return c.json({ ok: true }, 200);
});

// ---------------------------------------------------------------------------
// DELETE /users/:id/ban — remove ban flag from KV; write audit log
// ---------------------------------------------------------------------------
adminRoutes.delete("/users/:id/ban", async (c) => {
  const db = c.env?.DB;
  const kv = c.env?.KV;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }
  if (!kv) {
    return c.json({ error: "KV not configured" }, 500);
  }

  const id = c.req.param("id");
  const adminId = c.get("userId") ?? "unknown";

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await kv.delete(`ban:${id}`);
  await writeAuditLog(db, {
    adminId,
    targetId: id,
    action: "unban_user",
  });

  return c.json({ ok: true }, 200);
});

// ---------------------------------------------------------------------------
// POST /users/:id/impersonate — audit log; return 501 (hosted-only)
// ---------------------------------------------------------------------------
adminRoutes.post("/users/:id/impersonate", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const adminId = c.get("userId") ?? "unknown";

  await writeAuditLog(db, {
    adminId,
    targetId: id,
    action: "impersonate_user",
  });

  return c.json({ error: "Impersonation is a hosted-only feature" }, 501);
});

// ---------------------------------------------------------------------------
// POST /users/:id/sessions — invalidate sessions; return 501 (hosted-only)
// ---------------------------------------------------------------------------
adminRoutes.post("/users/:id/sessions", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");
  const adminId = c.get("userId") ?? "unknown";

  await writeAuditLog(db, {
    adminId,
    targetId: id,
    action: "invalidate_sessions",
  });

  return c.json(
    { error: "Session invalidation is a hosted-only feature" },
    501,
  );
});

// ---------------------------------------------------------------------------
// GET /games — paginated list of all games
// ---------------------------------------------------------------------------
adminRoutes.get("/games", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const page = parsePage(c.req.query("page"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const { results } = await db
    .prepare(
      "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit, offset)
    .all<{
      id: string;
      status: string;
      player_ids_json: string;
      started_at: number;
      ended_at: number | null;
      winner_id: string | null;
    }>();

  return c.json({
    games: results.map((row) => ({
      id: row.id,
      status: row.status,
      playerCount: (JSON.parse(row.player_ids_json) as string[]).length,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      winnerId: row.winner_id,
    })),
    page,
  });
});

// ---------------------------------------------------------------------------
// GET /games/:id — full game record with log
// ---------------------------------------------------------------------------
adminRoutes.get("/games/:id", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const id = c.req.param("id");

  const game = await db
    .prepare(
      "SELECT id, status, player_ids_json, started_at, ended_at, winner_id, state_json FROM games WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      status: string;
      player_ids_json: string;
      started_at: number;
      ended_at: number | null;
      winner_id: string | null;
      state_json: string | null;
    }>();

  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }

  const { results: logResults } = await db
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

  return c.json({
    id: game.id,
    status: game.status,
    playerIds: JSON.parse(game.player_ids_json) as string[],
    startedAt: game.started_at,
    endedAt: game.ended_at,
    winnerId: game.winner_id,
    state: game.state_json ? JSON.parse(game.state_json) : null,
    log: logResults.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      round: row.round,
      playerId: row.player_id,
      actionType: row.action_type,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      createdAt: row.created_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /analytics — basic aggregate stats
// ---------------------------------------------------------------------------
adminRoutes.get("/analytics", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const [usersResult, gamesResult, activeGamesResult] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) as count FROM users")
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) as count FROM games")
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) as count FROM games WHERE status = 'active'")
      .first<{ count: number }>(),
  ]);

  return c.json({
    totalUsers: usersResult?.count ?? 0,
    totalGames: gamesResult?.count ?? 0,
    activeGames: activeGamesResult?.count ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /analytics/costs — AI cost tracking from KV (last 30 days)
// ---------------------------------------------------------------------------
adminRoutes.get("/analytics/costs", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ error: "KV not configured" }, 500);
  }

  const costs: { date: string; cost: string }[] = [];
  const now = new Date();

  const dateKeys: { dateStr: string; key: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    dateKeys.push({ dateStr, key: `ai_cost:daily:${dateStr}` });
  }

  const values = await Promise.all(dateKeys.map(({ key }) => kv.get(key)));
  for (let i = 0; i < dateKeys.length; i++) {
    if (values[i] !== null) {
      costs.push({ date: dateKeys[i].dateStr, cost: values[i]! });
    }
  }

  return c.json({ costs });
});

// ---------------------------------------------------------------------------
// GET /audit-log — paginated list of admin_audit_log entries
// ---------------------------------------------------------------------------
adminRoutes.get("/audit-log", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const page = parsePage(c.req.query("page"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const { results } = await db
    .prepare(
      "SELECT id, admin_id, target_id, action, metadata_json, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit, offset)
    .all<{
      id: string;
      admin_id: string;
      target_id: string | null;
      action: string;
      metadata_json: string | null;
      created_at: number;
    }>();

  return c.json({
    entries: results.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      targetId: row.target_id,
      action: row.action,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: row.created_at,
    })),
    page,
  });
});
