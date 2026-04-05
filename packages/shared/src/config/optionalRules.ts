export const OPTIONAL_RULES_REGISTRY = {
  double_rent_district: {
    id: "double_rent_district",
    name: "Double Rent District",
    description:
      "When a player or Syndicate controls all tiles in a full sector AND owns the Sector Hub adjacent to that sector, they collect 3\u00D7 base rent (instead of 2\u00D7) from unowned-sector players who land on tiles in that sector.",
    requiredRankTier: 1,
  },
  speed_market: {
    id: "speed_market",
    name: "Speed Market",
    description:
      "Each player begins the game with 30% more Capital than normal. Games progress faster, encouraging aggressive early play.",
    requiredRankTier: 1,
  },
  no_regulation: {
    id: "no_regulation",
    name: "No Regulation",
    description:
      "The Regulation Zone (position 10) has no effect. Players who land on or are sent to the Regulation Zone experience no penalties.",
    requiredRankTier: 1,
  },
  disruption_blitz: {
    id: "disruption_blitz",
    name: "Disruption Blitz",
    description:
      "When a player lands on a DISRUPTION CARD space or resolves BLACK MARKET RELAY, they draw 2 Disruption cards instead of 1.",
    requiredRankTier: 1,
  },
  auction_everything: {
    id: "auction_everything",
    name: "Auction Everything",
    description:
      "When a player lands on any unowned sector tile, hub, or utility, it bypasses right-of-first-refusal and goes directly to auction. Reserve price: 1 Capital.",
    requiredRankTier: 1,
  },
  open_negotiation: {
    id: "open_negotiation",
    name: "Open Negotiation",
    description:
      "All negotiation proposals, counter-proposals, and agreements are visible to all players in the game (not just the parties involved).",
    requiredRankTier: 1,
  },
  debt_spiral: {
    id: "debt_spiral",
    name: "Debt Spiral",
    description:
      "If a player cannot pay rent immediately and has no available Capital, the debt accrues 10% simple interest per round until fully paid.",
    requiredRankTier: 1,
  },
  hostile_takeover: {
    id: "hostile_takeover",
    name: "Hostile Takeover",
    description:
      "Once per game, a player may forcibly purchase one sector tile from another player who is not in their Syndicate at 150% of acquisition cost.",
    requiredRankTier: 3,
  },
  market_manipulation: {
    id: "market_manipulation",
    name: "Market Manipulation",
    description:
      "Once per round, a player may pay \u00A450 to freeze one opponent's tile for the remainder of that round, preventing it from collecting rent.",
    requiredRankTier: 3,
  },
  insider_trading: {
    id: "insider_trading",
    name: "Insider Trading",
    description:
      "Before each Market Event card is drawn, the designated player may peek at the top card and choose to discard it and draw the next card instead.",
    requiredRankTier: 3,
  },
} as const;
