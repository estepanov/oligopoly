import type {
  GameAction,
  GameLogEntry,
  GameState,
  GameSummary,
} from "@oligopoly/validation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchGameConfig } from "../api/gameConfig";
import {
  fetchGameLog,
  fetchGameState,
  fetchGameSummary,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";
import { useAuth } from "../components/AuthContext";
import { BoardGrid } from "../components/BoardGrid";
import { GameActionLog } from "../components/GameActionLog";
import { GameBoardPanel } from "../components/GameBoardPanel";
import { GamePlayControls } from "../components/GamePlayControls";
import { useGameRealtime } from "../hooks/useGameRealtime";
import { buildTileNameMap } from "../lib/boardDisplay";
import { currentActorId, isMyTurn } from "../lib/gameUi";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [logEntries, setLogEntries] = useState<GameLogEntry[]>([]);
  const [tileNames, setTileNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const handleRealtimeState = useCallback(
    (nextState: GameState, source: string) => {
      setState(nextState);
      setLastAction(source);
    },
    [],
  );

  const { wsStatus, turnDeadline, lastEvent, setLastEvent } = useGameRealtime(
    id,
    {
      onState: handleRealtimeState,
    },
  );

  useEffect(() => {
    let cancelled = false;
    void fetchGameConfig()
      .then((config) => {
        if (!cancelled) setTileNames(buildTileNameMap(config));
      })
      .catch(() => {
        if (!cancelled) setTileNames(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) {
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
        const [summary, gameState, logResponse] = await Promise.all([
          fetchGameSummary(id),
          fetchGameState(id),
          fetchGameLog(id).catch(() => ({ log: [] as GameLogEntry[] })),
        ]);
        if (!cancelled) {
          setGame(summary);
          setState(gameState);
          setLogEntries(logResponse.log);
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
  }, [id]);

  const myPlayerId = useMemo(() => {
    if (!user || !state?.players) return null;
    const match = state.players.find(
      (player) => player.playerId === user.userId,
    );
    return match ? user.userId : null;
  }, [state?.players, user]);

  const runAction = async (label: string, action: GameAction) => {
    if (!id) return;
    setBusyAction(true);
    setError(null);
    try {
      const next = await submitGameAction(id, action);
      setState(next);
      setLastAction(label);
      if (next.logEntries?.length) {
        const appended = next.logEntries;
        setLogEntries((current) => [...current, ...appended]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyAction(false);
    }
  };

  const refreshState = async () => {
    if (!id) return;
    const [gameState, logResponse] = await Promise.all([
      fetchGameState(id),
      fetchGameLog(id).catch(() => ({ log: [] as GameLogEntry[] })),
    ]);
    setState(gameState);
    setLogEntries(logResponse.log);
    setLastEvent(null);
  };

  const currentPlayerId = state ? currentActorId(state) : null;
  const myTurn = state ? isMyTurn(state, myPlayerId) : false;
  const statusLine = lastAction ?? lastEvent;

  if (!id) {
    return (
      <div>
        <p className="errorText">Invalid route.</p>
        <Link to="/games">← Back to games</Link>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/games">← All games</Link>
        {" · "}
        <Link to="/lobbies">Lobbies</Link>
      </p>
      <h1 className="pageTitle">Game</h1>
      <p className="tagline">
        <code className="inline">{id}</code>
      </p>

      <div className="card">
        <h2>Summary</h2>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="errorText">{error}</p>}
        {!loading && !error && game && (
          <dl
            style={{
              display: "grid",
              gap: "0.5rem 1rem",
              gridTemplateColumns: "auto 1fr",
            }}
          >
            <dt className="muted">Status</dt>
            <dd>{game.status}</dd>
            <dt className="muted">Players</dt>
            <dd>{game.playerCount}</dd>
            <dt className="muted">Started</dt>
            <dd>{new Date(game.startedAt).toLocaleString()}</dd>
            <dt className="muted">Ended</dt>
            <dd>
              {game.endedAt !== null
                ? new Date(game.endedAt).toLocaleString()
                : "—"}
            </dd>
            <dt className="muted">Winner</dt>
            <dd>{game.winnerId ?? "—"}</dd>
          </dl>
        )}
      </div>

      {state && (
        <>
          <div className="card">
            <h2>Board</h2>
            <BoardGrid
              state={state}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
            />
            <GameBoardPanel
              state={state}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
            />
          </div>

          <div className="card">
            <h2>Action log</h2>
            <GameActionLog entries={logEntries} tileNames={tileNames} />
          </div>
        </>
      )}

      <div className="card">
        <h2>Play</h2>
        {state ? (
          <>
            <dl className="detailsGrid">
              <dt className="muted">Realtime</dt>
              <dd>{wsStatus}</dd>
              <dt className="muted">Your turn</dt>
              <dd>{myTurn ? "Yes" : "No"}</dd>
              <dt className="muted">Turn deadline</dt>
              <dd>
                {turnDeadline
                  ? new Date(turnDeadline).toLocaleTimeString()
                  : "—"}
              </dd>
              <dt className="muted">Round</dt>
              <dd>{state.round}</dd>
              <dt className="muted">Phase</dt>
              <dd>{state.phase ?? "unknown"}</dd>
              <dt className="muted">Current actor</dt>
              <dd>
                <code className="inline">{currentPlayerId ?? "—"}</code>
              </dd>
            </dl>

            <GamePlayControls
              state={state}
              myPlayerId={myPlayerId}
              tileNames={tileNames}
              busy={busyAction}
              onAction={runAction}
            />

            <div className="buttonRow" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction}
                onClick={() => void refreshState()}
              >
                Refresh
              </button>
            </div>
            {statusLine && <p className="muted">{statusLine}</p>}
          </>
        ) : (
          <p className="muted">Sign in as a game participant to load state.</p>
        )}
      </div>
    </div>
  );
}
