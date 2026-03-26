import { describe, it, expect } from "vitest";
import {
  clampTrustworthiness,
  canCreateBindingContract,
  TRUSTWORTHINESS_DEFAULT,
  DEFAULT_PROFILE_VISIBILITY,
} from "@oligopoly/shared";

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
