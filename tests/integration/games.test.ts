import { GameErrorKeys } from "@oligopoly/validation";
import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Minimal D1 stub that holds an in-memory rows map.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type DbOptions = {
  forceStateConflictOnStateUpdate?: boolean;
};

function makeDb(tables: Record<string, Row[]>, options: DbOptions = {}) {
  const mutationState = {
    lastChanges: 0,
    forceStateConflictOnStateUpdate:
      options.forceStateConflictOnStateUpdate ?? false,
  };
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
    async run(): Promise<{ success: boolean; meta: { changes: number } }> {
      const changes = applyMutation(query, boundParams, tables, mutationState);
      return { success: true, meta: { changes } };
    },
  });

  return {
    prepare: (query: string) => makeStmt(query, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      const out: unknown[] = [];
      for (const s of stmts) {
        out.push(await s.run());
      }
      return out;
    },
  };
}

function inferTable(query: string): string {
  const from = query.match(/FROM\s+(\w+)/i);
  if (from) {
    return from[1];
  }
  const upd = query.match(/UPDATE\s+(\w+)/i);
  if (upd) {
    return upd[1];
  }
  const ins = query.match(/INTO\s+(\w+)/i);
  if (ins) {
    return ins[1];
  }
  return "";
}

function applyMutation(
  query: string,
  params: unknown[],
  tables: Record<string, Row[]>,
  mutationState: {
    lastChanges: number;
    forceStateConflictOnStateUpdate: boolean;
  },
): number {
  if (
    /INSERT\s+INTO\s+games\s+\(id,\s*started_at,\s*player_ids_json\)\s+SELECT/i.test(
      query,
    )
  ) {
    const row = tables.games?.find((r) => r.id === params[0]);
    if (row && mutationState.lastChanges === 0) {
      throw new Error("UNIQUE constraint failed: games.id");
    }
    return 0;
  }

  if (/UPDATE\s+games/i.test(query) && /state_json/i.test(query)) {
    const stateJson = params[0];
    const id = params[1];
    const expectedStateJson = /AND\s+state_json\s*=\s*\?/i.test(query)
      ? params[2]
      : undefined;
    if (
      expectedStateJson !== undefined &&
      mutationState.forceStateConflictOnStateUpdate
    ) {
      mutationState.forceStateConflictOnStateUpdate = false;
      const conflictedRow = tables.games?.find((r) => r.id === id);
      if (conflictedRow) {
        conflictedRow.state_json = JSON.stringify({ gameId: id, round: 99 });
      }
    }
    const row = tables.games?.find(
      (r) =>
        r.id === id &&
        (expectedStateJson === undefined || r.state_json === expectedStateJson),
    );
    if (row) {
      row.state_json = stateJson;
      mutationState.lastChanges = 1;
      return 1;
    }
    mutationState.lastChanges = 0;
    return 0;
  }

  if (/INSERT\s+INTO\s+game_log/i.test(query)) {
    // Guarded inserts append [gameId, stateJson] for the EXISTS predicate; they
    // must no-op when the games row was not advanced to that state (lost race).
    const guarded = appliedGuardPresent(query);
    if (guarded && !appliedGuardSatisfied(tables, params)) {
      return 0;
    }
    const [
      id,
      game_id,
      round,
      player_id,
      action_type,
      payload_json,
      created_at,
    ] = params;
    tables.game_log.push({
      id,
      game_id,
      round,
      player_id,
      action_type,
      payload_json,
      created_at,
    });
    return 1;
  }

  if (/UPDATE\s+lobbies\s+SET\s+status\s*=\s*'finished'/i.test(query)) {
    if (appliedGuardPresent(query) && !appliedGuardSatisfied(tables, params)) {
      return 0;
    }
    const lobbyId = /SELECT\s+lobby_id\s+FROM\s+games/i.test(query)
      ? tables.games?.find((r) => r.id === params[0])?.lobby_id
      : params[0];
    const row = tables.lobbies?.find((r) => r.id === lobbyId);
    if (row) {
      row.status = "finished";
      return 1;
    }
    return 0;
  }

  return 0;
}

function appliedGuardPresent(query: string): boolean {
  return /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+games\s+WHERE\s+id\s*=\s*\?\s+AND\s+state_json\s*=\s*\?\s*\)/i.test(
    query,
  );
}

// The guard binds [gameId, stateJson] are always the last two params.
function appliedGuardSatisfied(
  tables: Record<string, Row[]>,
  params: unknown[],
): boolean {
  const stateJson = params[params.length - 1];
  const gameId = params[params.length - 2];
  return (tables.games ?? []).some(
    (r) => r.id === gameId && r.state_json === stateJson,
  );
}

function applyWhere(rows: Row[], query: string, params: unknown[]): Row[] {
  // Simple WHERE id = ? support
  const idMatch = query.match(/WHERE\s+id\s*=\s*\?/i);
  if (idMatch && params.length > 0) {
    return rows.filter((r) => r.id === params[0]);
  }

  // WHERE status = ?
  const statusMatch = query.match(/WHERE\s+status\s*=\s*\?/i);
  if (statusMatch && params.length > 0) {
    return rows.filter((r) => r.status === params[0]);
  }

  const tokenMatch = query.match(/WHERE\s+(?:s\.)?token\s*=\s*\?/i);
  if (tokenMatch && params.length > 0) {
    return rows.filter(
      (r) =>
        r.token === params[0] &&
        (typeof r.expires_at !== "number" ||
          typeof params[1] !== "number" ||
          r.expires_at > params[1]),
    );
  }

  const gameIdMatch = query.match(/WHERE\s+game_id\s*=\s*\?/i);
  if (gameIdMatch && params.length > 0) {
    return rows.filter((r) => r.game_id === params[0]);
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

function cloneRow<T extends Row>(r: T): T {
  return JSON.parse(JSON.stringify(r)) as T;
}

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

const userA: Row = {
  id: PLAYER_A,
  username: "player-a",
  role: "user",
};

const userB: Row = {
  id: PLAYER_B,
  username: "player-b",
  role: "user",
};

const outsiderUser: Row = {
  id: "outsider",
  username: "outsider",
  role: "user",
};

function makeEnv(extraTables: Record<string, Row[]> = {}) {
  return {
    DB: makeDb({
      users: [cloneRow(userA), cloneRow(userB), cloneRow(outsiderUser)],
      auth_sessions: [],
      games: [cloneRow(activeGame), cloneRow(completedGame)],
      game_log: [cloneRow(logEntry), cloneRow(logEntryCompleted)],
      ...extraTables,
    }),
  };
}

function makeEnvWithOptions(
  extraTables: Record<string, Row[]>,
  options: DbOptions,
) {
  return {
    DB: makeDb(
      {
        users: [cloneRow(userA), cloneRow(userB), cloneRow(outsiderUser)],
        auth_sessions: [],
        games: [cloneRow(activeGame), cloneRow(completedGame)],
        game_log: [cloneRow(logEntry), cloneRow(logEntryCompleted)],
        ...extraTables,
      },
      options,
    ),
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
    const res = await app.request(
      "/api/games/game-active/state",
      {},
      makeEnv(),
    );
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

  // ADV-1: private trade terms must reach only the proposer/recipient — never
  // other participants of the same game.
  it("hides private trade log entries from non-party participants", async () => {
    const threePlayerGame: Row = {
      id: "game-trade",
      status: "active",
      player_ids_json: JSON.stringify([PLAYER_A, PLAYER_B, "player-c"]),
      started_at: 1000,
      ended_at: null,
      winner_id: null,
      state_json: JSON.stringify({ gameId: "game-trade", round: 1 }),
    };
    const tradeLog: Row = {
      id: "log-trade",
      game_id: "game-trade",
      round: 1,
      player_id: PLAYER_A,
      action_type: "trade_proposed",
      payload_json: JSON.stringify({
        offerId: "trade-1",
        proposerId: PLAYER_A,
        recipientId: PLAYER_B,
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
        status: "pending",
      }),
      created_at: 1001,
    };
    const env = makeEnv({
      games: [cloneRow(threePlayerGame)],
      game_log: [cloneRow(tradeLog)],
      users: [
        cloneRow(userA),
        cloneRow(userB),
        { id: "player-c", username: "player-c", role: "user" },
      ],
    });

    // A participant in the trade sees the full entry.
    const partyRes = await app.request(
      "/api/games/game-trade/log",
      { headers: { "x-subject": PLAYER_B } },
      env,
    );
    const partyBody = await partyRes.json<{
      log: Array<{ actionType: string; payload: Record<string, unknown> }>;
    }>();
    expect(partyBody.log).toHaveLength(1);
    expect(partyBody.log[0].payload.gives).toBeDefined();

    // A non-party participant must NOT see the entry or its terms.
    const outsiderRes = await app.request(
      "/api/games/game-trade/log",
      { headers: { "x-subject": "player-c" } },
      env,
    );
    const outsiderBody = await outsiderRes.json<{ log: unknown[] }>();
    expect(outsiderBody.log).toEqual([]);
    expect(JSON.stringify(outsiderBody)).not.toContain("gives");
    expect(JSON.stringify(outsiderBody)).not.toContain("receives");
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

describe("POST /api/games/:id/action", () => {
  it("returns 409 for optimistic state conflicts", async () => {
    const conflictGame: Row = {
      id: "game-conflict",
      status: "active",
      player_ids_json: JSON.stringify([PLAYER_A, PLAYER_B]),
      started_at: 2000,
      ended_at: null,
      winner_id: null,
      state_json: JSON.stringify({
        gameId: "game-conflict",
        round: 1,
        phase: "action",
        currentPlayerIndex: 0,
        turnOrder: [PLAYER_A, PLAYER_B],
        freeMarketPool: 0,
        pendingBuyTilePosition: null,
        lastDiceRoll: null,
        winnerId: null,
        eliminatedPlayerIds: [],
        settings: { currencySymbol: "$" },
        players: [
          {
            playerId: PLAYER_A,
            position: 0,
            capital: 1000,
            ownedTilePositions: [3],
            mortgagedTilePositions: [],
            developmentTokens: {},
            trustworthiness: 7,
            actionPointsRemaining: 2,
            inRegulation: false,
            doublesCount: 0,
            isOnDiagonal: false,
          },
          {
            playerId: PLAYER_B,
            position: 0,
            capital: 900,
            ownedTilePositions: [6],
            mortgagedTilePositions: [],
            developmentTokens: {},
            trustworthiness: 7,
            actionPointsRemaining: 2,
            inRegulation: false,
            doublesCount: 0,
            isOnDiagonal: false,
          },
        ],
        tiles: [
          {
            position: 3,
            ownerId: PLAYER_A,
            mortgaged: false,
            developmentTokens: 0,
          },
          {
            position: 6,
            ownerId: PLAYER_B,
            mortgaged: false,
            developmentTokens: 0,
          },
        ],
      }),
    };
    const env = makeEnvWithOptions(
      { games: [conflictGame], game_log: [] },
      { forceStateConflictOnStateUpdate: true },
    );

    const res = await app.request(
      "/api/games/game-conflict/action",
      {
        method: "POST",
        headers: {
          "x-subject": PLAYER_A,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "propose_trade",
          recipientId: PLAYER_B,
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
        }),
      },
      env,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: GameErrorKeys.STATE_CONFLICT,
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/ws  and  /spectate
// ---------------------------------------------------------------------------
describe("WebSocket upgrades", () => {
  it("GET /api/games/:id/ws requires a WebSocket upgrade", async () => {
    const res = await app.request("/api/games/game-active/ws");
    expect(res.status).toBe(426);
  });

  it("GET /api/games/:id/spectate requires a WebSocket upgrade", async () => {
    const res = await app.request("/api/games/game-active/spectate");
    expect(res.status).toBe(426);
  });

  it("GET /api/games/:id/ws requires an authenticated player for upgrades", async () => {
    const res = await app.request(
      "/api/games/game-active/ws",
      { headers: { Upgrade: "websocket" } },
      makeEnv(),
    );

    expect(res.status).toBe(401);
  });

  it("GET /api/games/:id/ws rejects an outsider access_token for upgrades", async () => {
    const res = await app.request(
      "/api/games/game-active/ws?access_token=outsider-token",
      { headers: { Upgrade: "websocket" } },
      makeEnv({
        auth_sessions: [
          {
            token: "outsider-token",
            user_id: "outsider",
            role: "user",
            expires_at: Date.now() + 60_000,
          },
        ],
      }),
    );

    expect(res.status).toBe(403);
  });

  it("GET /api/games/:id/spectate rejects upgrades when spectator mode is disabled", async () => {
    const res = await app.request(
      "/api/games/game-active/spectate",
      { headers: { Upgrade: "websocket" } },
      makeEnv(),
    );

    expect(res.status).toBe(403);
  });
});

describe("POST /api/games/:id/ai/step", () => {
  it("applies one deterministic AI action when the current player is AI", async () => {
    const aiGame = {
      id: "game-ai",
      status: "active",
      player_ids_json: JSON.stringify(["ai:bot", PLAYER_A]),
      started_at: 2000,
      ended_at: null,
      winner_id: null,
      state_json: JSON.stringify({
        gameId: "game-ai",
        round: 1,
        phase: "waiting_for_roll",
        currentPlayerIndex: 0,
        turnOrder: ["ai:bot", PLAYER_A],
        freeMarketPool: 0,
        affinityAssignments: {},
        aiPlayers: [
          { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
        ],
        players: [
          {
            playerId: "ai:bot",
            kind: "ai",
            aiPersonality: "opportunist",
            position: 0,
            capital: 1500,
            ownedTilePositions: [],
            mortgagedTilePositions: [],
            developmentTokens: {},
            trustworthiness: 7,
            actionPointsRemaining: 2,
            inRegulation: false,
            doublesCount: 0,
            isOnDiagonal: false,
          },
          {
            playerId: PLAYER_A,
            kind: "human",
            position: 0,
            capital: 1500,
            ownedTilePositions: [],
            mortgagedTilePositions: [],
            developmentTokens: {},
            trustworthiness: 7,
            actionPointsRemaining: 0,
            inRegulation: false,
            doublesCount: 0,
            isOnDiagonal: false,
          },
        ],
        tiles: [],
        pendingBuyTilePosition: null,
        lastDiceRoll: null,
        winnerId: null,
        eliminatedPlayerIds: [],
        settings: {},
      }),
    };
    const env = makeEnv({ games: [aiGame], game_log: [] });

    const res = await app.request(
      "/api/games/game-ai/ai/step",
      { method: "POST", headers: { "x-subject": PLAYER_A } },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      aiPlayerId: string;
      aiAction: { type: string };
    }>();
    expect(body.aiPlayerId).toBe("ai:bot");
    expect(body.aiAction.type).toBe("roll_dice");
  });

  it("returns game.completed for finished games", async () => {
    const completedGame = {
      id: "game-completed",
      status: "completed",
      player_ids_json: JSON.stringify(["ai:bot"]),
      started_at: 2000,
      ended_at: 3000,
      winner_id: "ai:bot",
      state_json: JSON.stringify({
        gameId: "game-completed",
        phase: "game_over",
      }),
    };
    const env = makeEnv({ games: [completedGame], game_log: [] });

    const res = await app.request(
      "/api/games/game-completed/ai/step",
      { method: "POST", headers: { "x-subject": PLAYER_A } },
      env,
    );

    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("game.completed");
  });
});
