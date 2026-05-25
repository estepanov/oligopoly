import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { currentActorId } from "../lib/gameUi";

type BoardGridProps = {
  state: GameState;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
};

const BOTTOM_ROW = Array.from({ length: 11 }, (_, index) => index);
const RIGHT_COLUMN = Array.from({ length: 10 }, (_, index) => 11 + index);
const TOP_ROW = Array.from({ length: 11 }, (_, index) => 31 - index);
const LEFT_COLUMN = Array.from({ length: 8 }, (_, index) => 32 + index);

function tileOwnerId(state: GameState, position: number): string | null {
  const tile = state.tiles?.find((entry) => entry.position === position);
  return tile?.ownerId ?? null;
}

function playersAtPosition(state: GameState, position: number | string) {
  return state.players?.filter((player) => player.position === position) ?? [];
}

function BoardCell({
  position,
  state,
  tileNames,
  myPlayerId,
}: {
  position: number;
  state: GameState;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
}) {
  const ownerId = tileOwnerId(state, position);
  const occupants = playersAtPosition(state, position);
  const actorId = currentActorId(state);
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

export function BoardGrid({ state, tileNames, myPlayerId }: BoardGridProps) {
  return (
    <div className="boardGrid">
      <div className="boardGridRow boardGridRowTop">
        {TOP_ROW.map((position) => (
          <BoardCell
            key={position}
            position={position}
            state={state}
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
              state={state}
              tileNames={tileNames}
              myPlayerId={myPlayerId}
            />
          ))}
        </div>

        <div className="boardGridCenter">
          <p className="muted">Round {state.round}</p>
          <p>
            <strong>{state.phase ?? "unknown"}</strong>
          </p>
          <p className="muted">
            Free market: {state.settings?.currencySymbol ?? "¤"}
            {state.freeMarketPool ?? 0}
          </p>
        </div>

        <div className="boardGridColumn">
          {RIGHT_COLUMN.map((position) => (
            <BoardCell
              key={position}
              position={position}
              state={state}
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
            state={state}
            tileNames={tileNames}
            myPlayerId={myPlayerId}
          />
        ))}
      </div>
    </div>
  );
}
