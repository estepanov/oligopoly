import { z } from "zod";
import { env } from "../env";
import { getStoredToken } from "./auth";
import { requestJson } from "./http";

const UserRankSchema = z.object({
  tier: z.number(),
  title: z.string().nullable(),
  rankPoints: z.number(),
});

const AchievementSchema = z.object({
  id: z.string(),
  unlockedAt: z.number(),
});

const UserGameSchema = z.object({
  gameId: z.string(),
  status: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  winnerId: z.string().nullable(),
  playerIds: z.array(z.string()),
  participated: z.boolean(),
});

const authHeaders = (): HeadersInit => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function fetchMyRank() {
  return requestJson(`${env.apiUrl}/api/users/me/rank`, UserRankSchema, {
    headers: authHeaders(),
  });
}

export function fetchMyAchievements() {
  return requestJson(
    `${env.apiUrl}/api/users/me/achievements`,
    z.array(AchievementSchema),
    { headers: authHeaders() },
  );
}

export function fetchMyGames() {
  return requestJson(
    `${env.apiUrl}/api/users/me/games`,
    z.array(UserGameSchema),
    { headers: authHeaders() },
  );
}
