import { describe, it, expect } from "vitest";
import {
  clampTrustworthiness,
  canCreateBindingContract,
  TRUSTWORTHINESS_DEFAULT,
  DEFAULT_PROFILE_VISIBILITY,
  OPTIONAL_RULES_REGISTRY,
  OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  ACHIEVEMENTS_REGISTRY,
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

describe("OPTIONAL_RULES_REGISTRY", () => {
  const expectedIds = [
    "double_rent_district",
    "speed_market",
    "no_regulation",
    "disruption_blitz",
    "auction_everything",
    "open_negotiation",
    "debt_spiral",
    "hostile_takeover",
    "market_manipulation",
    "insider_trading",
  ];

  it("contains exactly the specified IDs and no extras", () => {
    const actualIds = Object.keys(OPTIONAL_RULES_REGISTRY);
    expect(actualIds).toEqual(expect.arrayContaining(expectedIds));
    expect(expectedIds).toEqual(expect.arrayContaining(actualIds));
    expect(actualIds).toHaveLength(expectedIds.length);
  });

  it("each entry has matching id, name, and requiredRankTier", () => {
    for (const entry of Object.values(OPTIONAL_RULES_REGISTRY)) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("requiredRankTier");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.requiredRankTier).toBe("number");
    }
  });
});

describe("OPTIONAL_MARKET_EVENT_CARDS_REGISTRY", () => {
  const expectedIds = [
    "optional_leveraged_buyout",
    "optional_corporate_espionage",
    "optional_short_squeeze",
    "optional_supply_chain_crisis",
    "optional_sovereign_wealth_fund",
    "optional_venture_capital_boom",
    "optional_algorithmic_flash_trade",
    "optional_regulatory_amnesty",
    "optional_dark_pool_transfer",
    "optional_synthetic_cdo",
    "optional_black_swan_event",
  ];

  it("contains exactly the specified IDs and no extras", () => {
    const actualIds = Object.keys(OPTIONAL_MARKET_EVENT_CARDS_REGISTRY);
    expect(actualIds).toEqual(expect.arrayContaining(expectedIds));
    expect(expectedIds).toEqual(expect.arrayContaining(actualIds));
    expect(actualIds).toHaveLength(expectedIds.length);
  });

  it("each entry has matching id, name, and requiredRankTier", () => {
    for (const entry of Object.values(OPTIONAL_MARKET_EVENT_CARDS_REGISTRY)) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("requiredRankTier");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.requiredRankTier).toBe("number");
    }
  });
});

describe("ACHIEVEMENTS_REGISTRY", () => {
  const expectedIds = [
    "first_steps",
    "full_house",
    "century_club",
    "champion",
    "dynasty",
    "monopolist",
    "deal_maker",
    "auctioneer",
    "sniper",
    "diagonal_shortcut",
    "flash_survivor",
    "kingmaker",
    "loan_shark",
    "oligarchs_gambit",
    "perfect_attendance",
  ];

  it("contains exactly the specified IDs and no extras", () => {
    const actualIds = Object.keys(ACHIEVEMENTS_REGISTRY);
    expect(actualIds).toEqual(expect.arrayContaining(expectedIds));
    expect(expectedIds).toEqual(expect.arrayContaining(actualIds));
    expect(actualIds).toHaveLength(expectedIds.length);
  });

  it("each entry has matching id, name, and rankPoints", () => {
    for (const entry of Object.values(ACHIEVEMENTS_REGISTRY)) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("rankPoints");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.rankPoints).toBe("number");
    }
  });
});
