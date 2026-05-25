import {
  CreateLobbyInputSchema,
  LeaveLobbyResponseSchema,
  LobbiesListResponseSchema,
  LobbyInviteResponseSchema,
  LobbyResponseSchema,
  type LobbyStatus,
  StartLobbyResponseSchema,
} from "@oligopoly/validation";
import type { z } from "zod";
import { env } from "../env";
import { getStoredToken } from "./auth";
import { ApiError, requestJson } from "./http";

export type Lobby = z.infer<typeof LobbyResponseSchema> & {
  status: LobbyStatus;
};
export type CreateLobbyInput = z.input<typeof CreateLobbyInputSchema>;
export type StartLobbyResponse = z.infer<typeof StartLobbyResponseSchema>;
export type LobbiesListResponse = z.infer<typeof LobbiesListResponseSchema>;
export type LeaveLobbyResponse = z.infer<typeof LeaveLobbyResponseSchema>;
export { ApiError };

const authHeaders = (): HeadersInit => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function listPublicLobbies() {
  return requestJson(`${env.apiUrl}/api/lobbies`, LobbiesListResponseSchema);
}

export function listMyLobbies() {
  return requestJson(
    `${env.apiUrl}/api/lobbies/mine`,
    LobbiesListResponseSchema,
    {
      headers: authHeaders(),
    },
  );
}

export function fetchLobby(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}`,
    LobbyResponseSchema,
  );
}

export function createLobby(input: CreateLobbyInput) {
  const payload = CreateLobbyInputSchema.parse(input);
  return requestJson(`${env.apiUrl}/api/lobbies`, LobbyResponseSchema, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function joinLobby(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/join`,
    LobbyResponseSchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function joinLobbyWithToken(lobbyId: string, token: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/join/${encodeURIComponent(token)}`,
    LobbyResponseSchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function createInviteToken(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/invite`,
    LobbyInviteResponseSchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function leaveLobby(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/leave`,
    LeaveLobbyResponseSchema,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
}

export function startLobby(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/start`,
    StartLobbyResponseSchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}
