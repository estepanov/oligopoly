import { useDeferredValue, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { AiWatchingBanner } from "../components/AiWatchingBanner";
import { useAuth } from "../components/AuthContext";
import { BoardGrid } from "../components/BoardGrid";
import { GameActionLog } from "../components/GameActionLog";
import { GameBoardPanel } from "../components/GameBoardPanel";
import { GamePlayControls } from "../components/GamePlayControls";
import { GameStatusHeader } from "../components/GameStatusHeader";
import { PlayerSummaryPanel } from "../components/PlayerSummaryPanel";
import { useGameSession } from "../hooks/useGameSession";
import { playerDisplayName, playerNameMap } from "../lib/gameDisplay";
import { currentActorId } from "../lib/gameUi";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const {
    game,
    state,
    logEntries,
    tileNames,
    tileDetails,
    error,
    loading,
    pendingAction,
    lastActionLatencyMs,
    statusLine,
    wsStatus,
    turnDeadline,
    timerKind,
    myPlayerId,
    runAction,
    refresh,
    presentationState,
    presentationMode,
    currentPresentationBeat,
    skipPresentation,
    controls,
  } = useGameSession(id, user?.userId ?? null);
  const viewState = presentationState ?? state;
  const deferredState = useDeferredValue(viewState);
  const deferredLogEntries = useDeferredValue(logEntries);
  const actorId = useMemo(
    () => (viewState ? currentActorId(viewState) : null),
    [viewState],
  );
  const deferredActorId = useMemo(
    () => (deferredState ? currentActorId(deferredState) : null),
    [deferredState],
  );
  const namesByPlayerId = useMemo(
    () => (deferredState ? playerNameMap(deferredState) : undefined),
    [deferredState],
  );
  const presentationName = useMemo(() => {
    if (currentPresentationBeat?.displayName) {
      return currentPresentationBeat.displayName;
    }
    if (viewState && currentPresentationBeat?.aiPlayerId) {
      return playerDisplayName(viewState, currentPresentationBeat.aiPlayerId);
    }
    return "AI player";
  }, [currentPresentationBeat, viewState]);

  if (!id) {
    return (
      <div>
        <p className="errorText">Invalid route.</p>
        <Link to="/games">← Back to games</Link>
      </div>
    );
  }

  return (
    <div className="gamePage">
      <GameStatusHeader
        gameId={id}
        state={viewState}
        actorId={actorId}
        myPlayerId={myPlayerId}
        myTurn={controls.myTurnEffective}
        wsStatus={wsStatus}
        turnDeadline={turnDeadline}
        timerKind={timerKind}
      />

      <div className="gameWorkspace">
        <section className="card gamePlayCard" aria-label="Play controls">
          <h2>Play</h2>
          {loading && <p className="muted">Loading table state...</p>}
          {error && (
            <p className="errorText" role="alert">
              {error}
            </p>
          )}
          <AiWatchingBanner
            open={presentationMode === "watching"}
            name={presentationName}
            summary={currentPresentationBeat?.summary}
            onSkip={skipPresentation}
          />
          {state ? (
            <>
              <dl className="detailsGrid">
                <dt className="muted">Realtime</dt>
                <dd>{wsStatus}</dd>
                <dt className="muted">Your turn</dt>
                <dd>{controls.myTurnEffective ? "Yes" : "No"}</dd>
                <dt className="muted">
                  {timerKind === "auction_bids"
                    ? "Auction closes"
                    : timerKind === "auction_settle"
                      ? "Auction reveals"
                      : timerKind === "trade_offer"
                        ? "Trade expires"
                        : "Turn deadline"}
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
                busy={controls.busy}
                pendingAction={pendingAction}
                onAction={runAction}
              />

              {pendingAction && (
                <div className="actionPendingBanner" role="status">
                  <span className="actionPendingPulse" aria-hidden="true" />
                  <span>
                    <strong>{pendingAction.label}</strong>
                    <span className="actionPendingDetail">
                      Waiting for server confirmation...
                    </span>
                  </span>
                </div>
              )}

              <div className="buttonRow gameRefreshActions">
                <button
                  type="button"
                  className="button buttonSecondary"
                  disabled={controls.busy}
                  onClick={() => void refresh()}
                >
                  Refresh
                </button>
              </div>
              {statusLine && (
                <p className="muted actionLatencyLine">
                  {statusLine}
                  {lastActionLatencyMs !== null
                    ? ` in ${lastActionLatencyMs} ms`
                    : ""}
                </p>
              )}
            </>
          ) : !loading && !error ? (
            <p className="muted">
              Sign in as a game participant to load state.
            </p>
          ) : null}
        </section>

        <aside className="gameSecondaryRail" aria-label="Table details">
          <div className="card gameSummaryCard">
            <h2>Table details</h2>
            {!loading && game && (
              <dl className="detailsGrid">
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
                    : "-"}
                </dd>
                <dt className="muted">Winner</dt>
                <dd>
                  {deferredState && game.winnerId
                    ? playerDisplayName(deferredState, game.winnerId, {
                        myPlayerId,
                      })
                    : (game.winnerId ?? "-")}
                </dd>
              </dl>
            )}
          </div>

          {deferredState && (
            <div className="card">
              <GameActionLog
                entries={deferredLogEntries}
                tileNames={tileNames}
                currencySettings={deferredState.settings}
                playerNames={namesByPlayerId}
              />
            </div>
          )}
        </aside>

        <section className="gamePrimary" aria-label="Board and players">
          {deferredState && (
            <>
              <div className="gamePageBoard card">
                <h2>Board</h2>
                <BoardGrid
                  state={deferredState}
                  tileNames={tileNames}
                  tileDetails={tileDetails}
                  myPlayerId={myPlayerId}
                  actorId={deferredActorId}
                />
                <GameBoardPanel
                  state={deferredState}
                  tileNames={tileNames}
                  myPlayerId={myPlayerId}
                  actorId={deferredActorId}
                />
              </div>

              <PlayerSummaryPanel
                state={deferredState}
                myPlayerId={myPlayerId}
                tileNames={tileNames}
                actorId={deferredActorId}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
