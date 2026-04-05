import {
  ACHIEVEMENTS_REGISTRY,
  AFFINITY_CARDS,
  ALL_TILES,
  DIAGONAL_TILES,
  DISRUPTION_DECK,
  MARKET_EVENT_DECK,
  OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  OPTIONAL_RULES_REGISTRY,
  PERIMETER_TILES,
  RANK_THRESHOLDS,
  SECTORS,
  TOTAL_BOARD_MARKET_VALUE,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

const CANONICAL_OPTIONAL_RULE_IDS = [
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
] as const;

const CANONICAL_MARKET_EVENT_CARD_IDS = [
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
] as const;

const CANONICAL_ACHIEVEMENT_IDS = [
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
] as const;

const CANONICAL_STANDARD_MARKET_EVENT_IDS = [
  "tech_boom",
  "green_new_deal",
  "stimulus_package",
  "bull_market",
  "sector_dividend",
  "infrastructure_bill",
  "merger_wave",
  "innovation_grant",
  "regulatory_crackdown",
  "market_crash",
  "antitrust_investigation",
  "supply_chain_crisis",
  "cyber_attack",
  "energy_crisis",
  "healthcare_scandal",
  "data_breach_fine",
  "financial_meltdown",
  "recession",
  "election_outcome",
  "opec_decision",
  "trade_liberalization",
  "debt_crisis",
  "hostile_takeover_alert",
  "whistleblower",
  "sovereign_wealth_fund",
  "economic_sanctions",
  "boom_town",
  "windfall_tax",
  "ipo_windfall",
  "climate_legislation",
] as const;

const CANONICAL_DISRUPTION_IDS = [
  "disruption_patent_troll",
  "disruption_golden_parachute",
  "disruption_insider_trading",
  "disruption_leveraged_buyout",
  "disruption_bankruptcy_protection",
  "disruption_angel_investor",
  "disruption_antitrust_exemption",
  "disruption_market_manipulation",
  "disruption_whistleblower_payoff",
  "disruption_bridge_loan",
  "disruption_corporate_espionage",
  "disruption_regulatory_capture",
  "disruption_lobbying_win",
  "disruption_short_squeeze",
  "disruption_go_to_regulation",
] as const;

const CANONICAL_AFFINITY_CARD_IDS = [
  "ai_pioneer",
  "quantitative_analyst",
  "esg_fund_manager",
  "biotech_ip",
  "streaming_pioneer",
  "last_mile_logistics",
  "consumer_insights",
  "lean_manufacturing",
  "spectrum_holder",
  "proptech_pioneer",
  "crypto_arbitrageur",
  "founding_partner",
] as const;

const sortedKeys = (registry: Record<string, unknown>): string[] =>
  Object.keys(registry).toSorted();

const sortedIds = (ids: readonly string[]): string[] => [...ids].toSorted();

describe("registry parity with oligopoly_game_rules.md canonical appendix", () => {
  it("keeps OPTIONAL_RULES_REGISTRY keys exactly aligned to the 10 canonical optional rule IDs", () => {
    expect(sortedKeys(OPTIONAL_RULES_REGISTRY)).toStrictEqual(
      sortedIds(CANONICAL_OPTIONAL_RULE_IDS),
    );
  });

  it("keeps OPTIONAL_MARKET_EVENT_CARDS_REGISTRY keys exactly aligned to the 11 canonical card IDs", () => {
    expect(sortedKeys(OPTIONAL_MARKET_EVENT_CARDS_REGISTRY)).toStrictEqual(
      sortedIds(CANONICAL_MARKET_EVENT_CARD_IDS),
    );
  });

  it("keeps ACHIEVEMENTS_REGISTRY keys exactly aligned to the 15 canonical achievement IDs", () => {
    expect(sortedKeys(ACHIEVEMENTS_REGISTRY)).toStrictEqual(
      sortedIds(CANONICAL_ACHIEVEMENT_IDS),
    );
  });

  it("keeps MARKET_EVENT_DECK keys exactly aligned to the 30 canonical standard market event IDs", () => {
    expect(sortedKeys(MARKET_EVENT_DECK)).toStrictEqual(
      sortedIds(CANONICAL_STANDARD_MARKET_EVENT_IDS),
    );
  });

  it("MARKET_EVENT_DECK has correct category counts (8 positive, 10 negative, 4 variable, 8 targeted)", () => {
    const cards = Object.values(MARKET_EVENT_DECK);
    expect(cards.filter((c) => c.category === "positive")).toHaveLength(8);
    expect(cards.filter((c) => c.category === "negative")).toHaveLength(10);
    expect(cards.filter((c) => c.category === "variable")).toHaveLength(4);
    expect(cards.filter((c) => c.category === "targeted")).toHaveLength(8);
  });

  it("keeps DISRUPTION_DECK keys exactly aligned to the 15 canonical disruption card IDs", () => {
    expect(sortedKeys(DISRUPTION_DECK)).toStrictEqual(
      sortedIds(CANONICAL_DISRUPTION_IDS),
    );
  });

  it("keeps AFFINITY_CARDS keys exactly aligned to the 12 canonical affinity card IDs", () => {
    expect(sortedKeys(AFFINITY_CARDS)).toStrictEqual(
      sortedIds(CANONICAL_AFFINITY_CARD_IDS),
    );
  });

  it("AFFINITY_CARDS marks only Biotech IP and Consumer Insights as active cards", () => {
    const activeCards = Object.values(AFFINITY_CARDS).filter((c) => c.isActive);
    expect(activeCards).toHaveLength(2);
    const activeIds = activeCards.map((c) => c.id).sort();
    expect(activeIds).toStrictEqual(["biotech_ip", "consumer_insights"]);
  });
});

describe("board registry integrity", () => {
  it("has exactly 40 perimeter tiles", () => {
    expect(PERIMETER_TILES).toHaveLength(40);
  });

  it("has exactly 5 diagonal tiles", () => {
    expect(DIAGONAL_TILES).toHaveLength(5);
  });

  it("has 45 total tiles", () => {
    expect(ALL_TILES).toHaveLength(45);
  });

  it("perimeter tiles have sequential positions 0–39", () => {
    for (let i = 0; i < 40; i++) {
      expect(PERIMETER_TILES[i].position).toBe(i);
    }
  });

  it("diagonal tiles have positions D1–D5", () => {
    expect(DIAGONAL_TILES[0].position).toBe("D1");
    expect(DIAGONAL_TILES[1].position).toBe("D2");
    expect(DIAGONAL_TILES[2].position).toBe("D3");
    expect(DIAGONAL_TILES[3].position).toBe("D4");
    expect(DIAGONAL_TILES[4].position).toBe("D5");
  });

  it("defines exactly 8 sectors", () => {
    expect(Object.keys(SECTORS)).toHaveLength(8);
  });

  it("corner tiles have no cost", () => {
    const corners = [0, 10, 20, 30];
    for (const pos of corners) {
      const tile = PERIMETER_TILES[pos];
      expect(tile.type).toBe("corner");
      expect(tile.cost).toBeNull();
    }
  });

  it("TOTAL_BOARD_MARKET_VALUE is the sum of all tile costs", () => {
    const expected = ALL_TILES.reduce((s, t) => s + (t.cost ?? 0), 0);
    expect(TOTAL_BOARD_MARKET_VALUE).toBe(expected);
    expect(TOTAL_BOARD_MARKET_VALUE).toBeGreaterThan(0);
  });

  it("sector tiles have non-null cost and baseRent", () => {
    for (const tile of ALL_TILES) {
      if (tile.type === "sector_tile") {
        expect(tile.cost).not.toBeNull();
        expect(tile.baseRent).not.toBeNull();
        expect(tile.sectorId).not.toBeNull();
      }
    }
  });

  it("utility tiles have cost but no baseRent", () => {
    for (const tile of ALL_TILES) {
      if (tile.type === "utility") {
        expect(tile.cost).toBe(150);
        expect(tile.baseRent).toBeNull();
      }
    }
  });

  it("sector hub tiles have cost but no baseRent", () => {
    for (const tile of ALL_TILES) {
      if (tile.type === "sector_hub") {
        expect(tile.cost).toBe(200);
        expect(tile.baseRent).toBeNull();
      }
    }
  });
});

describe("rank thresholds integrity", () => {
  it("has exactly 5 rank tiers", () => {
    expect(RANK_THRESHOLDS).toHaveLength(5);
  });

  it("tiers are numbered 1–5 in order", () => {
    for (let i = 0; i < 5; i++) {
      expect(RANK_THRESHOLDS[i].tier).toBe(i + 1);
    }
  });

  it("point thresholds are strictly increasing", () => {
    for (let i = 1; i < RANK_THRESHOLDS.length; i++) {
      expect(RANK_THRESHOLDS[i].pointsRequired).toBeGreaterThan(
        RANK_THRESHOLDS[i - 1].pointsRequired,
      );
    }
  });

  it("matches canonical thresholds from game rules", () => {
    expect(RANK_THRESHOLDS[0]).toEqual({
      tier: 1,
      title: "Market Novice",
      pointsRequired: 0,
    });
    expect(RANK_THRESHOLDS[1]).toEqual({
      tier: 2,
      title: "Sector Investor",
      pointsRequired: 100,
    });
    expect(RANK_THRESHOLDS[2]).toEqual({
      tier: 3,
      title: "Capital Baron",
      pointsRequired: 500,
    });
    expect(RANK_THRESHOLDS[3]).toEqual({
      tier: 4,
      title: "Market Mogul",
      pointsRequired: 1500,
    });
    expect(RANK_THRESHOLDS[4]).toEqual({
      tier: 5,
      title: "Oligarch",
      pointsRequired: 5000,
    });
  });
});
