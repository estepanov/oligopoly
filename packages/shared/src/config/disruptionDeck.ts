// ---------------------------------------------------------------------------
// Disruption Deck Registry (15 Cards)
// Canonical card definitions for the disruption deck.
// ---------------------------------------------------------------------------

export interface DisruptionCard {
  readonly id: string;
  readonly name: string;
}

export const DISRUPTION_DECK: Record<string, DisruptionCard> = {
  disruption_patent_troll: {
    id: "disruption_patent_troll",
    name: "Patent Troll",
  },
  disruption_golden_parachute: {
    id: "disruption_golden_parachute",
    name: "Golden Parachute",
  },
  disruption_insider_trading: {
    id: "disruption_insider_trading",
    name: "Insider Trading",
  },
  disruption_leveraged_buyout: {
    id: "disruption_leveraged_buyout",
    name: "Leveraged Buyout",
  },
  disruption_bankruptcy_protection: {
    id: "disruption_bankruptcy_protection",
    name: "Bankruptcy Protection",
  },
  disruption_angel_investor: {
    id: "disruption_angel_investor",
    name: "Angel Investor",
  },
  disruption_antitrust_exemption: {
    id: "disruption_antitrust_exemption",
    name: "Antitrust Exemption",
  },
  disruption_market_manipulation: {
    id: "disruption_market_manipulation",
    name: "Market Manipulation",
  },
  disruption_whistleblower_payoff: {
    id: "disruption_whistleblower_payoff",
    name: "Whistleblower Payoff",
  },
  disruption_bridge_loan: { id: "disruption_bridge_loan", name: "Bridge Loan" },
  disruption_corporate_espionage: {
    id: "disruption_corporate_espionage",
    name: "Corporate Espionage",
  },
  disruption_regulatory_capture: {
    id: "disruption_regulatory_capture",
    name: "Regulatory Capture",
  },
  disruption_lobbying_win: {
    id: "disruption_lobbying_win",
    name: "Lobbying Win",
  },
  disruption_short_squeeze: {
    id: "disruption_short_squeeze",
    name: "Short Squeeze",
  },
  disruption_go_to_regulation: {
    id: "disruption_go_to_regulation",
    name: "Go to Regulation",
  },
} as const;

/** All 15 disruption card IDs */
export const DISRUPTION_DECK_IDS = Object.keys(
  DISRUPTION_DECK,
) as ReadonlyArray<string>;
