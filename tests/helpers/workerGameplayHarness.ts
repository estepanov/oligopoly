import app from "@oligopoly/worker";

// ---------------------------------------------------------------------------
// Full-featured D1 stub for game action tests.
// Supports INSERT, SELECT, UPDATE, and batched operations needed by
// lobby creation, game start, and game action processing.
// ---------------------------------------------------------------------------
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
        ai_slots_json,
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
        ai_slots_json: ai_slots_json ?? "[]",
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
        tables.lobby_players.push({ lobby_id, user_id, is_admin, joined_at });
      } else {
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
      if (binds.length === 7) {
        const [
          id,
          game_id,
          round,
          player_id,
          action_type,
          payload_json,
          created_at,
        ] = binds as [
          string,
          string,
          number,
          string | null,
          string,
          string | null,
          number,
        ];
        tables.game_log.push({
          id,
          game_id,
          round,
          player_id,
          action_type,
          payload_json,
          created_at,
        });
      } else {
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
      }
      return { results: [], success: true };
    }

    // SELECT * FROM lobbies WHERE id = ?
    if (trimmed.startsWith("SELECT * FROM lobbies WHERE id = ?")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT * FROM lobbies WHERE status = 'waiting' AND is_private = 0
    if (
      trimmed.includes(
        "FROM lobbies WHERE status = 'waiting' AND is_private = 0",
      ) &&
      trimmed.includes("ORDER BY")
    ) {
      const limit = binds[binds.length - 1] as number;
      const rows = tables.lobbies.filter(
        (r) => r.status === "waiting" && r.is_private === 0,
      );
      rows.sort((a, b) => (b.created_at as number) - (a.created_at as number));
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

    // SELECT id, status, state_json FROM games WHERE id = ?
    if (
      trimmed.includes("SELECT id, status, state_json FROM games WHERE id = ?")
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT id, status, player_ids_json, state_json FROM games WHERE id = ?
    if (
      trimmed.includes(
        "SELECT id, status, player_ids_json, state_json FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?
    if (
      trimmed.includes(
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT id, player_ids_json FROM games WHERE id = ?
    if (
      trimmed.includes("SELECT id, player_ids_json FROM games WHERE id = ?")
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // SELECT lobby_id FROM games WHERE id = ?
    if (trimmed.includes("SELECT lobby_id FROM games WHERE id = ?")) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return {
        results: row ? [row] : [],
        first: row ? { lobby_id: row.lobby_id } : null,
      };
    }

    // SELECT id, player_ids_json, state_json FROM games WHERE id = ?
    if (
      trimmed.includes(
        "SELECT id, player_ids_json, state_json FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // UPDATE games SET state_json = ? WHERE id = ?
    if (trimmed.startsWith("UPDATE games SET state_json = ? WHERE id = ?")) {
      const row = tables.games.find((r) => r.id === binds[1]);
      if (row) row.state_json = binds[0];
      return { results: [], success: true };
    }

    // UPDATE games SET status = 'completed', winner_id = ?, ended_at = ? WHERE id = ?
    if (trimmed.startsWith("UPDATE games SET status = 'completed'")) {
      const row = tables.games.find((r) => r.id === binds[2]);
      if (row) {
        row.status = "completed";
        row.winner_id = binds[0];
        row.ended_at = binds[1];
      }
      return { results: [], success: true };
    }

    // UPDATE lobbies SET status = 'in_game'
    if (trimmed.startsWith("UPDATE lobbies SET status = 'in_game'")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]);
      if (row) row.status = "in_game";
      return { results: [], success: true };
    }

    // UPDATE lobbies SET status = 'finished'
    if (trimmed.startsWith("UPDATE lobbies SET status = 'finished'")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]);
      if (row) row.status = "finished";
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

    // SELECT ... FROM games (list)
    if (trimmed.includes("FROM games") && trimmed.includes("ORDER BY")) {
      let rows = [...tables.games];
      const statusIdx = trimmed.indexOf("status = ?");
      if (statusIdx !== -1) {
        rows = rows.filter((r) => r.status === binds[0]);
      }
      return { results: rows };
    }

    // SELECT ... FROM game_log WHERE game_id = ?
    if (trimmed.includes("FROM game_log WHERE game_id = ?")) {
      const rows = tables.game_log.filter((r) => r.game_id === binds[0]);
      return { results: rows };
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

  return { prepare, batch, _tables: tables } as unknown as D1Database & {
    _tables: Record<string, Row[]>;
  };
};

// ---------------------------------------------------------------------------
// Helper to make requests
// ---------------------------------------------------------------------------
const requestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    db?: D1Database;
  } = {},
) => {
  const { method = "GET", headers = {}, body, db } = options;
  const init: RequestInit = { method, headers: { ...headers } };
  if (body) {
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, {
    ALLOWED_ORIGINS: "http://localhost:5173",
    DB: db,
  });
};

// ---------------------------------------------------------------------------
// Helper: create lobby with 2 players and start game, return gameId + state
// ---------------------------------------------------------------------------
async function createAndStartGame(db: D1Database) {
  const createRes = await requestWithEnv("/api/lobbies", {
    method: "POST",
    headers: { "x-subject": "user-1" },
    body: {
      name: "Test Game Lobby",
      maxPlayers: 4,
      isPrivate: false,
      optionalRuleIds: [],
    },
    db,
  });
  const lobby = (await createRes.json()) as Record<string, unknown>;

  await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
    method: "POST",
    headers: { "x-subject": "user-2" },
    db,
  });

  const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
    method: "POST",
    headers: { "x-subject": "user-1" },
    db,
  });
  const startBody = (await startRes.json()) as Record<string, unknown>;

  // Parse the stored state to determine turn order
  const gameRow = (db as D1Database & { _tables: Record<string, Row[]> })
    ._tables.games[0];
  const state = JSON.parse(gameRow.state_json as string);

  return {
    gameId: startBody.gameId as string,
    lobbyId: lobby.id as string,
    turnOrder: state.turnOrder as string[],
    currentPlayer: state.turnOrder[0] as string,
    otherPlayer: state.turnOrder[1] as string,
  };
}

export async function createSoloAiGame(db: D1Database) {
  const createRes = await requestWithEnv("/api/lobbies", {
    method: "POST",
    headers: { "x-subject": "user-1" },
    body: {
      name: "Solo vs AI",
      maxPlayers: 2,
      isPrivate: false,
      optionalRuleIds: [],
      aiSlots: [{ id: "ai-1", name: "OpBot", personality: "opportunist" }],
    },
    db,
  });
  if (createRes.status !== 201) {
    throw new Error(`Failed to create lobby: ${createRes.status}`);
  }
  const lobby = (await createRes.json()) as Record<string, unknown>;

  const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
    method: "POST",
    headers: { "x-subject": "user-1" },
    db,
  });
  if (startRes.status !== 200) {
    throw new Error(`Failed to start lobby: ${startRes.status}`);
  }
  const startBody = (await startRes.json()) as Record<string, unknown>;

  const gameRow = (db as D1Database & { _tables: Record<string, Row[]> })
    ._tables.games[0];
  const state = JSON.parse(gameRow.state_json as string) as {
    turnOrder: string[];
  };

  return {
    gameId: startBody.gameId as string,
    humanId: "user-1",
    aiId: state.turnOrder.find((id) => id.startsWith("ai:")) ?? "",
    turnOrder: state.turnOrder,
    currentPlayer: state.turnOrder[0] as string,
  };
}

export async function stepAiUntil(
  db: D1Database,
  gameId: string,
  predicate: (body: Record<string, unknown>) => boolean,
  maxSteps = 16,
): Promise<Record<string, unknown>> {
  let lastBody: Record<string, unknown> = {};
  for (let i = 0; i < maxSteps; i++) {
    const res = await requestWithEnv(`/api/games/${gameId}/ai/step`, {
      method: "POST",
      db,
    });
    if (res.status === 409) {
      const harnessDb = db as HarnessDb;
      if (harnessDb._tables) {
        lastBody = loadStoredGameState(harnessDb, gameId) as Record<
          string,
          unknown
        >;
        if (predicate(lastBody)) return lastBody;
      }
      break;
    }
    if (res.status !== 200) {
      throw new Error(`AI step failed with status ${res.status}`);
    }
    lastBody = (await res.json()) as Record<string, unknown>;
    if (predicate(lastBody)) return lastBody;
  }
  if (!predicate(lastBody)) {
    throw new Error("AI stepping did not reach the expected state");
  }
  return lastBody;
}

export type HarnessDb = D1Database & {
  _tables: Record<string, Row[]>;
};

export type StoredGameState = {
  turnOrder: string[];
  currentPlayerIndex: number;
  phase?: string;
  pendingBuyTilePosition?: number | string | null;
};

export function loadStoredGameState(
  db: HarnessDb,
  gameId: string,
): StoredGameState {
  const row = db._tables.games.find((game) => game.id === gameId);
  if (!row?.state_json) {
    throw new Error(`Game row missing for ${gameId}`);
  }
  return JSON.parse(row.state_json as string) as StoredGameState;
}

export function storedActorId(state: StoredGameState): string {
  return state.turnOrder[state.currentPlayerIndex] ?? "";
}

export async function ensureActorTurn(
  db: HarnessDb,
  gameId: string,
  actorId: string,
  maxSteps = 16,
): Promise<StoredGameState> {
  for (let i = 0; i < maxSteps; i++) {
    const state = loadStoredGameState(db, gameId);
    if (storedActorId(state) === actorId) return state;

    const current = storedActorId(state);
    if (!current.startsWith("ai:")) {
      throw new Error(
        `Expected AI-controlled turn before ${actorId}, got ${current}`,
      );
    }

    const res = await requestWithEnv(`/api/games/${gameId}/ai/step`, {
      method: "POST",
      db,
    });
    if (res.status === 409) {
      const latest = loadStoredGameState(db, gameId);
      if (storedActorId(latest) === actorId) return latest;
      break;
    }
    if (res.status !== 200) {
      throw new Error(`AI step failed with status ${res.status}`);
    }
  }

  const finalState = loadStoredGameState(db, gameId);
  if (storedActorId(finalState) !== actorId) {
    throw new Error(
      `Timed out waiting for ${actorId}; current actor is ${storedActorId(finalState)}`,
    );
  }
  return finalState;
}

export function isActorTurn(
  body: Record<string, unknown>,
  actorId: string,
): boolean {
  const turnOrder = body.turnOrder as string[] | undefined;
  const index = body.currentPlayerIndex as number | undefined;
  if (!turnOrder || index === undefined) return false;
  return turnOrder[index] === actorId;
}

export { createAndStartGame, createD1Stub, requestWithEnv };
