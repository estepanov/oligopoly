import type { LobbyStatus } from "@oligopoly/validation";
import { z } from "zod";
import { env } from "../env";
import { ApiError, requestJson } from "./http";

const LobbyPlayerSchema = z.object({
  userId: z.string(),
  isAdmin: z.boolean(),
  joinedAt: z.number(),
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
});

const StartLobbyResponseSchema = LobbySchema.extend({
  gameId: z.string(),
});

const InviteResponseSchema = z.object({
  token: z.string(),
  expiresInSeconds: z.number(),
});

export type Lobby = z.infer<typeof LobbySchema> & { status: LobbyStatus };
export type CreateLobbyInput = z.infer<typeof CreateLobbyInputSchema>;
export type StartLobbyResponse = z.infer<typeof StartLobbyResponseSchema>;
export type LobbiesListResponse = z.infer<typeof LobbiesListResponseSchema>;
export { ApiError };

const subjectHeaders = (subject: string) => ({
  "x-subject": subject,
});

export function listPublicLobbies() {
  return requestJson(`${env.apiUrl}/api/lobbies`, LobbiesListResponseSchema);
}

export function fetchLobby(lobbyId: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}`,
    LobbySchema,
  );
}

export function createLobby(input: CreateLobbyInput, subject: string) {
  const payload = CreateLobbyInputSchema.parse(input);
  return requestJson(`${env.apiUrl}/api/lobbies`, LobbySchema, {
    method: "POST",
    headers: {
      ...subjectHeaders(subject),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function joinLobby(lobbyId: string, subject: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/join`,
    LobbySchema,
    {
      method: "POST",
      headers: subjectHeaders(subject),
    },
  );
}

export function joinLobbyWithToken(
  lobbyId: string,
  token: string,
  subject: string,
) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/join/${encodeURIComponent(token)}`,
    LobbySchema,
    {
      method: "POST",
      headers: subjectHeaders(subject),
    },
  );
}

export function createInviteToken(lobbyId: string, subject: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/invite`,
    InviteResponseSchema,
    {
      method: "POST",
      headers: subjectHeaders(subject),
    },
  );
}

export function startLobby(lobbyId: string, subject: string) {
  return requestJson(
    `${env.apiUrl}/api/lobbies/${encodeURIComponent(lobbyId)}/start`,
    StartLobbyResponseSchema,
    {
      method: "POST",
      headers: subjectHeaders(subject),
    },
  );
}
