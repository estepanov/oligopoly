// ---------------------------------------------------------------------------
// Game Setup Constants & Helpers
// Starting capital, special tile payments, action points, and related values.
// ---------------------------------------------------------------------------

/** Starting capital by player count */
export const STARTING_CAPITAL: Record<number, number> = {
  2: 1500,
  3: 1500,
  4: 1200,
  5: 1200,
  6: 1000,
} as const;

/** Speed Market optional rule: +30% starting capital */
export const SPEED_MARKET_MULTIPLIER = 1.3;

/** Action points available per turn */
export const ACTION_POINTS_PER_TURN = 2;

/** Capital collected when passing or landing on START */
export const PASS_START_BONUS = 200;

/** Minimum Free Market pool payout (from bank if pool is empty) */
export const FREE_MARKET_MINIMUM = 100;

/** Corporate Tax I payment (into Free Market pool) */
export const CORPORATE_TAX_I = 75;

/** Corporate Tax II payment (into Free Market pool) */
export const CORPORATE_TAX_II = 100;

/** Government Grant payout (from bank) */
export const GOVERNMENT_GRANT = 100;

/** Flash Crash: everyone loses this percentage of current Capital */
export const FLASH_CRASH_LOSS_PCT = 0.05;

/** Flash Crash: landing player collects this percentage of total losses */
export const FLASH_CRASH_WINDFALL_PCT = 0.1;

/** Last Mile Logistics affinity: diagonal traverse bonus */
export const DIAGONAL_TRAVERSE_BONUS = 30;

/** Action point costs for various actions */
export const ACTION_COSTS = {
  DEVELOP_TILE: 2,
  INITIATE_NEGOTIATION: 1,
  CALL_SYNDICATE_VOTE: 1,
  INITIATE_AUCTION: 1,
  FORM_SYNDICATE: 1,
} as const;

/** Maximum tiles absorbed per losing player after a syndicate win */
export const MAX_ABSORPTION_PER_PLAYER = 3;

/**
 * Get starting capital for a given player count.
 *
 * @param playerCount - Number of players (2–6)
 * @param speedMarketEnabled - Whether the Speed Market optional rule is active
 * @returns Starting capital per player
 */
export function getStartingCapital(
  playerCount: number,
  speedMarketEnabled?: boolean,
): number {
  const base = STARTING_CAPITAL[playerCount];
  if (base === undefined) {
    // Fallback: clamp to valid range
    if (playerCount <= 3) return speedMarketEnabled ? Math.floor(1500 * SPEED_MARKET_MULTIPLIER) : 1500;
    if (playerCount <= 5) return speedMarketEnabled ? Math.floor(1200 * SPEED_MARKET_MULTIPLIER) : 1200;
    return speedMarketEnabled ? Math.floor(1000 * SPEED_MARKET_MULTIPLIER) : 1000;
  }
  if (speedMarketEnabled) {
    return Math.floor(base * SPEED_MARKET_MULTIPLIER);
  }
  return base;
}
