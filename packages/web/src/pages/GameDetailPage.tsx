import { Link, useParams } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { BoardGrid } from "../components/BoardGrid";
import { GameActionLog } from "../components/GameActionLog";
import { GameBoardPanel } from "../components/GameBoardPanel";
import { GamePlayControls } from "../components/GamePlayControls";
import { useGameSession } from "../hooks/useGameSession";
import { currentActorId } from "../lib/gameUi";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const {
    game,
    state,
    logEntries,
    tileNames,
    error,
    loading,
    busyAction,
    statusLine,
    wsStatus,
    turnDeadline,
    timerKind,
    myPlayerId,
    myTurn,
    runAction,
    refresh,
  } = useGameSession(id, user?.userId ?? null);
  const actorId = state ? currentActorId(state) : null;

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
              actorId={actorId}
            />
            <GameBoardPanel
              state={state}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
              actorId={actorId}
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
              <dt className="muted">
                {timerKind === "auction_bids" ? "Auction closes" : "Turn deadline"}
              </dt>
              <dd>
                {turnDeadline
                  ? new Date(turnDeadline).toLocaleTimeString()
                  : "—"}
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
                onClick={() => void refresh()}
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
