import type { GameState } from "@oligopoly/validation";
import type { BoardTileDetails } from "../lib/boardDisplay";
import { tileLabel } from "../lib/boardDisplay";
import { occupantLabels } from "../lib/boardOccupants";
import type { BoardViewModel } from "../lib/boardViewModel";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";

type MobileBoardOverviewProps = {
  board: BoardViewModel;
  state: GameState;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  myPlayerId: string | null;
};

function tileCostLabel(
  details: BoardTileDetails | undefined,
  settings: GameState["settings"],
): string {
  return details?.cost === null || details?.cost === undefined
    ? "No purchase"
    : formatCurrencyAmount(details.cost, settings);
}

export function MobileBoardOverview({
  board,
  state,
  tileNames,
  tileDetails,
  myPlayerId,
}: MobileBoardOverviewProps) {
  return (
    <section className="mobileBoardOverview" aria-label="Mobile board overview">
      <div className="mobileBoardHero">
        <div>
          <span className="economicsLabel">Current focus</span>
          <strong>
            {board.actor
              ? `${playerDisplayName(state, board.actor.playerId, {
                  myPlayerId,
                })} at ${tileLabel(board.actor.position, tileNames)}`
              : "Waiting for turn"}
          </strong>
        </div>
        {board.me && (
          <div>
            <span className="economicsLabel">You</span>
            <strong>{tileLabel(board.me.position, tileNames)}</strong>
          </div>
        )}
      </div>

      {board.relevantPositions.length > 0 && (
        <ul className="mobileBoardFocusList" aria-label="Relevant board tiles">
          {board.relevantPositions.map((position) => {
            const key = String(position);
            const details = tileDetails.get(key);
            const occupants = board.occupantsByPosition.get(key) ?? [];
            const tileState = board.tilesByPosition.get(key);

            return (
              <li key={key}>
                <span className="mobileBoardPosition">{key}</span>
                <span className="mobileBoardTileMain">
                  <strong>{tileLabel(position, tileNames)}</strong>
                  <span>
                    {tileCostLabel(details, state.settings)}
                    {tileState?.ownerId
                      ? ` | Owned by ${playerDisplayName(
                          state,
                          tileState.ownerId,
                          { myPlayerId },
                        )}`
                      : ""}
                  </span>
                </span>
                {occupants.length > 0 && (
                  <span className="mobileBoardOccupants">
                    {occupantLabels(state, occupants, myPlayerId)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="mobileBoardDisclosure">
        <summary>Full board</summary>
        <ol className="mobileBoardFullList" aria-label="All board tiles">
          {board.fullBoardPositions.map((position) => {
            const key = String(position);
            const details = tileDetails.get(key);
            const occupants = board.occupantsByPosition.get(key) ?? [];

            return (
              <li key={key}>
                <span>{key}</span>
                <strong>{tileLabel(position, tileNames)}</strong>
                <em>{tileCostLabel(details, state.settings)}</em>
                {occupants.length > 0 && (
                  <small>{occupantLabels(state, occupants, myPlayerId)}</small>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
