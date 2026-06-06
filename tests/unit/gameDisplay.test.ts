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
    ).toBe("Mortgaged tile · Search Engine Corp.");

    expect(
      formatGameLogEntry(
        {
          id: "log-3",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "player_state_changed",
          payload: {
            playerId: "human-1",
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
          id: "log-owned",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "player_state_changed",
          payload: {
            playerId: "human-1",
            changes: {
              ownedTilePositions: { added: ["6"], removed: [] },
            },
          },
          createdAt: 1,
        },
        new Map([["6", "Search Engine Corp."]]),
        currencySettings,
      ),
    ).toContain("acquired Search Engine Corp.");

    expect(
      formatGameLogEntry(
        {
          id: "log-mort",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "player_state_changed",
          payload: {
            playerId: "human-1",
            changes: {
              mortgagedTilePositions: { added: ["1"], removed: [] },
            },
          },
          createdAt: 1,
        },
        new Map([["1", "Retail Row"]]),
        currencySettings,
      ),
    ).toContain("mortgaged Retail Row");

    expect(
      formatGameLogEntry(
        {
          id: "log-dev",
          gameId: "g",
          round: 1,
          playerId: "human-1",
          actionType: "player_state_changed",
          payload: {
            playerId: "human-1",
            changes: {
              developmentTokens: [{ position: 6, before: 0, after: 1 }],
            },
          },
          createdAt: 1,
        },
        new Map([["6", "Search Engine Corp."]]),
        currencySettings,
      ),
    ).toContain("Search Engine Corp. development 0->1");

    const multiFieldLine = formatGameLogEntry(
      {
        id: "log-multi",
        gameId: "g",
        round: 1,
        playerId: "human-1",
        actionType: "player_state_changed",
        payload: {
          playerId: "human-1",
          changes: {
            capital: { before: 100, after: 120, delta: 20 },
            ownedTilePositions: { added: ["3"], removed: [] },
            inRegulation: { before: false, after: true },
            syndicateId: { before: null, after: "synd-a" },
          },
        },
        createdAt: 1,
      },
      new Map([["3", "Cloud Lane"]]),
      currencySettings,
    );
    const cashAt = multiFieldLine.indexOf("cash");
    const acquiredAt = multiFieldLine.indexOf("acquired");
    expect(cashAt).toBeGreaterThan(0);
    expect(acquiredAt).toBeGreaterThan(cashAt);
    expect(multiFieldLine).toContain("entered regulation");
    expect(multiFieldLine).toContain("joined syndicate synd-a");

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
    ).toBe("Debt interest accrued · total ¤330 · interest ¤30");

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

  it("formats remaining player_state_changed fields", () => {
    const cur = { currencySymbol: "¤", currencyMultiplier: "10" };
    const tileNames = new Map<string, string>([
      ["0", "Start"],
      ["5", "Mid tile"],
    ]);

    const base = {
      gameId: "g",
      round: 1,
      playerId: "human-1",
      actionType: "player_state_changed" as const,
      createdAt: 1,
    };

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-lost",
          payload: {
            playerId: "human-1",
            changes: {
              ownedTilePositions: { added: [], removed: ["5"] },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("lost Mid tile");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-redeemed",
          payload: {
            playerId: "human-1",
            changes: {
              mortgagedTilePositions: { added: [], removed: ["5"] },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("redeemed Mid tile");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-move",
          payload: {
            playerId: "human-1",
            changes: { position: { before: 0, after: 5 } },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("moved to Mid tile");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-ap",
          payload: {
            playerId: "human-1",
            changes: {
              actionPointsRemaining: { before: 2, after: 0, delta: -2 },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("AP -2 to 0");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-trust",
          payload: {
            playerId: "human-1",
            changes: {
              trustworthiness: { before: 5, after: 6, delta: 1 },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("trust +1 to 6");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-debt",
          payload: {
            playerId: "human-1",
            changes: {
              outstandingDebt: { before: 50, after: 20, delta: -30 },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("debt");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-reg-off",
          payload: {
            playerId: "human-1",
            changes: { inRegulation: { before: true, after: false } },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("left regulation");

    expect(
      formatGameLogEntry(
        {
          ...base,
          id: "ps-syn-off",
          payload: {
            playerId: "human-1",
            changes: {
              syndicateId: { before: "synd-x", after: null },
            },
          },
        },
        tileNames,
        cur,
      ),
    ).toContain("left syndicate");
  });
});
