// ---------------------------------------------------------------------------
// Disruption Deck Registry (15 Cards)
// Canonical card definitions for the disruption deck.
// ---------------------------------------------------------------------------

export interface DisruptionCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const DISRUPTION_DECK: Record<string, DisruptionCard> = {
  disruption_patent_troll: {
    id: "disruption_patent_troll",
    name: "Patent Troll",
    description: "Pay 50 Capital.",
  },
  disruption_golden_parachute: {
    id: "disruption_golden_parachute",
    name: "Golden Parachute",
    description: "Collect 75 Capital.",
  },
  disruption_insider_trading: {
    id: "disruption_insider_trading",
    name: "Insider Trading",
    description:
      "Collect up to 50 Capital from the player with the most Capital (excluding you).",
  },
  disruption_leveraged_buyout: {
    id: "disruption_leveraged_buyout",
    name: "Leveraged Buyout",
    description:
      "Pay 75 Capital. (Full forced-auction flow deferred in current engine version.)",
  },
  disruption_bankruptcy_protection: {
    id: "disruption_bankruptcy_protection",
    name: "Bankruptcy Protection",
    description:
      "Collect 150 Capital if you have 200 Capital or less; otherwise collect 50 Capital.",
  },
  disruption_angel_investor: {
    id: "disruption_angel_investor",
    name: "Angel Investor",
    description:
      "Collect 100 Capital if you own fewer than 3 tiles; otherwise collect 50 Capital.",
  },
  disruption_antitrust_exemption: {
    id: "disruption_antitrust_exemption",
    name: "Antitrust Exemption",
    description:
      "If you are in the Regulation Zone, release immediately. Otherwise collect 50 Capital.",
  },
  disruption_market_manipulation: {
    id: "disruption_market_manipulation",
    name: "Market Manipulation",
    description:
      "Each other player loses 10% of their current Capital; you collect the total lost.",
  },
  disruption_whistleblower_payoff: {
    id: "disruption_whistleblower_payoff",
    name: "Whistleblower Payoff",
    description: "Pay up to 75 Capital into the Free Market pool.",
  },
  disruption_bridge_loan: {
    id: "disruption_bridge_loan",
    name: "Bridge Loan",
    description: "Collect 100 Capital.",
  },
  disruption_corporate_espionage: {
    id: "disruption_corporate_espionage",
    name: "Corporate Espionage",
    description:
      "Each player pays 10 Capital for every development token on tiles they own.",
  },
  disruption_regulatory_capture: {
    id: "disruption_regulatory_capture",
    name: "Regulatory Capture",
    description:
      "If you are in the Regulation Zone, release immediately. Otherwise send the richest opponent to the Regulation Zone.",
  },
  disruption_lobbying_win: {
    id: "disruption_lobbying_win",
    name: "Lobbying Win",
    description:
      "Collect 75 Capital plus 25 Capital for each player currently in the Regulation Zone.",
  },
  disruption_short_squeeze: {
    id: "disruption_short_squeeze",
    name: "Short Squeeze",
    description:
      "If you control at least 2 tiles in your strongest sector, collect 30 Capital per tile in that sector from each opponent (capped by their Capital). Otherwise collect 30 Capital.",
  },
  disruption_go_to_regulation: {
    id: "disruption_go_to_regulation",
    name: "Go to Regulation",
    description: "Go directly to the Regulation Zone.",
  },
} as const;

/** All 15 disruption card IDs */
export const DISRUPTION_DECK_IDS = Object.keys(
  DISRUPTION_DECK,
) as ReadonlyArray<string>;
