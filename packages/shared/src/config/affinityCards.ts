// ---------------------------------------------------------------------------
// Affinity Cards Registry (12 Cards)
// Industry Affinity cards — one dealt to each player at game start.
// ---------------------------------------------------------------------------

export interface AffinityCard {
  readonly id: string;
  readonly name: string;
  readonly sector: string;
  readonly effectDescription: string;
  /** True if the card has a one-time-use "Active" effect (costs 0 AP). */
  readonly isActive: boolean;
}

export const AFFINITY_CARDS: Record<string, AffinityCard> = {
  ai_pioneer: {
    id: "ai_pioneer",
    name: "AI Pioneer",
    sector: "Silicon Valley",
    effectDescription:
      "Your acquisition cost for all Silicon Valley sector tiles is reduced by 15% (applies to direct purchase, auction bids, and Hostile Takeover offers).",
    isActive: false,
  },
  quantitative_analyst: {
    id: "quantitative_analyst",
    name: "Quantitative Analyst",
    sector: "Wall Street",
    effectDescription:
      "When you collect rent from any Wall Street sector tile, the bank pays you an additional 10% on top of the standard rent. The payer is charged the normal amount only.",
    isActive: false,
  },
  esg_fund_manager: {
    id: "esg_fund_manager",
    name: "ESG Fund Manager",
    sector: "Energy",
    effectDescription:
      "When any player lands on one of your Energy sector tiles, the bank credits you an additional 15% of the rent paid — on top of the standard rent you already collect from the landing player.",
    isActive: false,
  },
  biotech_ip: {
    id: "biotech_ip",
    name: "Biotech IP",
    sector: "Healthcare",
    effectDescription:
      "Active (once per game): Nullify one Disruption Card effect that targets you. The card is discarded with no effect. Announce immediately when the card is drawn.",
    isActive: true,
  },
  streaming_pioneer: {
    id: "streaming_pioneer",
    name: "Streaming Pioneer",
    sector: "Media",
    effectDescription:
      "Rent you collect from all Media sector tiles is increased by 15%. The bank subsidises the bonus; the paying player pays standard rent.",
    isActive: false,
  },
  last_mile_logistics: {
    id: "last_mile_logistics",
    name: "Last Mile Logistics",
    sector: "Transport",
    effectDescription:
      "Each time your token traverses the Diagonal Express (enters at a corner and exits at the far end), collect 30 Capital from the bank as a route optimisation bonus.",
    isActive: false,
  },
  consumer_insights: {
    id: "consumer_insights",
    name: "Consumer Insights",
    sector: "Consumer / Retail",
    effectDescription:
      "Active (once per game, 0 AP): Reveal one opponent's current Capital total to all players. The target is chosen by you; the reveal is immediate and broadcast to the full table.",
    isActive: true,
  },
  lean_manufacturing: {
    id: "lean_manufacturing",
    name: "Lean Manufacturing",
    sector: "Industrial",
    effectDescription:
      "Development token installation on all your tiles costs 20% less Capital.",
    isActive: false,
  },
  spectrum_holder: {
    id: "spectrum_holder",
    name: "Spectrum Holder",
    sector: "Utilities",
    effectDescription:
      "If you own both Utility tiles simultaneously, each Utility tile's rent is calculated at 1.5× the standard utility rent rate (instead of the standard 1×).",
    isActive: false,
  },
  proptech_pioneer: {
    id: "proptech_pioneer",
    name: "PropTech Pioneer",
    sector: "Real Estate",
    effectDescription:
      "Your mortgage redemption rate is 105% of mortgage value instead of the standard 110%. You also save on early redemption.",
    isActive: false,
  },
  crypto_arbitrageur: {
    id: "crypto_arbitrageur",
    name: "Crypto Arbitrageur",
    sector: "Wildcard",
    effectDescription:
      "When you land on Free Market and collect the pool, the bank pays you an additional 25% of the collected pool value as a bonus. If the pool is empty, you collect only the standard 100 Capital floor.",
    isActive: false,
  },
  founding_partner: {
    id: "founding_partner",
    name: "Founding Partner",
    sector: "Wildcard",
    effectDescription:
      "Forming a Syndicate costs you 0 Action Points (instead of 1). Additionally, your Contribution Score starts with a 5% baseline — equivalent to having already contributed a small share before the game begins.",
    isActive: false,
  },
} as const;

/** All 12 affinity card IDs */
export const AFFINITY_CARD_IDS = Object.keys(AFFINITY_CARDS) as ReadonlyArray<string>;
