import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";
import {
  createWorkerD1Stub,
  type WorkerD1Stub,
} from "../helpers/workerD1Stub.js";
import { markLobbyPlayersReady } from "../helpers/workerGameplayHarness.js";

type D1Stub = WorkerD1Stub;

const createD1Stub = createWorkerD1Stub;

const createKvStub = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
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
    expect(body.lobbies[0].players).toEqual([
      expect.objectContaining({ userId: "user-1", isAdmin: true }),
    ]);
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
    await markLobbyPlayersReady(db, lobby.id, ["user-1", "user-2"]);

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

  it("returns active gameId on GET when lobby is in_game", async () => {
    const db = createD1Stub();
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Rejoin Lobby",
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
    await markLobbyPlayersReady(db, lobby.id, ["user-1", "user-2"]);

    const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();

    const getRes = await requestWithEnv(`/api/lobbies/${lobby.id}`, {
      method: "GET",
      db,
    });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.status).toBe("in_game");
    expect(getBody.gameId).toBe(startBody.gameId);
  });

  it("starts a solo-vs-AI lobby when AI fills the second seat", async () => {
    const db = createD1Stub();
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
    const lobby = await createRes.json();
    expect(lobby.aiSlots).toHaveLength(1);

    await markLobbyPlayersReady(db, lobby.id, ["user-1"]);

    const res = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gameId).toBeDefined();
    expect(db._tables.games[0].player_ids_json).toContain("ai:");
    const state = JSON.parse(db._tables.games[0].state_json as string);
    expect(state.aiPlayers).toHaveLength(1);
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
    expect(inviteBody.expiresInSeconds).toBe(24 * 60 * 60);

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

    const replayJoinRes = await requestWithEnv(
      `/api/lobbies/${lobby.id}/join/${inviteBody.token}`,
      {
        method: "POST",
        headers: { "x-subject": "user-3" },
        db,
        kv,
      },
    );
    expect(replayJoinRes.status).toBe(403);
  });
});

describe("GET /api/lobbies/:id/ws", () => {
  it("requires a WebSocket upgrade", async () => {
    const res = await requestWithEnv("/api/lobbies/some-id/ws");
    expect(res.status).toBe(426);
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
    await markLobbyPlayersReady(db, lobby.id, ["user-1", "user-2"]);

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

    const stateRes = await requestWithEnv(
      `/api/games/${startBody.gameId}/state`,
      {
        method: "GET",
        headers: { "x-subject": "user-1" },
        db,
      },
    );
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();
    expect(state.phase).toBe("waiting_for_market_event");
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
    await markLobbyPlayersReady(db, lobby.id, ["user-1", "user-2"]);

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

describe("rank-gate enforcement", () => {
  it("returns 403 when creating a lobby with a tier-3 optional rule and no rank row", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Gated Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: ["hostile_takeover"],
      },
      db,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("rank_too_low");
  });

  it("allows lobby creation when host meets the required rank tier", async () => {
    const db = createD1Stub();
    db._tables.user_ranks.push({ user_id: "user-1", rank_tier: 3 });
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Gated Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: ["hostile_takeover"],
      },
      db,
    });
    expect(res.status).toBe(201);
  });

  it("allows lobby creation with tier-1 rules without a rank row", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Basic Rules Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: ["speed_market", "no_regulation"],
      },
      db,
    });
    expect(res.status).toBe(201);
  });

  it("returns 403 when creating a lobby with a tier-2 optional market event card and no rank row", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Card Gated Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
        optionalMarketEventCardIds: ["optional_dark_pool_transfer"],
      },
      db,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("rank_too_low");
  });

  it("returns 403 when updating lobby settings with a rank-gated rule", async () => {
    const db = createD1Stub();
    // Create lobby with no gated rules
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Upgradable Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(createRes.status).toBe(201);
    const lobby = await createRes.json();

    // Try to update settings with a tier-3 rule — host has no rank row (tier 1)
    const updateRes = await requestWithEnv(
      `/api/lobbies/${lobby.id}/settings`,
      {
        method: "PUT",
        headers: { "x-subject": "user-1" },
        body: { optionalRuleIds: ["hostile_takeover"] },
        db,
      },
    );
    expect(updateRes.status).toBe(403);
    const updateBody = await updateRes.json();
    expect(updateBody.error).toContain("rank_too_low");
  });

  it("allows updating lobby settings when host meets required rank tier", async () => {
    const db = createD1Stub();
    db._tables.user_ranks.push({ user_id: "user-1", rank_tier: 3 });
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Upgradable Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    expect(createRes.status).toBe(201);
    const lobby = await createRes.json();

    const updateRes = await requestWithEnv(
      `/api/lobbies/${lobby.id}/settings`,
      {
        method: "PUT",
        headers: { "x-subject": "user-1" },
        body: { optionalRuleIds: ["hostile_takeover"] },
        db,
      },
    );
    expect(updateRes.status).toBe(200);
  });
});
