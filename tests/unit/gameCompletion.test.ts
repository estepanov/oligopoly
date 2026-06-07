import type { InternalGameState } from "@oligopoly/shared";
import { initTileStates } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";
import { processGameCompletion } from "../../packages/worker/src/services/gameCompletion.js";
import { createWorkerD1Stub } from "../helpers/workerD1Stub.js";

const createKvStub = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    },
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
};

function makeCompletedState(
  overrides?: Partial<InternalGameState>,
): InternalGameState {
  return {
    gameId: "game-1",
    round: 5,
    phase: "game_over",
    currentPlayerIndex: 0,
    turnOrder: ["user-1", "user-2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: "user-1",
    eliminatedPlayerIds: [],
    kickedPlayerIds: ["user-2"],
    tiles: initTileStates(),
    players: [
      {
        playerId: "user-1",
        position: 0,
        capital: 5000,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "user-2",
        position: 0,
        capital: 0,
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
    settings: {},
    ...overrides,
  };
}

describe("processGameCompletion", () => {
  it("records kicked players in recent game history without win stats", async () => {
    const db = createWorkerD1Stub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      undefined,
      "game-1",
      makeCompletedState(),
      1000,
    );

    const kickedStats = db._tables.user_stats.find(
      (row) => row.user_id === "user-2",
    );
    expect(kickedStats).toBeDefined();
    const recentGames = JSON.parse(
      kickedStats?.recent_games_json as string,
    ) as Array<{ gameId: string; result: string }>;
    expect(recentGames[0]).toEqual({
      gameId: "game-1",
      result: "kicked",
      endedAt: 1000,
    });
    expect(kickedStats?.wins).toBe(0);
    expect(kickedStats?.games_played).toBe(0);

    const winnerStats = db._tables.user_stats.find(
      (row) => row.user_id === "user-1",
    );
    expect(winnerStats?.games_played).toBe(1);
    expect(winnerStats?.wins).toBe(1);
  });

  it("omits AI seats from user stats and leaderboard rows while counting AI wins", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "ai:lobby:one",
      player_ids_json: JSON.stringify(["user-1", "ai:lobby:one"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({
        winnerId: "ai:lobby:one",
        turnOrder: ["user-1", "ai:lobby:one"],
        kickedPlayerIds: [],
        players: [
          makeCompletedState().players[0],
          {
            ...makeCompletedState().players[1],
            playerId: "ai:lobby:one",
            kind: "ai",
            displayName: "Copper Scout",
          },
        ],
        aiPlayers: [
          {
            playerId: "ai:lobby:one",
            name: "Copper Scout",
            personality: "opportunist",
          },
        ],
      }),
      1000,
    );

    expect(
      db._tables.user_stats.some((row) => row.user_id === "ai:lobby:one"),
    ).toBe(false);
    expect(JSON.parse(kv._store.get("leaderboard:wins") ?? "[]")).toEqual([]);
    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 0,
      aiWins: 1,
    });
  });

  it("counts a kicked human replaced by AI as one AI aggregate win", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-2",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    // user-2 was kicked and replaced by AI (same seat id, kind "ai"). They
    // must not earn human completion stats; aggregate wins still count as AI.
    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({
        winnerId: "user-2",
        kickedPlayerIds: ["user-2"],
        players: [
          makeCompletedState().players[0],
          {
            ...makeCompletedState().players[1],
            kind: "ai",
            displayName: "Copper Scout",
            aiPersonality: "opportunist",
          },
        ],
        aiPlayers: [
          {
            playerId: "user-2",
            name: "Copper Scout",
            personality: "opportunist",
          },
        ],
      }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 0,
      aiWins: 1,
    });
    expect(JSON.parse(kv._store.get("leaderboard:wins") ?? "[]")).toEqual([]);
    const kickedStats = db._tables.user_stats.find(
      (row) => row.user_id === "user-2",
    );
    expect(kickedStats?.wins).toBe(0);
    expect(kickedStats?.games_played).toBe(0);
  });

  it("recovers from corrupt leaderboard:summary KV when incrementing", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    kv._store.set("leaderboard:summary", "not-json");
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });

  it("recovers from corrupt leaderboard:wins KV when upserting", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    kv._store.set("leaderboard:wins", "not-json");
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    const wins = JSON.parse(
      kv._store.get("leaderboard:wins") ?? "[]",
    ) as Array<{
      userId: string;
      wins: number;
    }>;
    expect(wins).toEqual([{ userId: "user-1", username: "user-1", wins: 1 }]);
  });

  it("keeps valid leaderboard:wins rows when some entries fail schema validation", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    kv._store.set(
      "leaderboard:wins",
      JSON.stringify([
        { userId: "user-1", username: "old", wins: 5 },
        { userId: "user-2", username: "no-wins-field" },
      ]),
    );
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    const wins = JSON.parse(
      kv._store.get("leaderboard:wins") ?? "[]",
    ) as Array<{ userId: string; wins: number }>;
    expect(wins).toEqual([{ userId: "user-1", username: "user-1", wins: 6 }]);
  });

  it("does not double-apply when recent_games_json has a non-schema row with the same gameId", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });
    db._tables.user_stats.push({
      user_id: "user-1",
      games_played: 1,
      wins: 1,
      trades_completed: 0,
      auctions_won: 0,
      recent_games_json: JSON.stringify([
        { gameId: "game-1", incompleteLegacyRow: true },
      ]),
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    const stats = db._tables.user_stats.find((row) => row.user_id === "user-1");
    expect(stats?.games_played).toBe(1);
    expect(stats?.wins).toBe(1);
  });

  it("recovers from corrupt recent_games_json when updating stats", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });
    db._tables.user_stats.push({
      user_id: "user-1",
      games_played: 0,
      wins: 0,
      trades_completed: 0,
      auctions_won: 0,
      recent_games_json: "not-json",
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    const stats = db._tables.user_stats.find((row) => row.user_id === "user-1");
    expect(stats?.games_played).toBe(1);
    const recent = JSON.parse(stats?.recent_games_json as string) as Array<{
      gameId: string;
    }>;
    expect(recent[0]?.gameId).toBe("game-1");
  });

  it("falls back to state seat ids when player_ids_json is empty", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify([]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });

  it("retries leaderboard KV when D1 already committed but KV markers are missing", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });
    db._tables.user_stats.push({
      user_id: "user-1",
      games_played: 1,
      wins: 1,
      trades_completed: 0,
      auctions_won: 0,
      recent_games_json: JSON.stringify([
        { gameId: "game-1", result: "won", endedAt: 1000 },
      ]),
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    const stats = db._tables.user_stats.find((row) => row.user_id === "user-1");
    expect(stats?.games_played).toBe(1);
    expect(stats?.wins).toBe(1);
    expect(JSON.parse(kv._store.get("leaderboard:wins") ?? "[]")).toEqual([
      { userId: "user-1", username: "user-1", wins: 1 },
    ]);
    const completions = JSON.parse(
      kv._store.get("leaderboard:completions") ?? "[]",
    ) as Array<{ userId: string; completions: number }>;
    expect(completions).toHaveLength(2);
    expect(
      completions.find((row) => row.userId === "user-1")?.completions,
    ).toBe(1);
    expect(
      completions.find((row) => row.userId === "user-2")?.completions,
    ).toBe(1);
    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });

  it("does not double-apply leaderboard KV when completion markers already exist", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    kv._store.set(
      "leaderboard:wins",
      JSON.stringify([{ userId: "user-1", username: "user-1", wins: 1 }]),
    );
    kv._store.set(
      "leaderboard:completions",
      JSON.stringify([
        { userId: "user-1", username: "user-1", completions: 1 },
      ]),
    );
    kv._store.set(
      "leaderboard:summary",
      JSON.stringify({ humanWins: 1, aiWins: 0 }),
    );
    kv._store.set("leaderboard:completion:game-1:wins", "1");
    kv._store.set("leaderboard:completion:game-1:completions", "1");
    kv._store.set("leaderboard:completion:game-1:summary", "1");
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });
    db._tables.user_stats.push({
      user_id: "user-1",
      games_played: 1,
      wins: 1,
      trades_completed: 0,
      auctions_won: 0,
      recent_games_json: JSON.stringify([
        { gameId: "game-1", result: "won", endedAt: 1000 },
      ]),
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:wins") ?? "[]")[0]?.wins).toBe(
      1,
    );
    expect(
      JSON.parse(kv._store.get("leaderboard:completions") ?? "[]")[0]
        ?.completions,
    ).toBe(1);
    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });

  it("retries only missing leaderboard KV steps after a partial flush", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    kv._store.set(
      "leaderboard:wins",
      JSON.stringify([{ userId: "user-1", username: "user-1", wins: 1 }]),
    );
    kv._store.set("leaderboard:completion:game-1:wins", "1");
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });
    db._tables.user_stats.push({
      user_id: "user-1",
      games_played: 1,
      wins: 1,
      trades_completed: 0,
      auctions_won: 0,
      recent_games_json: JSON.stringify([
        { gameId: "game-1", result: "won", endedAt: 1000 },
      ]),
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({ kickedPlayerIds: [] }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:wins") ?? "[]")[0]?.wins).toBe(
      1,
    );
    const completions = JSON.parse(
      kv._store.get("leaderboard:completions") ?? "[]",
    ) as Array<{ userId: string; completions: number }>;
    expect(
      completions.find((row) => row.userId === "user-1")?.completions,
    ).toBe(1);
    expect(
      completions.find((row) => row.userId === "user-2")?.completions,
    ).toBe(1);
    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });

  it("counts a syndicate win once in aggregate summary", async () => {
    const db = createWorkerD1Stub();
    const kv = createKvStub();
    db._tables.games.push({
      id: "game-1",
      lobby_id: "lobby-1",
      status: "completed",
      started_at: 1,
      ended_at: 2,
      winner_id: "user-1",
      player_ids_json: JSON.stringify(["user-1", "user-2"]),
      state_json: null,
    });

    await processGameCompletion(
      db,
      kv,
      "game-1",
      makeCompletedState({
        kickedPlayerIds: [],
        players: makeCompletedState().players.map((player) => ({
          ...player,
          syndicateId: "syn-1",
        })),
        syndicates: {
          "syn-1": {
            syndicateId: "syn-1",
            adminId: "user-1",
            memberIds: ["user-1", "user-2"],
          },
        },
      }),
      1000,
    );

    expect(JSON.parse(kv._store.get("leaderboard:summary") ?? "{}")).toEqual({
      humanWins: 1,
      aiWins: 0,
    });
  });
});
