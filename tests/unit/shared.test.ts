import type {
  BindingContract,
  BindingContractTerm,
  ContributionInput,
  InternalGameState,
} from "@oligopoly/shared";
import {
  ACTION_POINTS_PER_TURN,
  applyAction,
  applyHandshakeBreach,
  applyHigherRankBonus,
  applyThreadExpiry,
  calcThreadExpiry,
  calculateAbsorptionPrice,
  calculateContributionScores,
  calculateDevelopmentCost,
  calculateGameRankPoints,
  calculateHubRent,
  calculateMortgageValue,
  calculateRedemptionCost,
  calculateSectorTileRent,
  calculateUtilityRent,
  canCreateBindingContract,
  checkSoloWin,
  checkSyndicateWin,
  chooseAiAction,
  clampTrustworthiness,
  closeAuctionBidWindowIfReady,
  DEFAULT_CONTRIBUTION_WEIGHTS,
  DEFAULT_PROFILE_VISIBILITY,
  DIAGONAL_TRAVERSE_BONUS,
  FLASH_CRASH_LOSS_PCT,
  FLASH_CRASH_WINDFALL_PCT,
  type FullUserProfile,
  finalizeAuctionSettleIfReady,
  findNextAiActorForPhase,
  getRankForPoints,
  getStartingCapital,
  getTileByPosition,
  getTilesBySector,
  getTrustworthinessRestrictions,
  HANDSHAKE_BREACH_PENALTY,
  initTileStates,
  isActionBlockedByContracts,
  isDiagonalChoice,
  isDoubles,
  isPerimeterChoice,
  isThreadExpired,
  moveOnPerimeter,
  NEGOTIATION_THREAD_DURATION,
  PASS_START_BONUS,
  SOLO_WIN_THRESHOLD,
  SYNDICATE_WIN_THRESHOLD,
  serializeProfileForAudience,
  THREAD_EXPIRY_PENALTY,
  TOTAL_BOARD_MARKET_VALUE,
  TRUSTWORTHINESS_DEFAULT,
  validateContractTerms,
  validateContractTileOwnership,
  validateContributionWeights,
  validateRevenueSplit,
} from "@oligopoly/shared";
import { NegotiationErrorKeys } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Existing tests (preserved)
// ---------------------------------------------------------------------------

describe("clampTrustworthiness", () => {
  it("clamps values below 0 to 0", () => {
    expect(clampTrustworthiness(-5)).toBe(0);
  });

  it("clamps values above 10 to 10", () => {
    expect(clampTrustworthiness(15)).toBe(10);
  });

  it("leaves values in range unchanged", () => {
    expect(clampTrustworthiness(7)).toBe(7);
  });
});

describe("chooseAiAction", () => {
  const baseAiState: InternalGameState = {
    gameId: "game-ai",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["ai:bot"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "ai:bot",
        kind: "ai",
        aiPersonality: "opportunist",
        position: 0,
        capital: 1500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    aiPlayers: [
      { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
    ],
    tiles: initTileStates(),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  };

  it("chooses draw_market_event during round-start phase", () => {
    const decision = chooseAiAction({
      ...baseAiState,
      phase: "waiting_for_market_event",
    });

    expect(decision?.action.type).toBe("draw_market_event");
  });

  it("chooses deterministic roll actions for AI turns", () => {
    const decision = chooseAiAction(baseAiState);

    expect(decision?.actorId).toBe("ai:bot");
    expect(decision?.action.type).toBe("roll_dice");
  });

  it("does not choose actions for human turns", () => {
    const decision = chooseAiAction({
      ...baseAiState,
      turnOrder: ["human-1"],
      players: [
        { ...baseAiState.players[0], playerId: "human-1", kind: "human" },
      ],
      aiPlayers: [],
    });

    expect(decision).toBeNull();
  });

  function tradeReadyState(): InternalGameState {
    return {
      ...baseAiState,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["human-1", "ai:bot"],
      players: [
        {
          playerId: "human-1",
          kind: "human",
          position: 0,
          capital: 1500,
          ownedTilePositions: [3],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
        {
          ...baseAiState.players[0],
          ownedTilePositions: [6],
          actionPointsRemaining: 2,
        },
      ],
      tiles: initTileStates().map((tile) => {
        if (String(tile.position) === "3") {
          return { ...tile, ownerId: "human-1" };
        }
        if (String(tile.position) === "6") {
          return { ...tile, ownerId: "ai:bot" };
        }
        return tile;
      }),
      tradeOffers: [],
    };
  }

  it("accepts favorable trade offers addressed to AI", () => {
    const state = tradeReadyState();
    state.tradeOffers = [
      {
        id: "trade-1",
        gameId: state.gameId,
        proposerId: "human-1",
        recipientId: "ai:bot",
        gives: { capital: 300, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        counterCount: 0,
      },
    ];

    const decision = chooseAiAction(state);

    expect(decision).toMatchObject({
      actorId: "ai:bot",
      action: { type: "accept_trade", offerId: "trade-1" },
    });
  });

  it("counters underpriced trade offers addressed to AI", () => {
    const state = tradeReadyState();
    state.tradeOffers = [
      {
        id: "trade-1",
        gameId: state.gameId,
        proposerId: "human-1",
        recipientId: "ai:bot",
        gives: { capital: 10, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        counterCount: 0,
      },
    ];

    const decision = chooseAiAction(state);

    expect(decision?.actorId).toBe("ai:bot");
    expect(decision?.action.type).toBe("counter_trade");
    expect(
      (decision?.action as { receives?: { capital?: number } }).receives
        ?.capital,
    ).toBeGreaterThan(10);
  });

  it("finds AI trade actors during auction phases", () => {
    const state = {
      ...tradeReadyState(),
      phase: "waiting_for_auction_bids" as const,
      pendingAuction: {
        tilePosition: 6,
        auctionType: "decline" as const,
        initiatorId: "human-1",
        eligiblePlayerIds: ["human-1", "ai:bot"],
        bidDeadlineAt: Date.now() + 60_000,
        submissions: {},
      },
      tradeOffers: [
        {
          id: "trade-1",
          gameId: "game-ai",
          proposerId: "human-1",
          recipientId: "ai:bot",
          gives: { capital: 300, tilePositions: [] },
          receives: { capital: 0, tilePositions: [6] },
          status: "pending" as const,
          createdAt: Date.now(),
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    };

    expect(findNextAiActorForPhase(state)).toBe("ai:bot");
    expect(chooseAiAction(state)?.action).toMatchObject({
      type: "accept_trade",
      offerId: "trade-1",
    });
  });

  it("proposes a cash-for-property trade on an AI action phase", () => {
    const state = {
      ...tradeReadyState(),
      currentPlayerIndex: 0,
      turnOrder: ["ai:bot", "human-1"],
    };

    const decision = chooseAiAction(state);

    expect(decision?.actorId).toBe("ai:bot");
    expect(decision?.action.type).toBe("propose_trade");
    expect(decision?.action).toMatchObject({
      recipientId: "human-1",
      receives: { capital: 0, tilePositions: [3] },
    });
  });
});

describe("canCreateBindingContract", () => {
  it("returns true for score >= 5", () => {
    expect(canCreateBindingContract(5)).toBe(true);
    expect(canCreateBindingContract(7)).toBe(true);
  });

  it("returns false for score < 5", () => {
    expect(canCreateBindingContract(4)).toBe(false);
    expect(canCreateBindingContract(0)).toBe(false);
  });
});

describe("defaults", () => {
  it("has correct default trustworthiness", () => {
    expect(TRUSTWORTHINESS_DEFAULT).toBe(7);
  });

  it("has correct default profile visibility", () => {
    expect(DEFAULT_PROFILE_VISIBILITY.rank).toBe("public");
    expect(DEFAULT_PROFILE_VISIBILITY.onlineStatus).toBe("authenticated");
  });
});

const makeProfile = (): FullUserProfile => ({
  id: "user-1",
  username: "oligarch",
  avatarUrl: "https://example.com/avatar.png",
  rankTier: 4,
  rankTitle: "Market Mogul",
  careerStats: {
    gamesPlayed: 120,
    wins: 55,
    winRate: 0.458,
    tradesCompleted: 340,
    auctionsWon: 87,
    favoriteSector: "Energy",
  },
  achievements: [{ id: "first_steps", unlockedAt: 1700000000000 }],
  recentGames: [
    { gameId: "g-1", result: "won", endedAt: 1700000001000 },
    { gameId: "g-2", result: "lost", endedAt: 1700000002000 },
  ],
  onlineStatus: "online",
  lastSeenAt: 1700000003000,
  viewerContext: {
    isSelf: false,
    sharedActiveGame: true,
    sharedSyndicate: false,
  },
  email: "oligarch@example.com",
  fullName: "Market Player",
  locale: "en-US",
  timezone: "UTC",
  currency: "USD",
  country: "US",
  themePreference: "dark",
  notificationPrefs: {
    email: true,
    push: false,
  },
  profileVisibility: {
    rank: "public",
    careerStats: "public",
    achievements: "authenticated",
    recentGames: "private",
    onlineStatus: "authenticated",
    lastSeen: "private",
    favoriteSector: "private",
  },
  usernameLastChangedAt: 1699999999000,
});

describe("serializeProfileForAudience", () => {
  it("public audience hides authenticated/private fields", () => {
    const profile = makeProfile();

    const serialized = serializeProfileForAudience(
      profile,
      "public",
      profile.profileVisibility,
    );

    expect(serialized).toStrictEqual({
      id: "user-1",
      username: "oligarch",
      avatarUrl: "https://example.com/avatar.png",
      rankTier: 4,
      rankTitle: "Market Mogul",
      careerStats: {
        gamesPlayed: 120,
        wins: 55,
        winRate: 0.458,
        tradesCompleted: 340,
        auctionsWon: 87,
        favoriteSector: null,
      },
    });
  });

  it("viewer audience includes public/authenticated fields but not private fields", () => {
    const profile = makeProfile();

    const serialized = serializeProfileForAudience(
      profile,
      "viewer",
      profile.profileVisibility,
    );

    expect(serialized).toStrictEqual({
      id: "user-1",
      username: "oligarch",
      avatarUrl: "https://example.com/avatar.png",
      rankTier: 4,
      rankTitle: "Market Mogul",
      careerStats: {
        gamesPlayed: 120,
        wins: 55,
        winRate: 0.458,
        tradesCompleted: 340,
        auctionsWon: 87,
        favoriteSector: null,
      },
      achievements: [{ id: "first_steps", unlockedAt: 1700000000000 }],
      onlineStatus: "online",
      viewerContext: {
        isSelf: false,
        sharedActiveGame: true,
        sharedSyndicate: false,
      },
    });
  });

  it("owner audience always includes private profile fields", () => {
    const profile = makeProfile();

    const serialized = serializeProfileForAudience(
      profile,
      "owner",
      profile.profileVisibility,
    );

    expect(serialized).toStrictEqual(profile);
  });

  it("always includes username and avatarUrl regardless of visibility settings", () => {
    const profile = makeProfile();
    const restrictiveVisibility = {
      rank: "private",
      careerStats: "private",
      achievements: "private",
      recentGames: "private",
      onlineStatus: "private",
      lastSeen: "private",
      favoriteSector: "private",
    } as const;

    const publicSerialized = serializeProfileForAudience(
      profile,
      "public",
      restrictiveVisibility,
    );
    const viewerSerialized = serializeProfileForAudience(
      profile,
      "viewer",
      restrictiveVisibility,
    );

    expect(publicSerialized).toStrictEqual({
      id: "user-1",
      username: "oligarch",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(viewerSerialized).toStrictEqual({
      id: "user-1",
      username: "oligarch",
      avatarUrl: "https://example.com/avatar.png",
      viewerContext: {
        isSelf: false,
        sharedActiveGame: true,
        sharedSyndicate: false,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Trustworthiness engine
// ---------------------------------------------------------------------------

describe("applyHandshakeBreach", () => {
  it("reduces score by HANDSHAKE_BREACH_PENALTY and clamps", () => {
    expect(applyHandshakeBreach(7)).toBe(7 + HANDSHAKE_BREACH_PENALTY);
    expect(applyHandshakeBreach(7)).toBe(5);
  });

  it("clamps result to 0 when penalty would go below minimum", () => {
    expect(applyHandshakeBreach(1)).toBe(0);
    expect(applyHandshakeBreach(0)).toBe(0);
  });

  it("works at the upper boundary", () => {
    expect(applyHandshakeBreach(10)).toBe(8);
  });
});

describe("applyThreadExpiry", () => {
  it("reduces score by THREAD_EXPIRY_PENALTY and clamps", () => {
    expect(applyThreadExpiry(7)).toBe(7 + THREAD_EXPIRY_PENALTY);
    expect(applyThreadExpiry(7)).toBe(6);
  });

  it("clamps result to 0 when penalty would go below minimum", () => {
    expect(applyThreadExpiry(0)).toBe(0);
  });

  it("works at the upper boundary", () => {
    expect(applyThreadExpiry(10)).toBe(9);
  });
});

describe("getTrustworthinessRestrictions", () => {
  it('returns "none" for scores 8-10', () => {
    for (const score of [8, 9, 10]) {
      const result = getTrustworthinessRestrictions(score);
      expect(result.restrictionLabel).toBe("none");
      expect(result.canCreateBindingContract).toBe(true);
    }
  });

  it('returns "standard" for scores 5-7', () => {
    for (const score of [5, 6, 7]) {
      const result = getTrustworthinessRestrictions(score);
      expect(result.restrictionLabel).toBe("standard");
      expect(result.canCreateBindingContract).toBe(true);
    }
  });

  it('returns "restricted" for scores 0-4', () => {
    for (const score of [0, 1, 2, 3, 4]) {
      const result = getTrustworthinessRestrictions(score);
      expect(result.restrictionLabel).toBe("restricted");
      expect(result.canCreateBindingContract).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Negotiation thread functions
// ---------------------------------------------------------------------------

describe("isThreadExpired", () => {
  it("returns false when current round is before expiry", () => {
    expect(isThreadExpired({ startedRound: 1, expiresAfterRound: 4 }, 3)).toBe(
      false,
    );
  });

  it("returns false when current round equals expiresAfterRound", () => {
    expect(isThreadExpired({ startedRound: 1, expiresAfterRound: 4 }, 4)).toBe(
      false,
    );
  });

  it("returns true when current round exceeds expiresAfterRound", () => {
    expect(isThreadExpired({ startedRound: 1, expiresAfterRound: 4 }, 5)).toBe(
      true,
    );
  });
});

describe("calcThreadExpiry", () => {
  it("returns startedRound + NEGOTIATION_THREAD_DURATION", () => {
    expect(calcThreadExpiry(1)).toBe(1 + NEGOTIATION_THREAD_DURATION);
    expect(calcThreadExpiry(1)).toBe(4);
  });

  it("works for round 0", () => {
    expect(calcThreadExpiry(0)).toBe(NEGOTIATION_THREAD_DURATION);
  });

  it("works for large round numbers", () => {
    expect(calcThreadExpiry(100)).toBe(103);
  });
});

// ---------------------------------------------------------------------------
// Contract term validation
// ---------------------------------------------------------------------------

describe("validateContractTerms", () => {
  it("rejects an empty terms array", () => {
    const result = validateContractTerms([]);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CONTRACT_INVALID_TERMS);
  });

  it("accepts a single valid term", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
    ];
    expect(validateContractTerms(terms)).toEqual({ valid: true });
  });

  it("accepts multiple distinct terms", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
      { type: "cannot_bid_auction", tileId: "tile-2", boundPlayerId: "p2" },
      {
        type: "must_pay_capital",
        amount: 100,
        fromPlayerId: "p1",
        toPlayerId: "p2",
        dueByRound: 5,
      },
    ];
    expect(validateContractTerms(terms)).toEqual({ valid: true });
  });

  it("rejects duplicate cannot_sell_tile terms for same tile/player", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
    ];
    const result = validateContractTerms(terms);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CONTRACT_INVALID_TERMS);
  });

  it("allows same type with different tile", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
      { type: "cannot_sell_tile", tileId: "tile-2", boundPlayerId: "p1" },
    ];
    expect(validateContractTerms(terms)).toEqual({ valid: true });
  });

  it("allows same type with different player", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p2" },
    ];
    expect(validateContractTerms(terms)).toEqual({ valid: true });
  });

  it("rejects duplicate revenue_share terms for same from/to/duration", () => {
    const terms: BindingContractTerm[] = [
      {
        type: "revenue_share",
        percentage: 10,
        fromPlayerId: "p1",
        toPlayerId: "p2",
        durationRounds: 3,
      },
      {
        type: "revenue_share",
        percentage: 20,
        fromPlayerId: "p1",
        toPlayerId: "p2",
        durationRounds: 3,
      },
    ];
    const result = validateContractTerms(terms);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CONTRACT_INVALID_TERMS);
  });
});

// ---------------------------------------------------------------------------
// Contract tile ownership validation
// ---------------------------------------------------------------------------

describe("validateContractTileOwnership", () => {
  it("returns valid when all tile terms reference owned tiles", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
      { type: "cannot_bid_auction", tileId: "tile-2", boundPlayerId: "p2" },
    ];
    const owned = {
      p1: ["tile-1", "tile-3"],
      p2: ["tile-2"],
    };
    expect(validateContractTileOwnership(terms, owned)).toEqual({
      valid: true,
    });
  });

  it("returns invalid when a player does not own the referenced tile", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-99", boundPlayerId: "p1" },
    ];
    const owned = {
      p1: ["tile-1"],
    };
    const result = validateContractTileOwnership(terms, owned);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CONTRACT_TILE_NOT_OWNED);
  });

  it("returns invalid when party has no owned tiles entry", () => {
    const terms: BindingContractTerm[] = [
      { type: "cannot_sell_tile", tileId: "tile-1", boundPlayerId: "p1" },
    ];
    const result = validateContractTileOwnership(terms, {});
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CONTRACT_TILE_NOT_OWNED);
  });

  it("ignores non-tile terms", () => {
    const terms: BindingContractTerm[] = [
      {
        type: "must_pay_capital",
        amount: 50,
        fromPlayerId: "p1",
        toPlayerId: "p2",
        dueByRound: 5,
      },
      {
        type: "revenue_share",
        percentage: 10,
        fromPlayerId: "p1",
        toPlayerId: "p2",
        durationRounds: 3,
      },
    ];
    expect(validateContractTileOwnership(terms, {})).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// Charter validation
// ---------------------------------------------------------------------------

describe("validateRevenueSplit", () => {
  it("returns valid when percentages sum to 100", () => {
    const split = [
      { playerId: "p1", pct: 50 },
      { playerId: "p2", pct: 50 },
    ];
    expect(validateRevenueSplit(split)).toEqual({ valid: true });
  });

  it("returns valid for three-way split summing to 100", () => {
    const split = [
      { playerId: "p1", pct: 40 },
      { playerId: "p2", pct: 35 },
      { playerId: "p3", pct: 25 },
    ];
    expect(validateRevenueSplit(split)).toEqual({ valid: true });
  });

  it("returns invalid when percentages sum to less than 100", () => {
    const split = [
      { playerId: "p1", pct: 40 },
      { playerId: "p2", pct: 30 },
    ];
    const result = validateRevenueSplit(split);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CHARTER_INVALID_SPLIT);
  });

  it("returns invalid when percentages sum to more than 100", () => {
    const split = [
      { playerId: "p1", pct: 60 },
      { playerId: "p2", pct: 60 },
    ];
    const result = validateRevenueSplit(split);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CHARTER_INVALID_SPLIT);
  });

  it("returns invalid for empty split", () => {
    const result = validateRevenueSplit([]);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CHARTER_INVALID_SPLIT);
  });

  it("returns valid for single player at 100%", () => {
    const split = [{ playerId: "p1", pct: 100 }];
    expect(validateRevenueSplit(split)).toEqual({ valid: true });
  });
});

describe("validateContributionWeights", () => {
  it("returns valid when weights sum to 100", () => {
    const weights = {
      assetScorePct: 40,
      revenueScorePct: 40,
      negotiationCreditPct: 20,
    };
    expect(validateContributionWeights(weights)).toEqual({ valid: true });
  });

  it("returns invalid when weights sum to less than 100", () => {
    const weights = {
      assetScorePct: 30,
      revenueScorePct: 30,
      negotiationCreditPct: 30,
    };
    const result = validateContributionWeights(weights);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CHARTER_INVALID_WEIGHTS);
  });

  it("returns invalid when weights sum to more than 100", () => {
    const weights = {
      assetScorePct: 50,
      revenueScorePct: 40,
      negotiationCreditPct: 20,
    };
    const result = validateContributionWeights(weights);
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(NegotiationErrorKeys.CHARTER_INVALID_WEIGHTS);
  });

  it("handles all weight in one category", () => {
    const weights = {
      assetScorePct: 100,
      revenueScorePct: 0,
      negotiationCreditPct: 0,
    };
    expect(validateContributionWeights(weights)).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// Contract enforcement (isActionBlockedByContracts)
// ---------------------------------------------------------------------------

function makeContract(
  overrides: Partial<BindingContract> & { terms: BindingContractTerm[] },
): BindingContract {
  return {
    id: overrides.id ?? "contract-1",
    gameId: overrides.gameId ?? "game-1",
    partyA: overrides.partyA ?? "p1",
    partyB: overrides.partyB ?? "p2",
    terms: overrides.terms,
    status: overrides.status ?? "active",
    startsRound: overrides.startsRound ?? 1,
    expiresRound: overrides.expiresRound ?? null,
    signedAt: overrides.signedAt ?? Date.now(),
    fulfilledAt: overrides.fulfilledAt ?? null,
    breachedAt: overrides.breachedAt ?? null,
  };
}

describe("isActionBlockedByContracts", () => {
  it("returns not blocked when no contracts exist", () => {
    const result = isActionBlockedByContracts([], {
      type: "sell_tile",
      tileId: "tile-1",
      playerId: "p1",
    });
    expect(result.blocked).toBe(false);
    expect(result.blockingContractId).toBeUndefined();
  });

  it("blocks sell_tile when cannot_sell_tile term matches", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      tileId: "tile-1",
      playerId: "p1",
    });
    expect(result.blocked).toBe(true);
    expect(result.blockingContractId).toBe("contract-1");
  });

  it("does not block sell_tile for a different tile", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      tileId: "tile-2",
      playerId: "p1",
    });
    expect(result.blocked).toBe(false);
  });

  it("does not block sell_tile for a different player", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      tileId: "tile-1",
      playerId: "p2",
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks bid_auction when cannot_bid_auction term matches", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_bid_auction",
            tileId: "tile-5",
            boundPlayerId: "p2",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "bid_auction",
      tileId: "tile-5",
      playerId: "p2",
    });
    expect(result.blocked).toBe(true);
  });

  it("ignores non-active contracts", () => {
    const contracts = [
      makeContract({
        status: "expired",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
      makeContract({
        status: "fulfilled",
        id: "contract-2",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
      makeContract({
        status: "breached",
        id: "contract-3",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      tileId: "tile-1",
      playerId: "p1",
    });
    expect(result.blocked).toBe(false);
  });

  it("does not block unrelated action types", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "develop_tile",
      tileId: "tile-1",
      playerId: "p1",
    });
    expect(result.blocked).toBe(false);
  });

  it("returns first blocking contract id when multiple contracts could block", () => {
    const contracts = [
      makeContract({
        id: "contract-A",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
      makeContract({
        id: "contract-B",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      tileId: "tile-1",
      playerId: "p1",
    });
    expect(result.blocked).toBe(true);
    expect(result.blockingContractId).toBe("contract-A");
  });

  it("does not block actions without a tileId for tile-based terms", () => {
    const contracts = [
      makeContract({
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "tile-1",
            boundPlayerId: "p1",
          },
        ],
      }),
    ];
    const result = isActionBlockedByContracts(contracts, {
      type: "sell_tile",
      playerId: "p1",
    });
    expect(result.blocked).toBe(false);
  });
});

// ===========================================================================
// Rent Calculation Engine
// ===========================================================================

describe("calculateSectorTileRent", () => {
  it("returns base rent with no dev tokens and no sector control", () => {
    expect(calculateSectorTileRent(10, 0, false)).toBe(10);
  });

  it("returns 2× base rent with sector control and no dev tokens", () => {
    expect(calculateSectorTileRent(10, 0, true)).toBe(20);
  });

  it("returns 5× base rent with 1 dev token", () => {
    expect(calculateSectorTileRent(10, 1, false)).toBe(50);
    expect(calculateSectorTileRent(10, 1, true)).toBe(50);
  });

  it("returns 10× base rent with 2 dev tokens", () => {
    expect(calculateSectorTileRent(10, 2, false)).toBe(100);
  });

  it("returns 15× base rent with 3 dev tokens", () => {
    expect(calculateSectorTileRent(10, 3, false)).toBe(150);
  });

  it("returns 20× base rent with 4 dev tokens", () => {
    expect(calculateSectorTileRent(10, 4, false)).toBe(200);
  });

  it("caps at 20× for tokens > 4", () => {
    expect(calculateSectorTileRent(10, 5, false)).toBe(200);
  });

  it("applies rate card multiplier", () => {
    // Base 120, sector control = 240, rate card 1.5× = 360
    expect(calculateSectorTileRent(120, 0, true, 1.5)).toBe(360);
  });

  it("clamps rate card to minimum 0.5", () => {
    expect(calculateSectorTileRent(100, 0, true, 0.1)).toBe(
      Math.floor(200 * 0.5),
    );
  });

  it("clamps rate card to maximum 2.0", () => {
    expect(calculateSectorTileRent(100, 0, true, 3.0)).toBe(
      Math.floor(200 * 2.0),
    );
  });
});

describe("calculateHubRent", () => {
  it("returns 25 for 1 hub", () => expect(calculateHubRent(1)).toBe(25));
  it("returns 50 for 2 hubs", () => expect(calculateHubRent(2)).toBe(50));
  it("returns 100 for 3 hubs", () => expect(calculateHubRent(3)).toBe(100));
  it("returns 200 for 4 hubs", () => expect(calculateHubRent(4)).toBe(200));
  it("returns 0 for 0 hubs", () => expect(calculateHubRent(0)).toBe(0));
});

describe("calculateUtilityRent", () => {
  it("returns 6 × dice for 1 utility", () => {
    expect(calculateUtilityRent(1, 7)).toBe(42);
  });
  it("returns 15 × dice for 2 utilities", () => {
    expect(calculateUtilityRent(2, 10)).toBe(150);
  });
  it("returns 0 for 0 utilities", () => {
    expect(calculateUtilityRent(0, 7)).toBe(0);
  });
});

describe("calculateDevelopmentCost", () => {
  it("first token costs face value", () => {
    expect(calculateDevelopmentCost(180, 1)).toBe(180);
  });

  it("subsequent tokens cost floor(1.5 × face value)", () => {
    expect(calculateDevelopmentCost(180, 2)).toBe(270);
    expect(calculateDevelopmentCost(180, 3)).toBe(270);
    expect(calculateDevelopmentCost(180, 4)).toBe(270);
  });

  it("handles odd costs that need floor", () => {
    expect(calculateDevelopmentCost(100, 2)).toBe(150);
    expect(calculateDevelopmentCost(60, 2)).toBe(90);
    // 80 × 1.5 = 120 (exact)
    expect(calculateDevelopmentCost(80, 2)).toBe(120);
  });

  it("applies lean manufacturing 20% discount", () => {
    // 180 × 0.8 = 144 for first token
    expect(calculateDevelopmentCost(180, 1, true)).toBe(144);
    // 270 × 0.8 = 216 for subsequent tokens
    expect(calculateDevelopmentCost(180, 2, true)).toBe(216);
  });
});

// ===========================================================================
// Mortgage Engine
// ===========================================================================

describe("calculateMortgageValue", () => {
  it("returns floor(cost × 0.5)", () => {
    expect(calculateMortgageValue(180)).toBe(90);
    expect(calculateMortgageValue(60)).toBe(30);
    expect(calculateMortgageValue(200)).toBe(100);
  });

  it("floors odd costs", () => {
    // 151 × 0.5 = 75.5 → floor → 75
    expect(calculateMortgageValue(151)).toBe(75);
  });
});

describe("calculateRedemptionCost", () => {
  it("returns ceil(mortgageValue × 1.1) for standard rate", () => {
    // Cloud Infrastructure: cost 180, mortgage 90, redemption = ceil(90 × 1.1) = ceil(99) = 99
    expect(calculateRedemptionCost(180)).toBe(99);
  });

  it("rounds up non-integer results", () => {
    // cost 60, mortgage 30, redemption = ceil(30 × 1.1) = ceil(33) = 33
    expect(calculateRedemptionCost(60)).toBe(33);
    // cost 100, mortgage 50, redemption = ceil(50 × 1.1) = ceil(55) = 55
    expect(calculateRedemptionCost(100)).toBe(55);
  });

  it("returns ceil(mortgageValue × 1.05) with PropTech affinity", () => {
    // cost 180, mortgage 90, redemption = ceil(90 × 1.05) = ceil(94.5) = 95
    expect(calculateRedemptionCost(180, true)).toBe(95);
  });
});

describe("calculateAbsorptionPrice", () => {
  it("returns floor(cost × 0.6)", () => {
    expect(calculateAbsorptionPrice(200)).toBe(120);
    expect(calculateAbsorptionPrice(180)).toBe(108);
  });
});

// ===========================================================================
// Starting Capital & Setup
// ===========================================================================

describe("getStartingCapital", () => {
  it("returns 1500 for 2–3 players", () => {
    expect(getStartingCapital(2)).toBe(1500);
    expect(getStartingCapital(3)).toBe(1500);
  });

  it("returns 1200 for 4–5 players", () => {
    expect(getStartingCapital(4)).toBe(1200);
    expect(getStartingCapital(5)).toBe(1200);
  });

  it("returns 1000 for 6 players", () => {
    expect(getStartingCapital(6)).toBe(1000);
  });

  it("applies Speed Market 30% bonus", () => {
    expect(getStartingCapital(2, true)).toBe(Math.floor(1500 * 1.3)); // 1950
    expect(getStartingCapital(4, true)).toBe(Math.floor(1200 * 1.3)); // 1560
    expect(getStartingCapital(6, true)).toBe(Math.floor(1000 * 1.3)); // 1300
  });
});

describe("setup constants", () => {
  it("PASS_START_BONUS is 200", () => {
    expect(PASS_START_BONUS).toBe(200);
  });

  it("FLASH_CRASH constants are correct", () => {
    expect(FLASH_CRASH_LOSS_PCT).toBe(0.05);
    expect(FLASH_CRASH_WINDFALL_PCT).toBe(0.1);
  });
});

// ===========================================================================
// Win Conditions
// ===========================================================================

describe("checkSyndicateWin", () => {
  it("returns true when at exactly 60%", () => {
    expect(checkSyndicateWin(600, 1000)).toBe(true);
  });

  it("returns true when above 60%", () => {
    expect(checkSyndicateWin(700, 1000)).toBe(true);
  });

  it("returns false when below 60%", () => {
    expect(checkSyndicateWin(599, 1000)).toBe(false);
  });

  it("returns false for zero total market value", () => {
    expect(checkSyndicateWin(100, 0)).toBe(false);
  });

  it("SYNDICATE_WIN_THRESHOLD is 0.6", () => {
    expect(SYNDICATE_WIN_THRESHOLD).toBe(0.6);
  });
});

describe("checkSoloWin", () => {
  it("returns true when at exactly 35%", () => {
    expect(checkSoloWin(350, 1000)).toBe(true);
  });

  it("returns true when above 35%", () => {
    expect(checkSoloWin(400, 1000)).toBe(true);
  });

  it("returns false when below 35%", () => {
    expect(checkSoloWin(349, 1000)).toBe(false);
  });

  it("returns false for zero total market value", () => {
    expect(checkSoloWin(100, 0)).toBe(false);
  });

  it("SOLO_WIN_THRESHOLD is 0.35", () => {
    expect(SOLO_WIN_THRESHOLD).toBe(0.35);
  });
});

// ===========================================================================
// Contribution Score Calculator
// ===========================================================================

describe("calculateContributionScores", () => {
  it("returns empty array for empty members", () => {
    expect(calculateContributionScores([])).toEqual([]);
  });

  it("returns 100% for single member", () => {
    const members: ContributionInput[] = [
      {
        playerId: "p1",
        tileAcquisitionCostShare: 1,
        rentCollectedShare: 1,
        dealValueShare: 1,
      },
    ];
    const result = calculateContributionScores(members);
    expect(result).toHaveLength(1);
    expect(result[0].percentage).toBe(100);
  });

  it("matches the worked example from game rules (Alice/Bob/Carol)", () => {
    const members: ContributionInput[] = [
      {
        playerId: "alice",
        tileAcquisitionCostShare: 0.45,
        rentCollectedShare: 0.5,
        dealValueShare: 0.6,
      },
      {
        playerId: "bob",
        tileAcquisitionCostShare: 0.35,
        rentCollectedShare: 0.3,
        dealValueShare: 0.3,
      },
      {
        playerId: "carol",
        tileAcquisitionCostShare: 0.2,
        rentCollectedShare: 0.2,
        dealValueShare: 0.1,
      },
    ];
    const result = calculateContributionScores(members);

    // Alice: 0.35×0.45 + 0.35×0.50 + 0.30×0.60 = 0.5125 (51.25%)
    // Bob:   0.35×0.35 + 0.35×0.30 + 0.30×0.30 = 0.3175 (31.75%)
    // Carol: 0.35×0.20 + 0.35×0.20 + 0.30×0.10 = 0.1700 (17.00%)
    const alice = result.find((r) => r.playerId === "alice")!;
    const bob = result.find((r) => r.playerId === "bob")!;
    const carol = result.find((r) => r.playerId === "carol")!;

    // Bob floors to 31, Carol floors to 17, Alice gets remainder: 100-31-17 = 52
    expect(bob.percentage).toBe(31);
    expect(carol.percentage).toBe(17);
    expect(alice.percentage).toBe(52);

    // Sum must be exactly 100
    const total = result.reduce((s, r) => s + r.percentage, 0);
    expect(total).toBe(100);
  });

  it("handles custom weights", () => {
    const members: ContributionInput[] = [
      {
        playerId: "p1",
        tileAcquisitionCostShare: 1,
        rentCollectedShare: 0,
        dealValueShare: 0,
      },
      {
        playerId: "p2",
        tileAcquisitionCostShare: 0,
        rentCollectedShare: 1,
        dealValueShare: 0,
      },
    ];
    const result = calculateContributionScores(members, {
      assetScorePct: 100,
      revenueScorePct: 0,
      negotiationCreditPct: 0,
    });
    const p1 = result.find((r) => r.playerId === "p1")!;
    expect(p1.percentage).toBe(100);
  });

  it("handles equal contributions", () => {
    const members: ContributionInput[] = [
      {
        playerId: "p1",
        tileAcquisitionCostShare: 0.5,
        rentCollectedShare: 0.5,
        dealValueShare: 0.5,
      },
      {
        playerId: "p2",
        tileAcquisitionCostShare: 0.5,
        rentCollectedShare: 0.5,
        dealValueShare: 0.5,
      },
    ];
    const result = calculateContributionScores(members);
    const total = result.reduce((s, r) => s + r.percentage, 0);
    expect(total).toBe(100);
    expect(result[0].percentage).toBe(50);
    expect(result[1].percentage).toBe(50);
  });

  it("DEFAULT_CONTRIBUTION_WEIGHTS sums to 100", () => {
    const sum =
      DEFAULT_CONTRIBUTION_WEIGHTS.assetScorePct +
      DEFAULT_CONTRIBUTION_WEIGHTS.revenueScorePct +
      DEFAULT_CONTRIBUTION_WEIGHTS.negotiationCreditPct;
    expect(sum).toBe(100);
  });
});

// ===========================================================================
// Dice & Movement
// ===========================================================================

describe("isDoubles", () => {
  it("returns true for matching dice", () => {
    expect(isDoubles([3, 3])).toBe(true);
    expect(isDoubles([1, 1])).toBe(true);
    expect(isDoubles([6, 6])).toBe(true);
  });

  it("returns false for non-matching dice", () => {
    expect(isDoubles([1, 2])).toBe(false);
    expect(isDoubles([5, 6])).toBe(false);
  });
});

describe("isPerimeterChoice / isDiagonalChoice", () => {
  it("odd rolls select perimeter", () => {
    expect(isPerimeterChoice(1)).toBe(true);
    expect(isPerimeterChoice(3)).toBe(true);
    expect(isPerimeterChoice(5)).toBe(true);
  });

  it("even rolls select diagonal", () => {
    expect(isDiagonalChoice(2)).toBe(true);
    expect(isDiagonalChoice(4)).toBe(true);
    expect(isDiagonalChoice(6)).toBe(true);
  });

  it("perimeter and diagonal are mutually exclusive", () => {
    for (let i = 1; i <= 6; i++) {
      expect(isPerimeterChoice(i)).toBe(!isDiagonalChoice(i));
    }
  });
});

describe("moveOnPerimeter", () => {
  it("moves forward on the board", () => {
    const result = moveOnPerimeter(5, 7);
    expect(result.newPosition).toBe(12);
    expect(result.passedStart).toBe(false);
  });

  it("wraps around the board", () => {
    const result = moveOnPerimeter(38, 5);
    expect(result.newPosition).toBe(3);
    expect(result.passedStart).toBe(true);
  });

  it("landing exactly on START counts as passing", () => {
    const result = moveOnPerimeter(35, 5);
    expect(result.newPosition).toBe(0);
    expect(result.passedStart).toBe(true);
  });

  it("does not pass start for short moves from low positions", () => {
    const result = moveOnPerimeter(0, 10);
    expect(result.newPosition).toBe(10);
    expect(result.passedStart).toBe(false);
  });
});

// ===========================================================================
// Board Tile Lookups
// ===========================================================================

describe("getTileByPosition", () => {
  it("finds perimeter tiles by number", () => {
    const tile = getTileByPosition(0);
    expect(tile).toBeDefined();
    expect(tile?.name).toBe("START");
  });

  it("finds diagonal tiles by string", () => {
    const tile = getTileByPosition("D1");
    expect(tile).toBeDefined();
    expect(tile?.name).toBe("Offshore Capital Corp.");
  });

  it("returns undefined for invalid position", () => {
    expect(getTileByPosition(99)).toBeUndefined();
    expect(getTileByPosition("D9")).toBeUndefined();
  });
});

describe("getTilesBySector", () => {
  it("returns 3 tiles for Emerging Tech (positions 1, 3, 11)", () => {
    const tiles = getTilesBySector("emerging_tech");
    expect(tiles).toHaveLength(3);
  });

  it("returns 3 tiles for Big Tech", () => {
    const tiles = getTilesBySector("big_tech");
    expect(tiles).toHaveLength(3);
  });

  it("returns 3 tiles for Fast Track (all diagonal)", () => {
    const tiles = getTilesBySector("fast_track");
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      expect(typeof tile.position).toBe("string");
    }
  });

  it("returns 2 tiles for Elite Tech", () => {
    const tiles = getTilesBySector("elite_tech");
    expect(tiles).toHaveLength(2);
  });
});

describe("TOTAL_BOARD_MARKET_VALUE", () => {
  it("is a positive number", () => {
    expect(TOTAL_BOARD_MARKET_VALUE).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Rank Points
// ===========================================================================

describe("getRankForPoints", () => {
  it("returns tier 1 for 0 points", () => {
    const rank = getRankForPoints(0);
    expect(rank.tier).toBe(1);
    expect(rank.title).toBe("Market Novice");
  });

  it("returns tier 1 for 99 points", () => {
    expect(getRankForPoints(99).tier).toBe(1);
  });

  it("returns tier 2 for 100 points", () => {
    expect(getRankForPoints(100).tier).toBe(2);
    expect(getRankForPoints(100).title).toBe("Sector Investor");
  });

  it("returns tier 3 for 500 points", () => {
    expect(getRankForPoints(500).tier).toBe(3);
  });

  it("returns tier 4 for 1500 points", () => {
    expect(getRankForPoints(1500).tier).toBe(4);
  });

  it("returns tier 5 for 5000+ points", () => {
    expect(getRankForPoints(5000).tier).toBe(5);
    expect(getRankForPoints(10000).tier).toBe(5);
  });
});

describe("calculateGameRankPoints", () => {
  it("awards 10 points for completing a game", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: false,
      sectorsControlled: 0,
      tradesCompleted: 0,
      auctionsWon: 0,
      achievementPoints: 0,
    });
    expect(pts).toBe(10);
  });

  it("awards 35 points for winning a game (10 completion + 25 win)", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: true,
      sectorsControlled: 0,
      tradesCompleted: 0,
      auctionsWon: 0,
      achievementPoints: 0,
    });
    expect(pts).toBe(35);
  });

  it("awards 5 points per sector controlled", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: false,
      sectorsControlled: 3,
      tradesCompleted: 0,
      auctionsWon: 0,
      achievementPoints: 0,
    });
    expect(pts).toBe(10 + 15);
  });

  it("caps sector control bonus at 8 sectors", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: false,
      sectorsControlled: 10,
      tradesCompleted: 0,
      auctionsWon: 0,
      achievementPoints: 0,
    });
    expect(pts).toBe(10 + 40);
  });

  it("awards 2 points per trade and auction", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: false,
      sectorsControlled: 0,
      tradesCompleted: 5,
      auctionsWon: 3,
      achievementPoints: 0,
    });
    expect(pts).toBe(10 + 10 + 6);
  });

  it("includes achievement points", () => {
    const pts = calculateGameRankPoints({
      completed: true,
      won: false,
      sectorsControlled: 0,
      tradesCompleted: 0,
      auctionsWon: 0,
      achievementPoints: 25,
    });
    expect(pts).toBe(35);
  });
});

describe("applyHigherRankBonus", () => {
  it("returns base points when opponent tier <= player tier", () => {
    expect(applyHigherRankBonus(100, 2, 3)).toBe(100);
    expect(applyHigherRankBonus(100, 2, 2)).toBe(100);
  });

  it("applies multiplier for higher-ranked opponents", () => {
    // 1 tier diff → 1.125 multiplier → floor(100 × 1.125) = 112
    expect(applyHigherRankBonus(100, 3, 2)).toBe(112);
  });

  it("caps at 1.5× multiplier", () => {
    // 5 tier diff → 1 + 5×0.125 = 1.625 → capped at 1.5
    expect(applyHigherRankBonus(100, 6, 1)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Game State Machine (applyAction)
// ---------------------------------------------------------------------------

function makeTestGameState(
  overrides?: Partial<InternalGameState>,
): InternalGameState {
  return {
    gameId: "test-game",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["player-1", "player-2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    tiles: initTileStates(),
    players: [
      {
        playerId: "player-1",
        position: 0,
        capital: 1500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: ACTION_POINTS_PER_TURN,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "player-2",
        position: 0,
        capital: 1500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    settings: {},
    ...overrides,
  };
}

describe("applyAction — roll_dice", () => {
  it("moves player to correct position on perimeter", () => {
    const state = makeTestGameState();
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 3],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(5);
    expect(result.state.lastDiceRoll).toEqual([2, 3]);
  });

  it("collects start bonus when passing position 0", () => {
    const state = makeTestGameState();
    state.players[0].position = 38;
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 4],
      pathChoiceDie: 1,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(4);
    expect(p.capital).toBe(1500 + PASS_START_BONUS - 75); // passed start + paid corporate tax I
  });

  it("throws when not player's turn", () => {
    const state = makeTestGameState();
    expect(() =>
      applyAction(state, "player-2", { type: "roll_dice", result: [1, 1] }),
    ).toThrow("game.not_your_turn");
  });

  it("throws when game is over", () => {
    const state = makeTestGameState({ phase: "game_over" });
    expect(() =>
      applyAction(state, "player-1", { type: "roll_dice", result: [1, 1] }),
    ).toThrow("game.completed");
  });

  it("sends to regulation on triple doubles", () => {
    const state = makeTestGameState();
    state.players[0].doublesCount = 2;
    state.phase = "rolling_doubles";
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [3, 3],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(10);
    expect(p.inRegulation).toBe(true);
    expect(p.doublesCount).toBe(0);
  });

  it("enters waiting_for_buy when landing on unowned purchasable tile", () => {
    const state = makeTestGameState();
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 2],
    });
    expect(result.state.phase).toBe("waiting_for_buy");
    expect(result.state.pendingBuyTilePosition).toBe(3);
  });

  it("allows rolling again after doubles (non-triple)", () => {
    const state = makeTestGameState();
    // Roll doubles to pos 4 (Corporate Tax I — special, no buy)
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 2],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.doublesCount).toBe(1);
    // Should be rolling_doubles phase since we can roll again
    expect(result.state.phase).toBe("rolling_doubles");
  });
});

describe("applyAction — buy_tile / decline_tile", () => {
  it("buys a tile and deducts capital", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
    });
    state.players[0].position = 3;
    const result = applyAction(state, "player-1", {
      type: "buy_tile",
      tilePosition: 3,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 - 80);
    expect(p.ownedTilePositions).toContain(3);
    const tile = result.state.tiles.find((t) => t.position === 3);
    expect(tile?.ownerId).toBe("player-1");
    expect(result.logEntries).toContainEqual({
      playerId: "player-1",
      actionType: "player_state_changed",
      payload: {
        playerId: "player-1",
        changes: {
          capital: { before: 1500, after: 1420, delta: -80 },
          ownedTilePositions: { added: ["3"], removed: [] },
        },
      },
    });
  });

  it("logs why and how a solo win was reached", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
    });
    state.players[0].position = 3;
    let seededMarketValue = 0;
    state.players[0].ownedTilePositions = [];
    for (const tileState of state.tiles) {
      if (String(tileState.position) === "3") continue;
      const tile = getTileByPosition(tileState.position);
      if (!tile?.cost) continue;
      tileState.ownerId = "player-1";
      state.players[0].ownedTilePositions.push(tileState.position);
      seededMarketValue += tile.cost;
      if (seededMarketValue >= TOTAL_BOARD_MARKET_VALUE * SOLO_WIN_THRESHOLD) {
        break;
      }
    }
    for (const position of state.players[0].ownedTilePositions) {
      const tile = state.tiles.find((entry) => entry.position === position);
      if (tile) tile.ownerId = "player-1";
    }

    const result = applyAction(state, "player-1", {
      type: "buy_tile",
      tilePosition: 3,
    });

    expect(result.state.phase).toBe("game_over");
    expect(result.state.winSummary).toMatchObject({
      winnerId: "player-1",
      winType: "solo",
      thresholdShare: SOLO_WIN_THRESHOLD,
    });
    expect(result.state.winSummary?.reason).toContain("solo threshold");
    expect(result.logEntries).toContainEqual({
      playerId: "player-1",
      actionType: "game_won",
      payload: expect.objectContaining({
        winnerId: "player-1",
        winType: "solo",
        thresholdShare: SOLO_WIN_THRESHOLD,
        reason: expect.stringContaining("solo threshold"),
      }),
    });
  });

  it("throws when insufficient capital", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
    });
    state.players[0].capital = 50;
    expect(() =>
      applyAction(state, "player-1", { type: "buy_tile", tilePosition: 3 }),
    ).toThrow("game.insufficient_capital");
  });

  it("declines tile and starts a sealed auction", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
    });
    const result = applyAction(state, "player-1", {
      type: "decline_tile",
      tilePosition: 3,
    });
    expect(result.state.phase).toBe("waiting_for_auction_bids");
    expect(result.state.pendingBuyTilePosition).toBeNull();
    expect(result.state.pendingAuction?.tilePosition).toBe(3);
    expect(result.state.pendingAuction?.auctionType).toBe("sealed_bids");
    expect(result.state.pendingAuction?.bidDeadlineAt).toBeGreaterThan(
      Date.now(),
    );
    expect(result.state.pendingAuction?.eligiblePlayerIds).toEqual([
      "player-1",
      "player-2",
    ]);
  });
});

describe("applyAction — auction_bid / auction_pass", () => {
  const openAuctionDeadline = Date.now() + 60 * 60 * 1000;

  function makeAuctionState(
    overrides?: Partial<InternalGameState>,
  ): InternalGameState {
    return makeTestGameState({
      phase: "waiting_for_auction_bids",
      pendingBuyTilePosition: null,
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: {},
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
      ...overrides,
    });
  }

  it("awards tile to highest bidder when all eligible players submit", () => {
    const state = makeAuctionState();
    const first = applyAction(state, "player-1", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 90,
    });
    expect(first.state.phase).toBe("waiting_for_auction_bids");

    const settled = applyAction(first.state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 50,
    });
    expect(settled.state.phase).toBe("waiting_for_auction_settle");

    const finalized = finalizeAuctionSettleIfReady(
      settled.state,
      (settled.state.pendingAuction?.settleDeadlineAt ?? 0) + 1,
    );
    expect(finalized?.state.phase).toBe("action");
    expect(finalized?.state.pendingAuction).toBeUndefined();

    const winner = finalized?.state.players.find(
      (p) => p.playerId === "player-1",
    );
    expect(winner?.capital).toBe(1500 - 90);
    expect(winner?.ownedTilePositions).toContain(3);
  });

  it("leaves tile unowned when every eligible player passes", () => {
    const state = makeAuctionState();
    const afterFirst = applyAction(state, "player-1", {
      type: "auction_pass",
      tilePosition: 3,
    });
    const settled = applyAction(afterFirst.state, "player-2", {
      type: "auction_pass",
      tilePosition: 3,
    });
    expect(settled.state.phase).toBe("waiting_for_auction_settle");
    const finalized = finalizeAuctionSettleIfReady(
      settled.state,
      (settled.state.pendingAuction?.settleDeadlineAt ?? 0) + 1,
    );
    expect(finalized?.state.phase).toBe("action");
    expect(finalized?.state.pendingAuction).toBeUndefined();
    const tile = finalized?.state.tiles.find((entry) => entry.position === 3);
    expect(tile?.ownerId).toBeNull();
  });

  it("starts a tie-break round when top bids match", () => {
    const state = makeAuctionState();
    const afterFirst = applyAction(state, "player-1", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 75,
    });
    const settling = applyAction(afterFirst.state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 75,
    });
    expect(settling.state.phase).toBe("waiting_for_auction_settle");
    const tieBreak = finalizeAuctionSettleIfReady(
      settling.state,
      (settling.state.pendingAuction?.settleDeadlineAt ?? 0) + 1,
    );
    expect(tieBreak?.state.phase).toBe("waiting_for_auction_bids");
    expect(tieBreak?.state.pendingAuction?.tieBreakRound).toBe(1);
    expect(tieBreak?.state.pendingAuction?.tieBreakMinBid).toBe(75);
    expect(tieBreak?.state.pendingAuction?.eligiblePlayerIds).toEqual([
      "player-1",
      "player-2",
    ]);
    expect(tieBreak?.state.pendingAuction?.submissions).toEqual({});
  });

  it("rejects bids below the tie-break minimum", () => {
    const state = makeAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: {},
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakMinBid: 75,
        tieBreakRound: 1,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
    });
    expect(() =>
      applyAction(state, "player-1", {
        type: "auction_bid",
        tilePosition: 3,
        amount: 74,
      }),
    ).toThrow("game.auction_bid_too_low");
  });

  it("keeps sealed bid amounts out of submission logs", () => {
    const state = makeAuctionState();
    const result = applyAction(state, "player-1", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 90,
    });
    const bidLog = result.logEntries.find(
      (entry) => entry.actionType === "auction_bid",
    );
    expect(bidLog?.payload).toEqual({
      position: 3,
      name: expect.any(String),
    });
  });

  it("preserves the final submission log when auto-settling", () => {
    const state = makeAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: { "player-1": 90 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
    });
    const settled = applyAction(state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 50,
    });
    expect(settled.state.phase).toBe("waiting_for_auction_settle");
    expect(
      settled.logEntries.some((entry) => entry.actionType === "auction_bid"),
    ).toBe(true);
    const finalized = finalizeAuctionSettleIfReady(
      settled.state,
      (settled.state.pendingAuction?.settleDeadlineAt ?? 0) + 1,
    );
    expect(
      finalized?.logEntries.some(
        (entry) => entry.actionType === "auction_settled",
      ),
    ).toBe(true);
  });

  it("auto-passes missing bidders when the bid window expires", () => {
    const state = makeAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: { "player-1": 80 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: Date.now() - 1,
      },
    });
    const closed = closeAuctionBidWindowIfReady(state, Date.now());
    expect(closed?.state.phase).toBe("waiting_for_auction_settle");
    const finalized = finalizeAuctionSettleIfReady(
      closed?.state,
      (closed?.state.pendingAuction?.settleDeadlineAt ?? 0) + 1,
    );
    expect(finalized?.state.phase).toBe("action");
    const winner = finalized?.state.players.find(
      (player) => player.playerId === "player-1",
    );
    expect(winner?.ownedTilePositions).toContain(3);
    expect(
      closed?.logEntries.filter(
        (entry) => entry.actionType === "auction_bids_closed",
      ),
    ).toHaveLength(1);
  });

  it("waits for settle delay before revealing bids", () => {
    const state = makeAuctionState({
      phase: "waiting_for_auction_settle",
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: { "player-1": 80, "player-2": 50 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: Date.now() - 1,
        settleDeadlineAt: Date.now() + 60_000,
      },
    });
    expect(finalizeAuctionSettleIfReady(state, Date.now())).toBeNull();
  });

  it("rejects bids after the bid window closes", () => {
    const state = makeAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "sealed_bids",
        submissions: {},
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: Date.now() - 1,
      },
    });
    expect(() =>
      applyAction(state, "player-1", {
        type: "auction_bid",
        tilePosition: 3,
        amount: 50,
      }),
    ).toThrow("game.auction_closed");
  });
});

describe("applyAction — open auction", () => {
  const openAuctionDeadline = Date.now() + 60 * 60 * 1000;

  function makeOpenAuctionState(
    overrides?: Partial<InternalGameState>,
  ): InternalGameState {
    return makeTestGameState({
      phase: "waiting_for_auction_bids",
      pendingBuyTilePosition: null,
      settings: { auctionType: "open_bids" },
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "open_bids",
        submissions: {},
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
      ...overrides,
    });
  }

  it("starts an open auction when lobby settings request open bids", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
      settings: { auctionType: "open_bids" },
    });
    const result = applyAction(state, "player-1", {
      type: "decline_tile",
      tilePosition: 3,
    });
    expect(result.state.pendingAuction?.auctionType).toBe("open_bids");
    expect(
      result.logEntries.find((entry) => entry.actionType === "auction_started")
        ?.payload,
    ).toMatchObject({ auctionType: "open_bids" });
  });

  it("includes bid amounts in open auction action logs", () => {
    const state = makeOpenAuctionState();
    const result = applyAction(state, "player-1", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 90,
    });
    const bidLog = result.logEntries.find(
      (entry) => entry.actionType === "auction_bid",
    );
    expect(bidLog?.payload).toMatchObject({ amount: 90 });
  });

  it("settles open auctions immediately when all players submit", () => {
    const state = makeOpenAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "open_bids",
        submissions: { "player-1": 90 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
    });
    const result = applyAction(state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 50,
    });
    expect(result.state.phase).toBe("action");
    expect(result.state.pendingAuction).toBeUndefined();
    expect(
      result.logEntries.some((entry) => entry.actionType === "auction_settled"),
    ).toBe(true);
    expect(
      result.logEntries.some(
        (entry) => entry.actionType === "auction_bids_closed",
      ),
    ).toBe(false);
  });

  it("resolves open auction ties with dice instead of sealed tie-break rounds", () => {
    const state = makeOpenAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "open_bids",
        submissions: { "player-1": 75 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: openAuctionDeadline,
      },
    });
    const result = applyAction(state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 75,
    });
    expect(result.state.phase).toBe("action");
    expect(result.state.pendingAuction).toBeUndefined();
    expect(result.state.pendingAuction?.tieBreakRound).toBeUndefined();
    expect(
      result.logEntries.find(
        (entry) => entry.actionType === "auction_tie_break",
      )?.payload,
    ).toMatchObject({ method: "dice" });
  });
});

describe("applyAction — live auction", () => {
  const liveAuctionDeadline = Date.now() + 5_000;

  function makeLiveAuctionState(
    overrides?: Partial<InternalGameState>,
  ): InternalGameState {
    return makeTestGameState({
      phase: "waiting_for_auction_bids",
      pendingBuyTilePosition: null,
      settings: {
        auctionType: "live_bidding",
        auctionExtensionWindow: "15s",
      },
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "live_bidding",
        submissions: {},
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: liveAuctionDeadline,
      },
      ...overrides,
    });
  }

  it("starts a live auction when lobby settings request live bidding", () => {
    const state = makeTestGameState({
      phase: "waiting_for_buy",
      pendingBuyTilePosition: 3,
      settings: { auctionType: "live_bidding" },
    });
    const result = applyAction(state, "player-1", {
      type: "decline_tile",
      tilePosition: 3,
    });
    expect(result.state.pendingAuction?.auctionType).toBe("live_bidding");
  });

  it("extends the timer when a new high bid is placed", () => {
    const now = Date.now();
    const state = makeLiveAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "live_bidding",
        submissions: { "player-1": 50 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: now + 5_000,
      },
    });
    const result = applyAction(state, "player-2", {
      type: "auction_bid",
      tilePosition: 3,
      amount: 75,
    });
    expect(result.state.phase).toBe("waiting_for_auction_bids");
    expect(result.state.pendingAuction?.bidDeadlineAt).toBeGreaterThan(
      now + 5_000,
    );
  });

  it("rejects pass actions during live bidding", () => {
    const state = makeLiveAuctionState();
    expect(() =>
      applyAction(state, "player-1", {
        type: "auction_pass",
        tilePosition: 3,
      }),
    ).toThrow("game.invalid_action");
  });

  it("settles live auctions when the timer expires", () => {
    const state = makeLiveAuctionState({
      pendingAuction: {
        tilePosition: 3,
        trigger: "decline",
        auctionType: "live_bidding",
        submissions: { "player-1": 80, "player-2": 60 },
        eligiblePlayerIds: ["player-1", "player-2"],
        tieBreakRound: 0,
        resumePhase: "action",
        bidDeadlineAt: Date.now() - 1,
      },
    });
    const closed = closeAuctionBidWindowIfReady(state, Date.now());
    expect(closed?.state.phase).toBe("action");
    expect(closed?.state.pendingAuction).toBeUndefined();
    const winner = closed?.state.players.find(
      (player) => player.playerId === "player-1",
    );
    expect(winner?.ownedTilePositions).toContain(3);
  });
});

describe("applyAction — end_turn", () => {
  it("advances to next player", () => {
    const state = makeTestGameState({ phase: "action" });
    const result = applyAction(state, "player-1", { type: "end_turn" });
    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.phase).toBe("waiting_for_roll");
  });

  it("advances round when wrapping around", () => {
    const state = makeTestGameState({ phase: "action", currentPlayerIndex: 1 });
    state.turnOrder = ["player-1", "player-2"];
    const result = applyAction(state, "player-2", { type: "end_turn" });
    expect(result.state.currentPlayerIndex).toBe(0);
    expect(result.state.round).toBe(2);
    expect(result.state.phase).toBe("waiting_for_roll");
  });
});

describe("applyAction — draw_market_event", () => {
  it("draws and resolves the top card at round start", () => {
    const state = makeTestGameState({
      phase: "waiting_for_market_event",
      marketEventDeckRemaining: ["stimulus_package"],
      marketEventDiscard: [],
    });
    const result = applyAction(state, "player-1", {
      type: "draw_market_event",
    });

    expect(result.state.phase).toBe("waiting_for_roll");
    expect(result.state.marketEventDiscard).toEqual(["stimulus_package"]);
    expect(result.state.marketEventDeckRemaining).toEqual([]);
    expect(
      result.logEntries.some((e) => e.actionType === "market_event_drawn"),
    ).toBe(true);
  });

  it("rejects draw_market_event outside round-start phase", () => {
    const state = makeTestGameState({ phase: "waiting_for_roll" });
    expect(() =>
      applyAction(state, "player-1", { type: "draw_market_event" }),
    ).toThrow("game.invalid_phase");
  });
});

describe("applyAction — disruption tiles", () => {
  it("draws and resolves a disruption card when landing on DISRUPTION CARD", () => {
    const state = makeTestGameState({
      phase: "waiting_for_roll",
      disruptionDeckRemaining: ["disruption_patent_troll"],
      disruptionDiscard: [],
    });
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [3, 4],
    });

    expect(
      result.state.players.find((p) => p.playerId === "player-1")?.position,
    ).toBe(7);
    expect(result.state.disruptionDiscard).toEqual(["disruption_patent_troll"]);
    expect(
      result.logEntries.some(
        (entry) => entry.actionType === "disruption_drawn",
      ),
    ).toBe(true);
    expect(
      result.state.players.find((p) => p.playerId === "player-1")?.capital,
    ).toBe(1450);
  });
});

describe("applyAction — mortgage / redeem", () => {
  it("mortgages an owned tile", () => {
    const state = makeTestGameState({ phase: "action" });
    state.players[0].ownedTilePositions = [3];
    const tile = state.tiles.find((t) => t.position === 3)!;
    tile.ownerId = "player-1";

    const result = applyAction(state, "player-1", {
      type: "mortgage_tile",
      tilePosition: 3,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 + 40);
    expect(p.mortgagedTilePositions).toContain(3);
    const ts = result.state.tiles.find((t) => t.position === 3)!;
    expect(ts.mortgaged).toBe(true);
  });

  it("redeems a mortgaged tile", () => {
    const state = makeTestGameState({ phase: "action" });
    state.players[0].ownedTilePositions = [3];
    state.players[0].mortgagedTilePositions = [3];
    const tile = state.tiles.find((t) => t.position === 3)!;
    tile.ownerId = "player-1";
    tile.mortgaged = true;

    const result = applyAction(state, "player-1", {
      type: "redeem_tile",
      tilePosition: 3,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 - 44);
    expect(p.mortgagedTilePositions).not.toContain(3);
    const ts = result.state.tiles.find((t) => t.position === 3)!;
    expect(ts.mortgaged).toBe(false);
  });

  it("applies PropTech Pioneer redemption discount", () => {
    const state = makeTestGameState({
      phase: "action",
      affinityAssignments: { "player-1": "proptech_pioneer" },
    });
    state.players[0].ownedTilePositions = [3];
    state.players[0].mortgagedTilePositions = [3];
    const tile = state.tiles.find((t) => t.position === 3)!;
    tile.ownerId = "player-1";
    tile.mortgaged = true;

    const result = applyAction(state, "player-1", {
      type: "redeem_tile",
      tilePosition: 3,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 - 42);
  });
});

describe("applyAction — develop tile affinity", () => {
  it("applies Lean Manufacturing development discount", () => {
    const state = makeTestGameState({
      phase: "action",
      affinityAssignments: { "player-1": "lean_manufacturing" },
    });
    state.players[0].ownedTilePositions = [1, 3, 11];
    state.players[0].actionPointsRemaining = 2;
    for (const position of state.players[0].ownedTilePositions) {
      const tile = state.tiles.find((t) => t.position === position);
      if (tile) tile.ownerId = "player-1";
    }

    const result = applyAction(state, "player-1", {
      type: "develop_tile",
      tilePosition: 3,
      tokenNumber: 1,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 - 64);
    const developedTile = result.state.tiles.find((t) => t.position === 3)!;
    expect(developedTile.developmentTokens).toBe(1);
  });
});

describe("applyAction — rent payment", () => {
  it("pays rent when landing on owned sector tile", () => {
    const state = makeTestGameState();
    state.players[1].ownedTilePositions = [3];
    const tile = state.tiles.find((t) => t.position === 3)!;
    tile.ownerId = "player-2";

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 2],
    });
    const payer = result.state.players.find((p) => p.playerId === "player-1")!;
    const owner = result.state.players.find((p) => p.playerId === "player-2")!;
    expect(payer.capital).toBe(1500 - 4);
    expect(owner.capital).toBe(1500 + 4);
  });

  it("pays hub rent based on number of hubs owned", () => {
    const state = makeTestGameState();
    state.players[1].ownedTilePositions = [5];
    const hub = state.tiles.find((t) => t.position === 5)!;
    hub.ownerId = "player-2";

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 3],
    });
    const payer = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(payer.capital).toBe(1500 - 25);
  });
});

describe("applyAction — diagonal overflow", () => {
  it("pays Free Market pool only once when rolling off diagonal", () => {
    const state = makeTestGameState();
    state.players[0].isOnDiagonal = true;
    state.players[0].position = "D5";
    state.freeMarketPool = 200;

    // D5 is index 4. Roll [1,1]=2 -> newDiagIndex=6, overflow by 1 step
    // Lands on position 21 (Biotech Research Corp.)
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 1],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.isOnDiagonal).toBe(false);
    expect(p.capital).toBe(1500 + 200);
    expect(
      result.logEntries.some((entry) => entry.actionType === "affinity_bonus"),
    ).toBe(false);
    expect(result.state.freeMarketPool).toBe(0);
    const fmLogs = result.logEntries.filter(
      (e) => e.actionType === "collected_free_market",
    );
    expect(fmLogs).toHaveLength(1);
  });

  it("awards Last Mile Logistics bonus when exiting the diagonal", () => {
    const state = makeTestGameState({
      affinityAssignments: { "player-1": "last_mile_logistics" },
    });
    state.players[0].isOnDiagonal = true;
    state.players[0].position = "D5";
    state.freeMarketPool = 200;

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 1],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.capital).toBe(1500 + 200 + DIAGONAL_TRAVERSE_BONUS);
    expect(
      result.logEntries.some((entry) => entry.actionType === "affinity_bonus"),
    ).toBe(true);
  });

  it("awards Last Mile Logistics bonus when passing START onto diagonal overflow", () => {
    const state = makeTestGameState({
      affinityAssignments: { "player-1": "last_mile_logistics" },
      marketEventDeckRemaining: [],
      marketEventDiscard: [],
    });
    state.players[0].position = 39;
    state.freeMarketPool = 50;

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [3, 4],
      pathChoiceDie: 2,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.isOnDiagonal).toBe(false);
    expect(p.capital).toBe(
      1500 + PASS_START_BONUS + 100 + DIAGONAL_TRAVERSE_BONUS,
    );
    expect(
      result.logEntries.some((entry) => entry.actionType === "affinity_bonus"),
    ).toBe(true);
  });

  it("continues remaining movement on perimeter after reaching FREE MARKET", () => {
    const state = makeTestGameState({
      marketEventDeckRemaining: [],
      marketEventDiscard: [],
    });
    state.players[0].isOnDiagonal = true;
    state.players[0].position = "D5";
    state.freeMarketPool = 50;

    // D5 is index 4, roll [3,4]=7 -> newDiagIndex=11, remaining=6 steps from pos 20
    // Lands on position 26 (MARKET EVENT)
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [3, 4],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(26);
    expect(p.isOnDiagonal).toBe(false);
    expect(p.capital).toBe(1500 + 100); // pool was 50 but minimum is 100
  });

  it("lands exactly on FREE MARKET when overflow is zero", () => {
    const state = makeTestGameState();
    state.players[0].isOnDiagonal = true;
    state.players[0].position = "D4";
    state.freeMarketPool = 300;

    // D4 is index 3, roll [1,1]=2 -> newDiagIndex=5 = DIAGONAL_TILES.length
    // remainingSteps = 0, lands on FREE MARKET
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 1],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(20);
    expect(p.capital).toBe(1500 + 300);
  });
});

describe("applyAction — end_turn rejects waiting_for_roll", () => {
  it("throws when trying to end turn before rolling", () => {
    const state = makeTestGameState({ phase: "waiting_for_roll" });
    expect(() => applyAction(state, "player-1", { type: "end_turn" })).toThrow(
      "game.cannot_end_turn",
    );
  });
});

describe("applyAction — landing on START triggers path choice", () => {
  it("enters waiting_for_path_choice when landing exactly on START", () => {
    const state = makeTestGameState();
    state.players[0].position = 36;
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 3],
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(0);
    expect(result.state.phase).toBe("waiting_for_path_choice");
    expect(p.capital).toBe(1500 + PASS_START_BONUS);
  });

  it("accepts path_choice action after landing on START", () => {
    const state = makeTestGameState({
      phase: "waiting_for_path_choice",
    });
    state.players[0].position = 0;
    const result = applyAction(state, "player-1", {
      type: "path_choice",
      choice: "diagonal",
    });
    expect(result.state.players[0].isOnDiagonal).toBe(true);
    expect(result.state.players[0].position).toBe("D1");
    expect(result.state.phase).toBe("action");
  });
});

describe("applyAction — regulation penalty persists through next turn", () => {
  it("does not clear regulation at end of the turn player was sent there", () => {
    const state = makeTestGameState({ phase: "action" });
    state.players[0].inRegulation = true;
    state.lastDiceRoll = null;

    const result = applyAction(state, "player-1", { type: "end_turn" });
    const p1 = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p1.inRegulation).toBe(true);
  });

  it("grants 0 AP to a regulated player on their next turn", () => {
    const state = makeTestGameState({ phase: "action", currentPlayerIndex: 1 });
    state.turnOrder = ["player-1", "player-2"];
    state.players[0].inRegulation = true;

    const result = applyAction(state, "player-2", { type: "end_turn" });
    expect(result.state.phase).toBe("waiting_for_roll");
    const p1 = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p1.actionPointsRemaining).toBe(0);
    expect(
      result.logEntries.some(
        (entry) => entry.actionType === "market_event_drawn",
      ),
    ).toBe(true);
  });

  it("clears regulation after the regulated player completes their penalty turn", () => {
    const state = makeTestGameState({ phase: "action" });
    state.players[0].inRegulation = true;
    state.lastDiceRoll = [3, 4];

    const result = applyAction(state, "player-1", { type: "end_turn" });
    const p1 = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p1.inRegulation).toBe(false);
    const servedLogs = result.logEntries.filter(
      (e) => e.actionType === "regulation_served",
    );
    expect(servedLogs).toHaveLength(1);
  });
});

describe("applyAction — syndicates and affinities", () => {
  it("forms a syndicate and shares sector control", () => {
    const state = makeTestGameState({ phase: "action" });
    state.players[0].ownedTilePositions = [1];
    state.players[1].ownedTilePositions = [3];
    state.tiles.find((tile) => tile.position === 1)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 3)!.ownerId = "player-2";

    const formed = applyAction(state, "player-1", {
      type: "form_syndicate",
      memberIds: ["player-1", "player-2"],
    });
    expect(formed.state.syndicates).toBeDefined();
    expect(
      formed.state.players.find((player) => player.playerId === "player-2")
        ?.syndicateId,
    ).toBeTruthy();

    formed.state.players[0].position = 1;
    formed.state.currentPlayerIndex = 0;
    formed.state.phase = "waiting_for_roll";
    const rentResult = applyAction(formed.state, "player-1", {
      type: "roll_dice",
      result: [0, 1],
    });
    expect(
      rentResult.logEntries.some((entry) => entry.actionType === "paid_rent"),
    ).toBe(false);
  });

  it("reveals opponent capital with consumer insights", () => {
    const state = makeTestGameState({
      phase: "action",
      affinityAssignments: { "player-1": "consumer_insights" },
    });
    const result = applyAction(state, "player-1", {
      type: "use_affinity",
      affinityId: "consumer_insights",
      targetPlayerId: "player-2",
    });
    expect(
      result.logEntries.some(
        (entry) => entry.actionType === "capital_revealed",
      ),
    ).toBe(true);
  });

  it("allows biotech nullification of harmful disruption cards", () => {
    const state = makeTestGameState({
      phase: "waiting_for_roll",
      affinityAssignments: { "player-1": "biotech_ip" },
      disruptionDeckRemaining: ["disruption_patent_troll"],
    });
    const drawn = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [3, 4],
    });
    expect(drawn.state.phase).toBe("waiting_for_disruption_nullify");
    const nullified = applyAction(drawn.state, "player-1", {
      type: "use_affinity",
      affinityId: "biotech_ip",
    });
    expect(nullified.state.phase).toBe("action");
    expect(
      nullified.state.players.find((player) => player.playerId === "player-1")
        ?.capital,
    ).toBe(1500);
    expect(
      nullified.logEntries.some(
        (entry) => entry.actionType === "disruption_nullified",
      ),
    ).toBe(true);
  });

  it("skips regulation penalties when no_regulation is enabled", () => {
    const state = makeTestGameState({
      settings: { optionalRuleIds: ["no_regulation"] },
    });
    state.players[0].position = 38;
    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [1, 1],
    });
    const player = result.state.players.find(
      (entry) => entry.playerId === "player-1",
    )!;
    expect(player.inRegulation).toBe(false);
  });
});

describe("applyAction — path-choice auto-roll when passing through START", () => {
  it("routes to perimeter with odd path-choice die", () => {
    const state = makeTestGameState();
    state.players[0].position = 38;

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 4],
      pathChoiceDie: 3,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.position).toBe(4);
    expect(p.isOnDiagonal).toBe(false);
    const pathLog = result.logEntries.find(
      (e) => e.actionType === "path_choice_auto",
    );
    expect(pathLog).toBeDefined();
    expect((pathLog?.payload as Record<string, unknown>).choice).toBe(
      "perimeter",
    );
  });

  it("routes to diagonal with even path-choice die", () => {
    const state = makeTestGameState();
    state.players[0].position = 38;

    const result = applyAction(state, "player-1", {
      type: "roll_dice",
      result: [2, 4],
      pathChoiceDie: 4,
    });
    const p = result.state.players.find((p) => p.playerId === "player-1")!;
    expect(p.isOnDiagonal).toBe(true);
    expect(p.position).toBe("D4");
    const pathLog = result.logEntries.find(
      (e) => e.actionType === "path_choice_auto",
    );
    expect(pathLog).toBeDefined();
    expect((pathLog?.payload as Record<string, unknown>).choice).toBe(
      "diagonal",
    );
  });
});
