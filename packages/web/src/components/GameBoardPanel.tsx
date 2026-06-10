import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { playerById } from "../lib/gameUi";

type GameBoardPanelProps = {
  state: GameState;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
  actorId: string | null;
};

export function GameBoardPanel({
  state,
  tileNames,
  myPlayerId,
  actorId,
}: GameBoardPanelProps) {
  const me = myPlayerId ? playerById(state, myPlayerId) : undefined;
  const actor = actorId ? playerById(state, actorId) : undefined;
  const players = state.players ?? [];

  return (
    <div className="gameBoardPanel">
      {state.pendingBuyTilePosition !== null &&
        state.pendingBuyTilePosition !== undefined && (
          <p className="gameBoardHighlight">
            Purchase decision:{" "}
            <strong>
              {tileLabel(state.pendingBuyTilePosition, tileNames)}
            </strong>
          </p>
        )}

      {state.pendingAuction && (
        <p className="gameBoardHighlight">
          Auction in progress:{" "}
          <strong>
            {tileLabel(state.pendingAuction.tilePosition, tileNames)}
          </strong>
        </p>
      )}

      {me && (
        <div className="boardContextGrid">
          <div>
            <span className="economicsLabel">You are on</span>
            <strong>{tileLabel(me.position, tileNames)}</strong>
          </div>
          <div>
            <span className="economicsLabel">Your capital</span>
            <strong>{formatCurrencyAmount(me.capital, state.settings)}</strong>
          </div>
          <div>
            <span className="economicsLabel">Owned tiles</span>
            <strong>{me.ownedTilePositions.length}</strong>
          </div>
        </div>
      )}

      {actor && (
        <p className="muted">
          Active player:{" "}
          <strong>
            {playerDisplayName(state, actor.playerId, { myPlayerId })}
          </strong>{" "}
          at <strong>{tileLabel(actor.position, tileNames)}</strong>.
        </p>
      )}

      {players.length > 0 && (
        <ul className="playerPositionChips" aria-label="Player positions">
          {players.map((player) => (
            <li
              className={player.playerId === actorId ? "isActive" : ""}
              key={player.playerId}
            >
              <strong>
                {playerDisplayName(state, player.playerId, { myPlayerId })}
              </strong>
              <span>{tileLabel(player.position, tileNames)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
