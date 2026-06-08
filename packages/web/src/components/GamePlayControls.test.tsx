import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { GamePlayControls } from "./GamePlayControls";

describe("GamePlayControls economics dialogs", () => {
  it("shows currency-valued development economics with active affinity modifiers", () => {
    const state: GameState = {
      gameId: "g",
      round: 1,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["me"],
      freeMarketPool: 0,
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      myAffinityCardId: "lean_manufacturing",
      settings: { currencySymbol: "¤", currencyMultiplier: "10" },
      players: [
        {
          playerId: "me",
          displayName: "Ada",
          position: 0,
          capital: 5_000,
          ownedTilePositions: [6, 8, 9],
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
        { position: 6, ownerId: "me", mortgaged: false, developmentTokens: 0 },
        { position: 8, ownerId: "me", mortgaged: false, developmentTokens: 0 },
        { position: 9, ownerId: "me", mortgaged: false, developmentTokens: 0 },
      ],
    };

    render(
      <GamePlayControls
        state={state}
        myPlayerId="me"
        tileNames={
          new Map([
            ["6", "Search Engine Corp."],
            ["8", "Social Media Platform"],
            ["9", "Cloud Infrastructure"],
          ])
        }
        busy={false}
        onAction={async () => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Develop (¤1,120)" }),
    ).toHaveTextContent("¤1,120");
    fireEvent.click(
      screen.getByRole("button", {
        name: /explain developing search engine corp/i,
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: /develop search engine corp/i,
    });
    expect(within(dialog).getByText("¤1,120")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/lean manufacturing applied/i),
    ).toBeInTheDocument();
  });

  it("formats action extra money labels with custom currency multipliers", () => {
    const state: GameState = {
      gameId: "g",
      round: 1,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["me", "opponent"],
      myAffinityCardId: null,
      settings: {
        currencySymbol: "¤",
        currencyMultiplier: "10",
        optionalRuleIds: ["market_manipulation"],
      },
      players: [
        {
          playerId: "me",
          displayName: "Ada",
          position: 0,
          capital: 5_000,
          ownedTilePositions: [],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
        {
          playerId: "opponent",
          displayName: "Grace",
          position: 1,
          capital: 500,
          ownedTilePositions: [6],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
      tiles: [
        {
          position: 6,
          ownerId: "opponent",
          mortgaged: false,
          developmentTokens: 0,
        },
      ],
    };

    render(
      <ActionPhaseExtras
        state={state}
        myPlayerId="me"
        tileNames={new Map([["6", "Search Engine Corp."]])}
        busy={false}
        onAction={async () => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Freeze tile (¤500)" }),
    ).toBeInTheDocument();
  });
});
