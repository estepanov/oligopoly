import {
  AFFINITY_IDS,
  calculateDevelopmentCost,
  calculateMortgageValue,
  calculateRedemptionCost,
  getTileByPosition,
  MAX_DEVELOPMENT_TOKENS,
  MORTGAGE_RATE,
  PROPTECH_REDEMPTION_RATE,
  REDEMPTION_RATE,
} from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { formatCurrencyAmount } from "./gameDisplay";
import {
  canMortgageTile,
  canRedeemTile,
  isTileDevelopableByPlayer,
  playerById,
} from "./gameUi";

function tileStateByPosition(
  state: GameState,
  position: number | string,
): NonNullable<GameState["tiles"]>[number] | undefined {
  return state.tiles?.find(
    (tile) => String(tile.position) === String(position),
  );
}

export function getTileEconomics(
  state: GameState,
  playerId: string | null,
  position: number | string,
) {
  const boardTile = getTileByPosition(position);
  const tileState = tileStateByPosition(state, position);
  const player = playerId ? playerById(state, playerId) : undefined;
  const ownerId = tileState?.ownerId ?? null;
  const isMine = Boolean(playerId && ownerId === playerId);
  const tileCost = boardTile?.cost ?? null;
  const developmentTokens = tileState?.developmentTokens ?? 0;
  const nextDevelopmentToken = developmentTokens + 1;
  const mortgaged = tileState?.mortgaged ?? false;
  const syntheticCdoActive =
    state.marketEventModifiers?.syntheticCdoMortgageRound === state.round;
  const availableMortgageRate = syntheticCdoActive ? 0.6 : MORTGAGE_RATE;
  const storedMortgageRate = tileState?.mortgageRate ?? MORTGAGE_RATE;
  const storedMortgageValue =
    tileCost !== null && mortgaged
      ? Math.floor(tileCost * storedMortgageRate)
      : null;
  const hasLeanDiscount =
    isMine && state.myAffinityCardId === AFFINITY_IDS.lean_manufacturing;
  const hasPropTechDiscount =
    isMine && state.myAffinityCardId === AFFINITY_IDS.proptech_pioneer;
  const isDevelopableTile =
    boardTile?.type === "sector_tile" &&
    !mortgaged &&
    nextDevelopmentToken <= MAX_DEVELOPMENT_TOKENS;
  const developmentCost =
    tileCost !== null && isDevelopableTile
      ? calculateDevelopmentCost(
          tileCost,
          nextDevelopmentToken,
          hasLeanDiscount,
        )
      : null;
  const availableMortgageValue =
    tileCost !== null
      ? calculateMortgageValue(tileCost, syntheticCdoActive)
      : null;
  const standardMortgageValue =
    tileCost !== null ? calculateMortgageValue(tileCost, false) : null;
  const redemptionCost =
    tileCost !== null && mortgaged
      ? calculateRedemptionCost(
          tileCost,
          hasPropTechDiscount,
          storedMortgageRate,
        )
      : null;
  const canDevelop = Boolean(
    playerId &&
      developmentCost !== null &&
      isTileDevelopableByPlayer(state, playerId, position) &&
      (player?.capital ?? 0) >= developmentCost,
  );
  const canMortgage = Boolean(
    playerId &&
      availableMortgageValue !== null &&
      canMortgageTile(state, playerId, position),
  );
  const canRedeem = Boolean(
    playerId &&
      redemptionCost !== null &&
      canRedeemTile(state, playerId, position) &&
      (player?.capital ?? 0) >= redemptionCost,
  );
  const currencySettings = state.settings;

  return {
    boardTile,
    tileState,
    tileCost,
    formattedTileCost:
      tileCost !== null
        ? formatCurrencyAmount(tileCost, currencySettings)
        : null,
    developmentTokens,
    nextDevelopmentToken,
    developmentCost,
    formattedDevelopmentCost:
      developmentCost !== null
        ? formatCurrencyAmount(developmentCost, currencySettings)
        : null,
    canDevelop,
    availableMortgageValue,
    formattedAvailableMortgageValue:
      availableMortgageValue !== null
        ? formatCurrencyAmount(availableMortgageValue, currencySettings)
        : null,
    storedMortgageValue,
    formattedStoredMortgageValue:
      storedMortgageValue !== null
        ? formatCurrencyAmount(storedMortgageValue, currencySettings)
        : null,
    mortgageValue: availableMortgageValue,
    formattedMortgageValue:
      availableMortgageValue !== null
        ? formatCurrencyAmount(availableMortgageValue, currencySettings)
        : null,
    standardMortgageValue,
    formattedStandardMortgageValue:
      standardMortgageValue !== null
        ? formatCurrencyAmount(standardMortgageValue, currencySettings)
        : null,
    canMortgage,
    mortgaged,
    availableMortgageRate,
    storedMortgageRate,
    mortgageRate: availableMortgageRate,
    redemptionRate: hasPropTechDiscount
      ? PROPTECH_REDEMPTION_RATE
      : REDEMPTION_RATE,
    redemptionCost,
    formattedRedemptionCost:
      redemptionCost !== null
        ? formatCurrencyAmount(redemptionCost, currencySettings)
        : null,
    canRedeem,
    syntheticCdoActive,
    hasLeanDiscount,
    hasPropTechDiscount,
    maxDevelopmentTokens: MAX_DEVELOPMENT_TOKENS,
  };
}
