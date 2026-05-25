import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";

type BoardGridProps = {
  state: GameState;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
  actorId: string | null;
};

const BOTTOM_ROW = Array.from({ length: 11 }, (_, index) => index);
const RIGHT_COLUMN = Array.from({ length: 10 }, (_, index) => 11 + index);
const TOP_ROW = Array.from({ length: 11 }, (_, index) => 31 - index);
const LEFT_COLUMN = Array.from({ length: 8 }, (_, index) => 32 + index);
const DIAGONAL_POSITIONS = ["D1", "D2", "D3", "D4", "D5"];

function indexPlayersByPosition(state: GameState) {
  const map = new Map<string, NonNullable<GameState["players"]>>();
  for (const player of state.players ?? []) {
    const key = String(player.position);
    const group = map.get(key) ?? [];
    group.push(player);
    map.set(key, group);
  }
  return map;
}

function indexTileOwners(state: GameState) {
  const map = new Map<number, string>();
  for (const tile of state.tiles ?? []) {
    if (typeof tile.position === "number" && tile.ownerId) {
      map.set(tile.position, tile.ownerId);
    }
  }
  return map;
}

function BoardCell({
  position,
  ownerId,
  occupants,
  actorId,
  tileNames,
  myPlayerId,
}: {
  position: number;
  ownerId: string | null;
  occupants: NonNullable<GameState["players"]>;
  actorId: string | null;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
}) {
  const isMine = ownerId !== null && ownerId === myPlayerId;
  const isActorHere = occupants.some((player) => player.playerId === actorId);

  return (
    <div
      className={[
        "boardGridCell",
        ownerId ? "boardGridCellOwned" : "",
        isMine ? "boardGridCellMine" : "",
        isActorHere ? "boardGridCellActive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={tileLabel(position, tileNames)}
    >
      <span className="boardGridPosition">{position}</span>
      <span className="boardGridName">{tileLabel(position, tileNames)}</span>
      {occupants.length > 0 && (
        <span className="boardGridOccupants">
          {occupants
            .map((player) =>
              player.playerId === myPlayerId
                ? "You"
                : (player.displayName ?? player.playerId.slice(0, 6)),
            )
            .join(", ")}
        </span>
      )}
    </div>
  );
}

export function BoardGrid({
  state,
  tileNames,
  myPlayerId,
  actorId,
}: BoardGridProps) {
  const occupantsByPosition = indexPlayersByPosition(state);
  const ownerByPosition = indexTileOwners(state);
  const diagonalOccupants = DIAGONAL_POSITIONS.flatMap(
    (position) => occupantsByPosition.get(position) ?? [],
  );

  return (
    <div className="boardGrid">
      <div className="boardGridRow boardGridRowTop">
        {TOP_ROW.map((position) => (
          <BoardCell
            key={position}
            position={position}
            ownerId={ownerByPosition.get(position) ?? null}
            occupants={occupantsByPosition.get(String(position)) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            myPlayerId={myPlayerId}
          />
        ))}
      </div>

      <div className="boardGridMiddle">
        <div className="boardGridColumn">
          {LEFT_COLUMN.map((position) => (
            <BoardCell
              key={position}
              position={position}
              ownerId={ownerByPosition.get(position) ?? null}
              occupants={occupantsByPosition.get(String(position)) ?? []}
              actorId={actorId}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
            />
          ))}
        </div>

        <div className="boardGridCenter">
          <p className="muted">Diagonal path</p>
          {diagonalOccupants.length > 0 ? (
            <ul className="boardGridDiagonalList">
              {diagonalOccupants.map((player) => (
                <li key={player.playerId}>
                  {player.playerId === myPlayerId
                    ? "You"
                    : (player.displayName ?? player.playerId.slice(0, 8))}{" "}
                  at {tileLabel(player.position, tileNames)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No players on diagonal</p>
          )}
        </div>

        <div className="boardGridColumn">
          {RIGHT_COLUMN.map((position) => (
            <BoardCell
              key={position}
              position={position}
              ownerId={ownerByPosition.get(position) ?? null}
              occupants={occupantsByPosition.get(String(position)) ?? []}
              actorId={actorId}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
            />
          ))}
        </div>
      </div>

      <div className="boardGridRow boardGridRowBottom">
        {BOTTOM_ROW.map((position) => (
          <BoardCell
            key={position}
            position={position}
            ownerId={ownerByPosition.get(position) ?? null}
            occupants={occupantsByPosition.get(String(position)) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            myPlayerId={myPlayerId}
          />
        ))}
      </div>
    </div>
  );
}
