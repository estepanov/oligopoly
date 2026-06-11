import { describe, expect, it } from "vitest";
import {
  logEntriesForBroadcast,
  persistGameActionResult,
  publicStateForBroadcast,
  toActionResponse,
} from "../../packages/worker/src/services/gamePersistence.js";
import { createD1Stub } from "../helpers/workerGameplayHarness.js";

describe("logEntriesForBroadcast", () => {
  it("filters logs marked as non-broadcast while preserving persisted entries", () => {
    const entries = [
      {
        playerId: "p1",
        actionType: "dark_pool_transfer",
        payload: { tilePosition: 12 },
        broadcast: false,
      },
      {
        playerId: "p1",
        actionType: "market_event_resolved",
        payload: { cardId: "optional_dark_pool_transfer" },
      },
    ];

    expect(logEntriesForBroadcast(entries)).toEqual([
      {
        playerId: "p1",
        actionType: "market_event_resolved",
        payload: { cardId: "optional_dark_pool_transfer" },
      },
    ]);
  });

  it("suppresses all realtime log entries for dark-pool transfers", () => {
    const entries = [
      {
        playerId: "p1",
        actionType: "market_event_drawn",
        payload: { cardId: "optional_dark_pool_transfer" },
      },
      {
        playerId: "p1",
        actionType: "dark_pool_transfer",
        payload: {
          fromPlayerId: "p2",
          toPlayerId: "p1",
          tilePosition: 12,
        },
        broadcast: false,
      },
      {
        playerId: null,
        actionType: "market_event_resolved",
        payload: { cardId: "optional_dark_pool_transfer" },
      },
    ];

    expect(logEntriesForBroadcast(entries)).toEqual([]);
  });

  it("broadcasts trade action entries", () => {
    const entries = [
      {
        playerId: "p1",
        actionType: "trade_proposed",
        payload: {
          offerId: "trade-1",
          proposerId: "p1",
          recipientId: "p2",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
        },
      },
    ];

    expect(logEntriesForBroadcast(entries)).toEqual(entries);
  });
});

describe("publicStateForBroadcast", () => {
  it("strips private game state from broadcast snapshots", () => {
    const broadcastState = publicStateForBroadcast({
      players: [],
      tiles: [],
      pendingInsiderPeek: {
        drawingPlayerId: "p1",
        cardId: "market_crash",
        trigger: "round_start",
      },
      handshakeAgreements: [
        {
          id: "handshake-1",
          gameId: "game-1",
          partyA: "p1",
          partyB: "p2",
          summary: "private",
          status: "proposed",
          proposedBy: "p1",
          createdAt: 1,
          signedAt: null,
          brokenAt: null,
          brokenBy: null,
        },
      ],
      negotiationThreads: [
        {
          id: "private-thread",
          gameId: "game-1",
          createdBy: "p1",
          partyIds: ["p1", "p2"],
          status: "open",
          startedRound: 1,
          expiresAfterRound: 4,
          visibility: "private",
          messages: [],
        },
        {
          id: "open-thread",
          gameId: "game-1",
          createdBy: "p1",
          partyIds: ["p1", "p2"],
          status: "open",
          startedRound: 1,
          expiresAfterRound: 4,
          visibility: "open",
          messages: [],
        },
      ],
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "game-1",
          proposerId: "p1",
          recipientId: "p2",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
          createdAt: 1,
          expiresAt: 2,
          counterCount: 0,
        },
      ],
    } as never);

    expect("pendingInsiderPeek" in broadcastState).toBe(false);
    expect("handshakeAgreements" in broadcastState).toBe(false);
    expect("tradeOffers" in broadcastState).toBe(false);
    expect(
      broadcastState.negotiationThreads?.map((thread) => thread.id),
    ).toEqual(["open-thread"]);
  });

  it("redacts dark-pool ownership changes from the broadcast state", () => {
    const state = {
      players: [
        {
          playerId: "p1",
          ownedTilePositions: [12],
          mortgagedTilePositions: [12],
        },
        { playerId: "p2", ownedTilePositions: [], mortgagedTilePositions: [] },
      ],
      tiles: [{ position: 12, ownerId: "p1", mortgaged: true }],
    };

    const broadcastState = publicStateForBroadcast(state as never, [
      {
        playerId: "p1",
        actionType: "dark_pool_transfer",
        payload: { fromPlayerId: "p2", toPlayerId: "p1", tilePosition: 12 },
        broadcast: false,
      },
    ]);

    expect(
      broadcastState.players.find((player) => player.playerId === "p1")
        ?.ownedTilePositions,
    ).toEqual([]);
    expect(
      broadcastState.players.find((player) => player.playerId === "p1")
        ?.mortgagedTilePositions,
    ).toEqual([]);
    expect(
      broadcastState.players.find((player) => player.playerId === "p2")
        ?.ownedTilePositions,
    ).toEqual([12]);
    expect(
      broadcastState.players.find((player) => player.playerId === "p2")
        ?.mortgagedTilePositions,
    ).toEqual([12]);
    expect(broadcastState.tiles[0]?.ownerId).toBe("p2");
  });
});

describe("toActionResponse", () => {
  it("uses broadcast-filtered log entries when subject is null", () => {
    const response = toActionResponse(
      {
        state: {
          players: [],
          tiles: [],
        } as never,
        logEntries: [
          {
            playerId: "p1",
            actionType: "market_event_drawn",
            payload: { cardId: "optional_dark_pool_transfer" },
          },
          {
            playerId: "p1",
            actionType: "dark_pool_transfer",
            payload: {
              fromPlayerId: "p2",
              toPlayerId: "p1",
              tilePosition: 12,
            },
            broadcast: false,
          },
        ],
      },
      null,
    );

    expect(response.logEntries).toEqual([]);
  });
});

describe("persistGameActionResult", () => {
  it("rejects stale state writes before inserting logs", async () => {
    const db = createD1Stub();
    db._tables.games.push({
      id: "game-1",
      state_json: JSON.stringify({ gameId: "game-1", round: 2 }),
      status: "active",
    });

    await expect(
      persistGameActionResult(
        db,
        "game-1",
        {
          state: { gameId: "game-1", round: 3 } as never,
          logEntries: [
            {
              playerId: "p1",
              actionType: "trade_accepted",
              payload: { offerId: "trade-1" },
            },
          ],
        },
        { expectedStateJson: JSON.stringify({ gameId: "game-1", round: 1 }) },
      ),
    ).rejects.toBe("game.state_conflict");
    expect(db._tables.game_log).toEqual([]);
  });
});
