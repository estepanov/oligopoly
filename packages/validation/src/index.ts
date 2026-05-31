import { z } from "zod";

export const VisibilitySettingSchema = z.enum([
  "public",
  "authenticated",
  "private",
]);
export type VisibilitySetting = z.infer<typeof VisibilitySettingSchema>;

export const ProfileVisibilitySchema = z.object({
  rank: VisibilitySettingSchema,
  careerStats: VisibilitySettingSchema,
  achievements: VisibilitySettingSchema,
  recentGames: VisibilitySettingSchema,
  onlineStatus: VisibilitySettingSchema,
  lastSeen: VisibilitySettingSchema,
  favoriteSector: VisibilitySettingSchema,
});
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;

export const UpdateUserSettingsInputSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  themePreference: z.string().optional(),
  profileVisibility: ProfileVisibilitySchema.partial().optional(),
});
export type UpdateUserSettingsInput = z.infer<
  typeof UpdateUserSettingsInputSchema
>;

export const NegotiationErrorKeys = {
  BINDING_NOT_ALLOWED_LOW_TRUST: "negotiation.binding_not_allowed_low_trust",
  CONTRACT_INVALID_TERMS: "negotiation.contract_invalid_terms",
  CONTRACT_TILE_NOT_OWNED: "negotiation.contract_tile_not_owned",
  THREAD_EXPIRED: "negotiation.thread_expired",
  ACTION_BLOCKED_BY_CONTRACT: "negotiation.action_blocked_by_contract",
  CHARTER_INVALID_SPLIT: "negotiation.charter_invalid_split",
  CHARTER_INVALID_WEIGHTS: "negotiation.charter_invalid_weights",
  SYNDICATE_DISSOLUTION_REQUIRES_UNANIMOUS_VOTE:
    "negotiation.syndicate_dissolution_requires_unanimous_vote",
} as const;

/** Stable keys returned by `applyGameAction` in `@oligopoly/shared` */
export const GameEngineErrorKeys = {
  NOT_YOUR_TURN: "game.not_your_turn",
  INVALID_PHASE: "game.invalid_phase",
  INVALID_ACTION: "game.invalid_action",
  DICE_ALREADY_ROLLED: "game.dice_already_rolled",
  DICE_RESULT_REQUIRED: "game.dice_result_required",
  INVALID_PLAYER_STATE: "game.invalid_player_state",
  UNKNOWN_ENGINE_ERROR: "game.unknown_engine_error",
  ACTION_NOT_IMPLEMENTED: "game.action_not_implemented",
  CANNOT_END_TURN: "game.cannot_end_turn",
} as const;

/** Stable game error keys surfaced by shared reducer adapters. */
export type GameEngineErrorKey =
  | (typeof GameEngineErrorKeys)[keyof typeof GameEngineErrorKeys]
  | (typeof GameErrorKeys)[keyof typeof GameErrorKeys];

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.number(),
  service: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export * from "./gameSchemas.js";
export * from "./validationShared.js";

import { GameActionSchema, GameStateSchema } from "./gameSchemas.js";
import {
  AiPersonalitySchema,
  AuctionTypeSchema,
  type GameErrorKeys,
  GameLogEntrySchema,
  LobbyAiSlotSchema,
  LobbyPlayerSchema,
  LobbyStatusSchema,
  SpectatorModeSchema,
  TurnTimeoutSchema,
} from "./validationShared.js";

export const LobbyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  hostId: z.string(),
  status: LobbyStatusSchema,
  maxPlayers: z.number().int().min(2).max(6),
  isPrivate: z.boolean(),
  optionalRuleIds: z.array(z.string()),
  createdAt: z.number(),
  players: z.array(LobbyPlayerSchema),
  aiSlots: z.array(LobbyAiSlotSchema).default([]),
  gameId: z.string().optional(),
  turnTimeout: TurnTimeoutSchema.optional(),
  auctionBidWindow: z.string().optional(),
  auctionSettleDelay: z.string().optional(),
  auctionType: AuctionTypeSchema.optional(),
  voiceVideoEnabled: z.boolean().optional(),
  spectatorMode: SpectatorModeSchema.optional(),
  marketEventDeckCardIds: z.array(z.string()).nullable().optional(),
  optionalMarketEventCardIds: z.array(z.string()).optional(),
  currencyName: z.string().optional(),
  currencySymbol: z.string().optional(),
  currencyMultiplier: z.string().optional(),
});
export type LobbyResponse = z.infer<typeof LobbyResponseSchema>;

export const LobbiesListResponseSchema = z.object({
  lobbies: z.array(LobbyResponseSchema),
  nextCursor: z.string().nullable(),
});
export type LobbiesListResponse = z.infer<typeof LobbiesListResponseSchema>;

export const StartLobbyResponseSchema = LobbyResponseSchema.extend({
  gameId: z.string(),
});
export type StartLobbyResponse = z.infer<typeof StartLobbyResponseSchema>;

export const LeaveLobbyResponseSchema = z.object({
  lobbyId: z.string(),
  deleted: z.boolean(),
  lobby: LobbyResponseSchema.optional(),
});
export type LeaveLobbyResponse = z.infer<typeof LeaveLobbyResponseSchema>;

export const LobbyInviteResponseSchema = z.object({
  token: z.string(),
  expiresInSeconds: z.number(),
});
export type LobbyInviteResponse = z.infer<typeof LobbyInviteResponseSchema>;

export const GameActionResponseSchema = GameStateSchema.extend({
  logEntries: z.array(GameLogEntrySchema).optional(),
});
export type GameActionResponse = z.infer<typeof GameActionResponseSchema>;

export const AiStepResponseSchema = GameActionResponseSchema.extend({
  aiAction: GameActionSchema.optional(),
  aiPlayerId: z.string().optional(),
  aiPersonality: AiPersonalitySchema.optional(),
});
export type AiStepResponse = z.infer<typeof AiStepResponseSchema>;

// ---------------------------------------------------------------------------
// Real-time lobby/game WebSocket schemas
// ---------------------------------------------------------------------------

export const RealtimeEnvelopeSchema = z.object({
  type: z.string(),
  sentAt: z.number(),
});
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelopeSchema>;

export const LobbyRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lobby.snapshot"),
    sentAt: z.number(),
    lobbyId: z.string(),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal("lobby.presence"),
    sentAt: z.number(),
    lobbyId: z.string(),
    userId: z.string(),
    status: z.enum(["online", "offline"]),
  }),
  z.object({
    type: z.literal("lobby.updated"),
    sentAt: z.number(),
    lobbyId: z.string(),
    payload: z.unknown(),
  }),
]);
export type LobbyRealtimeEvent = z.infer<typeof LobbyRealtimeEventSchema>;

export const GameRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("game.snapshot"),
    sentAt: z.number(),
    gameId: z.string(),
    payload: GameStateSchema,
  }),
  z.object({
    type: z.literal("game.action_applied"),
    sentAt: z.number(),
    gameId: z.string(),
    actorId: z.string(),
    action: GameActionSchema.optional(),
    logEntries: z.array(GameLogEntrySchema).optional(),
    state: GameStateSchema,
  }),
  z.object({
    type: z.literal("game.presence"),
    sentAt: z.number(),
    gameId: z.string(),
    userId: z.string(),
    status: z.enum(["online", "offline"]),
  }),
  z.object({
    type: z.literal("game.timer"),
    sentAt: z.number(),
    gameId: z.string(),
    currentPlayerId: z.string().optional(),
    deadlineAt: z.number().nullable(),
    timerKind: z.enum(["turn", "auction_bids", "auction_settle"]).optional(),
  }),
  z.object({
    type: z.literal("game.ai_action"),
    sentAt: z.number(),
    gameId: z.string(),
    aiPlayerId: z.string(),
    personality: AiPersonalitySchema,
    action: GameActionSchema,
  }),
  z.object({
    type: z.literal("game.schedule"),
    sentAt: z.number(),
    gameId: z.string(),
    state: GameStateSchema,
  }),
]);
export type GameRealtimeEvent = z.infer<typeof GameRealtimeEventSchema>;

// ---------------------------------------------------------------------------
// Passkey / WebAuthn auth schemas
// ---------------------------------------------------------------------------

/** Shared body for endpoints that accept just a username (3–32 chars). */
export const UsernameInputSchema = z.object({
  username: z.string().min(3).max(32),
});
export type UsernameInput = z.infer<typeof UsernameInputSchema>;

/** Input for POST /api/auth/register/options */
export const RegisterOptionsInputSchema = UsernameInputSchema;
export type RegisterOptionsInput = z.infer<typeof RegisterOptionsInputSchema>;

/**
 * Input for POST /api/auth/dev-login (local-development-only passwordless
 * sign-in). References the neutral username schema rather than the WebAuthn
 * registration schema so the two contracts stay decoupled.
 */
export const DevLoginInputSchema = UsernameInputSchema;
export type DevLoginInput = z.infer<typeof DevLoginInputSchema>;

/** Input for POST /api/auth/register/verify */
export const RegisterVerifyInputSchema = z.object({
  username: z.string().min(3).max(32),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      attestationObject: z.string(),
      clientDataJSON: z.string(),
      transports: z.array(z.string()).optional(),
    }),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.record(z.unknown()),
    type: z.literal("public-key"),
  }),
});
export type RegisterVerifyInput = z.infer<typeof RegisterVerifyInputSchema>;

/** Input for POST /api/auth/login/options */
export const LoginOptionsInputSchema = z.object({
  username: z.string().min(3).max(32).optional(),
});
export type LoginOptionsInput = z.infer<typeof LoginOptionsInputSchema>;

/** Input for POST /api/auth/login/verify */
export const LoginVerifyInputSchema = z.object({
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.record(z.unknown()),
    type: z.literal("public-key"),
  }),
});
export type LoginVerifyInput = z.infer<typeof LoginVerifyInputSchema>;

/** Response from session-creating auth endpoints */
export const AuthSessionResponseSchema = z.object({
  token: z.string(),
  userId: z.string(),
  username: z.string(),
  expiresAt: z.number(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

/** Response from GET /api/auth/session */
export const AuthSessionInfoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  expiresAt: z.number(),
});
export type AuthSessionInfo = z.infer<typeof AuthSessionInfoSchema>;

export const AuthErrorKeys = {
  USERNAME_TAKEN: "auth.username_taken",
  INVALID_CREDENTIAL: "auth.invalid_credential",
  CHALLENGE_EXPIRED: "auth.challenge_expired",
  CHALLENGE_NOT_FOUND: "auth.challenge_not_found",
  SESSION_EXPIRED: "auth.session_expired",
  SESSION_NOT_FOUND: "auth.session_not_found",
  CREDENTIAL_NOT_FOUND: "auth.credential_not_found",
  REGISTRATION_FAILED: "auth.registration_failed",
  VERIFICATION_FAILED: "auth.verification_failed",
  FORBIDDEN: "auth.forbidden",
  DB_NOT_CONFIGURED: "auth.db_not_configured",
  PASSKEY_NOT_SUPPORTED: "auth.passkey_not_supported",
} as const;
