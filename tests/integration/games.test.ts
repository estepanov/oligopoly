import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Minimal D1 stub that holds an in-memory rows map.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeDb(tables: Record<string, Row[]>) {
  const makeStmt = (query: string, boundParams: unknown[]) => ({
    bind: (...args: unknown[]) => makeStmt(query, args),
    async first<T>(): Promise<T | null> {
      const table = inferTable(query);
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
  });

  return {
    prepare: (query: string) => makeStmt(query, []),
  };
}

function inferTable(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match?.[1] ?? "";
}

function applyWhere(rows: Row[], query: string, params: unknown[]): Row[] {
  // Simple WHERE id = ? support
  const idMatch = query.match(/WHERE\s+id\s*=\s*\?/i);
  if (idMatch && params.length > 0) {
    return rows.filter((r) => r["id"] === params[0]);
  }

  // WHERE status = ?
  const statusMatch = query.match(/WHERE\s+status\s*=\s*\?/i);
  if (statusMatch && params.length > 0) {
    return rows.filter((r) => r["status"] === params[0]);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const PLAYER_A = "player-a";
const PLAYER_B = "player-b";

const activeGame: Row = {
  id: "game-active",
  status: "active",
  player_ids_json: JSON.stringify([PLAYER_A, PLAYER_B]),
  started_at: 1000,
  ended_at: null,
  winner_id: null,
  state_json: JSON.stringify({ gameId: "game-active", round: 3 }),
};

const completedGame: Row = {
  id: "game-done",
  status: "completed",
  player_ids_json: JSON.stringify([PLAYER_A, PLAYER_B]),
  started_at: 500,
  ended_at: 999,
  winner_id: PLAYER_A,
  state_json: null,
};

const logEntry: Row = {
  id: "log-1",
  game_id: "game-active",
  round: 1,
  player_id: PLAYER_A,
  action_type: "roll_dice",
  payload_json: JSON.stringify({ result: [3, 4] }),
  created_at: 1001,
};

const logEntryCompleted: Row = {
  id: "log-2",
  game_id: "game-done",
  round: 1,
  player_id: PLAYER_B,
  action_type: "buy_tile",
  payload_json: null,
  created_at: 501,
};

function makeEnv(extraTables: Record<string, Row[]> = {}) {
  return {
    DB: makeDb({
      games: [activeGame, completedGame],
      game_log: [logEntry, logEntryCompleted],
      ...extraTables,
    }),
  };
}

// ---------------------------------------------------------------------------
// GET /api/games
// ---------------------------------------------------------------------------
describe("GET /api/games", () => {
  it("returns an array of games", async () => {
    const res = await app.request("/api/games", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ games: unknown[] }>();
    expect(Array.isArray(body.games)).toBe(true);
  });

  it("returns empty array when DB is not bound", async () => {
    const res = await app.request("/api/games");
    expect(res.status).toBe(200);
    const body = await res.json<{ games: unknown[] }>();
    expect(body.games).toEqual([]);
  });

  it("returns 400 for an invalid ?status value", async () => {
    const res = await app.request("/api/games?status=invalid", {}, makeEnv());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id
// ---------------------------------------------------------------------------
describe("GET /api/games/:id", () => {
  it("returns 404 for an unknown game ID", async () => {
    const res = await app.request("/api/games/no-such-game", {}, makeEnv());
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Not found");
  });

  it("returns a game summary for a known ID", async () => {
    const res = await app.request("/api/games/game-active", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{
      id: string;
      status: string;
      playerCount: number;
    }>();
    expect(body.id).toBe("game-active");
    expect(body.status).toBe("active");
    expect(body.playerCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/state
// ---------------------------------------------------------------------------
describe("GET /api/games/:id/state", () => {
  it("returns 401 when no x-subject header", async () => {
    const res = await app.request("/api/games/game-active/state", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 403 when subject is not a player", async () => {
    const res = await app.request(
      "/api/games/game-active/state",
      { headers: { "x-subject": "outsider" } },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("returns state for a valid player", async () => {
    const res = await app.request(
      "/api/games/game-active/state",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ gameId: string; round: number }>();
    expect(body.gameId).toBe("game-active");
    expect(body.round).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/log
// ---------------------------------------------------------------------------
describe("GET /api/games/:id/log", () => {
  it("returns an array of log entries for a participant", async () => {
    const res = await app.request(
      "/api/games/game-active/log",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ log: unknown[] }>();
    expect(Array.isArray(body.log)).toBe(true);
  });

  it("returns 404 for an unknown game", async () => {
    const res = await app.request(
      "/api/games/no-such-game/log",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/replay
// ---------------------------------------------------------------------------
describe("GET /api/games/:id/replay", () => {
  it("returns 404 for an active (non-completed) game", async () => {
    const res = await app.request(
      "/api/games/game-active/replay",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown game", async () => {
    const res = await app.request(
      "/api/games/no-such-game/replay",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("returns replay log for a completed game", async () => {
    const res = await app.request(
      "/api/games/game-done/replay",
      { headers: { "x-subject": PLAYER_A } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ replay: unknown[] }>();
    expect(Array.isArray(body.replay)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/ws  and  /spectate
// ---------------------------------------------------------------------------
describe("WebSocket stubs", () => {
  it("GET /api/games/:id/ws returns 501", async () => {
    const res = await app.request("/api/games/game-active/ws");
    expect(res.status).toBe(501);
  });

  it("GET /api/games/:id/spectate returns 501", async () => {
    const res = await app.request("/api/games/game-active/spectate");
    expect(res.status).toBe(501);
  });
});
