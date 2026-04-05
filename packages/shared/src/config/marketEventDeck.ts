// ---------------------------------------------------------------------------
// Standard Market Event Deck Registry (30 Cards)
// Canonical card definitions for the base game deck.
// ---------------------------------------------------------------------------

export type MarketEventCategory =
  | "positive"
  | "negative"
  | "variable"
  | "targeted";

export interface MarketEventCard {
  readonly id: string;
  readonly name: string;
  readonly category: MarketEventCategory;
}

export const MARKET_EVENT_DECK: Record<string, MarketEventCard> = {
  // Positive (8)
  tech_boom: { id: "tech_boom", name: "Tech Boom", category: "positive" },
  green_new_deal: { id: "green_new_deal", name: "Green New Deal", category: "positive" },
  stimulus_package: { id: "stimulus_package", name: "Stimulus Package", category: "positive" },
  bull_market: { id: "bull_market", name: "Bull Market", category: "positive" },
  sector_dividend: { id: "sector_dividend", name: "Sector Dividend", category: "positive" },
  infrastructure_bill: { id: "infrastructure_bill", name: "Infrastructure Bill", category: "positive" },
  merger_wave: { id: "merger_wave", name: "Merger Wave", category: "positive" },
  innovation_grant: { id: "innovation_grant", name: "Innovation Grant", category: "positive" },

  // Negative (10)
  regulatory_crackdown: { id: "regulatory_crackdown", name: "Regulatory Crackdown", category: "negative" },
  market_crash: { id: "market_crash", name: "Market Crash", category: "negative" },
  antitrust_investigation: { id: "antitrust_investigation", name: "Antitrust Investigation", category: "negative" },
  supply_chain_crisis: { id: "supply_chain_crisis", name: "Supply Chain Crisis", category: "negative" },
  cyber_attack: { id: "cyber_attack", name: "Cyber Attack", category: "negative" },
  energy_crisis: { id: "energy_crisis", name: "Energy Crisis", category: "negative" },
  healthcare_scandal: { id: "healthcare_scandal", name: "Healthcare Scandal", category: "negative" },
  data_breach_fine: { id: "data_breach_fine", name: "Data Breach Fine", category: "negative" },
  financial_meltdown: { id: "financial_meltdown", name: "Financial Meltdown", category: "negative" },
  recession: { id: "recession", name: "Recession", category: "negative" },

  // Variable (4)
  election_outcome: { id: "election_outcome", name: "Election Outcome", category: "variable" },
  opec_decision: { id: "opec_decision", name: "OPEC Decision", category: "variable" },
  trade_liberalization: { id: "trade_liberalization", name: "Trade Liberalization", category: "variable" },
  debt_crisis: { id: "debt_crisis", name: "Debt Crisis", category: "variable" },

  // Targeted (8)
  hostile_takeover_alert: { id: "hostile_takeover_alert", name: "Hostile Takeover Alert", category: "targeted" },
  whistleblower: { id: "whistleblower", name: "Whistleblower", category: "targeted" },
  sovereign_wealth_fund: { id: "sovereign_wealth_fund", name: "Sovereign Wealth Fund", category: "targeted" },
  economic_sanctions: { id: "economic_sanctions", name: "Economic Sanctions", category: "targeted" },
  boom_town: { id: "boom_town", name: "Boom Town", category: "targeted" },
  windfall_tax: { id: "windfall_tax", name: "Windfall Tax", category: "targeted" },
  ipo_windfall: { id: "ipo_windfall", name: "IPO Windfall", category: "targeted" },
  climate_legislation: { id: "climate_legislation", name: "Climate Legislation", category: "targeted" },
} as const;

/** All 30 standard market event card IDs */
export const MARKET_EVENT_DECK_IDS = Object.keys(MARKET_EVENT_DECK) as ReadonlyArray<string>;
