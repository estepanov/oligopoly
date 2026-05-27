import type { InternalGameState } from "./gameStateTypes.js";

export function activeUtilityRentMultiplier(
  state: InternalGameState,
): number | null {
  const modifiers = state.marketEventModifiers;
  if (
    modifiers?.utilityRentMultiplier &&
    modifiers.utilityRentMultiplierUntilRound !== undefined &&
    state.round <= modifiers.utilityRentMultiplierUntilRound
  ) {
    return modifiers.utilityRentMultiplier;
  }
  return null;
}

export function syntheticCdoMortgageBoostActive(
  state: InternalGameState,
): boolean {
  return state.marketEventModifiers?.syntheticCdoMortgageRound === state.round;
}
