import type { GameState, PlayerState } from "@oligopoly/validation";

export type BoardPlacement = {
  row: number;
  column: number;
  rowSpan?: number;
  columnSpan?: number;
  xPercent?: number;
  yPercent?: number;
  edge: "bottom" | "left" | "top" | "right" | "diagonal";
  corner?: boolean;
};

export const DIAGONAL_POSITIONS = ["D1", "D2", "D3", "D4", "D5"] as const;
export const PERIMETER_POSITIONS = Array.from(
  { length: 40 },
  (_, index) => index,
);

export const DIAGONAL_PLACEMENTS = new Map<string, BoardPlacement>([
  ["D1", { row: 1, column: 1, xPercent: 72, yPercent: 72, edge: "diagonal" }],
  ["D2", { row: 1, column: 1, xPercent: 61, yPercent: 61, edge: "diagonal" }],
  ["D3", { row: 1, column: 1, xPercent: 50, yPercent: 50, edge: "diagonal" }],
  ["D4", { row: 1, column: 1, xPercent: 39, yPercent: 39, edge: "diagonal" }],
  ["D5", { row: 1, column: 1, xPercent: 28, yPercent: 28, edge: "diagonal" }],
]);

export function perimeterPlacement(position: number): BoardPlacement {
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

function playerById(
  players: PlayerState[] | undefined,
  playerId: string | null,
): PlayerState | undefined {
  if (!playerId) return undefined;
  return players?.find((player) => player.playerId === playerId);
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

function isBoardPosition(
  position: number | string | undefined,
): position is number | string {
  return position !== undefined;
}

export function buildBoardViewModel({
  state,
  myPlayerId,
  actorId,
}: {
  state: GameState;
  myPlayerId: string | null;
  actorId: string | null;
}) {
  const occupantsByPosition = indexPlayersByPosition(state);
  const ownerByPosition = indexTileOwners(state);
  const tilesByPosition = indexTilesByPosition(state);
  const me = playerById(state.players, myPlayerId);
  const actor = playerById(state.players, actorId);
  const focusedPositions = [
    me?.position,
    actor?.position,
    ...(state.players ?? []).map((player) => player.position),
  ];
  const relevantPositions = Array.from(
    new Set(focusedPositions.filter(isBoardPosition)),
  ).slice(0, 5);

  return {
    actor,
    diagonalOccupants: DIAGONAL_POSITIONS.flatMap(
      (position) => occupantsByPosition.get(position) ?? [],
    ),
    diagonalPlacements: DIAGONAL_PLACEMENTS,
    diagonalPositions: DIAGONAL_POSITIONS,
    fullBoardPositions: [...PERIMETER_POSITIONS, ...DIAGONAL_POSITIONS],
    me,
    occupantsByPosition,
    ownerByPosition,
    perimeterPositions: PERIMETER_POSITIONS,
    relevantPositions,
    tilesByPosition,
  };
}

export type BoardViewModel = ReturnType<typeof buildBoardViewModel>;
