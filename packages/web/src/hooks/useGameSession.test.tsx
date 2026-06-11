import {
  type GameAction,
  GameErrorKeys,
  type GameLogEntry,
  type GameState,
  type GameSummary,
} from "@oligopoly/validation";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGameConfig } from "../api/gameConfig";
import {
  fetchGameLog,
  fetchGameState,
  fetchGameSummary,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";
import { useGameSession } from "./useGameSession";

vi.mock("../api/gameConfig", () => ({
  fetchGameConfig: vi.fn(),
}));

vi.mock("../api/games", () => ({
  fetchGameLog: vi.fn(),
  fetchGameState: vi.fn(),
  fetchGameSummary: vi.fn(),
  submitGameAction: vi.fn(),
}));

vi.mock("./useGameRealtime", () => ({
  useGameRealtime: vi.fn(() => ({
    wsStatus: "connected",
    turnDeadline: null,
    timerKind: null,
  })),
}));

const summary: GameSummary = {
  id: "game-1",
  status: "active",
  playerCount: 2,
  startedAt: 1,
  endedAt: null,
  winnerId: null,
};

function gameState(round: number): GameState {
  return {
    gameId: "game-1",
    round,
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
        position: 0,
        capital: 900,
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
    tiles: [],
  };
}

describe("useGameSession", () => {
  beforeEach(() => {
    vi.mocked(fetchGameConfig).mockResolvedValue({
      perimeterTiles: [],
      diagonalTiles: [],
    });
    vi.mocked(fetchGameSummary).mockResolvedValue(summary);
    vi.mocked(fetchGameLog).mockReset();
    vi.mocked(fetchGameState).mockReset();
    vi.mocked(submitGameAction).mockReset();
  });

  it("refreshes state and logs after an optimistic action conflict", async () => {
    const initialLog: GameLogEntry[] = [
      {
        id: "log-1",
        gameId: "game-1",
        round: 1,
        playerId: "me",
        actionType: "trade_proposed",
        payload: { offerId: "trade-1" },
        createdAt: 1,
      },
    ];
    const refreshedLog: GameLogEntry[] = [
      ...initialLog,
      {
        id: "log-2",
        gameId: "game-1",
        round: 2,
        playerId: "opponent",
        actionType: "trade_accepted",
        payload: { offerId: "trade-1" },
        createdAt: 2,
      },
    ];
    vi.mocked(fetchGameState)
      .mockResolvedValueOnce(gameState(1))
      .mockResolvedValueOnce(gameState(2));
    vi.mocked(fetchGameLog)
      .mockResolvedValueOnce({ log: initialLog })
      .mockResolvedValueOnce({ log: refreshedLog });
    vi.mocked(submitGameAction).mockRejectedValue(
      new ApiError(GameErrorKeys.STATE_CONFLICT, 409, {
        error: GameErrorKeys.STATE_CONFLICT,
      }),
    );

    const { result } = renderHook(() => useGameSession("game-1", "me"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.runAction("Accepted trade", {
        type: "accept_trade",
        offerId: "trade-1",
      } satisfies GameAction);
    });

    await waitFor(() => expect(result.current.state?.round).toBe(2));
    expect(result.current.logEntries).toHaveLength(2);
    expect(result.current.error).toBe(GameErrorKeys.STATE_CONFLICT);
    expect(fetchGameState).toHaveBeenCalledTimes(2);
    expect(fetchGameLog).toHaveBeenCalledTimes(2);
  });
});
