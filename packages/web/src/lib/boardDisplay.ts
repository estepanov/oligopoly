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

export type BoardTileDetails = BoardTileLike;

/** Single pass over board config for both name and detail maps. */
export function buildTileMaps(config: BoardConfigSlice): {
  names: Map<string, string>;
  details: Map<string, BoardTileDetails>;
} {
  const names = new Map<string, string>();
  const details = new Map<string, BoardTileDetails>();
  for (const tile of [...config.perimeterTiles, ...config.diagonalTiles]) {
    const key = String(tile.position);
    names.set(key, tile.name);
    details.set(key, tile);
  }
  return { names, details };
}

export function buildTileNameMap(
  config: BoardConfigSlice,
): Map<string, string> {
  return buildTileMaps(config).names;
}

export function buildTileDetailsMap(
  config: BoardConfigSlice,
): Map<string, BoardTileDetails> {
  return buildTileMaps(config).details;
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
