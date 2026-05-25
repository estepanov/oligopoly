import { z } from "zod";
import { env } from "../env";
import { getJson } from "./http";

const BoardTileSchema = z.object({
  position: z.union([z.number(), z.string()]),
  name: z.string(),
  cost: z.number().nullable(),
  type: z.string(),
});

const GameConfigSchema = z.object({
  perimeterTiles: z.array(BoardTileSchema),
  diagonalTiles: z.array(BoardTileSchema),
});

export type GameConfig = z.infer<typeof GameConfigSchema>;

export function fetchGameConfig() {
  return getJson(`${env.apiUrl}/api/game-config`, GameConfigSchema);
}

export function buildTileNameMap(config: GameConfig): Map<string, string> {
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
