import {
  GameActionSchema,
  type GameState,
  GameStateSchema,
  GameSummarySchema,
} from "@oligopoly/validation";
import { z } from "zod";
import { env } from "../env";
import { getStoredToken } from "./auth";
import { getJson, requestJson } from "./http";

const GamesListResponseSchema = z.object({
  games: z.array(GameSummarySchema),
});

type GameActionResponse = GameState & { logEntries?: unknown[] };
type AiStepResponse = GameActionResponse & {
  aiAction?: z.infer<typeof GameActionSchema>;
  aiPlayerId?: string;
  aiPersonality?: string;
};

const GameActionResponseSchema = z
  .object({})
  .passthrough() as unknown as z.ZodType<GameActionResponse>;

const AiStepResponseSchema = z
  .object({})
  .passthrough() as unknown as z.ZodType<AiStepResponse>;

const authHeaders = (): HeadersInit => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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

export function fetchGameState(id: string) {
  return requestJson(
    `${env.apiUrl}/api/games/${encodeURIComponent(id)}/state`,
    GameStateSchema,
    { headers: authHeaders() },
  );
}

export function submitGameAction(
  id: string,
  action: z.infer<typeof GameActionSchema>,
) {
  return requestJson(
    `${env.apiUrl}/api/games/${encodeURIComponent(id)}/action`,
    GameActionResponseSchema,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
    },
  );
}

export function stepAiTurn(id: string) {
  return requestJson(
    `${env.apiUrl}/api/games/${encodeURIComponent(id)}/ai/step`,
    AiStepResponseSchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function gameWebSocketUrl(id: string, spectator = false) {
  const path = spectator ? "spectate" : "ws";
  return `${env.wsUrl}/api/games/${encodeURIComponent(id)}/${path}`;
}
