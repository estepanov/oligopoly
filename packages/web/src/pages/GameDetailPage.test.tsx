import type { GameState } from "@oligopoly/validation";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import { GameDetailPage } from "./GameDetailPage";

const runAction = vi.fn();
const refresh = vi.fn();
const sessionOverride = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

const state: GameState = {
  gameId: "game-1",
  round: 1,
  phase: "action",
  currentPlayerIndex: 0,
  turnOrder: ["human-1", "human-2"],
  players: [
    {
      playerId: "human-1",
      displayName: "Ada",
      position: 6,
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
    {
      playerId: "human-2",
      displayName: "Grace",
      position: 8,
      capital: 450,
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
  tiles: [
    { position: 6, ownerId: "human-1", mortgaged: false, developmentTokens: 0 },
  ],
  settings: { currencySymbol: "$" },
};

vi.mock("../components/AuthContext", () => ({
  useAuth: () => ({ user: { userId: "human-1" } }),
}));

vi.mock("../hooks/useGameSession", () => ({
  useGameSession: () => ({
    game: {
      gameId: "game-1",
      status: "active",
      playerCount: 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      winnerId: null,
    },
    state,
    logEntries: [],
    tileNames: new Map([
      ["6", "Search Engine Corp."],
      ["8", "Social Media Platform"],
    ]),
    tileDetails: new Map([
      [
        "6",
        {
          position: 6,
          name: "Search Engine Corp.",
          type: "sector_tile",
          cost: 100,
          baseRent: 20,
        },
      ],
      [
        "8",
        {
          position: 8,
          name: "Social Media Platform",
          type: "sector_tile",
          cost: 100,
          baseRent: 20,
        },
      ],
    ]),
    error: null,
    loading: false,
    busyAction: false,
    pendingAction: null,
    lastActionLatencyMs: null,
    statusLine: "Connected",
    wsStatus: "connected",
    turnDeadline: null,
    timerKind: "turn",
    myPlayerId: "human-1",
    myTurn: true,
    runAction,
    refresh,
    ...sessionOverride.value,
  }),
}));

describe("GameDetailPage", () => {
  afterEach(() => {
    sessionOverride.value = {};
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/games/game-1"]}>
        <Routes>
          <Route path="/games/:id" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders play controls before the board and exposes a readable mobile board overview", () => {
    const { container } = renderPage();

    const playHeading = screen.getByRole("heading", {
      level: 2,
      name: "Play",
    });
    const boardHeading = screen.getByRole("heading", {
      level: 2,
      name: "Board",
    });

    expect(
      playHeading.compareDocumentPosition(boardHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: /mobile board overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /relevant board tiles/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Full board")).toBeInTheDocument();
    expect(container.querySelector(".boardGrid")).toBeInTheDocument();
  });

  it("does not show the participant fallback while loading", () => {
    sessionOverride.value = {
      state: null,
      loading: true,
      error: null,
    };

    renderPage();

    expect(screen.getByText(/loading table state/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/sign in as a game participant/i),
    ).not.toBeInTheDocument();
  });

  it("shows game-load errors without conflicting fallback copy", () => {
    sessionOverride.value = {
      state: null,
      loading: false,
      error: "Failed to load game",
    };

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load game");
    expect(
      screen.queryByText(/sign in as a game participant/i),
    ).not.toBeInTheDocument();
  });

  it("shows immediate pending feedback while an action is being confirmed", () => {
    sessionOverride.value = {
      state: { ...state, phase: "waiting_for_roll" },
      busyAction: true,
      pendingAction: {
        label: "Rolled dice",
        type: "roll_dice",
        startedAt: Date.now(),
      },
      statusLine: "Rolled dice...",
    };

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Rolled dice");
    expect(screen.getByRole("button", { name: "Rolling..." })).toBeDisabled();
  });

  it("reports measured action latency after confirmation", () => {
    sessionOverride.value = {
      statusLine: "Ended turn confirmed",
      lastActionLatencyMs: 183,
    };

    renderPage();

    expect(
      screen.getByText("Ended turn confirmed in 183 ms"),
    ).toBeInTheDocument();
  });
});
