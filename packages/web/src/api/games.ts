import { GameSummarySchema } from "@oligopoly/validation";
import { z } from "zod";
import { env } from "../env";
import { getJson } from "./http";

const GamesListResponseSchema = z.object({
  games: z.array(GameSummarySchema),
});

export function fetchGamesList(status?: "active" | "completed") {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson(`${env.apiUrl}/api/games${q}`, GamesListResponseSchema);
}

export function fetchGameSummary(id: string) {
  return getJson(
    `${env.apiUrl}/api/games/${encodeURIComponent(id)}`,
    GameSummarySchema,
  );
}
