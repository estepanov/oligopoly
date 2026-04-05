import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

/**
 * Minimal in-memory D1 stub that supports the queries used by lobby routes.
 * Stores rows in plain arrays and executes simple SQL matching.
 */
type Row = Record<string, unknown>;
type D1Stub = D1Database & { _tables: Record<string, Row[]> };

const createD1Stub = (): D1Stub => {
  const tables: Record<string, Row[]> = {
    users: [
      { id: "user-1", username: "user-1", role: "user" },
      { id: "user-2", username: "user-2", role: "user" },
      { id: "user-3", username: "user-3", role: "user" },
      { id: "user-4", username: "user-4", role: "user" },
    ],
    lobbies: [],
    lobby_players: [],
    games: [],
    game_log: [],
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
        turn_timeout,
        auction_bid_window,
        auction_settle_delay,
        auction_type,
        voice_video_enabled,
        spectator_mode,
        market_event_deck_json,
        optional_event_card_ids_json,
        currency_name,
        currency_symbol,
        currency_multiplier,
      ] = binds as [
        string,
        string,
        string,
        number,
        number,
        string,
        number,
        string,
        string,
        string,
        string,
        number,
        string,
        string | null,
        string,
        string,
        string,
        string,
      ];
      tables.lobbies.push({
        id,
        name,
        host_id,
        status: "waiting",
        max_players,
        is_private,
        optional_rule_ids_json,
        created_at,
        turn_timeout: turn_timeout ?? "5min",
        auction_bid_window: auction_bid_window ?? "1min",
        auction_settle_delay: auction_settle_delay ?? "30s",
        auction_type: auction_type ?? "sealed_bids",
        voice_video_enabled: voice_video_enabled ?? 0,
        spectator_mode: spectator_mode ?? "disabled",
        market_event_deck_json: market_event_deck_json ?? null,
        optional_event_card_ids_json: optional_event_card_ids_json ?? null,
        currency_name: currency_name ?? "Capital",
        currency_symbol: currency_symbol ?? "¤",
        currency_multiplier: currency_multiplier ?? "1",
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

    // SELECT * FROM lobby_players WHERE user_id = ?
    if (trimmed.startsWith("SELECT * FROM lobby_players WHERE user_id = ?")) {
      const rows = tables.lobby_players.filter((r) => r.user_id === binds[0]);
      return { results: rows };
    }

    // INSERT INTO games
    if (trimmed.startsWith("INSERT INTO games")) {
      const [id, lobby_id, started_at, player_ids_json, state_json] = binds as [
        string,
        string,
        number,
        string,
        string,
      ];
      tables.games.push({
        id,
        lobby_id,
        status: "active",
        started_at,
        ended_at: null,
        winner_id: null,
        player_ids_json,
        state_json,
      });
      return { results: [], success: true };
    }

    // INSERT INTO game_log
    if (trimmed.startsWith("INSERT INTO game_log")) {
      const [id, game_id, payload_json, created_at] = binds as [
        string,
        string,
        string,
        number,
      ];
      tables.game_log.push({
        id,
        game_id,
        round: 1,
        player_id: null,
        action_type: "game_started",
        payload_json,
        created_at,
      });
      return { results: [], success: true };
    }

    // UPDATE lobbies SET status = 'starting' WHERE id = ?
    if (trimmed.startsWith("UPDATE lobbies SET status = 'in_game'")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]);
      if (row) row.status = "in_game";
      return { results: [], success: true };
    }

    // SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?
    if (
      trimmed.startsWith(
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
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

    // DELETE FROM lobbies WHERE id = ?
    if (trimmed.startsWith("DELETE FROM lobbies WHERE id = ?")) {
      tables.lobbies = tables.lobbies.filter((r) => r.id !== binds[0]);
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

  return { prepare, batch, _tables: tables } as unknown as D1Stub;
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

const setLobbyStatus = (db: D1Stub, lobbyId: string, status: string) => {
  const lobby = db._tables.lobbies.find((row) => row.id === lobbyId);
  if (!lobby) {
    throw new Error(`Lobby ${lobbyId} not found`);
  }
  lobby.status = status;
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

  it("returns 409 when the user is already in 2 waiting lobbies", async () => {
    const db = createD1Stub();

    for (const name of ["Lobby One", "Lobby Two"]) {
      const res = await requestWithEnv("/api/lobbies", {
        method: "POST",
        headers: { "x-subject": "user-1" },
        body: {
          name,
          maxPlayers: 4,
          isPrivate: false,
          optionalRuleIds: [],
        },
        db,
      });
      expect(res.status).toBe(201);
    }

    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Lobby Three",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("membership_limit_reached");
  });

  it("ignores starting lobbies when enforcing the waiting-lobby limit", async () => {
    const db = createD1Stub();

    const waitingLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Waiting Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(waitingLobbyRes.status).toBe(201);

    const startingLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-2" },
      body: {
        name: "Starting Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(startingLobbyRes.status).toBe(201);
    const startingLobby = await startingLobbyRes.json();

    const joinRes = await requestWithEnv(
      `/api/lobbies/${startingLobby.id}/join`,
      {
        method: "POST",
        headers: { "x-subject": "user-1" },
        db,
      },
    );
    expect(joinRes.status).toBe(200);
    setLobbyStatus(db, startingLobby.id, "starting");

    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Second Waiting Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });

    expect(res.status).toBe(201);
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

describe("GET /api/lobbies/mine", () => {
  it("returns the waiting lobbies the current user is in", async () => {
    const db = createD1Stub();

    const hostLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Owned Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(hostLobbyRes.status).toBe(201);

    const joinedLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-2" },
      body: {
        name: "Joined Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const joinedLobby = await joinedLobbyRes.json();

    await requestWithEnv(`/api/lobbies/${joinedLobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });

    const res = await requestWithEnv("/api/lobbies/mine", {
      headers: { "x-subject": "user-1" },
      db,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lobbies).toHaveLength(2);
    expect(
      body.lobbies[0].players.some(
        (p: { userId: string; isAdmin: boolean }) =>
          p.userId === "user-1" && p.isAdmin,
      ),
    ).toBe(true);
    expect(
      body.lobbies[1].players.some(
        (p: { userId: string; isAdmin: boolean }) => p.userId === "user-1",
      ),
    ).toBe(true);
  });

  it("excludes starting lobbies from the current user's waiting lobby list", async () => {
    const db = createD1Stub();

    const waitingLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Waiting Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(waitingLobbyRes.status).toBe(201);

    const startingLobbyRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-2" },
      body: {
        name: "Starting Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(startingLobbyRes.status).toBe(201);
    const startingLobby = await startingLobbyRes.json();

    const joinRes = await requestWithEnv(
      `/api/lobbies/${startingLobby.id}/join`,
      {
        method: "POST",
        headers: { "x-subject": "user-1" },
        db,
      },
    );
    expect(joinRes.status).toBe(200);
    setLobbyStatus(db, startingLobby.id, "starting");

    const res = await requestWithEnv("/api/lobbies/mine", {
      headers: { "x-subject": "user-1" },
      db,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lobbies).toHaveLength(1);
    expect(body.lobbies[0].name).toBe("Waiting Lobby");
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

  it("returns 409 when joining a third waiting lobby", async () => {
    const db = createD1Stub();

    const lobbyARes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Lobby A",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobbyA = await lobbyARes.json();

    const lobbyBRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-3" },
      body: {
        name: "Lobby B",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobbyB = await lobbyBRes.json();

    const lobbyCRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-4" },
      body: {
        name: "Lobby C",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobbyC = await lobbyCRes.json();

    for (const lobbyId of [lobbyA.id, lobbyB.id]) {
      const joinRes = await requestWithEnv(`/api/lobbies/${lobbyId}/join`, {
        method: "POST",
        headers: { "x-subject": "user-2" },
        db,
      });
      expect(joinRes.status).toBe(200);
    }

    const res = await requestWithEnv(`/api/lobbies/${lobbyC.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-2" },
      db,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("membership_limit_reached");
  });
});

describe("DELETE /api/lobbies/:id/leave", () => {
  it("deletes the lobby when the last player leaves", async () => {
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

    const leaveRes = await requestWithEnv(`/api/lobbies/${lobby.id}/leave`, {
      method: "DELETE",
      headers: { "x-subject": "user-1" },
      db,
    });

    expect(leaveRes.status).toBe(200);
    const leaveBody = await leaveRes.json();
    expect(leaveBody.deleted).toBe(true);

    const fetchRes = await requestWithEnv(`/api/lobbies/${lobby.id}`, { db });
    expect(fetchRes.status).toBe(404);
  });

  it("transfers host/admin when the host leaves a non-empty lobby", async () => {
    const db = createD1Stub();
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Shared Lobby",
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

    const leaveRes = await requestWithEnv(`/api/lobbies/${lobby.id}/leave`, {
      method: "DELETE",
      headers: { "x-subject": "user-1" },
      db,
    });

    expect(leaveRes.status).toBe(200);
    const leaveBody = await leaveRes.json();
    expect(leaveBody.deleted).toBe(false);
    expect(leaveBody.lobby.hostId).toBe("user-2");
    expect(leaveBody.lobby.players).toHaveLength(1);
    expect(leaveBody.lobby.players[0].userId).toBe("user-2");
    expect(leaveBody.lobby.players[0].isAdmin).toBe(true);
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

  it("creates game and transitions lobby to in_game with 2+ players", async () => {
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
    expect(body.status).toBe("in_game");
    expect(typeof body.gameId).toBe("string");

    const gameRes = await requestWithEnv(`/api/games/${body.gameId}`, {
      method: "GET",
      db,
    });
    expect(gameRes.status).toBe(200);
    const game = await gameRes.json();
    expect(game.status).toBe("active");
    expect(game.playerCount).toBe(2);
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

// ---------------------------------------------------------------------------
// Enhanced lobby settings
// ---------------------------------------------------------------------------

describe("Enhanced lobby settings", () => {
  it("returns default settings when created with minimal input", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Defaults Lobby",
        maxPlayers: 4,
        isPrivate: false,
      },
      db,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turnTimeout).toBe("5min");
    expect(body.auctionType).toBe("sealed_bids");
    expect(body.auctionBidWindow).toBe("1min");
    expect(body.auctionSettleDelay).toBe("30s");
    expect(body.voiceVideoEnabled).toBe(false);
    expect(body.spectatorMode).toBe("disabled");
    expect(body.currencyName).toBe("Capital");
    expect(body.currencySymbol).toBe("¤");
    expect(body.currencyMultiplier).toBe("1");
    expect(body.optionalMarketEventCardIds).toEqual([]);
    expect(body.marketEventDeckCardIds).toBeNull();
  });

  it("persists custom settings on creation", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Custom Lobby",
        maxPlayers: 6,
        isPrivate: true,
        optionalRuleIds: ["speed_market"],
        turnTimeout: "30min",
        auctionBidWindow: "5min",
        auctionSettleDelay: "1min",
        auctionType: "live_bidding",
        voiceVideoEnabled: true,
        spectatorMode: "enabled",
        currencyName: "Credits",
        currencySymbol: "$",
        currencyMultiplier: "1000",
        optionalMarketEventCardIds: ["optional_leveraged_buyout"],
      },
      db,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turnTimeout).toBe("30min");
    expect(body.auctionType).toBe("live_bidding");
    expect(body.auctionBidWindow).toBe("5min");
    expect(body.voiceVideoEnabled).toBe(true);
    expect(body.spectatorMode).toBe("enabled");
    expect(body.currencyName).toBe("Credits");
    expect(body.currencySymbol).toBe("$");
    expect(body.currencyMultiplier).toBe("1000");
    expect(body.optionalMarketEventCardIds).toEqual([
      "optional_leveraged_buyout",
    ]);
  });
});

describe("Enhanced game start — proper initial state", () => {
  it("creates a game with enriched state_json including players and settings", async () => {
    const db = createD1Stub();
    // Create lobby
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Game Start Lobby",
        maxPlayers: 4,
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

    // Start the game
    const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.gameId).toBeDefined();

    // Fetch the game record to validate the stored state
    const gameRes = await requestWithEnv(`/api/games/${startBody.gameId}`, {
      method: "GET",
      db,
    });
    expect(gameRes.status).toBe(200);
    const game = await gameRes.json();
    expect(game.status).toBe("active");
    expect(game.playerCount).toBe(2);
  });

  it("stores enriched game_started log with affinity assignments", async () => {
    const db = createD1Stub();
    // Create lobby with speed_market rule
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Speed Market Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: ["speed_market"],
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

    // Start the game
    const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.gameId).toBeDefined();
    expect(startBody.status).toBe("in_game");
  });
});
