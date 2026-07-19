import type { GameState } from "@oligopoly/validation";
import type { BoardTileDetails } from "../../lib/boardDisplay";

export function setNavigationGameState(
  overrides: Partial<GameState> = {},
): GameState {
  return {
    gameId: "g",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    myAffinityCardId: null,
    players: [
      {
        playerId: "me",
        displayName: "Ada",
        position: 0,
        capital: 500,
        ownedTilePositions: [],
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
        position: 1,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
      {
        position: 3,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
    ],
    ...overrides,
  };
}

export const setNavigationTileDetails = new Map<string, BoardTileDetails>([
  [
    "1",
    {
      position: 1,
      name: "Alpha Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 100,
      baseRent: 10,
    },
  ],
  [
    "3",
    {
      position: 3,
      name: "Beta Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 120,
      baseRent: 12,
    },
  ],
]);
