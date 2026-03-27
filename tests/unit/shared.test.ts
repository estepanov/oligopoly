import {
  canCreateBindingContract,
  clampTrustworthiness,
  DEFAULT_PROFILE_VISIBILITY,
  serializeProfileForAudience,
  TRUSTWORTHINESS_DEFAULT,
  type FullUserProfile,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

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
