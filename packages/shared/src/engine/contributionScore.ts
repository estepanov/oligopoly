// ---------------------------------------------------------------------------
// Contribution Score Calculator
// Computes each syndicate member's share of the collective payout using
// a weighted composite of asset score, revenue score, and negotiation credit.
// ---------------------------------------------------------------------------

/** Default contribution weights (must sum to 100) */
export const DEFAULT_CONTRIBUTION_WEIGHTS = {
  assetScorePct: 35,
  revenueScorePct: 35,
  negotiationCreditPct: 30,
} as const;

export interface ContributionInput {
  playerId: string;
  /** Player's share of syndicate total tile acquisition cost (0–1) */
  tileAcquisitionCostShare: number;
  /** Player's share of syndicate total rent collected (0–1) */
  rentCollectedShare: number;
  /** Player's share of syndicate total deal value (0–1) */
  dealValueShare: number;
}

export interface ContributionResult {
  playerId: string;
  /** Raw (un-normalized) score */
  rawScore: number;
  /** Normalized percentage (all members sum to exactly 100) */
  percentage: number;
}

/**
 * Calculate contribution scores for all syndicate members.
 *
 * Uses the formula:
 *   ContribScore(player) = assetWeight × tileShare + revenueWeight × rentShare + negoWeight × dealShare
 *
 * Scores are normalized so all members sum to exactly 100%.
 * Uses floor rounding on all but the highest scorer, who receives the remainder.
 *
 * @param members - Array of contribution inputs (one per syndicate member)
 * @param weights - Optional custom contribution weights (must sum to 100)
 * @returns Array of contribution results with normalized percentages
 */
export function calculateContributionScores(
  members: ContributionInput[],
  weights?: {
    assetScorePct: number;
    revenueScorePct: number;
    negotiationCreditPct: number;
  },
): ContributionResult[] {
  if (members.length === 0) return [];

  const w = weights ?? DEFAULT_CONTRIBUTION_WEIGHTS;
  const assetWeight = w.assetScorePct / 100;
  const revenueWeight = w.revenueScorePct / 100;
  const negoWeight = w.negotiationCreditPct / 100;

  // Calculate raw scores
  const rawResults: { playerId: string; rawScore: number }[] = members.map(
    (m) => ({
      playerId: m.playerId,
      rawScore:
        assetWeight * m.tileAcquisitionCostShare +
        revenueWeight * m.rentCollectedShare +
        negoWeight * m.dealValueShare,
    }),
  );

  const totalRaw = rawResults.reduce((sum, r) => sum + r.rawScore, 0);

  if (totalRaw === 0) {
    // Equal split if no one contributed
    const equalPct = Math.floor(100 / members.length);
    const remainder = 100 - equalPct * members.length;
    return rawResults.map((r, i) => ({
      playerId: r.playerId,
      rawScore: 0,
      percentage: equalPct + (i === 0 ? remainder : 0),
    }));
  }

  // Calculate raw percentages and apply floor rounding
  const rawPercentages = rawResults.map((r) => ({
    playerId: r.playerId,
    rawScore: r.rawScore,
    rawPct: (r.rawScore / totalRaw) * 100,
  }));

  // Find the highest scorer (by raw percentage, first one in case of ties)
  let highestIdx = 0;
  let highestPct = rawPercentages[0].rawPct;
  for (let i = 1; i < rawPercentages.length; i++) {
    if (rawPercentages[i].rawPct > highestPct) {
      highestPct = rawPercentages[i].rawPct;
      highestIdx = i;
    }
  }

  // Floor all except highest scorer
  const floored = rawPercentages.map((r, i) => ({
    playerId: r.playerId,
    rawScore: r.rawScore,
    percentage: i === highestIdx ? 0 : Math.floor(r.rawPct),
  }));

  // Highest scorer gets the remainder
  const othersTotal = floored.reduce(
    (sum, r, i) => (i === highestIdx ? sum : sum + r.percentage),
    0,
  );
  floored[highestIdx].percentage = 100 - othersTotal;

  return floored;
}
