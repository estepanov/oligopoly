import {
  type GameAction,
  GameErrorKeys,
  type GameLogEntry,
  type GameState,
  type GameSummary,
} from "@oligopoly/validation";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGameConfig } from "../api/gameConfig";
import {
  fetchGameLog,
  fetchGameState,
  fetchGameSummary,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";
import type { AiPresentationBeatInput } from "../lib/aiPresentationQueue";
import type { GameSessionUpdate } from "./useGameRealtime";
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

type RealtimeCallbacks = {
  onUpdate?: (update: GameSessionUpdate) => void;
  onAiAction?: (update: AiPresentationBeatInput) => void;
};

// Mutable test doubles for the mocked `useGameRealtime`: captures the
// `onUpdate`/`onAiAction` callbacks `useGameSession` wires up so tests can
// simulate WS delivery order/timing directly, and lets tests flip `wsStatus`
// to exercise the connected-vs-disconnected poll gating.
let realtimeCallbacks: RealtimeCallbacks = {};
let mockWsStatus: "connected" | "connecting" | "disconnected" | "error" =
  "connected";

vi.mock("./useGameRealtime", () => ({
  useGameRealtime: vi.fn((_gameId: string | undefined, options: unknown) => {
    realtimeCallbacks = (options ?? {}) as RealtimeCallbacks;
    return {
      wsStatus: mockWsStatus,
      turnDeadline: null,
      timerKind: null,
    };
  }),
}));

const summary: GameSummary = {
  id: "game-1",
  status: "active",
  playerCount: 2,
  startedAt: 1,
  endedAt: null,
  winnerId: null,
};

function gameState(
  round: number,
  stateVersion: number = round,
  currentPlayerIndex = 0,
): GameState {
  return {
    gameId: "game-1",
    round,
    phase: "action",
    stateVersion,
    currentPlayerIndex,
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

function aiActionUpdate(
  stateVersion: number,
  overrides: Partial<AiPresentationBeatInput> = {},
): AiPresentationBeatInput {
  return {
    aiPlayerId: "opponent",
    displayName: "Grace",
    material: true,
    softTurnEnd: false,
    summary: "Grace rolled",
    stateVersion,
    sentAt: Date.now(),
    ...overrides,
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
    realtimeCallbacks = {};
    mockWsStatus = "connected";
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("pairs an ai_action with a same-tick action_applied without waiting for a render commit", async () => {
    // Both states keep the opponent as actor so `needsInteraction` stays
    // false across the update — isolates the version/ref pairing behavior
    // from any confound of the viewer's own turn starting/ending.
    vi.mocked(fetchGameState).mockResolvedValueOnce(gameState(1, 1, 1));
    vi.mocked(fetchGameLog).mockResolvedValueOnce({ log: [] });

    const { result } = renderHook(() => useGameSession("game-1", "me"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state?.stateVersion).toBe(1);

    const nextState = gameState(2, 2, 1);
    act(() => {
      // Simulate the WS delivering `game.action_applied` and `game.ai_action`
      // back-to-back in the same synchronous tick, before React has a chance
      // to commit the canonical state update (and re-run the render-time
      // `stateRef.current = state` assignment).
      realtimeCallbacks.onUpdate?.({
        state: nextState,
        source: "Realtime state update",
      });
      realtimeCallbacks.onAiAction?.(aiActionUpdate(2));
    });

    expect(result.current.presentationMode).toBe("watching");
    expect(result.current.currentPresentationBeat?.stateVersion).toBe(2);
  });

  it("pairs an ai_action that arrives before its matching action_applied", async () => {
    vi.mocked(fetchGameState).mockResolvedValueOnce(gameState(1, 1, 1));
    vi.mocked(fetchGameLog).mockResolvedValueOnce({ log: [] });

    const { result } = renderHook(() => useGameSession("game-1", "me"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      realtimeCallbacks.onAiAction?.(aiActionUpdate(2));
    });
    // Buffered until the matching canonical state at version 2 arrives.
    expect(result.current.presentationMode).toBe("caught_up");

    const nextState = gameState(2, 2, 1);
    act(() => {
      realtimeCallbacks.onUpdate?.({
        state: nextState,
        source: "Realtime state update",
      });
    });

    expect(result.current.presentationMode).toBe("watching");
    expect(result.current.currentPresentationBeat?.stateVersion).toBe(2);
  });

  it("keeps presenting queued AI beats after canonical flips to the human's turn, absent an urgent obligation", async () => {
    // Regression: a fast-finishing `runAiTurnLoop` can advance canonical all
    // the way to "my turn" before the client has drained the AI beats that
    // led there. Canonical `isMyTurn` alone must not force a catch-up while
    // a beat is still current/queued — only an urgent obligation (auction
    // bid owed, pending inbound trade) does that.
    vi.mocked(fetchGameState).mockResolvedValueOnce(gameState(1, 1, 1));
    vi.mocked(fetchGameLog).mockResolvedValueOnce({ log: [] });

    const { result } = renderHook(() => useGameSession("game-1", "me"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First AI-seat action: opponent still acting.
    act(() => {
      realtimeCallbacks.onUpdate?.({
        state: gameState(2, 2, 1),
        source: "Realtime state update",
      });
      realtimeCallbacks.onAiAction?.(aiActionUpdate(2));
    });
    expect(result.current.presentationMode).toBe("watching");
    expect(result.current.currentPresentationBeat?.stateVersion).toBe(2);

    // Second AI-seat action hands the turn back to "me" (currentPlayerIndex
    // 0), with no auction bid owed or pending trade offer.
    act(() => {
      realtimeCallbacks.onUpdate?.({
        state: gameState(3, 3, 0),
        source: "Realtime state update",
      });
      realtimeCallbacks.onAiAction?.(
        aiActionUpdate(3, {
          softTurnEnd: true,
          summary: "Grace ended her turn",
        }),
      );
    });

    // Must still be watching the first beat with the second queued behind
    // it — not immediately jumped to caught_up with an empty queue.
    expect(result.current.presentationMode).toBe("watching");
    expect(result.current.currentPresentationBeat?.stateVersion).toBe(2);
    expect(result.current.myTurn).toBe(true);
    expect(result.current.controls.locked).toBe(true);
  });

  it("only falls back to polling while the WS is disconnected, not while connected", async () => {
    vi.mocked(fetchGameState).mockResolvedValue(gameState(1, 1, 1));
    vi.mocked(fetchGameLog).mockResolvedValue({ log: [] });
    mockWsStatus = "connected";

    const { result, rerender } = renderHook(() =>
      useGameSession("game-1", "me"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchGameState).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // Connected: `game.action_applied`/`game.ai_action` cover every turn, so
    // the backup poll must not fire (it would call `refresh()` ->
    // `skipPresentation()` and cut AI-beat pacing short).
    expect(fetchGameState).toHaveBeenCalledTimes(1);

    mockWsStatus = "disconnected";
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    // Disconnected: the poll is the only remaining source of updates.
    expect(fetchGameState).toHaveBeenCalledTimes(2);
  });
});
