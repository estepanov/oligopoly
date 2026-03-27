import { NegotiationErrorKeys } from "@oligopoly/validation";

export function validateRevenueSplit(
  split: Array<{ playerId: string; pct: number }>,
): { valid: boolean; errorKey?: string } {
  const total = split.reduce((sum, entry) => sum + entry.pct, 0);
  if (total !== 100) {
    return {
      valid: false,
      errorKey: NegotiationErrorKeys.CHARTER_INVALID_SPLIT,
    };
  }
  return { valid: true };
}

export function validateContributionWeights(weights: {
  assetScorePct: number;
  revenueScorePct: number;
  negotiationCreditPct: number;
}): { valid: boolean; errorKey?: string } {
  const total =
    weights.assetScorePct +
    weights.revenueScorePct +
    weights.negotiationCreditPct;
  if (total !== 100) {
    return {
      valid: false,
      errorKey: NegotiationErrorKeys.CHARTER_INVALID_WEIGHTS,
    };
  }
  return { valid: true };
}
