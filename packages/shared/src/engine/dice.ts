// ---------------------------------------------------------------------------
// Dice & Movement Helpers
// Core dice rolling and path choice logic for the game engine.
// ---------------------------------------------------------------------------

/** Three consecutive doubles sends a player to the Regulation Zone */
export const TRIPLE_DOUBLES_LIMIT = 3;

/** Diagonal path starts at corner 0 (START) */
export const DIAGONAL_ENTRY_POSITION = 0;

/** Diagonal path ends at corner 20 (FREE MARKET) */
export const DIAGONAL_EXIT_POSITION = 20;

/** Perimeter board size */
export const BOARD_SIZE = 40;

/** Uniform 1–6 via crypto rejection sampling (252 = 42×6; reject ≥252). */
export function rollFairD6(): number {
  const bytes = new Uint8Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= 252);
  return (bytes[0] % 6) + 1;
}

/** Two crypto-fair d6 — the server-authoritative roll. */
export function rollFairDice(): [number, number] {
  return [rollFairD6(), rollFairD6()];
}

/**
 * Two d6 via `Math.random`. NON-authoritative and not uniform-guaranteed —
 * intended only for tests/tooling. Server-authoritative dice use
 * `rollFairDice` (crypto); see `lib/dice.ts` in the worker.
 */
export function rollDice(): [number, number] {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return [die1, die2];
}

/**
 * Check if a dice roll is doubles (both dice show the same value).
 */
export function isDoubles(roll: [number, number]): boolean {
  return roll[0] === roll[1];
}

/**
 * Roll a single six-sided die for path choice at corner 0.
 * Odd = perimeter, Even = diagonal.
 *
 * Uses the crypto-backed `rollFairD6` so all server-authoritative dice share
 * one RNG tier (the dice authority boundary in the worker relies on this).
 */
export function rollPathChoiceDie(): number {
  return rollFairD6();
}

/**
 * Check if a path choice die roll selects the perimeter path.
 * Odd results (1, 3, 5) select the perimeter.
 */
export function isPerimeterChoice(roll: number): boolean {
  return roll % 2 !== 0;
}

/**
 * Check if a path choice die roll selects the diagonal path.
 * Even results (2, 4, 6) select the diagonal.
 */
export function isDiagonalChoice(roll: number): boolean {
  return roll % 2 === 0;
}

/**
 * Calculate the new position after moving on the perimeter track.
 * Handles wrapping around the 40-tile board.
 *
 * @param currentPosition - Current position (0–39)
 * @param spaces - Number of spaces to move
 * @returns Object with new position and whether START was passed
 */
export function moveOnPerimeter(
  currentPosition: number,
  spaces: number,
): { newPosition: number; passedStart: boolean } {
  const newPosition = (currentPosition + spaces) % BOARD_SIZE;
  const passedStart = currentPosition + spaces >= BOARD_SIZE;
  return { newPosition, passedStart };
}
