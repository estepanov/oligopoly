import type { GameState } from "@oligopoly/validation";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { getTileEconomics } from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";

type BoardGridProps = {
  state: GameState;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
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
  const map = new Map<string, string>();
  for (const tile of state.tiles ?? []) {
    if (tile.ownerId) {
      map.set(String(tile.position), tile.ownerId);
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
  tileDetails,
  myPlayerId,
  tileState,
  state,
}: {
  position: number | string;
  ownerId: string | null;
  occupants: NonNullable<GameState["players"]>;
  actorId: string | null;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  myPlayerId: string | null;
  tileState: NonNullable<GameState["tiles"]>[number] | undefined;
  state: GameState;
}) {
  const isMine = ownerId !== null && ownerId === myPlayerId;
  const isActorHere = occupants.some((player) => player.playerId === actorId);
  const label = tileLabel(position, tileNames);
  const details = tileDetails.get(String(position));
  const currencySettings = state.settings;
  const economics = getTileEconomics(
    state,
    isMine ? myPlayerId : null,
    position,
  );
  const canShowEconomics = economics.tileCost !== null;
  const mortgageLabel = economics.mortgaged
    ? "Stored mortgage value"
    : "Mortgage gain";
  const formattedMortgageValue = economics.mortgaged
    ? economics.formattedStoredMortgageValue
    : economics.formattedAvailableMortgageValue;

  return (
    <InfoDialog
      title={label}
      triggerLabel={`Open details for ${label}`}
      triggerClassName={[
        "boardGridCell",
        ownerId ? "boardGridCellOwned" : "",
        isMine ? "boardGridCellMine" : "",
        isActorHere ? "boardGridCellActive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      triggerContent={
        <>
          <span className="boardGridPosition">{position}</span>
          <span className="boardGridName">{label}</span>
          {occupants.length > 0 && (
            <span className="boardGridOccupants">
              {occupants
                .map((player) =>
                  player.playerId === myPlayerId
                    ? "You"
                    : playerDisplayName(state, player.playerId),
                )
                .join(", ")}
            </span>
          )}
        </>
      }
    >
      <dl className="detailsGrid">
        <dt className="muted">Position</dt>
        <dd>{position}</dd>
        <dt className="muted">Type</dt>
        <dd>{details?.type?.replaceAll("_", " ") ?? "board tile"}</dd>
        {details?.sectorId && (
          <>
            <dt className="muted">Sector</dt>
            <dd>{details.sectorId.replaceAll("_", " ")}</dd>
          </>
        )}
        {details?.cost !== null && details?.cost !== undefined && (
          <>
            <dt className="muted">Acquisition cost</dt>
            <dd>{formatCurrencyAmount(details.cost, currencySettings)}</dd>
          </>
        )}
        {details?.baseRent !== null && details?.baseRent !== undefined && (
          <>
            <dt className="muted">Base rent</dt>
            <dd>{formatCurrencyAmount(details.baseRent, currencySettings)}</dd>
          </>
        )}
        <dt className="muted">Owner</dt>
        <dd>
          {ownerId ? playerDisplayName(state, ownerId, { myPlayerId }) : "Bank"}
        </dd>
        {tileState && (
          <>
            <dt className="muted">Mortgage</dt>
            <dd>{tileState.mortgaged ? "Mortgaged" : "Available"}</dd>
            <dt className="muted">Development</dt>
            <dd>{tileState.developmentTokens} token(s)</dd>
          </>
        )}
        {canShowEconomics && (
          <>
            <dt className="muted">Next development</dt>
            <dd>{economics.formattedDevelopmentCost ?? "Not available"}</dd>
            <dt className="muted">{mortgageLabel}</dt>
            <dd>{formattedMortgageValue ?? "Not available"}</dd>
            <dt className="muted">Redeem cost</dt>
            <dd>{economics.formattedRedemptionCost ?? "Not available"}</dd>
          </>
        )}
        <dt className="muted">Occupants</dt>
        <dd>
          {occupants.length > 0
            ? occupants
                .map((player) =>
                  player.playerId === myPlayerId
                    ? "You"
                    : playerDisplayName(state, player.playerId),
                )
                .join(", ")
            : "None"}
        </dd>
      </dl>
    </InfoDialog>
  );
}

export function BoardGrid({
  state,
  tileNames,
  tileDetails,
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
            ownerId={ownerByPosition.get(String(position)) ?? null}
            occupants={occupantsByPosition.get(String(position)) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            tileDetails={tileDetails}
            myPlayerId={myPlayerId}
            tileState={state.tiles?.find(
              (tile) => String(tile.position) === String(position),
            )}
            state={state}
          />
        ))}
      </div>

      <div className="boardGridMiddle">
        <div className="boardGridColumn">
          {LEFT_COLUMN.map((position) => (
            <BoardCell
              key={position}
              position={position}
              ownerId={ownerByPosition.get(String(position)) ?? null}
              occupants={occupantsByPosition.get(String(position)) ?? []}
              actorId={actorId}
              tileNames={tileNames}
              tileDetails={tileDetails}
              myPlayerId={myPlayerId}
              tileState={state.tiles?.find(
                (tile) => String(tile.position) === String(position),
              )}
              state={state}
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
                    : playerDisplayName(state, player.playerId)}{" "}
                  at {tileLabel(player.position, tileNames)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No players on diagonal</p>
          )}
          <div className="boardGridDiagonalTiles">
            {DIAGONAL_POSITIONS.map((position) => (
              <BoardCell
                key={position}
                position={position}
                ownerId={ownerByPosition.get(position) ?? null}
                occupants={occupantsByPosition.get(position) ?? []}
                actorId={actorId}
                tileNames={tileNames}
                tileDetails={tileDetails}
                myPlayerId={myPlayerId}
                tileState={state.tiles?.find(
                  (tile) => String(tile.position) === position,
                )}
                state={state}
              />
            ))}
          </div>
        </div>

        <div className="boardGridColumn">
          {RIGHT_COLUMN.map((position) => (
            <BoardCell
              key={position}
              position={position}
              ownerId={ownerByPosition.get(String(position)) ?? null}
              occupants={occupantsByPosition.get(String(position)) ?? []}
              actorId={actorId}
              tileNames={tileNames}
              tileDetails={tileDetails}
              myPlayerId={myPlayerId}
              tileState={state.tiles?.find(
                (tile) => String(tile.position) === String(position),
              )}
              state={state}
            />
          ))}
        </div>
      </div>

      <div className="boardGridRow boardGridRowBottom">
        {BOTTOM_ROW.map((position) => (
          <BoardCell
            key={position}
            position={position}
            ownerId={ownerByPosition.get(String(position)) ?? null}
            occupants={occupantsByPosition.get(String(position)) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            tileDetails={tileDetails}
            myPlayerId={myPlayerId}
            tileState={state.tiles?.find(
              (tile) => String(tile.position) === String(position),
            )}
            state={state}
          />
        ))}
      </div>
    </div>
  );
}
