import { initTileStates, normalizeGameState } from "@oligopoly/shared";

/**
 * Shared fixture for the trade-action unit suites: a two-player game in the
 * `action` phase where p1 owns tile 3 and p2 owns tile 6. Used by the core,
 * expiry, and counter trade test files so they share one canonical setup.
 */
export function baseState() {
  return normalizeGameState({
    gameId: "trade-game",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "p1",
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
        playerId: "p2",
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
    tiles: initTileStates().map((tile) => {
      if (String(tile.position) === "3") return { ...tile, ownerId: "p1" };
      if (String(tile.position) === "6") return { ...tile, ownerId: "p2" };
      return tile;
    }),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { optionalRuleIds: [], turnTimeout: "5min" },
  });
}
