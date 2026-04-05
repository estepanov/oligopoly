// ---------------------------------------------------------------------------
// Rank Thresholds Registry
// Player rank tiers, point requirements, and rank point calculation.
// ---------------------------------------------------------------------------

export interface RankThreshold {
  readonly tier: number;
  readonly title: string;
  readonly pointsRequired: number;
}

/** The 5 rank tiers, ordered by tier */
export const RANK_THRESHOLDS: readonly RankThreshold[] = [
  { tier: 1, title: "Market Novice", pointsRequired: 0 },
  { tier: 2, title: "Sector Investor", pointsRequired: 100 },
  { tier: 3, title: "Capital Baron", pointsRequired: 500 },
  { tier: 4, title: "Market Mogul", pointsRequired: 1500 },
  { tier: 5, title: "Oligarch", pointsRequired: 5000 },
] as const;

/** Rank point award rules (per-event constants) */
export const RANK_POINT_RULES = {
  /** Awarded when a game concludes, regardless of outcome */
  GAME_COMPLETION: 10,
  /** Awarded for being in the winning syndicate or winning solo */
  GAME_WIN: 25,
  /** Per sector controlled at end of game (max 8 sectors × 5 = 40) */
  SECTOR_CONTROL: 5,
  /** Per successful trade (both parties earn points) */
  TRADE: 2,
  /** Per auction won */
  AUCTION_WIN: 2,
  /** Maximum number of sectors for sector control bonus */
  MAX_SECTORS: 8,
  /** Maximum multiplier for playing against higher-ranked opponents */
  MAX_HIGHER_RANK_MULTIPLIER: 1.5,
} as const;

/**
 * Determine the rank tier and title for a given cumulative point total.
 * Returns the highest tier whose threshold is met.
 */
export function getRankForPoints(points: number): {
  tier: number;
  title: string;
} {
  let result: { tier: number; title: string } = {
    tier: RANK_THRESHOLDS[0].tier,
    title: RANK_THRESHOLDS[0].title,
  };
  for (const threshold of RANK_THRESHOLDS) {
    if (points >= threshold.pointsRequired) {
      result = { tier: threshold.tier, title: threshold.title };
    }
  }
  return result;
}

/**
 * Calculate total rank points earned from a single game.
 */
export function calculateGameRankPoints(params: {
  completed: boolean;
  won: boolean;
  sectorsControlled: number;
  tradesCompleted: number;
  auctionsWon: number;
  achievementPoints: number;
}): number {
  let total = 0;
  if (params.completed) {
    total += RANK_POINT_RULES.GAME_COMPLETION;
  }
  if (params.won) {
    total += RANK_POINT_RULES.GAME_WIN;
  }
  const sectorBonus =
    Math.min(params.sectorsControlled, RANK_POINT_RULES.MAX_SECTORS) *
    RANK_POINT_RULES.SECTOR_CONTROL;
  total += sectorBonus;
  total += params.tradesCompleted * RANK_POINT_RULES.TRADE;
  total += params.auctionsWon * RANK_POINT_RULES.AUCTION_WIN;
  total += params.achievementPoints;
  return total;
}

/**
 * Apply bonus multiplier for playing against higher-ranked opponents.
 * The multiplier scales linearly between 1.0 and MAX_HIGHER_RANK_MULTIPLIER
 * based on the tier difference. Returns floored integer.
 */
export function applyHigherRankBonus(
  basePoints: number,
  highestOpponentTier: number,
  playerTier: number,
): number {
  if (highestOpponentTier <= playerTier) {
    return basePoints;
  }
  const tierDiff = highestOpponentTier - playerTier;
  // Scale: each tier difference adds 0.125 to multiplier, capped at 1.5
  const multiplier = Math.min(
    1 + tierDiff * 0.125,
    RANK_POINT_RULES.MAX_HIGHER_RANK_MULTIPLIER,
  );
  return Math.floor(basePoints * multiplier);
}
