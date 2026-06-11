import type { GameState } from "@oligopoly/validation";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { GamePlayControls } from "./GamePlayControls";

const tileNames = new Map([
  ["6", "Search Engine Corp."],
  ["8", "Social Media Platform"],
  ["9", "Cloud Infrastructure"],
]);

function baseGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me", "opponent"],
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
      {
        playerId: "opponent",
        displayName: "Grace",
        position: 1,
        capital: 500,
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
    tiles: [],
    ...overrides,
  };
}

describe("GamePlayControls next-action guidance", () => {
  it("foregrounds roll guidance without changing the roll action", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);

    render(
      <GamePlayControls
        state={baseGameState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Movement")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Roll to move" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the server rolls the dice and moves you/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Roll dice" }));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Rolled dice", {
        type: "roll_dice",
      });
    });
  });

  it("renames and disables the active action while waiting on the server", () => {
    render(
      <GamePlayControls
        state={baseGameState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={true}
        pendingAction={{ label: "Rolled dice", type: "roll_dice" }}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Rolling..." })).toBeDisabled();
  });

  it("explains buy and decline decisions with face-value purchase context", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);

    render(
      <GamePlayControls
        state={baseGameState({
          phase: "waiting_for_buy",
          pendingBuyTilePosition: 6,
        })}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Right of first refusal")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Buy the tile or open an auction",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Search Engine Corp.")).toBeInTheDocument();
    expect(screen.getByText("$140")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$360")).toBeInTheDocument();
    expect(
      screen.getByText(
        /declining starts an auction where every eligible player/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Buy Search Engine Corp." }),
    );

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Bought tile", {
        type: "buy_tile",
        tilePosition: 6,
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Decline - start auction" }),
    );

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Declined tile", {
        type: "decline_tile",
        tilePosition: 6,
      });
    });
  });

  it("explains route choice while preserving path actions", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);

    render(
      <GamePlayControls
        state={baseGameState({ phase: "waiting_for_path_choice" })}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Route choice")).toBeInTheDocument();
    expect(
      screen.getByText(/perimeter keeps you on the outer board/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Take Diagonal Express" }),
    );

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Chose diagonal path", {
        type: "path_choice",
        choice: "diagonal",
      });
    });
  });
});

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
        tileNames={tileNames}
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

  it("keeps trade response controls visible during insider peek", () => {
    const state: GameState = {
      gameId: "g",
      round: 1,
      phase: "waiting_for_insider_peek",
      currentPlayerIndex: 0,
      turnOrder: ["drawer", "me"],
      freeMarketPool: 0,
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      pendingInsiderPeek: {
        drawingPlayerId: "drawer",
        cardId: "optional_insider_trading",
      },
      settings: { currencySymbol: "$" },
      players: [
        {
          playerId: "drawer",
          displayName: "Ada",
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
          playerId: "me",
          displayName: "Grace",
          position: 1,
          capital: 900,
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
          position: 3,
          ownerId: "drawer",
          mortgaged: false,
          developmentTokens: 0,
        },
        { position: 6, ownerId: "me", mortgaged: false, developmentTokens: 0 },
      ],
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "g",
          proposerId: "drawer",
          recipientId: "me",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    };

    render(
      <GamePlayControls
        state={state}
        myPlayerId="me"
        tileNames={
          new Map([
            ["3", "Mobile Gaming Inc."],
            ["6", "Search Engine Corp."],
          ])
        }
        busy={false}
        onAction={async () => undefined}
      />,
    );

    expect(screen.getByText("Insider trading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept trade/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /counter/i })).toBeDisabled();
  });
});
