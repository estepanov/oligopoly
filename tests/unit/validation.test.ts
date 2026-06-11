import {
  AiPersonalitySchema,
  AuctionTypeSchema,
  BindingContractSchema,
  BindingContractTermSchema,
  BoardTileSchema,
  CreateLobbyInputSchema,
  CurrencyMultiplierSchema,
  GameActionSchema,
  GameErrorKeys,
  GamePhaseSchema,
  GameRealtimeEventSchema,
  GameStateSchema,
  HandshakeAgreementSchema,
  HealthResponseSchema,
  LobbyRealtimeEventSchema,
  NegotiationErrorKeys,
  NegotiationMessageSchema,
  NegotiationThreadSchema,
  PlayerStateSchema,
  ProfileVisibilitySchema,
  RateCardSchema,
  SectorIdSchema,
  SpectatorModeSchema,
  SyndicateCharterSchema,
  TileStateSchema,
  TileTypeSchema,
  TradeErrorKeys,
  TradeOfferSchema,
  TurnTimeoutSchema,
  UpdateLobbySettingsInputSchema,
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

describe("GameErrorKeys", () => {
  it("includes optimistic state conflict", () => {
    expect(GameErrorKeys.STATE_CONFLICT).toBe("game.state_conflict");
  });
});

describe("AI and realtime schemas", () => {
  it("accepts lobby AI slots on create inputs", () => {
    const result = CreateLobbyInputSchema.safeParse({
      name: "Solo vs AI",
      maxPlayers: 2,
      isPrivate: false,
      optionalRuleIds: [],
      aiSlots: [{ id: "ai-1", personality: "opportunist" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate lobby AI slot IDs", () => {
    const result = CreateLobbyInputSchema.safeParse({
      name: "Duplicate AI",
      maxPlayers: 3,
      isPrivate: false,
      optionalRuleIds: [],
      aiSlots: [
        { id: "ai-1", name: "Bot 1", personality: "opportunist" },
        { id: "ai-1", name: "Bot 2", personality: "loyalist" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("validates AI personalities", () => {
    expect(AiPersonalitySchema.safeParse("loyalist").success).toBe(true);
    expect(AiPersonalitySchema.safeParse("chaotic").success).toBe(false);
  });

  it("validates lobby and game realtime events", () => {
    expect(
      LobbyRealtimeEventSchema.safeParse({
        type: "lobby.presence",
        sentAt: 1,
        lobbyId: "lobby-1",
        userId: "user-1",
        status: "online",
      }).success,
    ).toBe(true);

    expect(
      GameRealtimeEventSchema.safeParse({
        type: "game.timer",
        sentAt: 1,
        gameId: "game-1",
        currentPlayerId: "ai:1",
        deadlineAt: null,
      }).success,
    ).toBe(true);
    expect(
      GameRealtimeEventSchema.safeParse({
        type: "game.timer",
        sentAt: 1,
        gameId: "game-1",
        deadlineAt: 2,
        timerKind: "trade_offer",
      }).success,
    ).toBe(true);
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

  it("accepts open visibility", () => {
    const result = NegotiationThreadSchema.safeParse({
      ...validThread,
      visibility: "open",
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

// ===========================================================================
// Board & Game Configuration Schemas
// ===========================================================================

describe("TileTypeSchema", () => {
  it("accepts valid tile types", () => {
    for (const t of [
      "sector_tile",
      "corner",
      "special",
      "utility",
      "sector_hub",
    ]) {
      expect(TileTypeSchema.safeParse(t).success).toBe(true);
    }
  });
  it("rejects invalid tile type", () => {
    expect(TileTypeSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("SectorIdSchema", () => {
  it("accepts all 8 sector IDs", () => {
    const sectors = [
      "emerging_tech",
      "big_tech",
      "finance",
      "healthcare",
      "energy",
      "defense_media",
      "elite_tech",
      "fast_track",
    ];
    for (const s of sectors) {
      expect(SectorIdSchema.safeParse(s).success).toBe(true);
    }
  });
  it("rejects invalid sector", () => {
    expect(SectorIdSchema.safeParse("tech").success).toBe(false);
  });
});

describe("BoardTileSchema", () => {
  it("accepts a valid perimeter tile", () => {
    const result = BoardTileSchema.safeParse({
      position: 1,
      name: "Digital Content Co.",
      type: "sector_tile",
      sectorId: "emerging_tech",
      cost: 60,
      baseRent: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid diagonal tile with string position", () => {
    const result = BoardTileSchema.safeParse({
      position: "D1",
      name: "Offshore Capital Corp.",
      type: "sector_tile",
      sectorId: "fast_track",
      cost: 320,
      baseRent: 28,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a corner tile with null fields", () => {
    const result = BoardTileSchema.safeParse({
      position: 0,
      name: "START",
      type: "corner",
      sectorId: null,
      cost: null,
      baseRent: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("AuctionTypeSchema", () => {
  it("accepts all three auction types", () => {
    for (const t of ["open_bids", "sealed_bids", "live_bidding"]) {
      expect(AuctionTypeSchema.safeParse(t).success).toBe(true);
    }
  });
  it("rejects invalid auction type", () => {
    expect(AuctionTypeSchema.safeParse("english").success).toBe(false);
  });
});

describe("TurnTimeoutSchema", () => {
  it("accepts all valid timeout values", () => {
    const values = [
      "1min",
      "5min",
      "30min",
      "2h",
      "8h",
      "24h",
      "48h",
      "7d",
      "none",
    ];
    for (const v of values) {
      expect(TurnTimeoutSchema.safeParse(v).success).toBe(true);
    }
  });
  it("rejects invalid timeout", () => {
    expect(TurnTimeoutSchema.safeParse("10min").success).toBe(false);
  });
});

describe("SpectatorModeSchema", () => {
  it("accepts enabled and disabled", () => {
    expect(SpectatorModeSchema.safeParse("enabled").success).toBe(true);
    expect(SpectatorModeSchema.safeParse("disabled").success).toBe(true);
  });
  it("rejects invalid value", () => {
    expect(SpectatorModeSchema.safeParse("partial").success).toBe(false);
  });
});

describe("CurrencyMultiplierSchema", () => {
  it("accepts valid multipliers", () => {
    for (const m of ["1", "10", "100", "1000", "10000", "100000"]) {
      expect(CurrencyMultiplierSchema.safeParse(m).success).toBe(true);
    }
  });
  it("rejects invalid multiplier", () => {
    expect(CurrencyMultiplierSchema.safeParse("50").success).toBe(false);
  });
});

// ===========================================================================
// Enhanced Lobby Schemas
// ===========================================================================

describe("CreateLobbyInputSchema (enhanced)", () => {
  it("accepts minimal input with defaults", () => {
    const result = CreateLobbyInputSchema.safeParse({
      name: "Test Lobby",
      maxPlayers: 4,
      isPrivate: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnTimeout).toBe("5min");
      expect(result.data.auctionType).toBe("sealed_bids");
      expect(result.data.voiceVideoEnabled).toBe(false);
      expect(result.data.spectatorMode).toBe("disabled");
      expect(result.data.currencyName).toBe("Capital");
      expect(result.data.currencySymbol).toBe("$");
      expect(result.data.currencyMultiplier).toBe("1");
    }
  });

  it("accepts full input with all settings", () => {
    const result = CreateLobbyInputSchema.safeParse({
      name: "Full Lobby",
      maxPlayers: 6,
      isPrivate: true,
      optionalRuleIds: ["speed_market"],
      turnTimeout: "30min",
      auctionBidWindow: "5min",
      auctionSettleDelay: "1min",
      auctionType: "live_bidding",
      voiceVideoEnabled: true,
      spectatorMode: "enabled",
      marketEventDeckCardIds: ["tech_boom", "market_crash"],
      optionalMarketEventCardIds: ["optional_leveraged_buyout"],
      currencyName: "Credits",
      currencySymbol: "$",
      currencyMultiplier: "1000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid auctionType", () => {
    const result = CreateLobbyInputSchema.safeParse({
      name: "Test",
      maxPlayers: 4,
      isPrivate: false,
      auctionType: "dutch",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateLobbySettingsInputSchema (enhanced)", () => {
  it("accepts partial update with new fields", () => {
    const result = UpdateLobbySettingsInputSchema.safeParse({
      turnTimeout: "2h",
      auctionType: "open_bids",
      currencyName: "Coins",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no changes)", () => {
    const result = UpdateLobbySettingsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Game Action Schema
// ===========================================================================

describe("GameActionSchema", () => {
  it("accepts roll_dice action", () => {
    const result = GameActionSchema.safeParse({
      type: "roll_dice",
      result: [3, 4],
    });
    expect(result.success).toBe(true);
  });

  it("accepts roll_dice without result (server fills authoritative dice)", () => {
    const result = GameActionSchema.safeParse({ type: "roll_dice" });
    expect(result.success).toBe(true);
  });

  it("accepts buy_tile action with number position", () => {
    const result = GameActionSchema.safeParse({
      type: "buy_tile",
      tilePosition: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts buy_tile action with string position", () => {
    const result = GameActionSchema.safeParse({
      type: "buy_tile",
      tilePosition: "D1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts develop_tile action", () => {
    const result = GameActionSchema.safeParse({
      type: "develop_tile",
      tilePosition: 6,
      tokenNumber: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects develop_tile with tokenNumber > 4", () => {
    const result = GameActionSchema.safeParse({
      type: "develop_tile",
      tilePosition: 6,
      tokenNumber: 5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts mortgage_tile action", () => {
    expect(
      GameActionSchema.safeParse({ type: "mortgage_tile", tilePosition: 9 })
        .success,
    ).toBe(true);
  });

  it("accepts auction_bid action", () => {
    const result = GameActionSchema.safeParse({
      type: "auction_bid",
      tilePosition: 13,
      amount: 250,
    });
    expect(result.success).toBe(true);
  });

  it("rejects auction_bid with 0 amount", () => {
    const result = GameActionSchema.safeParse({
      type: "auction_bid",
      tilePosition: 13,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts path_choice action", () => {
    expect(
      GameActionSchema.safeParse({ type: "path_choice", choice: "perimeter" })
        .success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({ type: "path_choice", choice: "diagonal" })
        .success,
    ).toBe(true);
  });

  it("accepts end_turn action", () => {
    expect(GameActionSchema.safeParse({ type: "end_turn" }).success).toBe(true);
  });

  it("accepts start_negotiation", () => {
    const result = GameActionSchema.safeParse({
      type: "start_negotiation",
      targetPlayerIds: ["p1", "p2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts trade offer actions", () => {
    expect(
      GameActionSchema.safeParse({
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
        timeoutMinutes: 5,
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "accept_trade",
        offerId: "trade-1",
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "reject_trade",
        offerId: "trade-1",
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "counter_trade",
        offerId: "trade-1",
        gives: { capital: 0, tilePositions: [6] },
        receives: { capital: 100, tilePositions: [] },
      }).success,
    ).toBe(true);
  });

  it("accepts form_syndicate", () => {
    const result = GameActionSchema.safeParse({
      type: "form_syndicate",
      memberIds: ["p1", "p2", "p3"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown action type", () => {
    const result = GameActionSchema.safeParse({
      type: "fly_to_moon",
    });
    expect(result.success).toBe(false);
  });
});

describe("TradeOfferSchema", () => {
  it("accepts a pending trade offer", () => {
    const result = TradeOfferSchema.safeParse({
      id: "trade-1",
      gameId: "game-1",
      proposerId: "p1",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
      status: "pending",
      createdAt: 1,
      expiresAt: 2,
      counterCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("exports stable trade error keys", () => {
    expect(TradeErrorKeys.OFFER_EXPIRED).toBe("trade.offer_expired");
    expect(Object.keys(TradeErrorKeys)).toHaveLength(9);
  });
});

// ===========================================================================
// Enhanced Game State Schema
// ===========================================================================

describe("GamePhaseSchema", () => {
  it("accepts all valid phases", () => {
    for (const p of ["market_event", "action", "waiting_for_roll"]) {
      expect(GamePhaseSchema.safeParse(p).success).toBe(true);
    }
  });
  it("rejects invalid phase", () => {
    expect(GamePhaseSchema.safeParse("setup").success).toBe(false);
  });
});

describe("PlayerStateSchema", () => {
  it("accepts a valid player state", () => {
    const result = PlayerStateSchema.safeParse({
      playerId: "p1",
      position: 5,
      capital: 1500,
      ownedTilePositions: [1, 3],
      mortgagedTilePositions: [],
      developmentTokens: { "1": 2, "3": 1 },
      trustworthiness: 7,
      actionPointsRemaining: 2,
      inRegulation: false,
      doublesCount: 0,
      isOnDiagonal: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects trustworthiness outside 0–10", () => {
    const result = PlayerStateSchema.safeParse({
      playerId: "p1",
      position: 0,
      capital: 1000,
      ownedTilePositions: [],
      mortgagedTilePositions: [],
      developmentTokens: {},
      trustworthiness: 11,
      actionPointsRemaining: 2,
      inRegulation: false,
      doublesCount: 0,
      isOnDiagonal: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("TileStateSchema", () => {
  it("accepts a valid tile state", () => {
    const result = TileStateSchema.safeParse({
      position: 1,
      ownerId: "p1",
      mortgaged: false,
      developmentTokens: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts unowned tile", () => {
    const result = TileStateSchema.safeParse({
      position: "D1",
      ownerId: null,
      mortgaged: false,
      developmentTokens: 0,
    });
    expect(result.success).toBe(true);
  });

  it("preserves the mortgage rate for client redemption economics", () => {
    const result = TileStateSchema.safeParse({
      position: 6,
      ownerId: "p1",
      mortgaged: true,
      mortgageRate: 0.6,
      developmentTokens: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mortgageRate).toBe(0.6);
    }
  });
});

describe("RateCardSchema", () => {
  it("accepts a valid rate card", () => {
    const result = RateCardSchema.safeParse({
      sectorId: "energy",
      syndicateId: "s1",
      multiplier: 1.5,
      roundsWithoutLanding: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects multiplier below 0.5", () => {
    const result = RateCardSchema.safeParse({
      sectorId: "energy",
      syndicateId: "s1",
      multiplier: 0.3,
      roundsWithoutLanding: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects multiplier above 2.0", () => {
    const result = RateCardSchema.safeParse({
      sectorId: "energy",
      syndicateId: "s1",
      multiplier: 2.5,
      roundsWithoutLanding: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("GameStateSchema (enhanced)", () => {
  it("still accepts minimal state (backward compat)", () => {
    const result = GameStateSchema.safeParse({
      gameId: "game-1",
      round: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts full enhanced state", () => {
    const result = GameStateSchema.safeParse({
      gameId: "game-1",
      round: 3,
      phase: "action",
      currentPlayerIndex: 0,
      players: [
        {
          playerId: "p1",
          position: 5,
          capital: 1200,
          ownedTilePositions: [1, 3],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
      tiles: [
        { position: 1, ownerId: "p1", mortgaged: false, developmentTokens: 0 },
      ],
      freeMarketPool: 75,
      turnOrder: ["p1", "p2"],
      settings: {
        turnTimeout: "5min",
        auctionType: "sealed_bids",
        optionalRuleIds: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("preserves redacted auction view fields on client state", () => {
    const result = GameStateSchema.safeParse({
      gameId: "game-1",
      round: 1,
      phase: "waiting_for_auction_bids",
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: {},
        eligiblePlayerIds: ["p1", "p2"],
        tieBreakRound: 0,
        resumePhase: "action",
        submissionCount: 1,
        mySubmission: 90,
        bidDeadlineAt: Date.now() + 60_000,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pendingAuction?.submissionCount).toBe(1);
      expect(result.data.pendingAuction?.mySubmission).toBe(90);
    }
  });

  it("preserves handshake agreements and insider peek for web UI", () => {
    const result = GameStateSchema.safeParse({
      gameId: "game-1",
      round: 2,
      phase: "waiting_for_insider_peek",
      pendingInsiderPeek: {
        cardId: "tech_boom",
        drawingPlayerId: "p1",
        trigger: "round_start",
      },
      handshakeAgreements: [
        {
          id: "handshake-game-1-1",
          partyA: "p1",
          partyB: "p2",
          summary: "No trades",
          status: "pending",
          partySignatures: { p1: true },
          createdRound: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pendingInsiderPeek?.cardId).toBe("tech_boom");
      expect(result.data.handshakeAgreements?.[0]?.id).toBe(
        "handshake-game-1-1",
      );
    }
  });
});
