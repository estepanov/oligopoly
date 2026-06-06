import type {
  GameAction,
  GameLogEntry,
  GameState,
  GameSummary,
} from "@oligopoly/validation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchGameConfig } from "../api/gameConfig";
import {
  fetchGameLog,
  fetchGameState,
  fetchGameSummary,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";
import {
  type BoardTileDetails,
  buildTileDetailsMap,
  buildTileNameMap,
} from "../lib/boardDisplay";
import {
  currentActorId,
  isAiControlledActor,
  isMyTurn,
  mergeAuctionClientView,
} from "../lib/gameUi";
import { type GameSessionUpdate, useGameRealtime } from "./useGameRealtime";

function appendLogEntries(
  current: GameLogEntry[],
  incoming: GameLogEntry[] | undefined,
): GameLogEntry[] {
  if (!incoming?.length) return current;
  const seen = new Set(current.map((entry) => entry.id));
  const novel = incoming.filter((entry) => !seen.has(entry.id));
  return novel.length ? [...current, ...novel] : current;
}

async function loadGameLog(gameId: string): Promise<GameLogEntry[]> {
  try {
    const response = await fetchGameLog(gameId);
    return response.log;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 401)
    ) {
      return [];
    }
    throw error;
  }
}

export function useGameSession(
  gameId: string | undefined,
  myUserId: string | null,
) {
  const [game, setGame] = useState<GameSummary | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [logEntries, setLogEntries] = useState<GameLogEntry[]>([]);
  const [tileNames, setTileNames] = useState<Map<string, string>>(new Map());
  const [tileDetails, setTileDetails] = useState<Map<string, BoardTileDetails>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const applySessionUpdate = useCallback((update: GameSessionUpdate) => {
    setState((current) => mergeAuctionClientView(current, update.state));
    if (update.logEntries?.length) {
      setLogEntries((current) => appendLogEntries(current, update.logEntries));
    }
    setStatusLine(update.source);
  }, []);

  const { wsStatus, turnDeadline, timerKind } = useGameRealtime(gameId, {
    onUpdate: applySessionUpdate,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchGameConfig()
      .then((config) => {
        if (!cancelled) {
          setTileNames(buildTileNameMap(config));
          setTileDetails(buildTileDetailsMap(config));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTileNames(new Map());
          setTileDetails(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      setState(null);
      setLogEntries([]);
      setError("Missing game id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summary, gameState, log] = await Promise.all([
          fetchGameSummary(gameId),
          fetchGameState(gameId),
          loadGameLog(gameId),
        ]);
        if (!cancelled) {
          setGame(summary);
          setState((current) => mergeAuctionClientView(current, gameState));
          setLogEntries(log);
        }
      } catch (e) {
        if (!cancelled) {
          setGame(null);
          setState(null);
          setLogEntries([]);
          if (e instanceof ApiError && e.status === 404) {
            setError("Game not found.");
          } else {
            setError(e instanceof ApiError ? e.message : "Failed to load game");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const myPlayerId = useMemo(() => {
    if (!myUserId || !state?.players) return null;
    return state.players.some((player) => player.playerId === myUserId)
      ? myUserId
      : null;
  }, [myUserId, state?.players]);

  const runAction = useCallback(
    async (label: string, action: GameAction) => {
      if (!gameId) return;
      setBusyAction(true);
      setError(null);
      try {
        const next = await submitGameAction(gameId, action);
        setState((current) => mergeAuctionClientView(current, next));
        setStatusLine(label);
        if (next.logEntries?.length) {
          setLogEntries((current) =>
            appendLogEntries(current, next.logEntries),
          );
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Action failed");
      } finally {
        setBusyAction(false);
      }
    },
    [gameId],
  );

  const refresh = useCallback(async () => {
    if (!gameId) return;
    const [gameState, log] = await Promise.all([
      fetchGameState(gameId),
      loadGameLog(gameId),
    ]);
    setState((current) => mergeAuctionClientView(current, gameState));
    setLogEntries(log);
    setStatusLine(null);
  }, [gameId]);

  useEffect(() => {
    if (!gameId || state?.phase === "game_over") return;
    const actorId = state ? currentActorId(state) : null;
    const shouldPoll =
      wsStatus !== "connected" ||
      (state ? isAiControlledActor(state, actorId) : false);
    if (!shouldPoll) return;

    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [gameId, refresh, state, wsStatus]);

  return {
    game,
    state,
    logEntries,
    tileNames,
    tileDetails,
    error,
    loading,
    busyAction,
    statusLine,
    wsStatus,
    turnDeadline,
    timerKind,
    myPlayerId,
    myTurn: state ? isMyTurn(state, myPlayerId) : false,
    currentPlayerId: state ? currentActorId(state) : null,
    runAction,
    refresh,
  };
}
