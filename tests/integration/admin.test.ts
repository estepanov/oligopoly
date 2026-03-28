import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "../../packages/worker/src/routes/admin";

// ---------------------------------------------------------------------------
// Minimal D1 stub
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeDb(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[]> = {};

  const makeStmt = (query: string, boundParams: unknown[]) => ({
    bind: (...args: unknown[]) => makeStmt(query, args),
    async first<T>(): Promise<T | null> {
      const table = inferTable(query);

      // Handle COUNT(*) queries
      if (query.includes("COUNT(*)")) {
        const rows = tables[table] ?? [];
        const filtered = applyWhere(rows, query, boundParams);
        return { count: filtered.length } as T;
      }

      const rows = tables[table] ?? [];
      const filtered = applyWhere(rows, query, boundParams);
      return (filtered[0] as T) ?? null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      const table = inferTable(query);
      const rows = tables[table] ?? [];
      const filtered = applyWhere(rows, query, boundParams);
      return { results: filtered as T[] };
    },
    async run(): Promise<void> {
      // Track INSERT operations for audit log verification
      if (query.startsWith("INSERT INTO")) {
        const table = inferTable(query);
        if (!inserted[table]) {
          inserted[table] = [];
        }
        inserted[table].push(
          Object.fromEntries(boundParams.map((v, i) => [`param_${i}`, v])),
        );
      }
    },
  });

  return {
    prepare: (query: string) => makeStmt(query, []),
    _inserted: inserted,
  };
}

function inferTable(query: string): string {
  const fromMatch = query.match(/FROM\s+(\w+)/i);
  if (fromMatch) return fromMatch[1];
  const intoMatch = query.match(/INTO\s+(\w+)/i);
  if (intoMatch) return intoMatch[1];
  return "";
}

function applyWhere(rows: Row[], query: string, params: unknown[]): Row[] {
  const idMatch = query.match(/WHERE\s+id\s*=\s*\?/i);
  if (idMatch && params.length > 0) {
    return rows.filter((r) => r.id === params[0]);
  }

  const gameIdMatch = query.match(/WHERE\s+game_id\s*=\s*\?/i);
  if (gameIdMatch && params.length > 0) {
    return rows.filter((r) => r.game_id === params[0]);
  }

  const statusMatch = query.match(/WHERE\s+status\s*=\s*'(\w+)'/i);
  if (statusMatch) {
    return rows.filter((r) => r.status === statusMatch[1]);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Minimal KV stub
// ---------------------------------------------------------------------------
function makeKv(store: Record<string, string> = {}) {
  return {
    get: async (key: string) => store[key] ?? null,
    put: async (key: string, value: string) => {
      store[key] = value;
    },
    delete: async (key: string) => {
      delete store[key];
    },
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const USER_A: Row = {
  id: "user-a",
  username: "alice",
  avatar_url: null,
  full_name: "Alice Admin",
  email: "alice@example.com",
  locale: "en",
  timezone: "UTC",
  currency: "USD",
  country: "US",
  theme_preference: "dark",
  created_at: 1000,
  updated_at: 1000,
};

const USER_B: Row = {
  id: "user-b",
  username: "bob",
  avatar_url: null,
  full_name: "Bob Regular",
  email: "bob@example.com",
  locale: "en",
  timezone: "UTC",
  currency: "EUR",
  country: "DE",
  theme_preference: "system",
  created_at: 2000,
  updated_at: 2000,
};

const GAME_A: Row = {
  id: "game-a",
  status: "active",
  player_ids_json: JSON.stringify(["user-a", "user-b"]),
  started_at: 3000,
  ended_at: null,
  winner_id: null,
  state_json: JSON.stringify({ gameId: "game-a", round: 5 }),
};

const LOG_ENTRY: Row = {
  id: "log-1",
  game_id: "game-a",
  round: 1,
  player_id: "user-a",
  action_type: "roll_dice",
  payload_json: JSON.stringify({ result: [2, 3] }),
  created_at: 3001,
};

const AUDIT_ENTRY: Row = {
  id: "audit-1",
  admin_id: "admin-user",
  target_id: "user-b",
  action: "ban_user",
  metadata_json: null,
  created_at: 5000,
};

function makeEnv(overrides: { kvStore?: Record<string, string> } = {}) {
  const kvStore = overrides.kvStore ?? {};
  return {
    DB: makeDb({
      users: [USER_A, USER_B],
      games: [GAME_A],
      game_log: [LOG_ENTRY],
      admin_audit_log: [AUDIT_ENTRY],
    }),
    KV: makeKv(kvStore),
  };
}

// ---------------------------------------------------------------------------
// Helper to make admin requests
// ---------------------------------------------------------------------------
type WrapperEnv = {
  Bindings: { DB?: D1Database; KV?: KVNamespace };
  Variables: { userId?: string; userRole?: string };
};

function adminRequest(
  path: string,
  options: {
    method?: string;
    env?: ReturnType<typeof makeEnv>;
    role?: string;
    userId?: string;
  } = {},
) {
  const env = options.env ?? makeEnv();
  const method = options.method ?? "GET";
  const { role, userId } = options;

  const wrapper = new Hono<WrapperEnv>();

  wrapper.use("*", async (c, next) => {
    if (role !== undefined) {
      c.set("userRole", role);
    }
    if (userId !== undefined) {
      c.set("userId", userId);
    }
    await next();
  });

  wrapper.route("/api/admin", adminRoutes);

  return wrapper.request(path, { method }, env);
}

// ---------------------------------------------------------------------------
// Tests: requireAdmin middleware
// ---------------------------------------------------------------------------
describe("requireAdmin middleware", () => {
  it("returns 401 when no auth adapter is configured (no userRole set)", async () => {
    const res = await adminRequest("/api/admin/users", {
      role: undefined,
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("not configured");
  });

  it("returns 403 when user is not a global_admin", async () => {
    const res = await adminRequest("/api/admin/users", {
      role: "regular",
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Forbidden");
  });

  it("allows access for global_admin role", async () => {
    const res = await adminRequest("/api/admin/users", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/users
// ---------------------------------------------------------------------------
describe("GET /api/admin/users", () => {
  it("returns paginated user list", async () => {
    const res = await adminRequest("/api/admin/users", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ users: unknown[]; page: number }>();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/users/:id
// ---------------------------------------------------------------------------
describe("GET /api/admin/users/:id", () => {
  it("returns full user record for known ID", async () => {
    const res = await adminRequest("/api/admin/users/user-a", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ id: string; email: string | null }>();
    expect(body.id).toBe("user-a");
    expect(body.email).toBe("alice@example.com");
  });

  it("returns 404 for unknown user", async () => {
    const res = await adminRequest("/api/admin/users/nonexistent", {
      role: "global_admin",
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/admin/users/:id/ban
// ---------------------------------------------------------------------------
describe("POST /api/admin/users/:id/ban", () => {
  it("sets ban flag in KV", async () => {
    const kvStore: Record<string, string> = {};
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/user-b/ban", {
      method: "POST",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(200);
    expect(kvStore["ban:user-b"]).toBe("1");
  });

  it("returns 400 when admin tries to ban themselves", async () => {
    const kvStore: Record<string, string> = {};
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/admin-user/ban", {
      method: "POST",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Cannot ban yourself");
    expect(kvStore["ban:admin-user"]).toBeUndefined();
  });

  it("returns 404 when banning a nonexistent user", async () => {
    const kvStore: Record<string, string> = {};
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/nonexistent/ban", {
      method: "POST",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(404);
    expect(kvStore["ban:nonexistent"]).toBeUndefined();
  });

  it("writes audit log entry on ban", async () => {
    const kvStore: Record<string, string> = {};
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/user-b/ban", {
      method: "POST",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(200);

    // Verify audit log was written
    const db = env.DB as ReturnType<typeof makeDb>;
    const auditInserts = db._inserted.admin_audit_log;
    expect(auditInserts).toBeDefined();
    expect(auditInserts.length).toBeGreaterThan(0);

    // Check that the last audit entry contains the expected action
    const lastEntry = auditInserts[auditInserts.length - 1];
    expect(lastEntry.param_1).toBe("admin-user"); // admin_id
    expect(lastEntry.param_2).toBe("user-b"); // target_id
    expect(lastEntry.param_3).toBe("ban_user"); // action
  });
});

// ---------------------------------------------------------------------------
// Tests: DELETE /api/admin/users/:id/ban
// ---------------------------------------------------------------------------
describe("DELETE /api/admin/users/:id/ban", () => {
  it("removes ban flag from KV", async () => {
    const kvStore: Record<string, string> = { "ban:user-b": "1" };
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/user-b/ban", {
      method: "DELETE",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(200);
    expect(kvStore["ban:user-b"]).toBeUndefined();
  });

  it("returns 404 when unbanning a nonexistent user", async () => {
    const kvStore: Record<string, string> = { "ban:nonexistent": "1" };
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/nonexistent/ban", {
      method: "DELETE",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(404);
    // KV should remain untouched
    expect(kvStore["ban:nonexistent"]).toBe("1");
  });

  it("writes audit log entry on unban", async () => {
    const kvStore: Record<string, string> = { "ban:user-b": "1" };
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/users/user-b/ban", {
      method: "DELETE",
      env,
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(200);

    const db = env.DB as ReturnType<typeof makeDb>;
    const auditInserts = db._inserted.admin_audit_log;
    expect(auditInserts).toBeDefined();
    expect(auditInserts.length).toBeGreaterThan(0);

    const lastEntry = auditInserts[auditInserts.length - 1];
    expect(lastEntry.param_3).toBe("unban_user");
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/admin/users/:id/impersonate
// ---------------------------------------------------------------------------
describe("POST /api/admin/users/:id/impersonate", () => {
  it("returns 501 (hosted-only feature)", async () => {
    const res = await adminRequest("/api/admin/users/user-b/impersonate", {
      method: "POST",
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(501);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/admin/users/:id/sessions
// ---------------------------------------------------------------------------
describe("POST /api/admin/users/:id/sessions", () => {
  it("returns 501 (hosted-only feature)", async () => {
    const res = await adminRequest("/api/admin/users/user-b/sessions", {
      method: "POST",
      role: "global_admin",
      userId: "admin-user",
    });
    expect(res.status).toBe(501);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/games
// ---------------------------------------------------------------------------
describe("GET /api/admin/games", () => {
  it("returns paginated games list", async () => {
    const res = await adminRequest("/api/admin/games", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ games: unknown[]; page: number }>();
    expect(Array.isArray(body.games)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/games/:id
// ---------------------------------------------------------------------------
describe("GET /api/admin/games/:id", () => {
  it("returns full game record with log", async () => {
    const res = await adminRequest("/api/admin/games/game-a", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      id: string;
      log: unknown[];
    }>();
    expect(body.id).toBe("game-a");
    expect(Array.isArray(body.log)).toBe(true);
  });

  it("returns 404 for unknown game", async () => {
    const res = await adminRequest("/api/admin/games/nonexistent", {
      role: "global_admin",
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/analytics
// ---------------------------------------------------------------------------
describe("GET /api/admin/analytics", () => {
  it("returns aggregate stats", async () => {
    const res = await adminRequest("/api/admin/analytics", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      totalUsers: number;
      totalGames: number;
      activeGames: number;
    }>();
    expect(typeof body.totalUsers).toBe("number");
    expect(typeof body.totalGames).toBe("number");
    expect(typeof body.activeGames).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/analytics/costs
// ---------------------------------------------------------------------------
describe("GET /api/admin/analytics/costs", () => {
  it("returns cost data from KV", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const kvStore: Record<string, string> = {
      [`ai_cost:daily:${today}`]: "12.50",
    };
    const env = makeEnv({ kvStore });

    const res = await adminRequest("/api/admin/analytics/costs", {
      role: "global_admin",
      env,
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      costs: { date: string; cost: string }[];
    }>();
    expect(Array.isArray(body.costs)).toBe(true);
    expect(body.costs.length).toBeGreaterThan(0);
    expect(body.costs[0].date).toBe(today);
    expect(body.costs[0].cost).toBe("12.50");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/admin/audit-log
// ---------------------------------------------------------------------------
describe("GET /api/admin/audit-log", () => {
  it("returns paginated audit log entries", async () => {
    const res = await adminRequest("/api/admin/audit-log", {
      role: "global_admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      entries: unknown[];
      page: number;
    }>();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.page).toBe(1);
  });
});
