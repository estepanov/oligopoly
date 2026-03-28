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

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.number(),
  service: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// Negotiation message
// ---------------------------------------------------------------------------
export const NegotiationMessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  content: z.string(),
  sentAt: z.number(),
});
export type NegotiationMessage = z.infer<typeof NegotiationMessageSchema>;

// ---------------------------------------------------------------------------
// Binding contract term — discriminated union on `type`
// ---------------------------------------------------------------------------
export const BindingContractTermSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cannot_sell_tile"),
    tileId: z.string(),
    boundPlayerId: z.string(),
  }),
  z.object({
    type: z.literal("cannot_bid_auction"),
    tileId: z.string(),
    boundPlayerId: z.string(),
  }),
  z.object({
    type: z.literal("must_pay_capital"),
    amount: z.number(),
    fromPlayerId: z.string(),
    toPlayerId: z.string(),
    dueByRound: z.number(),
  }),
  z.object({
    type: z.literal("revenue_share"),
    percentage: z.number(),
    fromPlayerId: z.string(),
    toPlayerId: z.string(),
    durationRounds: z.number(),
  }),
]);
export type BindingContractTerm = z.infer<typeof BindingContractTermSchema>;

// ---------------------------------------------------------------------------
// Binding contract status
// ---------------------------------------------------------------------------
export const BindingContractStatusSchema = z.enum([
  "active",
  "fulfilled",
  "expired",
  "breached",
]);
export type BindingContractStatus = z.infer<typeof BindingContractStatusSchema>;

// ---------------------------------------------------------------------------
// Binding contract
// ---------------------------------------------------------------------------
export const BindingContractSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  partyA: z.string(),
  partyB: z.string(),
  terms: z.array(BindingContractTermSchema),
  status: BindingContractStatusSchema,
  startsRound: z.number(),
  expiresRound: z.number().nullable(),
  signedAt: z.number(),
  fulfilledAt: z.number().nullable(),
  breachedAt: z.number().nullable(),
});
export type BindingContract = z.infer<typeof BindingContractSchema>;

// ---------------------------------------------------------------------------
// Handshake agreement
// ---------------------------------------------------------------------------
export const HandshakeAgreementSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  partyIds: z.array(z.string()),
  summary: z.string(),
  signedAt: z.number(),
  settledAt: z.number().nullable(),
  brokenBy: z.string().nullable(),
});
export type HandshakeAgreement = z.infer<typeof HandshakeAgreementSchema>;

// ---------------------------------------------------------------------------
// Syndicate charter
// ---------------------------------------------------------------------------
export const SyndicateCharterSchema = z.object({
  syndicateId: z.string(),
  governanceModel: z.enum(["asset_weighted", "equal_vote"]),
  deadlockResolution: z.literal("public_dice_roll"),
  revenueSplit: z.array(
    z.object({
      playerId: z.string(),
      pct: z.number(),
    }),
  ),
  contributionWeights: z.object({
    assetScorePct: z.number(),
    revenueScorePct: z.number(),
    negotiationCreditPct: z.number(),
  }),
  dissolutionClause: z.object({
    trustPenaltyPerMember: z.number(),
    requiresUnanimousVote: z.literal(true),
  }),
  ratifiedAt: z.number(),
});
export type SyndicateCharter = z.infer<typeof SyndicateCharterSchema>;

// ---------------------------------------------------------------------------
// Negotiation thread status & visibility
// ---------------------------------------------------------------------------
export const NegotiationThreadStatusSchema = z.enum([
  "open",
  "agreed",
  "expired",
  "cancelled",
]);
export type NegotiationThreadStatus = z.infer<
  typeof NegotiationThreadStatusSchema
>;

export const NegotiationThreadVisibilitySchema = z.enum([
  "private",
  "open_negotiation_rule",
]);
export type NegotiationThreadVisibility = z.infer<
  typeof NegotiationThreadVisibilitySchema
>;

// ---------------------------------------------------------------------------
// Negotiation thread
// ---------------------------------------------------------------------------
export const NegotiationThreadSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  createdBy: z.string(),
  partyIds: z.array(z.string()),
  status: NegotiationThreadStatusSchema,
  startedRound: z.number(),
  expiresAfterRound: z.number(),
  visibility: NegotiationThreadVisibilitySchema,
  messages: z.array(NegotiationMessageSchema),
  proposedContract: BindingContractSchema.optional(),
  handshakeRecord: HandshakeAgreementSchema.optional(),
});
export type NegotiationThread = z.infer<typeof NegotiationThreadSchema>;

// ---------------------------------------------------------------------------
// Game status
// ---------------------------------------------------------------------------
export const GameStatusSchema = z.enum(["active", "completed"]);
export type GameStatus = z.infer<typeof GameStatusSchema>;

// ---------------------------------------------------------------------------
// Game summary — returned by GET /api/games and GET /api/games/:id
// ---------------------------------------------------------------------------
export const GameSummarySchema = z.object({
  id: z.string(),
  status: GameStatusSchema,
  playerCount: z.number().int(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  winnerId: z.string().nullable(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

// ---------------------------------------------------------------------------
// Game state snapshot — returned by GET /api/games/:id/state
// Placeholder: only gameId and round are required for now.
// ---------------------------------------------------------------------------
export const GameStateSchema = z.object({
  gameId: z.string(),
  round: z.number().int(),
});
export type GameState = z.infer<typeof GameStateSchema>;

// ---------------------------------------------------------------------------
// Game log entry — returned by GET /api/games/:id/log and /replay
// ---------------------------------------------------------------------------
export const GameLogEntrySchema = z.object({
  id: z.string(),
  gameId: z.string(),
  round: z.number().int(),
  playerId: z.string().nullable(),
  actionType: z.string(),
  payload: z.unknown().nullable(),
  createdAt: z.number(),
});
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;

// ---------------------------------------------------------------------------
// Lobby schemas
// ---------------------------------------------------------------------------
export const LobbyStatusSchema = z.enum([
  "waiting",
  "starting",
  "in_game",
  "finished",
]);
export type LobbyStatus = z.infer<typeof LobbyStatusSchema>;

export const CreateLobbyInputSchema = z.object({
  name: z.string().min(1).max(64),
  maxPlayers: z.number().int().min(2).max(6),
  isPrivate: z.boolean(),
  optionalRuleIds: z.array(z.string()).default([]),
});
export type CreateLobbyInput = z.infer<typeof CreateLobbyInputSchema>;

export const UpdateLobbySettingsInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  maxPlayers: z.number().int().min(2).max(6).optional(),
  isPrivate: z.boolean().optional(),
  optionalRuleIds: z.array(z.string()).optional(),
});
export type UpdateLobbySettingsInput = z.infer<
  typeof UpdateLobbySettingsInputSchema
>;

// ---------------------------------------------------------------------------
// Leaderboard schemas
// ---------------------------------------------------------------------------
export const LeaderboardWinsEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
  wins: z.number().int(),
});
export type LeaderboardWinsEntry = z.infer<typeof LeaderboardWinsEntrySchema>;

export const LeaderboardCompletionsEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
  completions: z.number().int(),
});
export type LeaderboardCompletionsEntry = z.infer<
  typeof LeaderboardCompletionsEntrySchema
>;

export const LeaderboardWinsResponseSchema = z.object({
  entries: z.array(LeaderboardWinsEntrySchema),
});
export type LeaderboardWinsResponse = z.infer<
  typeof LeaderboardWinsResponseSchema
>;

export const LeaderboardCompletionsResponseSchema = z.object({
  entries: z.array(LeaderboardCompletionsEntrySchema),
});
export type LeaderboardCompletionsResponse = z.infer<
  typeof LeaderboardCompletionsResponseSchema
>;

export const LobbyErrorKeys = {
  NOT_FOUND: "lobby.not_found",
  FULL: "lobby.full",
  PRIVATE: "lobby.private",
  ALREADY_JOINED: "lobby.already_joined",
  ALREADY_STARTED: "lobby.already_started",
  NOT_ENOUGH_PLAYERS: "lobby.not_enough_players",
  NOT_ADMIN: "lobby.not_admin",
  NOT_OWNER: "lobby.not_owner",
  INVALID_TOKEN: "lobby.invalid_token",
  PLAYER_NOT_FOUND: "lobby.player_not_found",
  AUTH_REQUIRED: "lobby.auth_required",
} as const;
