import {
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
  hasSectorControl,
  MAX_DEVELOPMENT_TOKENS,
} from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import type { BoardTileDetails } from "./boardDisplay";
import { occupantLabels } from "./boardOccupants";
import { playerDisplayName } from "./gameDisplay";

export function sectorClass(details: BoardTileDetails | undefined): string {
  return details?.sectorId ? `boardGridSector-${details.sectorId}` : "";
}

export function tileTypeLabel(details: BoardTileDetails | undefined): string {
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

export function tileStatusLabel({
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

export function boardTileDisplayName(
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

export function developmentTokenIndexes(developmentTokens: number): number[] {
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

export type RentSchedule = {
  conditionHeader: string;
  rows: Array<{
    id: string;
    label: string;
    detail: string;
    rent: number;
  }>;
};

export function rentScheduleForTile(
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

export function currentDiceTotal(state: GameState): number | null {
  return state.lastDiceRoll?.length === 2
    ? state.lastDiceRoll[0] + state.lastDiceRoll[1]
    : null;
}

export function currentRentRowId({
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

export type TileSetInfo = {
  members: TileSetMember[];
  subtitle: string;
  title: string;
};

export function sectorDisplayName(sectorId: string): string {
  return sectorId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildTileSetInfo({
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
