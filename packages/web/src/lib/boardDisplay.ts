type BoardTileLike = {
  position: number | string;
  name: string;
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

export function tileLabel(
  position: number | string | null | undefined,
  tileNames: Map<string, string>,
): string {
  if (position === null || position === undefined) return "—";
  const key = String(position);
  return tileNames.get(key) ?? key;
}
