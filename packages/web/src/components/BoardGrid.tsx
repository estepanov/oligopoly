import {
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
  hasSectorControl,
  MAX_DEVELOPMENT_TOKENS,
} from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import type { CSSProperties } from "react";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { getTileEconomics } from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";
import { TileEconomicsExplainContent } from "./TileEconomicsExplainContent";

type BoardGridProps = {
  state: GameState;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  myPlayerId: string | null;
  actorId: string | null;
};

const DIAGONAL_POSITIONS = ["D1", "D2", "D3", "D4", "D5"];

type BoardPlacement = {
  row: number;
  column: number;
  rowSpan?: number;
  columnSpan?: number;
  xPercent?: number;
  yPercent?: number;
  edge: "bottom" | "left" | "top" | "right" | "diagonal";
  corner?: boolean;
};

const PERIMETER_POSITIONS = Array.from({ length: 40 }, (_, index) => index);

const DIAGONAL_PLACEMENTS = new Map<string, BoardPlacement>([
  ["D1", { row: 1, column: 1, xPercent: 72, yPercent: 72, edge: "diagonal" }],
  ["D2", { row: 1, column: 1, xPercent: 61, yPercent: 61, edge: "diagonal" }],
  ["D3", { row: 1, column: 1, xPercent: 50, yPercent: 50, edge: "diagonal" }],
  ["D4", { row: 1, column: 1, xPercent: 39, yPercent: 39, edge: "diagonal" }],
  ["D5", { row: 1, column: 1, xPercent: 28, yPercent: 28, edge: "diagonal" }],
]);

function perimeterPlacement(position: number): BoardPlacement {
  if (position <= 10) {
    return {
      row: 11,
      column: 11 - position,
      edge: "bottom",
      corner: position === 0 || position === 10,
    };
  }

  if (position <= 20) {
    return {
      row: 21 - position,
      column: 1,
      edge: "left",
      corner: position === 20,
    };
  }

  if (position <= 30) {
    return {
      row: 1,
      column: position - 19,
      edge: "top",
      corner: position === 30,
    };
  }

  return {
    row: position - 29,
    column: 11,
    edge: "right",
  };
}

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

function sectorClass(details: BoardTileDetails | undefined): string {
  return details?.sectorId ? `boardGridSector-${details.sectorId}` : "";
}

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

function indexTilesByPosition(state: GameState) {
  const map = new Map<string, NonNullable<GameState["tiles"]>[number]>();
  for (const tile of state.tiles ?? []) {
    map.set(String(tile.position), tile);
  }
  return map;
}

function occupantLabels(
  state: GameState,
  occupants: NonNullable<GameState["players"]>,
  myPlayerId: string | null,
): string {
  return occupants
    .map((player) =>
      player.playerId === myPlayerId
        ? "You"
        : playerDisplayName(state, player.playerId),
    )
    .join(", ");
}

function compactOccupantLabel(
  occupants: NonNullable<GameState["players"]>,
  myPlayerId: string | null,
): string {
  const hasMe = occupants.some((player) => player.playerId === myPlayerId);

  if (hasMe) {
    return occupants.length === 1 ? "You" : `You +${occupants.length - 1}`;
  }

  return occupants.length === 1 ? "P" : `${occupants.length}P`;
}

function tileTypeLabel(details: BoardTileDetails | undefined): string {
  switch (details?.type) {
    case "sector_tile":
      return "Asset";
    case "sector_hub":
      return "Hub";
    case "utility":
      return "Utility";
    case "special":
      return "Event";
    case "corner":
      return "Corner";
    default:
      return "Tile";
  }
}

function tileStatusLabel({
  ownerId,
  mortgaged,
  developmentTokens,
}: {
  ownerId: string | null;
  mortgaged: boolean;
  developmentTokens: number;
}): string {
  if (!ownerId) return "Open";
  if (mortgaged) return "Mortgaged";
  if (developmentTokens > 0) return `Lvl ${developmentTokens}`;
  return "Owned";
}

function boardTileDisplayName(
  position: number | string,
  label: string,
): string {
  switch (String(position)) {
    case "0":
      return "START";
    case "10":
      return "Reg. Zone";
    case "20":
      return "Free Market";
    case "30":
      return "Go to Reg.";
    default:
      return label
        .replace(/\s+(Corporation|Corp\.|Company|Co\.|Inc\.)$/i, "")
        .replace(/\s+Authority$/i, " Auth.")
        .replace(/\s+Contractor$/i, " Contract")
        .replace(/\s+Infrastructure$/i, " Infra.");
  }
}

function developmentTokenIndexes(developmentTokens: number): number[] {
  return Array.from(
    { length: Math.min(developmentTokens, 4) },
    (_, index) => index,
  );
}

function sectorRentRows(baseRent: number) {
  return [
    {
      id: "base",
      label: "Base",
      detail: "No set",
      rent: calculateSectorTileRent(baseRent, 0, false),
    },
    {
      id: "set",
      label: "Set",
      detail: "Full sector",
      rent: calculateSectorTileRent(baseRent, 0, true),
    },
    ...Array.from({ length: MAX_DEVELOPMENT_TOKENS }, (_, index) => {
      const tokenCount = index + 1;
      return {
        id: `dev-${tokenCount}`,
        label: `${tokenCount} dev`,
        detail: `${tokenCount} token${tokenCount === 1 ? "" : "s"}`,
        rent: calculateSectorTileRent(baseRent, tokenCount, true),
      };
    }),
  ];
}

type RentSchedule = {
  conditionHeader: string;
  rows: Array<{
    id: string;
    label: string;
    detail: string;
    rent: number;
  }>;
};

function rentScheduleForTile(
  details: BoardTileDetails | undefined,
  currentDiceTotal: number | null,
): RentSchedule | null {
  if (
    details?.type === "sector_tile" &&
    details.baseRent !== null &&
    details.baseRent !== undefined
  ) {
    return {
      conditionHeader: "Condition",
      rows: sectorRentRows(details.baseRent),
    };
  }

  if (details?.type === "sector_hub") {
    return {
      conditionHeader: "Hubs owned",
      rows: [1, 2, 3, 4].map((hubCount) => ({
        id: `hub-${hubCount}`,
        label: `${hubCount} hub${hubCount === 1 ? "" : "s"}`,
        detail: `${hubCount} controlled`,
        rent: calculateHubRent(hubCount),
      })),
    };
  }

  if (details?.type === "utility") {
    const diceTotals = [2, 6, 8, 10, 12];
    if (currentDiceTotal !== null && !diceTotals.includes(currentDiceTotal)) {
      diceTotals.push(currentDiceTotal);
      diceTotals.sort((a, b) => a - b);
    }
    return {
      conditionHeader: "Roll",
      rows: diceTotals.flatMap((diceTotal) => [
        {
          id: `util-1-${diceTotal}`,
          label: "1 util",
          detail: `${diceTotal} rolled`,
          rent: calculateUtilityRent(1, diceTotal),
        },
        {
          id: `util-2-${diceTotal}`,
          label: "2 utils",
          detail: `${diceTotal} rolled`,
          rent: calculateUtilityRent(2, diceTotal),
        },
      ]),
    };
  }

  return null;
}

function controllerIdsForPlayer(state: GameState, playerId: string): string[] {
  const player = state.players?.find((entry) => entry.playerId === playerId);
  const syndicateId = player?.syndicateId;
  const syndicate = syndicateId ? state.syndicates?.[syndicateId] : undefined;
  return syndicate ? [...syndicate.memberIds] : [playerId];
}

function tileOwnedByController(
  state: GameState,
  controllerId: string,
  ownerId: string | null | undefined,
): boolean {
  if (!ownerId) return false;
  return controllerIdsForPlayer(state, controllerId).includes(ownerId);
}

function countOwnedSetTiles(
  state: GameState,
  controllerId: string,
  positions: Array<number | string>,
): number {
  return positions.filter((position) => {
    const tileState = state.tiles?.find(
      (tile) => String(tile.position) === String(position),
    );
    return (
      tileState?.ownerId &&
      tileOwnedByController(state, controllerId, tileState.ownerId) &&
      !tileState.mortgaged
    );
  }).length;
}

function currentDiceTotal(state: GameState): number | null {
  return state.lastDiceRoll?.length === 2
    ? state.lastDiceRoll[0] + state.lastDiceRoll[1]
    : null;
}

function currentRentRowId({
  details,
  ownerId,
  state,
  tileState,
}: {
  details: BoardTileDetails | undefined;
  ownerId: string | null;
  state: GameState;
  tileState: NonNullable<GameState["tiles"]>[number] | undefined;
}): string | null {
  if (!details || !ownerId || tileState?.mortgaged) return null;

  if (details.type === "sector_tile" && details.sectorId) {
    const developmentTokens = tileState?.developmentTokens ?? 0;
    if (developmentTokens > 0) {
      return `dev-${Math.min(developmentTokens, MAX_DEVELOPMENT_TOKENS)}`;
    }
    if (
      state.players &&
      state.tiles &&
      hasSectorControl(
        {
          players: state.players,
          syndicates: state.syndicates,
          tiles: state.tiles,
        },
        ownerId,
        details.sectorId,
      )
    ) {
      return "set";
    }
    return "base";
  }

  if (details.type === "sector_hub") {
    const hubCount = countOwnedSetTiles(state, ownerId, [5, 15, 25, 35]);
    return hubCount > 0 ? `hub-${Math.min(hubCount, 4)}` : null;
  }

  if (details.type === "utility") {
    const utilityCount = countOwnedSetTiles(state, ownerId, [12, 28]);
    const diceTotal = currentDiceTotal(state) ?? 7;
    return utilityCount > 0
      ? `util-${Math.min(utilityCount, 2)}-${diceTotal}`
      : null;
  }

  return null;
}

type TileSetMember = {
  developmentTokens: number;
  label: string;
  mortgaged: boolean;
  occupantLabel: string | null;
  ownerLabel: string;
  position: number | string;
  selected: boolean;
  statusLabel: string;
};

type TileSetInfo = {
  members: TileSetMember[];
  subtitle: string;
  title: string;
};

function sectorDisplayName(sectorId: string): string {
  return sectorId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTileSetInfo({
  details,
  position,
  state,
  tileDetails,
  tilesByPosition,
  occupantsByPosition,
  myPlayerId,
}: {
  details: BoardTileDetails | undefined;
  position: number | string;
  state: GameState;
  tileDetails: Map<string, BoardTileDetails>;
  tilesByPosition: Map<string, NonNullable<GameState["tiles"]>[number]>;
  occupantsByPosition: Map<string, NonNullable<GameState["players"]>>;
  myPlayerId: string | null;
}): TileSetInfo | null {
  if (!details) return null;

  let title: string;
  let subtitle: string;
  let setTiles: BoardTileDetails[];

  if (details.type === "sector_tile" && details.sectorId) {
    const sectorName = sectorDisplayName(details.sectorId);
    title = `${sectorName} set`;
    subtitle =
      "Own every card in this sector to unlock set rent and allow development.";
    setTiles = Array.from(tileDetails.values()).filter(
      (tile) =>
        tile.type === "sector_tile" && tile.sectorId === details.sectorId,
    );
  } else if (details.type === "utility") {
    title = "Utility set";
    subtitle =
      "Utility rent scales by how many utilities the owner controls when rent is paid.";
    setTiles = Array.from(tileDetails.values()).filter(
      (tile) => tile.type === "utility",
    );
  } else if (details.type === "sector_hub") {
    title = "Hub network";
    subtitle =
      "Hub rent rises as a player controls more hubs across the board.";
    setTiles = Array.from(tileDetails.values()).filter(
      (tile) => tile.type === "sector_hub",
    );
  } else {
    return null;
  }

  if (setTiles.length <= 1) return null;

  return {
    title,
    subtitle,
    members: setTiles.map((setTile) => {
      const key = String(setTile.position);
      const setTileState = tilesByPosition.get(key);
      const setOwnerId = setTileState?.ownerId ?? null;
      const setOccupants = occupantsByPosition.get(key) ?? [];
      const developmentTokens = setTileState?.developmentTokens ?? 0;
      const mortgaged = setTileState?.mortgaged ?? false;
      return {
        developmentTokens,
        label: setTile.name,
        mortgaged,
        occupantLabel:
          setOccupants.length > 0
            ? occupantLabels(state, setOccupants, myPlayerId)
            : null,
        ownerLabel: setOwnerId
          ? playerDisplayName(state, setOwnerId, { myPlayerId })
          : "Bank",
        position: setTile.position,
        selected: String(setTile.position) === String(position),
        statusLabel: tileStatusLabel({
          ownerId: setOwnerId,
          mortgaged,
          developmentTokens,
        }),
      };
    }),
  };
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
  const currencySettings = state.settings;
  const economics = isMine
    ? getTileEconomics(state, myPlayerId, position, myPlayerId)
    : null;
  const showOwnerActionEconomics =
    isMine && economics !== null && economics.tileCost !== null;
  const rentSchedule = rentScheduleForTile(
    details,
    currentDiceTotal(state) ?? 7,
  );
  const activeRentRowId = currentRentRowId({
    details,
    ownerId,
    state,
    tileState,
  });
  const setInfo = buildTileSetInfo({
    details,
    position,
    state,
    tileDetails,
    tilesByPosition,
    occupantsByPosition,
    myPlayerId,
  });
  const ownerLabel = ownerId
    ? playerDisplayName(state, ownerId, { myPlayerId })
    : "Bank";
  const sectorLabel = details?.sectorId
    ? sectorDisplayName(details.sectorId)
    : null;
  const tileCost =
    details?.cost !== null && details?.cost !== undefined
      ? formatCurrencyAmount(details.cost, currencySettings)
      : "-";
  const baseRent =
    details?.baseRent !== null && details?.baseRent !== undefined
      ? formatCurrencyAmount(details.baseRent, currencySettings)
      : "-";
  const occupantSummary =
    occupants.length > 0
      ? occupantLabels(state, occupants, myPlayerId)
      : "None";
  const tileDetailMetrics = [
    { label: "Position", value: String(position) },
    {
      label: "Type",
      value: details?.type?.replaceAll("_", " ") ?? "board tile",
    },
    ...(sectorLabel ? [{ label: "Sector", value: sectorLabel }] : []),
    { label: "Owner", value: ownerLabel },
    { label: "Cost", value: tileCost },
    { label: "Base rent", value: baseRent },
    {
      label: "Mortgage",
      value: tileState
        ? tileState.mortgaged
          ? "Mortgaged"
          : "Available"
        : "-",
    },
    {
      label: "Development",
      value: `${developmentTokens} token${developmentTokens === 1 ? "" : "s"}`,
    },
  ];

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
                {compactOccupantLabel(occupants, myPlayerId)}
              </span>
            )}
          </span>
        </>
      }
    >
      <div className="tileDetailsSurface">
        <section className="tileDetailsHero">
          <span
            className={`tileDetailsHeroAccent ${sectorClass(details)}`}
            aria-hidden="true"
          />
          <div className="tileDetailsHeroCopy">
            <div className="tileDetailsKicker">
              <span>{tileTypeLabel(details)}</span>
              {sectorLabel && <span>{sectorLabel}</span>}
            </div>
            <p>
              {ownerId
                ? `${ownerLabel} controls this tile.`
                : details?.cost !== null && details?.cost !== undefined
                  ? "Available to acquire when landed on."
                  : "Board space with no owner."}
            </p>
          </div>
          <div className="tileDetailsHeroStatus">
            <span>{statusLabel}</span>
            <strong>#{position}</strong>
          </div>
        </section>

        <div className="tileDetailsMetrics">
          {tileDetailMetrics.map((metric) => (
            <div key={metric.label} className="tileDetailsMetric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        {rentSchedule && (
          <section className="tileDetailsSection">
            <div className="tileDetailsSectionHeader">
              <h4>Rent schedule</h4>
              <p>The highlighted row is the rent currently in effect.</p>
            </div>
            <table className="boardRentTable">
              <thead>
                <tr>
                  <th scope="col">Level</th>
                  <th scope="col">{rentSchedule.conditionHeader}</th>
                  <th scope="col">Rent</th>
                </tr>
              </thead>
              <tbody>
                {rentSchedule.rows.map((row) => {
                  const isActiveRent = row.id === activeRentRowId;
                  return (
                    <tr
                      key={`${row.label}-${row.detail}`}
                      className={isActiveRent ? "boardRentTableCurrent" : ""}
                    >
                      <td>{row.label}</td>
                      <td>{row.detail}</td>
                      <td>
                        {formatCurrencyAmount(row.rent, currencySettings)}
                        {isActiveRent && (
                          <span className="boardRentCurrentBadge">Current</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {setInfo && (
          <section className="tileDetailsSection">
            <div className="tileDetailsSectionHeader">
              <h4>Set membership</h4>
              <p>{setInfo.subtitle}</p>
            </div>
            <div className="boardSetPanel">
              <div className="boardSetHeader">
                <strong>{setInfo.title}</strong>
              </div>
              <ul className="boardSetList">
                {setInfo.members.map((member) => (
                  <li
                    key={String(member.position)}
                    className={[
                      "boardSetItem",
                      member.selected ? "boardSetItemSelected" : "",
                      member.mortgaged ? "boardSetItemMortgaged" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="boardSetPosition">{member.position}</span>
                    <span className="boardSetMain">
                      <strong>{member.label}</strong>
                      <span>
                        Owned by {member.ownerLabel}
                        {member.occupantLabel
                          ? ` | Players here: ${member.occupantLabel}`
                          : ""}
                      </span>
                    </span>
                    <span className="boardSetStatus">
                      {member.selected ? "Selected" : member.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showOwnerActionEconomics && economics && (
          <section className="tileDetailsSection">
            <div className="tileDetailsSectionHeader">
              <h4>Your tile economics</h4>
              <p>Costs, mortgage value, redemption, and development context.</p>
            </div>
            <div className="boardCellEconomicsEmbed">
              <TileEconomicsExplainContent
                mode="property_overview"
                economics={economics}
                currencySettings={currencySettings}
                developmentTokens={tileState?.developmentTokens ?? 0}
                mortgaged={tileState?.mortgaged ?? false}
              />
            </div>
          </section>
        )}

        <section className="tileDetailsSection tileDetailsOccupants">
          <div className="tileDetailsSectionHeader">
            <h4>Occupants</h4>
            <p>{occupantSummary}</p>
          </div>
        </section>
      </div>
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
  const tilesByPosition = indexTilesByPosition(state);
  const diagonalOccupants = DIAGONAL_POSITIONS.flatMap(
    (position) => occupantsByPosition.get(position) ?? [],
  );

  return (
    <div className="boardGrid">
      <div className="boardGridCenter">
        <div className="boardGridCenterTop">
          <span className="eyebrow">Oligopoly Online</span>
          <strong>Market floor</strong>
        </div>
        <div className="boardGridCenterBottom">
          <p className="muted">Diagonal express path</p>
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
        </div>
      </div>

      {PERIMETER_POSITIONS.map((position) => (
        <BoardCell
          key={position}
          position={position}
          ownerId={ownerByPosition.get(String(position)) ?? null}
          occupants={occupantsByPosition.get(String(position)) ?? []}
          actorId={actorId}
          tileNames={tileNames}
          tileDetails={tileDetails}
          myPlayerId={myPlayerId}
          tileState={tilesByPosition.get(String(position))}
          tilesByPosition={tilesByPosition}
          occupantsByPosition={occupantsByPosition}
          state={state}
          placement={perimeterPlacement(position)}
        />
      ))}

      {DIAGONAL_POSITIONS.map((position) => {
        const placement = DIAGONAL_PLACEMENTS.get(position);
        if (!placement) return null;

        return (
          <BoardCell
            key={position}
            position={position}
            ownerId={ownerByPosition.get(position) ?? null}
            occupants={occupantsByPosition.get(position) ?? []}
            actorId={actorId}
            tileNames={tileNames}
            tileDetails={tileDetails}
            myPlayerId={myPlayerId}
            tileState={tilesByPosition.get(String(position))}
            tilesByPosition={tilesByPosition}
            occupantsByPosition={occupantsByPosition}
            state={state}
            placement={placement}
          />
        );
      })}
    </div>
  );
}
