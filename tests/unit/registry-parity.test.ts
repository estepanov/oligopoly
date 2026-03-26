import {
  ACHIEVEMENTS_REGISTRY,
  OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  OPTIONAL_RULES_REGISTRY,
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
});
