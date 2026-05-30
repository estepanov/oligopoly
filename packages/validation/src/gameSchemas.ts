import { z } from "zod";
import {
  AiPersonalitySchema,
  AiPlayerRuntimeSchema,
  AuctionTypeSchema,
  BindingContractSchema,
  BindingContractTermSchema,
  GamePlayerKindSchema,
  NegotiationThreadStatusSchema,
  SpectatorModeSchema,
  SyndicateFormationCharterSchema,
  TurnTimeoutSchema,
} from "./validationShared.js";

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
    type: z.literal("auction_pass"),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("draw_market_event"),
  }),
  z.object({
    type: z.literal("use_affinity"),
    affinityId: z.string(),
    targetPlayerId: z.string().optional(),
  }),
  z.object({
    type: z.literal("accept_disruption"),
  }),
  z.object({
    type: z.literal("start_negotiation"),
    targetPlayerIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("propose_contract"),
    partyB: z.string(),
    terms: z.array(BindingContractTermSchema).min(1),
    expiresRound: z.number().int().min(1).optional(),
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
    charter: SyndicateFormationCharterSchema.optional(),
  }),
  z.object({
    type: z.literal("call_vote"),
    voteType: z.literal("dissolve_syndicate"),
  }),
  z.object({
    type: z.literal("path_choice"),
    choice: z.enum(["perimeter", "diagonal"]),
  }),
  z.object({
    type: z.literal("end_turn"),
  }),
  z.object({
    type: z.literal("set_rate_card"),
    sectorId: z.string(),
    multiplier: z.number().min(0.5).max(2.0),
  }),
  z.object({
    type: z.literal("end_coordination"),
  }),
  z.object({
    type: z.literal("initiate_auction"),
    tilePosition: z.union([z.number().int(), z.string()]),
    amount: z.number().int().min(1).optional(),
  }),
  z.object({
    type: z.literal("pay_debt"),
    amount: z.number().int().min(1).optional(),
  }),
  z.object({
    type: z.literal("propose_handshake"),
    partyB: z.string(),
    summary: z.string().min(1),
  }),
  z.object({
    type: z.literal("hostile_takeover"),
    targetPlayerId: z.string(),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("market_manipulation"),
    targetPlayerId: z.string(),
    tilePosition: z.union([z.number().int(), z.string()]),
  }),
  z.object({
    type: z.literal("insider_keep_market_event"),
  }),
  z.object({
    type: z.literal("insider_discard_market_event"),
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
  "waiting_for_market_event",
  "waiting_for_roll",
  "waiting_for_buy",
  "waiting_for_auction_bids",
  "waiting_for_auction_settle",
  "waiting_for_path_choice",
  "waiting_for_disruption_nullify",
  "waiting_for_insider_peek",
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
  syndicateId: z.string().nullable().optional(),
  outstandingDebt: z.number().int().min(0).optional(),
  coordinationAcknowledged: z.boolean().optional(),
  hostileTakeoverUsed: z.boolean().optional(),
  marketManipulationUsedThisRound: z.boolean().optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/** In-game handshake row (engine `handshakeAgreements`, not persisted DB shape). */
export const InGameHandshakeAgreementSchema = z.object({
  id: z.string(),
  partyA: z.string(),
  partyB: z.string(),
  summary: z.string(),
  partySignatures: z.record(z.string(), z.boolean()).optional(),
  status: z.enum(["pending", "active", "broken"]),
  createdRound: z.number().int(),
});
export type InGameHandshakeAgreement = z.infer<
  typeof InGameHandshakeAgreementSchema
>;

export const PendingInsiderPeekSchema = z.object({
  cardId: z.string(),
  drawingPlayerId: z.string(),
  trigger: z.enum(["round_start", "tile"]).optional(),
  tilePosition: z.union([z.number().int(), z.string()]).optional(),
});
export type PendingInsiderPeek = z.infer<typeof PendingInsiderPeekSchema>;

/** Negotiation thread snapshot returned in game state (subset of full thread). */
export const GameNegotiationThreadSchema = z.object({
  id: z.string(),
  createdBy: z.string(),
  partyIds: z.array(z.string()),
  status: NegotiationThreadStatusSchema,
  startedRound: z.number().int(),
  expiresAfterRound: z.number().int(),
  visibility: z.enum(["private", "open"]).optional(),
});
export type GameNegotiationThread = z.infer<typeof GameNegotiationThreadSchema>;

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

export const PendingAuctionSchema = z.object({
  tilePosition: z.union([z.number().int(), z.string()]),
  trigger: z.enum([
    "decline",
    "foreclosure",
    "forced_sale",
    "player_initiated",
  ]),
  sellerId: z.string().optional(),
  reservePrice: z.number().int().min(1).optional(),
  auctionType: z.enum(["sealed_bids", "open_bids", "live_bidding"]),
  submissions: z.record(
    z.string(),
    z.union([z.number().int().min(1), z.literal("pass")]),
  ),
  eligiblePlayerIds: z.array(z.string()),
  tieBreakMinBid: z.number().int().min(1).optional(),
  tieBreakRound: z.number().int().min(0).optional(),
  resumePhase: z.enum(["action", "rolling_doubles", "waiting_for_roll"]),
  bidDeadlineAt: z.number().int().optional(),
  settleDeadlineAt: z.number().int().optional(),
  /** Present in redacted client views; omitted from persisted engine state. */
  submissionCount: z.number().int().min(0).optional(),
  /** Present in redacted player views; omitted from persisted engine state. */
  mySubmission: z
    .union([z.number().int().min(1), z.literal("pass")])
    .optional(),
});
export type PendingAuction = z.infer<typeof PendingAuctionSchema>;

export const GameStateSchema = z.object({
  gameId: z.string(),
  round: z.number().int(),
  phase: GamePhaseSchema.optional(),
  currentPlayerIndex: z.number().int().min(0).optional(),
  players: z.array(PlayerStateSchema).optional(),
  tiles: z.array(TileStateSchema).optional(),
  freeMarketPool: z.number().optional(),
  activeContracts: z.array(BindingContractSchema).optional(),
  syndicates: z
    .record(
      z.string(),
      z.object({
        syndicateId: z.string(),
        adminId: z.string(),
        memberIds: z.array(z.string()),
      }),
    )
    .optional(),
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
  pendingAuction: PendingAuctionSchema.optional(),
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
  handshakeAgreements: z.array(InGameHandshakeAgreementSchema).optional(),
  negotiationThreads: z.array(GameNegotiationThreadSchema).optional(),
  pendingInsiderPeek: PendingInsiderPeekSchema.nullable().optional(),
  settings: z
    .object({
      turnTimeout: TurnTimeoutSchema.optional(),
      auctionType: AuctionTypeSchema.optional(),
      auctionBidWindow: z.string().optional(),
      auctionSettleDelay: z.string().optional(),
      auctionExtensionWindow: z.string().optional(),
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
