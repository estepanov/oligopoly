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
