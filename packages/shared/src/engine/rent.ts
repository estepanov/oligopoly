// ---------------------------------------------------------------------------
// Rent Calculation Engine
// Implements all rent formulas from the game rules.
// ---------------------------------------------------------------------------

/** Maximum number of development tokens per tile */
export const MAX_DEVELOPMENT_TOKENS = 4;

/** Rent multipliers for development tokens */
export const RENT_MULTIPLIERS = {
  /** Sector control with no development tokens: 2× base rent */
  SECTOR_CONTROL: 2,
  /** 1 development token: 5× base rent */
  DEV_1: 5,
  /** 2 development tokens: 10× base rent */
  DEV_2: 10,
  /** 3 development tokens: 15× base rent */
  DEV_3: 15,
  /** 4 development tokens: 20× base rent */
  DEV_4: 20,
} as const;

/** Hub rent lookup by number of hubs controlled */
export const HUB_RENT: Record<number, number> = {
  1: 25,
  2: 50,
  3: 100,
  4: 200,
} as const;

/** Utility rent multiplier by number of utilities controlled */
export const UTILITY_RENT_MULTIPLIER: Record<number, number> = {
  1: 6,
  2: 15,
} as const;

/** Rate Card bounds */
export const RATE_CARD_MIN = 0.5;
export const RATE_CARD_MAX = 2.0;
export const RATE_CARD_STEP = 0.05;

/**
 * Calculate rent for a sector tile.
 *
 * @param baseRent - The tile's base rent
 * @param developmentTokens - Number of development tokens on the tile (0–4)
 * @param hasSectorControl - Whether the owner controls the entire sector
 * @param rateCardMultiplier - Optional Rate Card multiplier (0.5–2.0); only applies when set
 * @returns The rent amount owed
 */
export function calculateSectorTileRent(
  baseRent: number,
  developmentTokens: number,
  hasSectorControl: boolean,
  rateCardMultiplier?: number,
  sectorControlMultiplier?: number,
): number {
  let multiplier: number;

  if (developmentTokens >= 4) {
    multiplier = RENT_MULTIPLIERS.DEV_4;
  } else if (developmentTokens === 3) {
    multiplier = RENT_MULTIPLIERS.DEV_3;
  } else if (developmentTokens === 2) {
    multiplier = RENT_MULTIPLIERS.DEV_2;
  } else if (developmentTokens === 1) {
    multiplier = RENT_MULTIPLIERS.DEV_1;
  } else if (hasSectorControl) {
    multiplier = sectorControlMultiplier ?? RENT_MULTIPLIERS.SECTOR_CONTROL;
  } else {
    multiplier = 1;
  }

  let rent = baseRent * multiplier;

  if (rateCardMultiplier !== undefined) {
    const clamped = Math.max(
      RATE_CARD_MIN,
      Math.min(RATE_CARD_MAX, rateCardMultiplier),
    );
    rent = Math.floor(rent * clamped);
  }

  return rent;
}

/**
 * Calculate rent for a Sector Hub tile.
 *
 * @param hubsControlled - Number of hubs owned by the player/syndicate (1–4)
 * @returns The rent amount, or 0 if invalid
 */
export function calculateHubRent(hubsControlled: number): number {
  return HUB_RENT[hubsControlled] ?? 0;
}

/**
 * Calculate rent for a Utility tile.
 *
 * @param utilitiesControlled - Number of utilities owned (1 or 2)
 * @param diceRoll - The visiting player's dice roll total
 * @returns The rent amount, or 0 if invalid
 */
export function calculateUtilityRent(
  utilitiesControlled: number,
  diceRoll: number,
): number {
  const multiplier = UTILITY_RENT_MULTIPLIER[utilitiesControlled];
  if (multiplier === undefined) return 0;
  return multiplier * diceRoll;
}

/**
 * Calculate the cost to add a development token to a tile.
 *
 * First token costs face value; each subsequent token costs floor(1.5 × face value).
 *
 * @param tileCost - The tile's acquisition cost
 * @param tokenNumber - Which token is being added (1–4)
 * @param hasLeanManufacturing - Whether the owner has the Lean Manufacturing affinity (20% discount)
 * @returns The development cost
 */
export function calculateDevelopmentCost(
  tileCost: number,
  tokenNumber: number,
  hasLeanManufacturing?: boolean,
): number {
  let cost: number;
  if (tokenNumber <= 1) {
    cost = tileCost;
  } else {
    cost = Math.floor(tileCost * 1.5);
  }
  if (hasLeanManufacturing) {
    cost = Math.floor(cost * 0.8);
  }
  return cost;
}
