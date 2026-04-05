// ---------------------------------------------------------------------------
// Mortgage Engine
// Mortgage value and redemption cost calculations.
// ---------------------------------------------------------------------------

/** Mortgage yields 50% of acquisition cost */
export const MORTGAGE_RATE = 0.5;

/** Standard redemption rate: 110% of mortgage value */
export const REDEMPTION_RATE = 1.1;

/** PropTech Pioneer affinity redemption rate: 105% of mortgage value */
export const PROPTECH_REDEMPTION_RATE = 1.05;

/** Minimum reserve price for foreclosure auctions */
export const FORECLOSURE_RESERVE = 1;

/**
 * Calculate the capital received when mortgaging a tile.
 * Returns floor(cost × 0.5).
 *
 * @param tileCost - The tile's original acquisition cost
 * @returns The mortgage value (Capital received)
 */
export function calculateMortgageValue(tileCost: number): number {
  return Math.floor(tileCost * MORTGAGE_RATE);
}

/**
 * Calculate the cost to redeem (un-mortgage) a tile.
 * Returns ceil(mortgageValue × rate), with floating-point epsilon handling.
 *
 * Standard rate: 110% of mortgage value (55% of acquisition cost).
 * PropTech Pioneer affinity: 105% of mortgage value.
 *
 * @param tileCost - The tile's original acquisition cost
 * @param hasPropTechAffinity - Whether the owner has the PropTech Pioneer affinity card
 * @returns The redemption cost (Capital to pay)
 */
export function calculateRedemptionCost(
  tileCost: number,
  hasPropTechAffinity?: boolean,
): number {
  const mortgageValue = calculateMortgageValue(tileCost);
  const rate = hasPropTechAffinity ? PROPTECH_REDEMPTION_RATE : REDEMPTION_RATE;
  const raw = mortgageValue * rate;
  // Handle floating-point: if the value is within epsilon of an integer, round to that integer
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) < 1e-9) {
    return rounded;
  }
  return Math.ceil(raw);
}

/**
 * Calculate the absorption price for a tile acquired by the winning syndicate.
 * Returns floor(tileCost × 0.6).
 *
 * @param tileCost - The tile's original acquisition cost
 * @returns The absorption price
 */
export function calculateAbsorptionPrice(tileCost: number): number {
  return Math.floor(tileCost * 0.6);
}
