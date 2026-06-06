import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import {
  formatCurrencyAmount,
  playerDisplayName,
  playerNameMap,
} from "../../packages/web/src/lib/gameDisplay";
import { formatGameLogEntry } from "../../packages/web/src/lib/gameLogDisplay";

describe("game display helpers", () => {
  const state: GameState = {
    gameId: "g",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["human-1", "ai:one"],
    players: [
      {
        playerId: "human-1",
        displayName: "Ada",
        position: 0,
        capital: 100,
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
        playerId: "ai:one",
        kind: "ai",
        displayName: "Copper Scout",
        aiPersonality: "opportunist",
        position: 0,
        capital: 100,
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
    aiPlayers: [
      { playerId: "ai:one", name: "Copper Scout", personality: "opportunist" },
    ],
  };

  it("formats custom currency using the display multiplier", () => {
    expect(
      formatCurrencyAmount(72, {
        currencySymbol: "¤",
        currencyMultiplier: "10",
      }),
    ).toBe("¤720");
  });

  it("prefers display names for players and log metadata", () => {
    const names = playerNameMap(state);
    expect(playerDisplayName(state, "ai:one")).toBe("Copper Scout");
    expect(
      formatGameLogEntry(
        {
          id: "log-1",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "paid_rent",
          payload: { to: "ai:one", amount: 25 },
          createdAt: 1,
        },
        new Map(),
        "$",
        names,
      ),
    ).toContain("to Copper Scout");
  });

  it("formats game log money with custom currency multipliers", () => {
    const currencySettings = {
      currencySymbol: "¤",
      currencyMultiplier: "10",
    };

    expect(
      formatGameLogEntry(
        {
          id: "log-2",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "mortgaged_tile",
          payload: { position: 6, mortgageValue: 70 },
          createdAt: 1,
        },
        new Map([["6", "Search Engine Corp."]]),
        currencySettings,
      ),
    ).toBe("Mortgaged tile · Search Engine Corp. · +¤700");

    expect(
      formatGameLogEntry(
        {
          id: "log-3",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "player_state_changed",
          payload: {
            changes: { capital: { before: 100, after: 150, delta: 50 } },
          },
          createdAt: 1,
        },
        new Map(),
        currencySettings,
      ),
    ).toContain("cash +¤500 to ¤1,500");

    expect(
      formatGameLogEntry(
        {
          id: "log-4",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "debt_paid",
          payload: { amount: 12, remaining: 4 },
          createdAt: 1,
        },
        new Map(),
        currencySettings,
      ),
    ).toBe("debt paid · amount ¤120 · remaining ¤40");

    expect(
      formatGameLogEntry(
        {
          id: "log-5",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "market_event_capital_change",
          payload: {
            cardId: "optional_venture_capital_boom",
            delta: -25,
            capital: 75,
          },
          createdAt: 1,
        },
        new Map(),
        currencySettings,
      ),
    ).toBe(
      "Market event capital change · optional venture capital boom · change -¤250 · capital ¤750",
    );

    expect(
      formatGameLogEntry(
        {
          id: "log-6",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "debt_interest",
          payload: { interest: 3, total: 33 },
          createdAt: 1,
        },
        new Map(),
        currencySettings,
      ),
    ).toBe("debt interest · total ¤330 · interest ¤30");

    expect(
      formatGameLogEntry(
        {
          id: "log-7",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "foreclosure_proceeds",
          payload: { proceeds: 20, applied: 15, debtRemaining: 5 },
          createdAt: 1,
        },
        new Map(),
        currencySettings,
      ),
    ).toBe(
      "foreclosure proceeds · proceeds ¤200 · applied ¤150 · debt remaining ¤50",
    );
  });
});
