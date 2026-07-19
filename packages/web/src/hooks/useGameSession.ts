import type {
  GameAction,
  GameLogEntry,
  GameState,
  GameSummary,
} from "@oligopoly/validation";
import { GameErrorKeys } from "@oligopoly/validation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchGameConfig } from "../api/gameConfig";
import {
  fetchGameLog,
  fetchGameState,
  fetchGameSummary,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";
import { type BoardTileDetails, buildTileMaps } from "../lib/boardDisplay";
import {
  currentActorId,
  isMyTurn,
  mergeAuctionClientView,
  viewerNeedsInteraction,
} from "../lib/gameUi";
import { useAiPresentation } from "./useAiPresentation";
import {
  type GameAiActionUpdate,
  type GameSessionUpdate,
  useGameRealtime,
} from "./useGameRealtime";

type PendingGameAction = {
  label: string;
  type: GameAction["type"];
  startedAt: number;
};

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
  const [pendingAction, setPendingAction] = useState<PendingGameAction | null>(
    null,
  );
  const [lastActionLatencyMs, setLastActionLatencyMs] = useState<number | null>(
    null,
  );

  const myPlayerId = useMemo(() => {
    if (!myUserId || !state?.players) return null;
    return state.players.some((player) => player.playerId === myUserId)
      ? myUserId
      : null;
  }, [myUserId, state?.players]);

  const needsInteraction = useMemo(
    () => (state ? viewerNeedsInteraction(state, myPlayerId) : false),
    [state, myPlayerId],
  );

  const {
    presentationState,
    presentationMode,
    currentPresentationBeat,
    pushAiAction,
    skip: skipPresentation,
  } = useAiPresentation(state, myPlayerId, needsInteraction);

  // AI beats and their matching canonical state can arrive over WS in either
  // order (ai_action usually follows action_applied, but is not guaranteed
  // to). Buffer by `stateVersion` until both halves of the pair are known,
  // per the pairing strategy in the AI turn presentation design doc.
  const pendingAiRef = useRef<Map<number, GameAiActionUpdate>>(new Map());
  // Mirrors `state`, but assigned synchronously wherever canonical state is
  // produced (rather than only at render time via `stateRef.current = state`)
  // so that an `ai_action` arriving in the same tick as its pairing
  // `action_applied`/snapshot can match immediately, without waiting for a
  // React commit to land the ref update.
  const stateRef = useRef<GameState | null>(state);
  stateRef.current = state;

  const applySessionUpdate = useCallback(
    (update: GameSessionUpdate) => {
      // `mergeAuctionClientView` exists because auctions hold client-LOCAL state
      // (the optimistic `mySubmission`) that a server broadcast would otherwise
      // wipe. `tradeOffers` deliberately has NO symmetric merge: there is no
      // client-local trade state to preserve — every broadcast carries the
      // viewer's own offers (the DO re-injects them per viewer via
      // `filterTradeOffersForViewer`), so we always take the server's `tradeOffers`
      // verbatim. If a future broadcast path ever omitted `tradeOffers`, that would
      // be a server-side bug to fix at the source, not something to patch here.
      const merged = mergeAuctionClientView(stateRef.current, update.state);
      stateRef.current = merged;
      setState(merged);
      if (update.logEntries?.length) {
        setLogEntries((current) =>
          appendLogEntries(current, update.logEntries),
        );
      }
      setStatusLine(update.source);

      const version = merged.stateVersion;
      if (version === undefined) return;
      for (const [pendingVersion, pendingBeat] of pendingAiRef.current) {
        if (pendingVersion > version) continue;
        pendingAiRef.current.delete(pendingVersion);
        if (pendingVersion === version) {
          pushAiAction(pendingBeat, merged);
        }
      }
    },
    [pushAiAction],
  );

  const handleAiAction = useCallback(
    (update: GameAiActionUpdate) => {
      const current = stateRef.current;
      if (current && current.stateVersion === update.stateVersion) {
        pushAiAction(update, current);
        return;
      }
      pendingAiRef.current.set(update.stateVersion, update);
    },
    [pushAiAction],
  );

  const { wsStatus, turnDeadline, timerKind } = useGameRealtime(gameId, {
    onUpdate: applySessionUpdate,
    onAiAction: handleAiAction,
  });

  const previousWsStatusRef = useRef(wsStatus);
  useEffect(() => {
    if (
      previousWsStatusRef.current === "connected" &&
      wsStatus !== "connected"
    ) {
      skipPresentation();
    }
    previousWsStatusRef.current = wsStatus;
  }, [wsStatus, skipPresentation]);

  useEffect(() => {
    let cancelled = false;
    void fetchGameConfig()
      .then((config) => {
        if (!cancelled) {
          const { names, details } = buildTileMaps(config);
          setTileNames(names);
          setTileDetails(details);
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

  const refresh = useCallback(async () => {
    if (!gameId) return;
    const [gameState, log] = await Promise.all([
      fetchGameState(gameId),
      loadGameLog(gameId),
    ]);
    setState((current) => mergeAuctionClientView(current, gameState));
    setLogEntries(log);
    setStatusLine(null);
    // Poll/refresh is the degrade-to-jump-to-latest path (WS down, backup
    // AI-turn poll, or an explicit manual refresh): always catch presentation
    // up to canonical rather than pacing from a possibly-stale queue.
    skipPresentation();
  }, [gameId, skipPresentation]);

  const actionsLocked = presentationMode === "watching";

  const runAction = useCallback(
    async (label: string, action: GameAction) => {
      if (!gameId || actionsLocked) return;
      const startedAt =
        typeof performance === "undefined" ? Date.now() : performance.now();
      setBusyAction(true);
      setPendingAction({ label, type: action.type, startedAt: Date.now() });
      setStatusLine(`${label}...`);
      setLastActionLatencyMs(null);
      setError(null);
      try {
        const next = await submitGameAction(gameId, action);
        const finishedAt =
          typeof performance === "undefined" ? Date.now() : performance.now();
        const latencyMs = Math.max(0, Math.round(finishedAt - startedAt));

        startTransition(() => {
          setState((current) => mergeAuctionClientView(current, next));
          setStatusLine(`${label} confirmed`);
          setLastActionLatencyMs(latencyMs);
          setPendingAction(null);
          setBusyAction(false);
          if (next.logEntries?.length) {
            setLogEntries((current) =>
              appendLogEntries(current, next.logEntries),
            );
          }
        });
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.status === 409 &&
          e.message === GameErrorKeys.STATE_CONFLICT
        ) {
          await refresh();
        }
        setError(e instanceof ApiError ? e.message : "Action failed");
        setPendingAction(null);
        setBusyAction(false);
      }
    },
    [gameId, refresh, actionsLocked],
  );

  useEffect(() => {
    if (!gameId || state?.phase === "game_over") return;
    // WS delivers `game.action_applied`/`game.ai_action` for every turn,
    // including AI-controlled ones, so no backup poll is needed while
    // connected — polling here would call `refresh()` -> `skipPresentation()`
    // on a timer and cut the AI presentation pacing short. Only fall back to
    // polling when the socket is down.
    if (wsStatus === "connected") return;

    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [gameId, refresh, state?.phase, wsStatus]);

  return {
    game,
    state,
    logEntries,
    tileNames,
    tileDetails,
    error,
    loading,
    busyAction,
    pendingAction,
    lastActionLatencyMs,
    statusLine,
    wsStatus,
    turnDeadline,
    timerKind,
    myPlayerId,
    myTurn: state ? isMyTurn(state, myPlayerId) : false,
    currentPlayerId: state ? currentActorId(state) : null,
    runAction,
    refresh,
    canonicalState: state,
    presentationState,
    presentationMode,
    currentPresentationBeat,
    skipPresentation,
    actionsLocked,
  };
}
