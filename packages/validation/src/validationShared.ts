import { z } from "zod";

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
  partySignatures: z.record(z.string(), z.boolean()).optional(),
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

/** Charter payload when forming a syndicate (syndicate id assigned by engine). */
export const SyndicateFormationCharterSchema = SyndicateCharterSchema.omit({
  syndicateId: true,
});
export type SyndicateFormationCharter = z.infer<
  typeof SyndicateFormationCharterSchema
>;

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

export const NegotiationThreadVisibilitySchema = z.enum(["private", "open"]);
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

export const GameLogListResponseSchema = z.object({
  log: z.array(GameLogEntrySchema),
});
export type GameLogListResponse = z.infer<typeof GameLogListResponseSchema>;

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

export const LobbyPlayerSchema = z.object({
  userId: z.string(),
  isAdmin: z.boolean(),
  isReady: z.boolean().optional(),
  joinedAt: z.number(),
});
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;

// ---------------------------------------------------------------------------
// Leaderboard schemas
// ---------------------------------------------------------------------------
export const LeaderboardEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardWinsEntrySchema = LeaderboardEntrySchema.extend({
  wins: z.number().int().nonnegative(),
});
export type LeaderboardWinsEntry = z.infer<typeof LeaderboardWinsEntrySchema>;

export const LeaderboardCompletionsEntrySchema = LeaderboardEntrySchema.extend({
  completions: z.number().int().nonnegative(),
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

export const LeaderboardErrorKeys = {
  INVALID_DATA: "leaderboard.invalid_data",
} as const;

// ---------------------------------------------------------------------------
// Calls schemas and error keys
// ---------------------------------------------------------------------------
export const CallsSessionTokenResponseSchema = z.object({
  sessionId: z.string(),
  sessionToken: z.string(),
});
export type CallsSessionTokenResponse = z.infer<
  typeof CallsSessionTokenResponseSchema
>;

export const CallsErrorKeys = {
  AUTH_REQUIRED: "calls.auth_required",
  NOT_CONFIGURED: "calls.not_configured",
  TOKEN_FAILED: "calls.token_failed",
  UPSTREAM_INVALID: "calls.upstream_invalid",
} as const;

export const GameErrorKeys = {
  AUTH_REQUIRED: "game.auth_required",
  FORBIDDEN: "game.forbidden",
  NOT_FOUND: "game.not_found",
  NOT_PLAYER: "game.not_player",
  GAME_COMPLETED: "game.completed",
  NOT_YOUR_TURN: "game.not_your_turn",
  NOT_AI_TURN: "game.not_ai_turn",
  INVALID_ACTION: "game.invalid_action",
  MUST_ROLL_FIRST: "game.must_roll_first",
  ALREADY_ROLLED: "game.already_rolled",
  TILE_NOT_PURCHASABLE: "game.tile_not_purchasable",
  TILE_ALREADY_OWNED: "game.tile_already_owned",
  INSUFFICIENT_CAPITAL: "game.insufficient_capital",
  NO_PENDING_BUY: "game.no_pending_buy",
  WRONG_TILE: "game.wrong_tile",
  PATH_CHOICE_NOT_NEEDED: "game.path_choice_not_needed",
  CANNOT_END_TURN: "game.cannot_end_turn",
  TILE_NOT_OWNED: "game.tile_not_owned",
  TILE_MORTGAGED: "game.tile_mortgaged",
  MAX_DEVELOPMENT: "game.max_development",
  INSUFFICIENT_AP: "game.insufficient_ap",
  TILE_NOT_MORTGAGED: "game.tile_not_mortgaged",
  DB_NOT_CONFIGURED: "game.db_not_configured",
} as const;

export const LobbyErrorKeys = {
  NOT_FOUND: "lobby.not_found",
  FULL: "lobby.full",
  PRIVATE: "lobby.private",
  ALREADY_JOINED: "lobby.already_joined",
  ALREADY_STARTED: "lobby.already_started",
  MEMBERSHIP_LIMIT_REACHED: "lobby.membership_limit_reached",
  NOT_ENOUGH_PLAYERS: "lobby.not_enough_players",
  NOT_ADMIN: "lobby.not_admin",
  NOT_OWNER: "lobby.not_owner",
  NOT_IN_LOBBY: "lobby.not_in_lobby",
  INVALID_TOKEN: "lobby.invalid_token",
  PLAYER_NOT_FOUND: "lobby.player_not_found",
  AUTH_REQUIRED: "lobby.auth_required",
  RANK_TOO_LOW: "lobby.rank_too_low",
  NOT_ALL_READY: "lobby.not_all_ready",
} as const;

// ---------------------------------------------------------------------------
// Board & game configuration schemas
// ---------------------------------------------------------------------------

export const TileTypeSchema = z.enum([
  "sector_tile",
  "corner",
  "special",
  "utility",
  "sector_hub",
]);
export type TileType = z.infer<typeof TileTypeSchema>;

export const SectorIdSchema = z.enum([
  "emerging_tech",
  "big_tech",
  "finance",
  "healthcare",
  "energy",
  "defense_media",
  "elite_tech",
  "fast_track",
]);
export type SectorId = z.infer<typeof SectorIdSchema>;

export const BoardTileSchema = z.object({
  position: z.union([z.number().int(), z.string()]),
  name: z.string(),
  type: TileTypeSchema,
  sectorId: SectorIdSchema.nullable(),
  cost: z.number().nullable(),
  baseRent: z.number().nullable(),
});
export type BoardTile = z.infer<typeof BoardTileSchema>;

export const AuctionTypeSchema = z.enum([
  "open_bids",
  "sealed_bids",
  "live_bidding",
]);
export type AuctionType = z.infer<typeof AuctionTypeSchema>;

export const TurnTimeoutSchema = z.enum([
  "1min",
  "5min",
  "30min",
  "2h",
  "8h",
  "24h",
  "48h",
  "7d",
  "none",
]);
export type TurnTimeout = z.infer<typeof TurnTimeoutSchema>;

export const SpectatorModeSchema = z.enum(["enabled", "disabled"]);
export type SpectatorMode = z.infer<typeof SpectatorModeSchema>;

export const AiPersonalitySchema = z.enum([
  "loyalist",
  "opportunist",
  "disruptor",
]);
export type AiPersonality = z.infer<typeof AiPersonalitySchema>;

export const LobbyAiSlotSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(32),
  personality: AiPersonalitySchema,
});
export type LobbyAiSlot = z.infer<typeof LobbyAiSlotSchema>;

const LobbyAiSlotsSchema = z
  .array(LobbyAiSlotSchema)
  .max(5)
  .superRefine((slots, ctx) => {
    const seen = new Set<string>();
    slots.forEach((slot, index) => {
      if (seen.has(slot.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI slot IDs must be unique",
          path: [index, "id"],
        });
        return;
      }
      seen.add(slot.id);
    });
  });

export const GamePlayerKindSchema = z.enum(["human", "ai"]);
export type GamePlayerKind = z.infer<typeof GamePlayerKindSchema>;

export const AiPlayerRuntimeSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  personality: AiPersonalitySchema,
  takeoverForPlayerId: z.string().nullable().optional(),
});
export type AiPlayerRuntime = z.infer<typeof AiPlayerRuntimeSchema>;

export const CurrencyMultiplierSchema = z.enum([
  "1",
  "10",
  "100",
  "1000",
  "10000",
  "100000",
]);
export type CurrencyMultiplier = z.infer<typeof CurrencyMultiplierSchema>;

// ---------------------------------------------------------------------------
// Enhanced lobby schemas
// ---------------------------------------------------------------------------

export const CreateLobbyInputSchema = z.object({
  name: z.string().min(1).max(64),
  maxPlayers: z.number().int().min(2).max(6),
  isPrivate: z.boolean(),
  optionalRuleIds: z.array(z.string()).default([]),
  aiSlots: LobbyAiSlotsSchema.default([]),
  turnTimeout: TurnTimeoutSchema.default("5min"),
  auctionBidWindow: z
    .enum(["30s", "1min", "5min", "10min", "30min"])
    .default("1min"),
  auctionSettleDelay: z.enum(["10s", "30s", "1min", "5min"]).default("30s"),
  auctionExtensionWindow: z.enum(["10s", "15s", "30s"]).default("15s"),
  auctionType: AuctionTypeSchema.default("sealed_bids"),
  voiceVideoEnabled: z.boolean().default(false),
  spectatorMode: SpectatorModeSchema.default("disabled"),
  marketEventDeckCardIds: z.array(z.string()).optional(),
  optionalMarketEventCardIds: z.array(z.string()).default([]),
  currencyName: z.string().min(1).max(32).default("Capital"),
  currencySymbol: z.string().min(1).max(8).default("¤"),
  currencyMultiplier: CurrencyMultiplierSchema.default("1"),
});
export type CreateLobbyInput = z.infer<typeof CreateLobbyInputSchema>;

export const UpdateLobbySettingsInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  maxPlayers: z.number().int().min(2).max(6).optional(),
  isPrivate: z.boolean().optional(),
  optionalRuleIds: z.array(z.string()).optional(),
  aiSlots: LobbyAiSlotsSchema.optional(),
  turnTimeout: TurnTimeoutSchema.optional(),
  auctionBidWindow: z
    .enum(["30s", "1min", "5min", "10min", "30min"])
    .optional(),
  auctionSettleDelay: z.enum(["10s", "30s", "1min", "5min"]).optional(),
  auctionExtensionWindow: z.enum(["10s", "15s", "30s"]).optional(),
  auctionType: AuctionTypeSchema.optional(),
  voiceVideoEnabled: z.boolean().optional(),
  spectatorMode: SpectatorModeSchema.optional(),
  marketEventDeckCardIds: z.array(z.string()).nullable().optional(),
  optionalMarketEventCardIds: z.array(z.string()).optional(),
  currencyName: z.string().min(1).max(32).optional(),
  currencySymbol: z.string().min(1).max(8).optional(),
  currencyMultiplier: CurrencyMultiplierSchema.optional(),
});
export type UpdateLobbySettingsInput = z.infer<
  typeof UpdateLobbySettingsInputSchema
>;
