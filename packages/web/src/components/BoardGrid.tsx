import type { GameState } from "@oligopoly/validation";
import { useMemo } from "react";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { buildBoardViewModel, perimeterPlacement } from "../lib/boardViewModel";
import { playerDisplayName } from "../lib/gameDisplay";
import { BoardCell } from "./BoardCell";
import { MobileBoardOverview } from "./MobileBoardOverview";

type BoardGridProps = {
  state: GameState;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  myPlayerId: string | null;
  actorId: string | null;
};

export function BoardGrid({
  state,
  tileNames,
  tileDetails,
  myPlayerId,
  actorId,
}: BoardGridProps) {
  const board = useMemo(
    () => buildBoardViewModel({ state, myPlayerId, actorId }),
    [actorId, myPlayerId, state],
  );

  return (
    <>
      <MobileBoardOverview
        board={board}
        tileNames={tileNames}
        tileDetails={tileDetails}
        state={state}
        myPlayerId={myPlayerId}
      />

      <div className="boardGrid">
        <div className="boardGridCenter">
          <div className="boardGridCenterTop">
            <span className="eyebrow">Oligopoly Online</span>
            <strong>Market floor</strong>
          </div>
          <div className="boardGridCenterBottom">
            <p className="muted">Diagonal express path</p>
            {board.diagonalOccupants.length > 0 ? (
              <ul className="boardGridDiagonalList">
                {board.diagonalOccupants.map((player) => (
                  <li key={player.playerId}>
                    {player.playerId === myPlayerId
                      ? "You"
                      : playerDisplayName(state, player.playerId)}{" "}
                    at {tileLabel(player.position, tileNames)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No players on diagonal</p>
            )}
          </div>
        </div>

        {board.perimeterPositions.map((position) => (
          <BoardCell
            key={position}
            position={position}
            ownerId={board.ownerByPosition.get(String(position)) ?? null}
            occupants={board.occupantsByPosition.get(String(position)) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            tileDetails={tileDetails}
            myPlayerId={myPlayerId}
            tileState={board.tilesByPosition.get(String(position))}
            tilesByPosition={board.tilesByPosition}
            occupantsByPosition={board.occupantsByPosition}
            state={state}
            placement={perimeterPlacement(position)}
          />
        ))}

        {board.diagonalPositions.map((position) => {
          const placement = board.diagonalPlacements.get(position);
          if (!placement) return null;

          return (
            <BoardCell
              key={position}
              position={position}
              ownerId={board.ownerByPosition.get(position) ?? null}
              occupants={board.occupantsByPosition.get(position) ?? []}
              actorId={actorId}
              tileNames={tileNames}
              tileDetails={tileDetails}
              myPlayerId={myPlayerId}
              tileState={board.tilesByPosition.get(String(position))}
              tilesByPosition={board.tilesByPosition}
              occupantsByPosition={board.occupantsByPosition}
              state={state}
              placement={placement}
            />
          );
        })}
      </div>
    </>
  );
}
