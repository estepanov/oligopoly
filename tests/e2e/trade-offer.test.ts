import { describe, expect, it } from "vitest";
import {
  createAndStartGame,
  createD1Stub,
  createSoloAiGame,
  type HarnessDb,
  loadStoredGameState,
  requestWithEnv,
} from "../helpers/workerGameplayHarness.js";

function seedTradeReadyState(db: HarnessDb, gameId: string, players: string[]) {
  const row = db._tables.games.find((game) => game.id === gameId);
  if (!row?.state_json) throw new Error(`Missing game ${gameId}`);
  const state = JSON.parse(row.state_json as string) as Record<string, unknown>;
  const [p1, p2] = players;
  state.phase = "action";
  state.currentPlayerIndex = 0;
  state.turnOrder = players;
  state.players = [
    {
      playerId: p1,
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
      playerId: p2,
      ...(p2?.startsWith("ai:")
        ? { kind: "ai", aiPersonality: "opportunist" }
        : {}),
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
  ];
  if (p2?.startsWith("ai:")) {
    state.aiPlayers = [
      { playerId: p2, name: "OpBot", personality: "opportunist" },
    ];
  }
  state.tiles = (state.tiles as Array<Record<string, unknown>>).map((tile) => {
    if (String(tile.position) === "3") return { ...tile, ownerId: p1 };
    if (String(tile.position) === "6") return { ...tile, ownerId: p2 };
    return tile;
  });
  row.state_json = JSON.stringify(state);
}

describe("e2e trade offers", () => {
  it("rejects, counters, and accepts a full money plus property trade through the HTTP API", async () => {
    const db = createD1Stub() as HarnessDb;
    const { gameId, turnOrder } = await createAndStartGame(db);
    const [p1, p2] = turnOrder;
    seedTradeReadyState(db, gameId, [p1, p2]);

    const firstOffer = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": p1 },
      body: {
        type: "propose_trade",
        recipientId: p2,
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
      },
      db,
    });
    expect(firstOffer.status).toBe(200);
    const firstOfferBody = (await firstOffer.json()) as {
      tradeOffers: Array<{ id: string; status: string }>;
    };
    const firstOfferId = firstOfferBody.tradeOffers.find(
      (offer) => offer.status === "pending",
    )?.id;
    expect(firstOfferId).toBeDefined();

    const reject = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": p2 },
      body: { type: "reject_trade", offerId: firstOfferId },
      db,
    });
    expect(reject.status).toBe(200);

    const secondOffer = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": p1 },
      body: {
        type: "propose_trade",
        recipientId: p2,
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
      },
      db,
    });
    expect(secondOffer.status).toBe(200);
    const secondOfferBody = (await secondOffer.json()) as {
      tradeOffers: Array<{ id: string; status: string }>;
    };
    const secondOfferId = secondOfferBody.tradeOffers.find(
      (offer) => offer.status === "pending",
    )?.id;
    expect(secondOfferId).toBeDefined();

    const counter = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": p2 },
      body: {
        type: "counter_trade",
        offerId: secondOfferId,
        gives: { capital: 0, tilePositions: [6] },
        receives: { capital: 70, tilePositions: [3] },
      },
      db,
    });
    expect(counter.status).toBe(200);
    const counterBody = (await counter.json()) as {
      tradeOffers: Array<{ id: string; status: string }>;
    };
    const counterOfferId = counterBody.tradeOffers.find(
      (offer) => offer.status === "pending",
    )?.id;
    expect(counterOfferId).toBeDefined();

    const accept = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": p1 },
      body: { type: "accept_trade", offerId: counterOfferId },
      db,
    });
    expect(accept.status).toBe(200);

    const stored = loadStoredGameState(db, gameId) as ReturnType<
      typeof loadStoredGameState
    > & {
      players: Array<{
        playerId: string;
        capital: number;
        actionPointsRemaining: number;
        ownedTilePositions: Array<number | string>;
      }>;
      tiles: Array<{ position: number | string; ownerId: string | null }>;
      tradeOffers: Array<{ id: string; status: string; counterCount: number }>;
    };
    const player1 = stored.players.find((player) => player.playerId === p1);
    const player2 = stored.players.find((player) => player.playerId === p2);

    expect(player1?.capital).toBe(930);
    expect(player2?.capital).toBe(970);
    expect(player1?.actionPointsRemaining).toBe(0);
    expect(player2?.actionPointsRemaining).toBe(2);
    expect(player1?.ownedTilePositions.map(String)).toEqual(["6"]);
    expect(player2?.ownedTilePositions.map(String)).toEqual(["3"]);
    expect(
      stored.tiles.find((tile) => String(tile.position) === "3")?.ownerId,
    ).toBe(p2);
    expect(
      stored.tiles.find((tile) => String(tile.position) === "6")?.ownerId,
    ).toBe(p1);
    expect(stored.tradeOffers.map((offer) => offer.status)).toEqual([
      "rejected",
      "countered",
      "accepted",
    ]);
  });

  it("lets AI accept favorable trade offers and records the action in the game log", async () => {
    const db = createD1Stub() as HarnessDb;
    const { gameId, humanId, aiId } = await createSoloAiGame(db);
    seedTradeReadyState(db, gameId, [humanId, aiId]);

    const offer = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": humanId },
      body: {
        type: "propose_trade",
        recipientId: aiId,
        gives: { capital: 300, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      },
      db,
    });
    expect(offer.status).toBe(200);

    const stored = loadStoredGameState(db, gameId) as ReturnType<
      typeof loadStoredGameState
    > & {
      players: Array<{
        playerId: string;
        capital: number;
        actionPointsRemaining: number;
        ownedTilePositions: Array<number | string>;
      }>;
      tradeOffers: Array<{ id: string; status: string }>;
    };
    const human = stored.players.find((player) => player.playerId === humanId);
    const ai = stored.players.find((player) => player.playerId === aiId);

    expect(stored.tradeOffers.map((trade) => trade.status)).toEqual([
      "accepted",
    ]);
    expect(human?.capital).toBe(700);
    expect(ai?.capital).toBe(1200);
    expect(human?.actionPointsRemaining).toBe(1);
    expect(human?.ownedTilePositions.map(String)).toEqual(["3", "6"]);
    expect(ai?.ownedTilePositions.map(String)).toEqual([]);

    const logs = db._tables.game_log.filter(
      (entry) => entry.game_id === gameId,
    );
    expect(logs.map((entry) => entry.action_type)).toContain("trade_proposed");
    expect(logs.map((entry) => entry.action_type)).toContain("trade_accepted");
  });
});
