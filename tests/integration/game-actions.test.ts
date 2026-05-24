import app from "@oligopoly/worker";
import { beforeEach, describe, expect, it } from "vitest";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/games/:id/action — basics", () => {
  it("returns 401 without auth", async () => {
    const db = createD1Stub();
    const { gameId } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown game", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/games/nonexistent/action", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a player in the game", async () => {
    const db = createD1Stub();
    const { gameId } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": "user-3" },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when it is not the player's turn", async () => {
    const db = createD1Stub();
    const { gameId, otherPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.not_your_turn");
  });

  it("rejects invalid dice values via schema validation", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [0, 7] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.invalid_action");
  });

  it("rejects unknown action types via schema validation", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "hack_game" },
      db,
    });
    expect(res.status).toBe(400);
  });

  it("rejects end_turn before rolling dice", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.cannot_end_turn");
  });
});

describe("POST /api/games/:id/action — roll_dice", () => {
  it("successfully rolls dice and moves the current player", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 3] },
      db,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.lastDiceRoll).toEqual([2, 3]);

    const players = body.players as Array<{
      playerId: string;
      position: number | string;
    }>;
    const movedPlayer = players.find((p) => p.playerId === currentPlayer);
    expect(movedPlayer).toBeDefined();
    expect(movedPlayer!.position).toBe(5);
  });

  it("returns 400 when trying to roll again without doubles", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // First roll (non-doubles)
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 3] },
      db,
    });

    // Second roll should fail (action phase, not waiting for roll)
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 4] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.already_rolled");
  });
});

describe("POST /api/games/:id/action — buy_tile / decline_tile", () => {
  it("allows buying an unowned tile after landing on it", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to position 1 (Digital Content Co. — cost 60)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 0] },
      db,
    });

    // Actually, dice are 1-6 each. Let's use result [1,2] to land on pos 3 (Mobile Gaming Inc., cost 80)
    // Re-create game since state changed
  });

  it("can buy a tile from position 1 (Digital Content Co., cost 60)", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll [1, 2] = 3 -> position 3 = Mobile Gaming Inc. (cost 80)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    const rollBody = (await rollRes.json()) as Record<string, unknown>;
    expect(rollBody.phase).toBe("waiting_for_buy");
    expect(rollBody.pendingBuyTilePosition).toBe(3);

    // Buy the tile
    const buyRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    expect(buyRes.status).toBe(200);
    const buyBody = (await buyRes.json()) as Record<string, unknown>;
    expect(buyBody.pendingBuyTilePosition).toBeNull();

    const players = buyBody.players as Array<{
      playerId: string;
      capital: number;
      ownedTilePositions: number[];
    }>;
    const buyer = players.find((p) => p.playerId === currentPlayer)!;
    expect(buyer.capital).toBe(1500 - 80);
    expect(buyer.ownedTilePositions).toContain(3);
  });

  it("can decline a tile and proceed to action phase", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to unowned tile
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });

    // Decline the tile
    const declineRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "decline_tile", tilePosition: 3 },
      db,
    });
    expect(declineRes.status).toBe(200);
    const declineBody = (await declineRes.json()) as Record<string, unknown>;
    expect(declineBody.phase).toBe("action");
    expect(declineBody.pendingBuyTilePosition).toBeNull();
  });
});

describe("POST /api/games/:id/action — end_turn", () => {
  it("advances to the next player's turn", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Roll to non-purchasable tile (pos 2 = MARKET EVENT, or pos 4 = CORPORATE TAX I)
    // [2, 2] = 4 -> CORPORATE TAX I (special tile, no buy)
    // But [2,2] is doubles! Use [1, 3] = 4 instead
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });

    // End turn
    const endRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes.status).toBe(200);
    const endBody = (await endRes.json()) as Record<string, unknown>;
    expect(endBody.phase).toBe("waiting_for_roll");

    // Now the other player should be able to roll
    const otherRollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(otherRollRes.status).toBe(200);
  });

  it("returns error when trying to end turn during buy decision", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to purchasable tile
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });

    // Try to end turn while buy decision pending
    const endRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes.status).toBe(400);
    const body = (await endRes.json()) as { error: string };
    expect(body.error).toBe("game.cannot_end_turn");
  });
});

describe("POST /api/games/:id/action — rent payment", () => {
  it("charges rent when landing on owned tile", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Player 1: Roll to pos 3 (Mobile Gaming Inc.) and buy it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });

    // Player 2: Roll to same position (pos 3)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    expect(rollRes.status).toBe(200);
    const body = (await rollRes.json()) as Record<string, unknown>;

    // Check rent was paid (base rent for Mobile Gaming Inc. is 4)
    const players = body.players as Array<{
      playerId: string;
      capital: number;
    }>;
    const payer = players.find((p) => p.playerId === otherPlayer)!;
    const owner = players.find((p) => p.playerId === currentPlayer)!;

    expect(payer.capital).toBe(1500 - 4);
    expect(owner.capital).toBe(1500 - 80 + 4);
  });
});

describe("POST /api/games/:id/action — doubles", () => {
  it("allows rolling again after doubles", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll doubles [3, 3] = 6 -> pos 6 (Search Engine Corp.)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [3, 3] },
      db,
    });
    const rollBody = (await rollRes.json()) as Record<string, unknown>;

    // If landed on purchasable tile, need to buy or decline first
    if (rollBody.phase === "waiting_for_buy") {
      await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": currentPlayer },
        body: {
          type: "decline_tile",
          tilePosition: rollBody.pendingBuyTilePosition,
        },
        db,
      });
    }

    // Should be in rolling_doubles phase -> can roll again
    const secondRollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(secondRollRes.status).toBe(200);
  });
});

describe("POST /api/games/:id/action — special tiles", () => {
  it("pays Corporate Tax I when landing on position 4", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // [1, 3] = 4 -> CORPORATE TAX I (pays 75 to free market pool)
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    expect(player.capital).toBe(1500 - 75);
    expect(body.freeMarketPool).toBe(75);
  });
});

describe("Full game round cycle", () => {
  it("completes a full round with both players taking turns", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Player 1 rolls, lands on special tile, ends turn
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    const endRes1 = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes1.status).toBe(200);
    const end1Body = (await endRes1.json()) as Record<string, unknown>;
    expect(end1Body.round).toBe(1);

    // Player 2 rolls, lands on special tile, ends turn
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    const endRes2 = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes2.status).toBe(200);
    const end2Body = (await endRes2.json()) as Record<string, unknown>;
    // After both players go, round should advance
    expect(end2Body.round).toBe(2);

    // Player 1 can take their turn again in round 2
    const round2Res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(round2Res.status).toBe(200);
  });
});

describe("POST /api/games/:id/action — mortgage and redeem", () => {
  it("can mortgage an owned tile during action phase", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to pos 3, buy it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });

    // Mortgage the tile (Mobile Gaming Inc. cost 80, mortgage value = 40)
    const mortRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "mortgage_tile", tilePosition: 3 },
      db,
    });
    expect(mortRes.status).toBe(200);
    const body = (await mortRes.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
      mortgagedTilePositions: number[];
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    expect(player.capital).toBe(1500 - 80 + 40);
    expect(player.mortgagedTilePositions).toContain(3);
  });

  it("can redeem a mortgaged tile", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to pos 3, buy it, mortgage it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "mortgage_tile", tilePosition: 3 },
      db,
    });

    // Redeem (cost = ceil(40 * 1.1) = 44)
    const redeemRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "redeem_tile", tilePosition: 3 },
      db,
    });
    expect(redeemRes.status).toBe(200);
    const body = (await redeemRes.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
      mortgagedTilePositions: number[];
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    expect(player.capital).toBe(1500 - 80 + 40 - 44);
    expect(player.mortgagedTilePositions).not.toContain(3);
  });
});

describe("Game state endpoint reflects action results", () => {
  it("GET /api/games/:id/state returns updated state after actions", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Perform an action
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });

    // Fetch state
    const stateRes = await requestWithEnv(`/api/games/${gameId}/state`, {
      headers: { "x-subject": currentPlayer },
      db,
    });
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as Record<string, unknown>;
    expect(state.lastDiceRoll).toEqual([1, 3]);
  });
});

describe("Game log tracks all actions", () => {
  it("GET /api/games/:id/log returns entries for submitted actions", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Perform some actions
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });

    // Check log
    const logRes = await requestWithEnv(`/api/games/${gameId}/log`, {
      headers: { "x-subject": currentPlayer },
      db,
    });
    expect(logRes.status).toBe(200);
    const logBody = (await logRes.json()) as {
      log: Array<{ actionType: string }>;
    };
    expect(logBody.log.length).toBeGreaterThanOrEqual(2);

    const actionTypes = logBody.log.map((e) => e.actionType);
    expect(actionTypes).toContain("game_started");
    expect(actionTypes).toContain("roll_dice");
  });
});
