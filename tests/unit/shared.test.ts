import type { BindingContract, BindingContractTerm } from "@oligopoly/shared";
import {
  applyHandshakeBreach,
  applyThreadExpiry,
  calcThreadExpiry,
  canCreateBindingContract,
  clampTrustworthiness,
  DEFAULT_PROFILE_VISIBILITY,
  type FullUserProfile,
  getTrustworthinessRestrictions,
  HANDSHAKE_BREACH_PENALTY,
  isActionBlockedByContracts,
  isThreadExpired,
  NEGOTIATION_THREAD_DURATION,
  serializeProfileForAudience,
  THREAD_EXPIRY_PENALTY,
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
