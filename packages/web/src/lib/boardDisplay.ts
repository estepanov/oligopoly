type BoardTileLike = {
  position: number | string;
  name: string;
  cost?: number | null;
  baseRent?: number | null;
  sectorId?: string | null;
  type?: string;
};

type BoardConfigSlice = {
  perimeterTiles: BoardTileLike[];
  diagonalTiles: BoardTileLike[];
};

export function buildTileNameMap(
  config: BoardConfigSlice,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tile of [...config.perimeterTiles, ...config.diagonalTiles]) {
    map.set(String(tile.position), tile.name);
  }
  return map;
}

export type BoardTileDetails = BoardTileLike;

export function buildTileDetailsMap(
  config: BoardConfigSlice,
): Map<string, BoardTileDetails> {
  const map = new Map<string, BoardTileDetails>();
  for (const tile of [...config.perimeterTiles, ...config.diagonalTiles]) {
    map.set(String(tile.position), tile);
  }
  return map;
}

/**
 * HTML selects stringify values. Perimeter tiles must be sent as numbers so
 * `getTileByPosition` resolves the perimeter track, not diagonal IDs.
 */
export function parseTilePosition(value: string): number | string {
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return value;
}

export function tileLabel(
  position: number | string | null | undefined,
  tileNames: Map<string, string>,
): string {
  if (position === null || position === undefined) return "—";
  const key = String(position);
  return tileNames.get(key) ?? key;
}
