import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

/**
 * Minimal in-memory D1 stub that supports the queries used by lobby routes.
 * Stores rows in plain arrays and executes simple SQL matching.
 */
type Row = Record<string, unknown>;

const createD1Stub = () => {
  const tables: Record<string, Row[]> = {
    users: [
      { id: "user-1", username: "user-1", role: "user" },
      { id: "user-2", username: "user-2", role: "user" },
      { id: "user-3", username: "user-3", role: "user" },
    ],
    lobbies: [],
    lobby_players: [],
  };

  const execSql = (sql: string, binds: unknown[]) => {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    // INSERT INTO lobbies
    if (trimmed.startsWith("INSERT INTO lobbies")) {
      const [
        id,
        name,
        host_id,
        max_players,
        is_private,
        optional_rule_ids_json,
        created_at,
      ] = binds as [string, string, string, number, number, string, number];
      tables.lobbies.push({
        id,
        name,
        host_id,
        status: "waiting",
        max_players,
        is_private,
        optional_rule_ids_json,
        created_at,
      });
      return { results: [], success: true };
    }

    // INSERT INTO lobby_players
    if (trimmed.startsWith("INSERT INTO lobby_players")) {
      if (binds.length === 4) {
        const [lobby_id, user_id, is_admin, joined_at] = binds as [
          string,
          string,
          number,
          number,
        ];
        tables.lobby_players.push({
          lobby_id,
          user_id,
          is_admin,
          joined_at,
        });
      } else {
        // VALUES (?, ?, 1, ?) — is_admin hardcoded in SQL
        const [lobby_id, user_id, joined_at] = binds as [
          string,
          string,
          number,
        ];
        const isAdmin = trimmed.includes(", 1,") ? 1 : 0;
        tables.lobby_players.push({
          lobby_id,
          user_id,
          is_admin: isAdmin,
          joined_at,
        });
      }
      return { results: [], success: true };
    }

    // SELECT * FROM lobbies WHERE id = ?
    if (trimmed.startsWith("SELECT * FROM lobbies WHERE id = ?")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT * FROM lobbies WHERE status = 'waiting' AND is_private = 0 ... ORDER BY
    if (
      trimmed.includes(
        "FROM lobbies WHERE status = 'waiting' AND is_private = 0",
      ) &&
      trimmed.includes("ORDER BY")
    ) {
      const limit = binds[binds.length - 1] as number;
      let rows = tables.lobbies.filter(
        (r) => r.status === "waiting" && r.is_private === 0,
      );
      if (binds.length === 4) {
        // Compound cursor: (created_at < ? OR (created_at = ? AND id < ?))
        const cursorTime = binds[0] as number;
        const cursorId = binds[2] as string;
        rows = rows.filter(
          (r) =>
            (r.created_at as number) < cursorTime ||
            ((r.created_at as number) === cursorTime &&
              (r.id as string) < cursorId),
        );
      }
      rows.sort((a, b) => {
        const timeDiff = (b.created_at as number) - (a.created_at as number);
        if (timeDiff !== 0) return timeDiff;
        return (b.id as string) < (a.id as string) ? -1 : 1;
      });
      return { results: rows.slice(0, limit) };
    }

    // SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?
    if (
      trimmed.startsWith(
        "SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?",
      )
    ) {
      const row =
        tables.lobby_players.find(
          (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
        ) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT * FROM lobby_players WHERE lobby_id = ?
    if (trimmed.startsWith("SELECT * FROM lobby_players WHERE lobby_id = ?")) {
      const rows = tables.lobby_players.filter((r) => r.lobby_id === binds[0]);
      return { results: rows };
    }

    // UPDATE lobbies SET status = 'starting' WHERE id = ?
    if (trimmed.startsWith("UPDATE lobbies SET status = 'starting'")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]);
      if (row) row.status = "starting";
      return { results: [], success: true };
    }

    // UPDATE lobbies SET ... WHERE id = ? (settings update)
    if (trimmed.startsWith("UPDATE lobbies SET")) {
      const id = binds[binds.length - 1];
      const row = tables.lobbies.find((r) => r.id === id);
      if (row) {
        const setPart = trimmed.match(/SET (.+?) WHERE/)?.[1] ?? "";
        const fields = setPart.split(",").map((f) => f.trim().split(" = ")[0]);
        for (let i = 0; i < fields.length; i++) {
          row[fields[i]] = binds[i];
        }
      }
      return { results: [], success: true };
    }

    // UPDATE lobby_players SET is_admin = 1
    if (trimmed.startsWith("UPDATE lobby_players SET is_admin = 1")) {
      const row = tables.lobby_players.find(
        (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
      );
      if (row) row.is_admin = 1;
      return { results: [], success: true };
    }

    // DELETE FROM lobby_players
    if (trimmed.startsWith("DELETE FROM lobby_players")) {
      tables.lobby_players = tables.lobby_players.filter(
        (r) => !(r.lobby_id === binds[0] && r.user_id === binds[1]),
      );
      return { results: [], success: true };
    }

    // SELECT id, role FROM users WHERE id = ? (authSubjectMiddleware)
    if (trimmed.startsWith("SELECT id, role FROM users WHERE id = ?")) {
      const row = tables.users.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT COUNT(*) as cnt FROM lobby_players WHERE lobby_id = ?
    if (trimmed.includes("COUNT(*)")) {
      const rows = tables.lobby_players.filter((r) => r.lobby_id === binds[0]);
      return { results: [{ cnt: rows.length }], first: { cnt: rows.length } };
    }

    return { results: [] };
  };

  const prepare = (sql: string) => {
    let boundValues: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        boundValues = args;
        return stmt;
      },
      run: async () => execSql(sql, boundValues),
      all: async <T>() => {
        const result = execSql(sql, boundValues);
        return { results: result.results as T[] };
      },
      first: async <T>() => {
        const result = execSql(sql, boundValues);
        return (result.first ?? result.results[0] ?? null) as T | null;
      },
      _exec: () => execSql(sql, boundValues),
    };
    return stmt;
  };

  const batch = async (stmts: unknown[]) => {
    return stmts.map((s) => {
      const stmt = s as { _exec: () => { results: unknown[] } };
      return stmt._exec();
    });
  };

  return { prepare, batch } as unknown as D1Database;
};

const createKvStub = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    _store: store,
  } as unknown as KVNamespace;
};

const requestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    db?: D1Database;
    kv?: KVNamespace;
  } = {},
) => {
  const { method = "GET", headers = {}, body, db, kv } = options;
  const init: RequestInit = { method, headers: { ...headers } };
  if (body) {
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, {
    ALLOWED_ORIGINS: "http://localhost:5173",
    DB: db,
    KV: kv,
  });
};

describe("POST /api/lobbies", () => {
  it("returns 201 with created lobby", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Test Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Test Lobby");
    expect(body.maxPlayers).toBe(4);
    expect(body.hostId).toBe("user-1");
    expect(body.status).toBe("waiting");
    expect(body.players).toHaveLength(1);
    expect(body.players[0].userId).toBe("user-1");
    expect(body.players[0].isAdmin).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      body: {
        name: "Test",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/lobbies", () => {
  it("returns array of public lobbies", async () => {
    const db = createD1Stub();
    // Create a public lobby first
    await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Public Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const res = await requestWithEnv("/api/lobbies", { db });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lobbies).toBeInstanceOf(Array);
    expect(body.lobbies.length).toBe(1);
    expect(body.lobbies[0].name).toBe("Public Lobby");
  });
});

describe("POST /api/lobbies/:id/join", () => {
  it("returns 409 when lobby is full", async () => {
    const db = createD1Stub();
    // Create a lobby with maxPlayers = 2
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Small Lobby",
        maxPlayers: 2,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobby = await createRes.json();

    // Second player joins
    await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-2" },
      db,
    });

    // Third player tries to join — should be full
    const res = await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-3" },
      db,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("full");
  });
});

describe("POST /api/lobbies/:id/start", () => {
  it("returns 409 when only 1 player", async () => {
    const db = createD1Stub();
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Solo Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobby = await createRes.json();

    const res = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("not_enough_players");
  });

  it("transitions to starting with 2+ players", async () => {
    const db = createD1Stub();
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Ready Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobby = await createRes.json();

    await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-2" },
      db,
    });

    const res = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("starting");
  });
});

describe("POST /api/lobbies/:id/invite + join/:token", () => {
  it("generates invite token and allows joining private lobby", async () => {
    const db = createD1Stub();
    const kv = createKvStub();

    // Create a private lobby
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Private Lobby",
        maxPlayers: 4,
        isPrivate: true,
        optionalRuleIds: [],
      },
      db,
      kv,
    });
    const lobby = await createRes.json();
    expect(createRes.status).toBe(201);

    // Generate invite token
    const inviteRes = await requestWithEnv(`/api/lobbies/${lobby.id}/invite`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
      kv,
    });
    expect(inviteRes.status).toBe(200);
    const inviteBody = await inviteRes.json();
    expect(inviteBody.token).toBeDefined();

    // Join via token
    const joinRes = await requestWithEnv(
      `/api/lobbies/${lobby.id}/join/${inviteBody.token}`,
      {
        method: "POST",
        headers: { "x-subject": "user-2" },
        db,
        kv,
      },
    );
    expect(joinRes.status).toBe(200);
    const joinBody = await joinRes.json();
    expect(joinBody.players).toHaveLength(2);
  });
});

describe("GET /api/lobbies/:id/ws", () => {
  it("returns 501 stub", async () => {
    const res = await requestWithEnv("/api/lobbies/some-id/ws");
    expect(res.status).toBe(501);
  });
});
