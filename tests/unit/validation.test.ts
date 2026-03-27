import {
  BindingContractSchema,
  BindingContractTermSchema,
  HandshakeAgreementSchema,
  HealthResponseSchema,
  NegotiationErrorKeys,
  NegotiationMessageSchema,
  NegotiationThreadSchema,
  ProfileVisibilitySchema,
  SyndicateCharterSchema,
  UpdateUserSettingsInputSchema,
} from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

describe("ProfileVisibilitySchema", () => {
  it("accepts valid visibility settings", () => {
    const result = ProfileVisibilitySchema.safeParse({
      rank: "public",
      careerStats: "public",
      achievements: "public",
      recentGames: "public",
      onlineStatus: "authenticated",
      lastSeen: "authenticated",
      favoriteSector: "public",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid visibility values", () => {
    const result = ProfileVisibilitySchema.safeParse({
      rank: "invalid",
      careerStats: "public",
      achievements: "public",
      recentGames: "public",
      onlineStatus: "authenticated",
      lastSeen: "authenticated",
      favoriteSector: "public",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateUserSettingsInputSchema", () => {
  it("accepts valid partial update", () => {
    const result = UpdateUserSettingsInputSchema.safeParse({
      username: "testuser",
      profileVisibility: { rank: "private" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 3 chars", () => {
    const result = UpdateUserSettingsInputSchema.safeParse({
      username: "ab",
    });
    expect(result.success).toBe(false);
  });
});

describe("NegotiationErrorKeys", () => {
  it("contains all required error keys", () => {
    expect(NegotiationErrorKeys.BINDING_NOT_ALLOWED_LOW_TRUST).toBe(
      "negotiation.binding_not_allowed_low_trust",
    );
    expect(NegotiationErrorKeys.THREAD_EXPIRED).toBe(
      "negotiation.thread_expired",
    );
    expect(Object.keys(NegotiationErrorKeys)).toHaveLength(8);
  });
});

describe("HealthResponseSchema", () => {
  it("validates a health response", () => {
    const result = HealthResponseSchema.safeParse({
      status: "ok",
      timestamp: Date.now(),
      service: "oligopoly-worker",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NegotiationMessageSchema
// ---------------------------------------------------------------------------
describe("NegotiationMessageSchema", () => {
  it("accepts a valid message", () => {
    const result = NegotiationMessageSchema.safeParse({
      id: "msg-1",
      senderId: "player-a",
      content: "I propose we split sector revenue 60/40",
      sentAt: 1700000000000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = NegotiationMessageSchema.safeParse({
      id: "msg-1",
      senderId: "player-a",
    });
    expect(result.success).toBe(false);
  });

  it("rejects wrong type for sentAt", () => {
    const result = NegotiationMessageSchema.safeParse({
      id: "msg-1",
      senderId: "player-a",
      content: "hello",
      sentAt: "not-a-number",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BindingContractTermSchema
// ---------------------------------------------------------------------------
describe("BindingContractTermSchema", () => {
  it("accepts cannot_sell_tile term", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "cannot_sell_tile",
      tileId: "tile-5",
      boundPlayerId: "player-a",
    });
    expect(result.success).toBe(true);
  });

  it("accepts cannot_bid_auction term", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "cannot_bid_auction",
      tileId: "tile-12",
      boundPlayerId: "player-b",
    });
    expect(result.success).toBe(true);
  });

  it("accepts must_pay_capital term", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "must_pay_capital",
      amount: 500,
      fromPlayerId: "player-a",
      toPlayerId: "player-b",
      dueByRound: 10,
    });
    expect(result.success).toBe(true);
  });

  it("accepts revenue_share term", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "revenue_share",
      percentage: 25,
      fromPlayerId: "player-a",
      toPlayerId: "player-b",
      durationRounds: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown term type", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "unknown_type",
      tileId: "tile-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects cannot_sell_tile with missing boundPlayerId", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "cannot_sell_tile",
      tileId: "tile-5",
    });
    expect(result.success).toBe(false);
  });

  it("rejects must_pay_capital with missing amount", () => {
    const result = BindingContractTermSchema.safeParse({
      type: "must_pay_capital",
      fromPlayerId: "player-a",
      toPlayerId: "player-b",
      dueByRound: 10,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BindingContractSchema
// ---------------------------------------------------------------------------
const validContract = {
  id: "contract-1",
  gameId: "game-1",
  partyA: "player-a",
  partyB: "player-b",
  terms: [
    {
      type: "cannot_sell_tile" as const,
      tileId: "tile-5",
      boundPlayerId: "player-a",
    },
    {
      type: "revenue_share" as const,
      percentage: 20,
      fromPlayerId: "player-a",
      toPlayerId: "player-b",
      durationRounds: 4,
    },
  ],
  status: "active" as const,
  startsRound: 3,
  expiresRound: 10,
  signedAt: 1700000000000,
  fulfilledAt: null,
  breachedAt: null,
};

describe("BindingContractSchema", () => {
  it("accepts a valid binding contract", () => {
    const result = BindingContractSchema.safeParse(validContract);
    expect(result.success).toBe(true);
  });

  it("accepts null expiresRound", () => {
    const result = BindingContractSchema.safeParse({
      ...validContract,
      expiresRound: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status enum value", () => {
    const result = BindingContractSchema.safeParse({
      ...validContract,
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing terms array", () => {
    const { terms: _, ...noTerms } = validContract;
    const result = BindingContractSchema.safeParse(noTerms);
    expect(result.success).toBe(false);
  });

  it("rejects missing required id field", () => {
    const { id: _, ...noId } = validContract;
    const result = BindingContractSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HandshakeAgreementSchema
// ---------------------------------------------------------------------------
describe("HandshakeAgreementSchema", () => {
  it("accepts a valid handshake agreement", () => {
    const result = HandshakeAgreementSchema.safeParse({
      id: "hs-1",
      gameId: "game-1",
      partyIds: ["player-a", "player-b"],
      summary: "We agree not to compete in the Energy sector",
      signedAt: 1700000000000,
      settledAt: null,
      brokenBy: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts settled handshake with brokenBy set", () => {
    const result = HandshakeAgreementSchema.safeParse({
      id: "hs-2",
      gameId: "game-1",
      partyIds: ["player-a", "player-b", "player-c"],
      summary: "Non-aggression pact for 3 rounds",
      signedAt: 1700000000000,
      settledAt: 1700000100000,
      brokenBy: "player-c",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing summary", () => {
    const result = HandshakeAgreementSchema.safeParse({
      id: "hs-1",
      gameId: "game-1",
      partyIds: ["player-a"],
      signedAt: 1700000000000,
      settledAt: null,
      brokenBy: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array partyIds", () => {
    const result = HandshakeAgreementSchema.safeParse({
      id: "hs-1",
      gameId: "game-1",
      partyIds: "player-a",
      summary: "Deal",
      signedAt: 1700000000000,
      settledAt: null,
      brokenBy: null,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SyndicateCharterSchema
// ---------------------------------------------------------------------------
const validCharter = {
  syndicateId: "syndicate-1",
  governanceModel: "asset_weighted" as const,
  deadlockResolution: "public_dice_roll" as const,
  revenueSplit: [
    { playerId: "player-a", pct: 60 },
    { playerId: "player-b", pct: 40 },
  ],
  contributionWeights: {
    assetScorePct: 50,
    revenueScorePct: 30,
    negotiationCreditPct: 20,
  },
  dissolutionClause: {
    trustPenaltyPerMember: 2,
    requiresUnanimousVote: true as const,
  },
  ratifiedAt: 1700000000000,
};

describe("SyndicateCharterSchema", () => {
  it("accepts a valid charter with asset_weighted governance", () => {
    const result = SyndicateCharterSchema.safeParse(validCharter);
    expect(result.success).toBe(true);
  });

  it("accepts equal_vote governance model", () => {
    const result = SyndicateCharterSchema.safeParse({
      ...validCharter,
      governanceModel: "equal_vote",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid governance model", () => {
    const result = SyndicateCharterSchema.safeParse({
      ...validCharter,
      governanceModel: "majority_vote",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid deadlock resolution", () => {
    const result = SyndicateCharterSchema.safeParse({
      ...validCharter,
      deadlockResolution: "coin_flip",
    });
    expect(result.success).toBe(false);
  });

  it("rejects requiresUnanimousVote set to false", () => {
    const result = SyndicateCharterSchema.safeParse({
      ...validCharter,
      dissolutionClause: {
        trustPenaltyPerMember: 2,
        requiresUnanimousVote: false,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing contributionWeights", () => {
    const { contributionWeights: _, ...noWeights } = validCharter;
    const result = SyndicateCharterSchema.safeParse(noWeights);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NegotiationThreadSchema
// ---------------------------------------------------------------------------
const validThread = {
  id: "thread-1",
  gameId: "game-1",
  createdBy: "player-a",
  partyIds: ["player-a", "player-b"],
  status: "open" as const,
  startedRound: 5,
  expiresAfterRound: 8,
  visibility: "private" as const,
  messages: [
    {
      id: "msg-1",
      senderId: "player-a",
      content: "Let's make a deal",
      sentAt: 1700000000000,
    },
  ],
  proposedContract: undefined,
  handshakeRecord: undefined,
};

describe("NegotiationThreadSchema", () => {
  it("accepts a valid open thread", () => {
    const result = NegotiationThreadSchema.safeParse(validThread);
    expect(result.success).toBe(true);
  });

  it("accepts a thread with all status values", () => {
    for (const status of ["open", "agreed", "expired", "cancelled"]) {
      const result = NegotiationThreadSchema.safeParse({
        ...validThread,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("accepts open_negotiation_rule visibility", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      visibility: "open_negotiation_rule",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid visibility", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      visibility: "public",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a thread with a proposed contract", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      proposedContract: validContract,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a thread with a handshake record", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      handshakeRecord: {
        id: "hs-1",
        gameId: "game-1",
        partyIds: ["player-a", "player-b"],
        summary: "Gentleman's agreement",
        signedAt: 1700000000000,
        settledAt: null,
        brokenBy: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing messages array", () => {
    const { messages: _, ...noMessages } = validThread;
    const result = NegotiationThreadSchema.safeParse(noMessages);
    expect(result.success).toBe(false);
  });

  it("accepts empty messages array", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      messages: [],
    });
    expect(result.success).toBe(true);
  });
});
