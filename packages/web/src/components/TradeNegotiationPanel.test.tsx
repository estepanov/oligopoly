import type { GameAction, GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GamePlayControls } from "./GamePlayControls";
import { TradeNegotiationPanel } from "./trade-negotiation";

function tradeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
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
        playerId: "opponent",
        displayName: "Grace",
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
    tiles: [
      { position: 3, ownerId: "me", mortgaged: false, developmentTokens: 0 },
      {
        position: 6,
        ownerId: "opponent",
        mortgaged: false,
        developmentTokens: 0,
      },
    ],
    ...overrides,
  };
}

const tileNames = new Map([
  ["3", "Mobile Gaming Inc."],
  ["6", "Search Engine Corp."],
]);

describe("TradeNegotiationPanel", () => {
  it("submits a money plus property trade offer", async () => {
    const onAction = vi.fn<(_: string, action: GameAction) => Promise<void>>(
      async () => undefined,
    );

    render(
      <TradeNegotiationPanel
        state={tradeState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /counterparty/i }), {
      target: { value: "opponent" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /capital you give/i }),
      { target: { value: "100" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /capital you request/i }),
      { target: { value: "50" } },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /mobile gaming inc/i }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /search engine corp/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /propose trade/i }));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Proposed trade", {
        type: "propose_trade",
        recipientId: "opponent",
        gives: { capital: 100, tilePositions: ["3"] },
        receives: { capital: 50, tilePositions: ["6"] },
      });
    });
  });

  it("shows incoming offers out of turn and keeps counter available", () => {
    const onAction = vi.fn<(_: string, action: GameAction) => Promise<void>>(
      async () => undefined,
    );
    const state = tradeState({
      currentPlayerIndex: 0,
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "g",
          proposerId: "me",
          recipientId: "opponent",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    });

    render(
      <GamePlayControls
        state={state}
        myPlayerId="opponent"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("button", { name: /accept trade/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /counter/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /accept trade/i }));

    expect(onAction).toHaveBeenCalledWith("Accepted trade from Ada", {
      type: "accept_trade",
      offerId: "trade-1",
    });
  });

  it("shows pending offers sent by the current player", () => {
    const state = tradeState({
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "g",
          proposerId: "me",
          recipientId: "opponent",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    });

    render(
      <TradeNegotiationPanel
        state={state}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={async () => undefined}
      />,
    );

    const sentOffers = screen.getByLabelText(/sent trade offers/i);
    expect(sentOffers).toHaveTextContent("Sent to Grace");
    expect(sentOffers).toHaveTextContent("You give");
    expect(sentOffers).toHaveTextContent("Mobile Gaming Inc.");
    expect(sentOffers).toHaveTextContent("You request");
    expect(sentOffers).toHaveTextContent("Search Engine Corp.");
  });

  it("does not render response actions for a pending incoming offer once the game is over", () => {
    const state = tradeState({
      phase: "game_over",
      winnerId: "me",
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "g",
          proposerId: "me",
          recipientId: "opponent",
          gives: { capital: 100, tilePositions: [3] },
          receives: { capital: 50, tilePositions: [6] },
          status: "pending",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    });

    render(
      <TradeNegotiationPanel
        state={state}
        myPlayerId="opponent"
        tileNames={tileNames}
        busy={false}
        onAction={async () => undefined}
      />,
    );

    // The offer card still renders, but no Accept/Reject/Counter controls.
    expect(screen.getByText(/offer from ada/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /accept trade/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^counter$/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the proposal composer when the current player has no action points", () => {
    const base = tradeState();
    const state = tradeState({
      players: (base.players ?? []).map((player) =>
        player.playerId === "me"
          ? { ...player, actionPointsRemaining: 0 }
          : player,
      ),
    });

    render(
      <TradeNegotiationPanel
        state={state}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={async () => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /propose trade/i }),
    ).not.toBeInTheDocument();
  });
});
