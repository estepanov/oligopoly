import {
  HealthResponseSchema,
  NegotiationErrorKeys,
  ProfileVisibilitySchema,
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
