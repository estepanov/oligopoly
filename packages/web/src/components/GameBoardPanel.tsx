import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
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
  const currency = state.settings?.currencySymbol ?? "¤";

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

      {me && (
        <p className="muted">
          You are at <strong>{tileLabel(me.position, tileNames)}</strong> with{" "}
          {currency}
          {me.capital} capital and {me.ownedTilePositions.length} owned tile
          {me.ownedTilePositions.length === 1 ? "" : "s"}.
        </p>
      )}

      {state.players && (
        <table className="gamesTable gameBoardTable">
          <thead>
            <tr>
              <th>Player</th>
              <th>Location</th>
              <th>Capital</th>
              <th>Tiles</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((player) => (
              <tr
                key={player.playerId}
                className={
                  player.playerId === actorId
                    ? "gameBoardCurrentRow"
                    : undefined
                }
              >
                <td>
                  {player.displayName ?? player.playerId}
                  {player.kind === "ai" ? " (AI)" : ""}
                  {player.playerId === myPlayerId ? " (you)" : ""}
                </td>
                <td>{tileLabel(player.position, tileNames)}</td>
                <td>
                  {currency}
                  {player.capital}
                </td>
                <td>{player.ownedTilePositions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
