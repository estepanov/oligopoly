// ---------------------------------------------------------------------------
// Win Condition Checking
// Syndicate win (60%) and solo win (35%) threshold checks.
// ---------------------------------------------------------------------------

/** Syndicate must control ≥ 60% of total market value */
export const SYNDICATE_WIN_THRESHOLD = 0.6;

/** Solo player must control ≥ 35% of total market value */
export const SOLO_WIN_THRESHOLD = 0.35;

/**
 * Check if a syndicate has crossed the win threshold.
 *
 * @param syndicateMarketValue - Sum of acquisition costs of tiles owned by syndicate
 * @param totalMarketValue - Total board market value (sum of all tile costs)
 * @returns true if the syndicate has won
 */
export function checkSyndicateWin(
  syndicateMarketValue: number,
  totalMarketValue: number,
): boolean {
  if (totalMarketValue <= 0) return false;
  return syndicateMarketValue / totalMarketValue >= SYNDICATE_WIN_THRESHOLD;
}

/**
 * Check if a solo player has crossed the win threshold.
 *
 * @param playerMarketValue - Sum of acquisition costs of tiles owned by the player
 * @param totalMarketValue - Total board market value (sum of all tile costs)
 * @returns true if the player has won solo
 */
export function checkSoloWin(
  playerMarketValue: number,
  totalMarketValue: number,
): boolean {
  if (totalMarketValue <= 0) return false;
  return playerMarketValue / totalMarketValue >= SOLO_WIN_THRESHOLD;
}
