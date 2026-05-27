import { describe, expect, it } from "vitest";
import {
  logEntriesForBroadcast,
  publicStateForBroadcast,
  toActionResponse,
} from "../../packages/worker/src/services/gamePersistence.js";

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
});

describe("publicStateForBroadcast", () => {
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
