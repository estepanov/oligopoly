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
  DICE_ALREADY_ROLLED: "game.dice_already_rolled",
  DICE_RESULT_REQUIRED: "game.dice_result_required",
  INVALID_PLAYER_STATE: "game.invalid_player_state",
  ACTION_NOT_IMPLEMENTED: "game.action_not_implemented",
  CANNOT_END_TURN: "game.cannot_end_turn",
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
  aiSlots: z.array(LobbyAiSlotSchema).max(5).default([]),
  turnTimeout: TurnTimeoutSchema.default("5min"),
  auctionBidWindow: z
    .enum(["30s", "1min", "5min", "10min", "30min"])
    .default("1min"),
  auctionSettleDelay: z.enum(["10s", "30s", "1min", "5min"]).default("30s"),
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
  aiSlots: z.array(LobbyAiSlotSchema).max(5).optional(),
  turnTimeout: TurnTimeoutSchema.optional(),
  auctionBidWindow: z
    .enum(["30s", "1min", "5min", "10min", "30min"])
    .optional(),
  auctionSettleDelay: z.enum(["10s", "30s", "1min", "5min"]).optional(),
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

// ---------------------------------------------------------------------------
// Game action schemas (discriminated union)
// ---------------------------------------------------------------------------

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roll_dice"),
    /** Omitted on client requests; server fills from authoritative RNG before persistence. */
    result: z
      .tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)])
      .optional(),
  }),
  z.object({
    type: z.literal("buy_tile"),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("decline_tile"),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("develop_tile"),
    tilePosition: z.union([z.number().int(), z.string()]),
    tokenNumber: z.number().int().min(1).max(4),
  }),
  z.object({
    type: z.literal("mortgage_tile"),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("redeem_tile"),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("auction_bid"),
    tilePosition: z.union([z.number().int(), z.string()]),
    amount: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("start_negotiation"),
    targetPlayerIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("sign_contract"),
    contractId: z.string(),
  }),
  z.object({
    type: z.literal("sign_handshake"),
    handshakeId: z.string(),
  }),
  z.object({
    type: z.literal("break_handshake"),
    handshakeId: z.string(),
  }),
  z.object({
    type: z.literal("form_syndicate"),
    memberIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("call_vote"),
    voteType: z.string(),
  }),
  z.object({
    type: z.literal("path_choice"),
    choice: z.enum(["perimeter", "diagonal"]),
  }),
  z.object({
    type: z.literal("end_turn"),
  }),
]);
export type GameAction = z.infer<typeof GameActionSchema>;

// ---------------------------------------------------------------------------
// Enhanced game state schema
// ---------------------------------------------------------------------------

export const GamePhaseSchema = z.enum([
  "market_event",
  "action",
  "syndicate_coordination",
  "waiting_for_roll",
  "waiting_for_buy",
  "waiting_for_path_choice",
  "rolling_doubles",
  "game_over",
]);
export type GamePhase = z.infer<typeof GamePhaseSchema>;

export const PlayerStateSchema = z.object({
  playerId: z.string(),
  kind: GamePlayerKindSchema.default("human").optional(),
  displayName: z.string().optional(),
  aiPersonality: AiPersonalitySchema.optional(),
  position: z.union([z.number().int(), z.string()]),
  capital: z.number(),
  ownedTilePositions: z.array(z.union([z.number().int(), z.string()])),
  mortgagedTilePositions: z.array(z.union([z.number().int(), z.string()])),
  developmentTokens: z.record(z.string(), z.number().int().min(0).max(4)),
  trustworthiness: z.number().int().min(0).max(10),
  actionPointsRemaining: z.number().int().min(0),
  inRegulation: z.boolean(),
  doublesCount: z.number().int().min(0),
  isOnDiagonal: z.boolean(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const TileStateSchema = z.object({
  position: z.union([z.number().int(), z.string()]),
  ownerId: z.string().nullable(),
  mortgaged: z.boolean(),
  developmentTokens: z.number().int().min(0).max(4),
});
export type TileState = z.infer<typeof TileStateSchema>;

export const RateCardSchema = z.object({
  sectorId: z.string(),
  syndicateId: z.string(),
  multiplier: z.number().min(0.5).max(2.0),
  roundsWithoutLanding: z.number().int().min(0),
});
export type RateCard = z.infer<typeof RateCardSchema>;

export const GameStateSchema = z.object({
  gameId: z.string(),
  round: z.number().int(),
  phase: GamePhaseSchema.optional(),
  currentPlayerIndex: z.number().int().min(0).optional(),
  players: z.array(PlayerStateSchema).optional(),
  tiles: z.array(TileStateSchema).optional(),
  freeMarketPool: z.number().optional(),
  activeContracts: z.array(BindingContractSchema).optional(),
  rateCards: z.array(RateCardSchema).optional(),
  turnOrder: z.array(z.string()).optional(),
  aiPlayers: z.array(AiPlayerRuntimeSchema).optional(),
  /** The requesting player's own affinity card (hidden from other players) */
  myAffinityCardId: z.string().nullable().optional(),
  /** Position of tile awaiting purchase decision */
  pendingBuyTilePosition: z
    .union([z.number().int(), z.string()])
    .nullable()
    .optional(),
  /** Last dice roll result */
  lastDiceRoll: z
    .tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)])
    .nullable()
    .optional(),
  /** ID of the winner (player or syndicate leader) */
  winnerId: z.string().nullable().optional(),
  /** IDs of eliminated players */
  eliminatedPlayerIds: z.array(z.string()).optional(),
  /** Human players permanently replaced by AI after an admin kick */
  kickedPlayerIds: z.array(z.string()).optional(),
  settings: z
    .object({
      turnTimeout: TurnTimeoutSchema.optional(),
      auctionType: AuctionTypeSchema.optional(),
      auctionBidWindow: z.string().optional(),
      auctionSettleDelay: z.string().optional(),
      optionalRuleIds: z.array(z.string()).optional(),
      optionalMarketEventCardIds: z.array(z.string()).optional(),
      marketEventDeckCardIds: z.array(z.string()).nullable().optional(),
      currencyName: z.string().optional(),
      currencySymbol: z.string().optional(),
      currencyMultiplier: z.string().optional(),
      spectatorMode: SpectatorModeSchema.optional(),
    })
    .optional(),
});
export type GameState = z.infer<typeof GameStateSchema>;

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
    action: GameActionSchema,
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
    currentPlayerId: z.string(),
    deadlineAt: z.number().nullable(),
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

/** Input for POST /api/auth/register/options */
export const RegisterOptionsInputSchema = z.object({
  username: z.string().min(3).max(32),
});
export type RegisterOptionsInput = z.infer<typeof RegisterOptionsInputSchema>;

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
  DB_NOT_CONFIGURED: "auth.db_not_configured",
  PASSKEY_NOT_SUPPORTED: "auth.passkey_not_supported",
} as const;
