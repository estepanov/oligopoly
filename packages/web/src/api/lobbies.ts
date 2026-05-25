import { AiPersonalitySchema, type LobbyStatus } from "@oligopoly/validation";
import { z } from "zod";
import { env } from "../env";
import { getStoredToken } from "./auth";
import { ApiError, requestJson } from "./http";

const LobbyPlayerSchema = z.object({
  userId: z.string(),
  isAdmin: z.boolean(),
  joinedAt: z.number(),
});

const LobbyAiSlotSchema = z.object({
  id: z.string(),
  name: z.string(),
  personality: AiPersonalitySchema,
});

const LobbySchema = z.object({
  id: z.string(),
  name: z.string(),
  hostId: z.string(),
  status: z.enum(["waiting", "starting", "in_game", "finished"]),
  maxPlayers: z.number().int().min(2).max(6),
  isPrivate: z.boolean(),
  optionalRuleIds: z.array(z.string()),
  createdAt: z.number(),
  players: z.array(LobbyPlayerSchema),
  aiSlots: z.array(LobbyAiSlotSchema).default([]),
  gameId: z.string().optional(),
});

const LobbiesListResponseSchema = z.object({
  lobbies: z.array(LobbySchema),
  nextCursor: z.string().nullable(),
});

const CreateLobbyInputSchema = z.object({
  name: z.string().min(1).max(64),
  maxPlayers: z.number().int().min(2).max(6),
  isPrivate: z.boolean(),
  optionalRuleIds: z.array(z.string()),
  aiSlots: z.array(LobbyAiSlotSchema).default([]),
});

const StartLobbyResponseSchema = LobbySchema.extend({
  gameId: z.string(),
});

const InviteResponseSchema = z.object({
  token: z.string(),
  expiresInSeconds: z.number(),
});

const LeaveLobbyResponseSchema = z.object({
  lobbyId: z.string(),
  deleted: z.boolean(),
  lobby: LobbySchema.optional(),
});

export type Lobby = z.infer<typeof LobbySchema> & { status: LobbyStatus };
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
    LobbySchema,
  );
}

export function createLobby(input: CreateLobbyInput) {
  const payload = CreateLobbyInputSchema.parse(input);
  return requestJson(`${env.apiUrl}/api/lobbies`, LobbySchema, {
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
    LobbySchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function joinLobbyWithToken(lobbyId: string, token: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/join/${encodeURIComponent(token)}`,
    LobbySchema,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
}

export function createInviteToken(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/invite`,
    InviteResponseSchema,
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
