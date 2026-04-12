export const OPTIONAL_MARKET_EVENT_CARDS_REGISTRY = {
  optional_leveraged_buyout: {
    id: "optional_leveraged_buyout",
    name: "Leveraged Buyout",
    description:
      "The player controlling the fewest tiles must immediately place one of their most expensive tiles up for auction. Minimum bid: 1 Capital. Proceeds go to the auctioned player.",
    requiredRankTier: 1,
  },
  optional_corporate_espionage: {
    id: "optional_corporate_espionage",
    name: "Corporate Espionage",
    description:
      "Each player pays 10 Capital for every development token on tiles currently owned by opponents.",
    requiredRankTier: 1,
  },
  optional_short_squeeze: {
    id: "optional_short_squeeze",
    name: "Short Squeeze",
    description:
      "The player controlling the most tiles in any single sector immediately collects 30 Capital per tile in that sector from all other players.",
    requiredRankTier: 1,
  },
  optional_supply_chain_crisis: {
    id: "optional_supply_chain_crisis",
    name: "Supply Chain Crisis",
    description:
      "All utilities collect double rent for the next 2 rounds. After 2 complete rounds, rent returns to normal.",
    requiredRankTier: 1,
  },
  optional_sovereign_wealth_fund: {
    id: "optional_sovereign_wealth_fund",
    name: "Sovereign Wealth Fund",
    description:
      "The bank distributes 200 Capital equally among all players, rounded down.",
    requiredRankTier: 1,
  },
  optional_venture_capital_boom: {
    id: "optional_venture_capital_boom",
    name: "Venture Capital Boom",
    description:
      "Each player currently controlling fewer than 3 tiles receives 100 Capital from the bank as startup funding.",
    requiredRankTier: 1,
  },
  optional_algorithmic_flash_trade: {
    id: "optional_algorithmic_flash_trade",
    name: "Algorithmic Flash Trade",
    description:
      "All players simultaneously roll a single die. Each player collects that result \u00D7 10 Capital from the bank.",
    requiredRankTier: 1,
  },
  optional_regulatory_amnesty: {
    id: "optional_regulatory_amnesty",
    name: "Regulatory Amnesty",
    description:
      "All players currently positioned in the Regulation Zone are immediately released without losing their next turn's optional actions.",
    requiredRankTier: 1,
  },
  optional_dark_pool_transfer: {
    id: "optional_dark_pool_transfer",
    name: "Dark Pool Transfer",
    description:
      "One random player may secretly transfer one of their tiles to any other player without public announcement. The transfer is recorded in the action log but no notification is broadcast.",
    requiredRankTier: 2,
  },
  optional_synthetic_cdo: {
    id: "optional_synthetic_cdo",
    name: "Synthetic CDO",
    description:
      "Each player may mortgage any number of their tiles simultaneously this round at 60% of acquisition cost (instead of the standard 50%).",
    requiredRankTier: 2,
  },
  optional_black_swan_event: {
    id: "optional_black_swan_event",
    name: "Black Swan Event",
    description:
      "All players lose 25% of their current Capital immediately. The player with the least total Capital receives all the Capital lost by other players combined.",
    requiredRankTier: 2,
  },
} as const;
