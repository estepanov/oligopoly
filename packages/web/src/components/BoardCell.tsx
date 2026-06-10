import type { GameState } from "@oligopoly/validation";
import type { CSSProperties } from "react";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { compactOccupantLabel, occupantLabels } from "../lib/boardOccupants";
import {
  boardTileDisplayName,
  developmentTokenIndexes,
  sectorClass,
  tileStatusLabel,
  tileTypeLabel,
} from "../lib/boardTileDetails";
import type { BoardPlacement } from "../lib/boardViewModel";
import { BoardTileDetailsContent } from "./BoardTileDetailsContent";
import { InfoDialog } from "./InfoDialog";

function boardCellStyle(placement: BoardPlacement): CSSProperties {
  if (
    placement.edge === "diagonal" &&
    placement.xPercent !== undefined &&
    placement.yPercent !== undefined
  ) {
    return {
      left: `${placement.xPercent}%`,
      top: `${placement.yPercent}%`,
    };
  }

  return {
    gridColumn: placement.column,
    gridRow: placement.row,
    ...(placement.columnSpan
      ? { gridColumnEnd: `span ${placement.columnSpan}` }
      : null),
    ...(placement.rowSpan ? { gridRowEnd: `span ${placement.rowSpan}` } : null),
  };
}

export function BoardCell({
  position,
  ownerId,
  occupants,
  actorId,
  tileNames,
  tileDetails,
  myPlayerId,
  tileState,
  tilesByPosition,
  occupantsByPosition,
  state,
  placement,
}: {
  position: number | string;
  ownerId: string | null;
  occupants: NonNullable<GameState["players"]>;
  actorId: string | null;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  myPlayerId: string | null;
  tileState: NonNullable<GameState["tiles"]>[number] | undefined;
  tilesByPosition: Map<string, NonNullable<GameState["tiles"]>[number]>;
  occupantsByPosition: Map<string, NonNullable<GameState["players"]>>;
  state: GameState;
  placement: BoardPlacement;
}) {
  const isMine = ownerId !== null && ownerId === myPlayerId;
  const isActorHere = occupants.some((player) => player.playerId === actorId);
  const label = tileLabel(position, tileNames);
  const displayName = boardTileDisplayName(position, label);
  const details = tileDetails.get(String(position));
  const mortgaged = tileState?.mortgaged ?? false;
  const developmentTokens = tileState?.developmentTokens ?? 0;
  const statusLabel = tileStatusLabel({
    ownerId,
    mortgaged,
    developmentTokens,
  });

  return (
    <InfoDialog
      title={label}
      triggerLabel={`Open details for ${label}`}
      triggerClassName={[
        "boardGridCell",
        `boardGridCell-${placement.edge}`,
        placement.corner ? "boardGridCellCorner" : "",
        sectorClass(details),
        ownerId ? "boardGridCellOwned" : "",
        !ownerId && details?.cost !== null && details?.cost !== undefined
          ? "boardGridCellAvailable"
          : "",
        isMine ? "boardGridCellMine" : "",
        mortgaged ? "boardGridCellMortgaged" : "",
        developmentTokens > 0 ? "boardGridCellImproved" : "",
        isActorHere ? "boardGridCellActive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      triggerStyle={boardCellStyle(placement)}
      triggerContent={
        <>
          <span className="boardGridSectorBand" aria-hidden="true" />
          <span className="boardGridTileMeta">
            <span className="boardGridPosition">{position}</span>
            <span className="boardGridType">{tileTypeLabel(details)}</span>
          </span>
          <span className="boardGridName" title={label}>
            {displayName}
          </span>
          <span className="boardGridFooter">
            <span className="boardGridStatus" title={statusLabel}>
              {statusLabel}
            </span>
            {developmentTokens > 0 && !mortgaged && (
              <span
                className="boardGridDevelopment"
                title={`${developmentTokens} development token${
                  developmentTokens === 1 ? "" : "s"
                }`}
              >
                {developmentTokenIndexes(developmentTokens).map((index) => (
                  <span key={index} />
                ))}
              </span>
            )}
            {mortgaged && (
              <span className="boardGridMortgageBadge" title="Mortgaged">
                M
              </span>
            )}
            {occupants.length > 0 && (
              <span
                className="boardGridOccupants"
                title={`Occupants: ${occupantLabels(
                  state,
                  occupants,
                  myPlayerId,
                )}`}
              >
                {compactOccupantLabel(state, occupants, myPlayerId)}
              </span>
            )}
          </span>
        </>
      }
    >
      <BoardTileDetailsContent
        details={details}
        occupants={occupants}
        occupantsByPosition={occupantsByPosition}
        ownerId={ownerId}
        position={position}
        state={state}
        tileDetails={tileDetails}
        tileState={tileState}
        tilesByPosition={tilesByPosition}
        myPlayerId={myPlayerId}
      />
    </InfoDialog>
  );
}
