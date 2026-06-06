import { z } from "zod";
import { env } from "../env";
import { getJson } from "./http";

const BoardTileSchema = z.object({
  position: z.union([z.number(), z.string()]),
  name: z.string(),
  cost: z.number().nullable(),
  baseRent: z.number().nullable(),
  sectorId: z.string().nullable(),
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
