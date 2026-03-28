import { z } from "zod";
import { env } from "../env";
import { getJson } from "./http";

/** Worker `/api/game-config` payload (not yet a shared validation export). */
export const GameConfigResponseSchema = z.record(z.string(), z.unknown());

export type GameConfigResponse = z.infer<typeof GameConfigResponseSchema>;

export function fetchGameConfig() {
  return getJson(`${env.apiUrl}/api/game-config`, GameConfigResponseSchema);
}
