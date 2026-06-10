import type { GameState } from "@oligopoly/validation";
import { Link } from "react-router-dom";
import { playerDisplayName } from "../lib/gameDisplay";
import { describeGameStep } from "../lib/gameStepUi";
import { isAuctionBiddingPhase, isAuctionPhase } from "../lib/gameUi";

type GameStatusHeaderProps = {
  gameId: string;
  state: GameState | null;
  actorId: string | null;
  myPlayerId: string | null;
  myTurn: boolean;
  wsStatus: string;
  turnDeadline: number | null;
  timerKind: string | null;
};

function deadlineLabel(timerKind: string | null): string {
  if (timerKind === "auction_bids") return "Auction closes";
  if (timerKind === "auction_settle") return "Auction reveals";
  return "Turn deadline";
}

function tableStatusLabel(state: GameState | null, myTurn: boolean): string {
  if (!state) return "Loading";
  if (state.phase === "game_over") return "Complete";
  if (isAuctionBiddingPhase(state)) return "Auction bidding";
  if (isAuctionPhase(state)) return "Auction settling";
  return myTurn ? "Your turn" : "Waiting";
}

export function GameStatusHeader({
  gameId,
  state,
  actorId,
  myPlayerId,
  myTurn,
  wsStatus,
  turnDeadline,
  timerKind,
}: GameStatusHeaderProps) {
  const actorName =
    state && actorId
      ? playerDisplayName(state, actorId, { myPlayerId })
      : "Next player";
  const step = state ? describeGameStep(state, myPlayerId) : null;
  const title = !state
    ? "Loading table"
    : state.phase === "game_over"
      ? "Game over"
      : isAuctionPhase(state)
        ? `${step?.eyebrow ?? "Auction"}: ${step?.title ?? "Auction in progress"}`
        : myTurn
          ? `Your turn: ${step?.title ?? "choose an action"}`
          : `Waiting for ${actorName}`;
  const statusLabel = tableStatusLabel(state, myTurn);

  return (
    <header className="pageHeader gameStatusHeader">
      <p className="muted gameBreadcrumbs">
        <Link to="/games">All games</Link>
        {" / "}
        <Link to="/lobbies">Lobbies</Link>
      </p>
      <span className="eyebrow">Live table</span>
      <h1 className="pageTitle">{title}</h1>
      <p className="tagline">
        {state
          ? `Round ${state.round} · ${state.players?.length ?? 0} players · ${step?.eyebrow ?? "Table state"}`
          : "Loading the table state and player seats."}
      </p>
      <div className="statusStrip">
        <span className="statusChip">Realtime {wsStatus}</span>
        <span className="statusChip">{statusLabel}</span>
        {turnDeadline && (
          <span className="statusChip">
            {deadlineLabel(timerKind)}{" "}
            {new Date(turnDeadline).toLocaleTimeString()}
          </span>
        )}
      </div>
      <details className="technicalDetails">
        <summary>Technical details</summary>
        <p className="muted">
          Game ID <code className="inline">{gameId}</code>
        </p>
      </details>
    </header>
  );
}
