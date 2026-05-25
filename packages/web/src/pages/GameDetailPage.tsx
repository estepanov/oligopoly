import type { GameState, GameSummary } from "@oligopoly/validation";
import {
  GameRealtimeEventSchema,
  GameStateSchema,
} from "@oligopoly/validation";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchGameState,
  fetchGameSummary,
  gameWebSocketUrl,
  stepAiTurn,
  submitGameAction,
} from "../api/games";
import { ApiError } from "../api/http";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const isAiTurn = (gameState: GameState | null) => {
    if (!gameState) return false;
    const actorId =
      gameState.turnOrder?.[gameState.currentPlayerIndex ?? -1] ?? null;
    if (!actorId) return false;
    const player = gameState.players?.find((entry) => entry.playerId === actorId);
    if (player?.kind === "ai") return true;
    return (gameState.aiPlayers ?? []).some(
      (ai) => ai.playerId === actorId || ai.takeoverForPlayerId === actorId,
    );
  };

  useEffect(() => {
    if (!id) {
      setGame(null);
      setError("Missing game id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summary, gameState] = await Promise.all([
          fetchGameSummary(id),
          fetchGameState(id),
        ]);
        if (!cancelled) {
          setGame(summary);
          setState(gameState);
        }
      } catch (e) {
        if (!cancelled) {
          setGame(null);
          setState(null);
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

  useEffect(() => {
    if (!id) return;

    setWsStatus("connecting");
    const socket = new WebSocket(gameWebSocketUrl(id));
    socket.onopen = () => setWsStatus("connected");
    socket.onclose = () => setWsStatus("disconnected");
    socket.onerror = () => setWsStatus("error");
    socket.onmessage = (event) => {
      try {
        const parsed = GameRealtimeEventSchema.safeParse(
          JSON.parse(String(event.data)),
        );
        if (parsed.success) {
          const message = parsed.data;
          if (message.type === "game.action_applied" && "state" in message) {
            setState(GameStateSchema.parse(message.state));
            setLastAction("Realtime state update");
            return;
          }
          if (message.type === "game.snapshot" && "payload" in message) {
            setState(GameStateSchema.parse(message.payload));
            setLastAction("Realtime snapshot");
            return;
          }
          if (message.type === "game.timer" && "deadlineAt" in message) {
            setTurnDeadline(message.deadlineAt ?? null);
            return;
          }
        }
      } catch {
        // Fall through to raw event logging.
      }
      setLastAction(`Realtime event: ${event.data}`);
    };
    return () => socket.close();
  }, [id]);

  useEffect(() => {
    if (!id || !state || busyAction || state.phase === "game_over") return;
    if (!isAiTurn(state)) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusyAction(true);
        setError(null);
        try {
          const next = await stepAiTurn(id);
          if (!cancelled) {
            setState(next);
            setLastAction(
              next.aiAction
                ? `AI ${next.aiPlayerId} chose ${next.aiAction.type}`
                : "AI step complete",
            );
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof ApiError ? e.message : "AI step failed");
          }
        } finally {
          if (!cancelled) setBusyAction(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, state, busyAction]);

  const refreshState = async () => {
    if (!id) return;
    setState(await fetchGameState(id));
  };

  const runAction = async (
    label: string,
    action:
      | { type: "roll_dice" }
      | { type: "buy_tile"; tilePosition: number | string }
      | { type: "decline_tile"; tilePosition: number | string }
      | { type: "end_turn" },
  ) => {
    if (!id) return;
    setBusyAction(true);
    setError(null);
    try {
      const next = await submitGameAction(id, action);
      setState(next);
      setLastAction(label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyAction(false);
    }
  };

  const runAiStep = async () => {
    if (!id) return;
    setBusyAction(true);
    setError(null);
    try {
      const next = await stepAiTurn(id);
      setState(next);
      setLastAction(
        next.aiAction
          ? `AI ${next.aiPlayerId} chose ${next.aiAction.type}`
          : "AI step complete",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI step failed");
    } finally {
      setBusyAction(false);
    }
  };

  const currentPlayerId =
    state?.turnOrder?.[state.currentPlayerIndex ?? -1] ?? null;
  const currentPlayer = state?.players?.find(
    (player) => player.playerId === currentPlayerId,
  );
  const pendingTile = state?.pendingBuyTilePosition ?? null;

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

      <div className="card">
        <h2>Play</h2>
        {state ? (
          <>
            <dl className="detailsGrid">
              <dt className="muted">Realtime</dt>
              <dd>{wsStatus}</dd>
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
              <dt className="muted">Current turn</dt>
              <dd>
                <code className="inline">{currentPlayerId ?? "—"}</code>
                {currentPlayer?.kind === "ai" ? " (AI)" : ""}
              </dd>
              <dt className="muted">Pending tile</dt>
              <dd>{pendingTile ?? "—"}</dd>
            </dl>

            <div className="buttonRow">
              <button
                type="button"
                className="button"
                disabled={
                  busyAction ||
                  !["waiting_for_roll", "rolling_doubles"].includes(
                    state.phase ?? "",
                  )
                }
                onClick={() =>
                  void runAction("Rolled dice", { type: "roll_dice" })
                }
              >
                Roll dice
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction || pendingTile === null}
                onClick={() =>
                  pendingTile !== null &&
                  void runAction("Bought tile", {
                    type: "buy_tile",
                    tilePosition: pendingTile,
                  })
                }
              >
                Buy tile
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction || pendingTile === null}
                onClick={() =>
                  pendingTile !== null &&
                  void runAction("Declined tile", {
                    type: "decline_tile",
                    tilePosition: pendingTile,
                  })
                }
              >
                Decline tile
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction || state.phase !== "action"}
                onClick={() =>
                  void runAction("Ended turn", { type: "end_turn" })
                }
              >
                End turn
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction || currentPlayer?.kind !== "ai"}
                onClick={() => void runAiStep()}
              >
                Step AI
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busyAction}
                onClick={() => void refreshState()}
              >
                Refresh
              </button>
            </div>
            {lastAction && <p className="muted">{lastAction}</p>}
          </>
        ) : (
          <p className="muted">Sign in as a game participant to load state.</p>
        )}
      </div>

      {state?.players && (
        <div className="card">
          <h2>Players</h2>
          <table className="gamesTable">
            <thead>
              <tr>
                <th>Player</th>
                <th>Kind</th>
                <th>Position</th>
                <th>Capital</th>
                <th>Tiles</th>
              </tr>
            </thead>
            <tbody>
              {state.players.map((player) => (
                <tr key={player.playerId}>
                  <td>{player.displayName ?? player.playerId}</td>
                  <td>{player.kind ?? "human"}</td>
                  <td>{player.position}</td>
                  <td>{player.capital}</td>
                  <td>{player.ownedTilePositions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
