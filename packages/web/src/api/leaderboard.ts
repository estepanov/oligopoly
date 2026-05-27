import {
  LeaderboardCompletionsResponseSchema,
  LeaderboardWinsResponseSchema,
} from "@oligopoly/validation";
import { env } from "../env";
import { requestJson } from "./http";

export function fetchLeaderboardWins() {
  return requestJson(
    `${env.apiUrl}/api/leaderboard/wins`,
    LeaderboardWinsResponseSchema,
  );
}

export function fetchLeaderboardCompletions() {
  return requestJson(
    `${env.apiUrl}/api/leaderboard/completions`,
    LeaderboardCompletionsResponseSchema,
  );
}
