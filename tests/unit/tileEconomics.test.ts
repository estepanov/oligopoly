import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { getTileEconomics } from "../../packages/web/src/lib/tileEconomics";

describe("getTileEconomics", () => {
  it("uses Synthetic CDO for available mortgage rate without changing stored rate", () => {
    const state: GameState = {
      gameId: "g",
      round: 3,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["me"],
      myAffinityCardId: null,
      marketEventModifiers: { syntheticCdoMortgageRound: 3 },
      settings: { currencySymbol: "$", currencyMultiplier: "1" },
      players: [
        {
          playerId: "me",
          position: 0,
          capital: 500,
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
          position: 6,
          ownerId: "me",
          mortgaged: false,
          mortgageRate: null,
          developmentTokens: 0,
        },
      ],
    };

    const economics = getTileEconomics(state, "me", 6);

    expect(economics.availableMortgageRate).toBe(0.6);
    expect(economics.storedMortgageRate).toBe(0.5);
    expect(economics.mortgageRate).toBe(0.6);
    expect(economics.availableMortgageValue).toBe(84);
    expect(economics.formattedAvailableMortgageValue).toBe("$84");
    expect(economics.storedMortgageValue).toBeNull();
    expect(economics.redemptionCost).toBeNull();
  });

  it("uses stored Synthetic CDO mortgage rate for redemption economics", () => {
    const state: GameState = {
      gameId: "g",
      round: 3,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["me"],
      myAffinityCardId: null,
      settings: { currencySymbol: "$", currencyMultiplier: "1" },
      players: [
        {
          playerId: "me",
          position: 0,
          capital: 500,
          ownedTilePositions: [6],
          mortgagedTilePositions: [6],
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
          position: 6,
          ownerId: "me",
          mortgaged: true,
          mortgageRate: 0.6,
          developmentTokens: 0,
        },
      ],
    };

    const economics = getTileEconomics(state, "me", 6);

    expect(economics.availableMortgageRate).toBe(0.5);
    expect(economics.storedMortgageRate).toBe(0.6);
    expect(economics.mortgageRate).toBe(0.5);
    expect(economics.availableMortgageValue).toBe(70);
    expect(economics.formattedAvailableMortgageValue).toBe("$70");
    expect(economics.storedMortgageValue).toBe(84);
    expect(economics.formattedStoredMortgageValue).toBe("$84");
    expect(economics.redemptionCost).toBe(93);
    expect(economics.formattedRedemptionCost).toBe("$93");
    expect(economics.canRedeem).toBe(true);
  });
});
