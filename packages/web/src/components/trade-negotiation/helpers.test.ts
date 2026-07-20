import type { BindingContract, GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { parseCapital, tradeableTilesForPlayer } from "./helpers";

const tileNames = new Map([
  ["3", "Mobile Gaming Inc."],
  ["4", "Search Engine Corp."],
  ["5", "Cloud Infrastructure"],
]);

function stateWithTiles(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
    stateVersion: 0,
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["me", "opponent"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { currencySymbol: "$" },
    players: [
      {
        playerId: "me",
        displayName: "Ada",
        position: 0,
        capital: 1000,
        ownedTilePositions: [3, 4, 5],
        mortgagedTilePositions: [4],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: [
      { position: 3, ownerId: "me", mortgaged: false, developmentTokens: 0 },
      { position: 4, ownerId: "me", mortgaged: true, developmentTokens: 0 },
      { position: 5, ownerId: "me", mortgaged: false, developmentTokens: 0 },
    ],
    ...overrides,
  };
}

function sellLockContract(tileId: string): BindingContract {
  return {
    id: "contract-1",
    gameId: "g",
    partyA: "me",
    partyB: "opponent",
    terms: [{ type: "cannot_sell_tile", tileId, boundPlayerId: "me" }],
    status: "active",
    startsRound: 1,
    expiresRound: null,
    signedAt: 1,
    fulfilledAt: null,
    breachedAt: null,
  };
}

describe("tradeableTilesForPlayer", () => {
  it("excludes mortgaged tiles (engine validateTransferTiles rule)", () => {
    const positions = tradeableTilesForPlayer(
      stateWithTiles(),
      "me",
      tileNames,
    ).map((tile) => tile.position);

    expect(positions).toEqual(["3", "5"]);
    expect(positions).not.toContain("4");
  });

  it("excludes tiles locked by an active cannot_sell_tile contract", () => {
    const positions = tradeableTilesForPlayer(
      stateWithTiles({ activeContracts: [sellLockContract("5")] }),
      "me",
      tileNames,
    ).map((tile) => tile.position);

    // 4 is mortgaged, 5 is contract-locked: only 3 remains tradeable.
    expect(positions).toEqual(["3"]);
    expect(positions).not.toContain("5");
  });

  it("ignores contracts that are not active", () => {
    const lock = sellLockContract("5");
    const positions = tradeableTilesForPlayer(
      stateWithTiles({
        activeContracts: [{ ...lock, status: "expired" }],
      }),
      "me",
      tileNames,
    ).map((tile) => tile.position);

    expect(positions).toEqual(["3", "5"]);
  });
});

describe("parseCapital", () => {
  it("clamps and floors finite input to a non-negative integer", () => {
    expect(parseCapital("100")).toBe(100);
    expect(parseCapital("12.9")).toBe(12);
    expect(parseCapital("0")).toBe(0);
    expect(parseCapital("-5")).toBe(0);
  });

  it('treats empty string as zero (Number("") === 0)', () => {
    expect(parseCapital("")).toBe(0);
  });

  it("returns NaN for non-finite input so callers can reject it explicitly", () => {
    expect(Number.isNaN(parseCapital("abc"))).toBe(true);
    expect(Number.isNaN(parseCapital("Infinity"))).toBe(true);
    // The panel gates on Number.isFinite(...), which rejects this NaN sentinel.
    expect(Number.isFinite(parseCapital("abc"))).toBe(false);
  });
});
