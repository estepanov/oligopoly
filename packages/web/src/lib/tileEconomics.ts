import {
  AFFINITY_IDS,
  type AffinityContext,
  calculateDevelopmentCost,
  calculateMortgageValue,
  calculateRedemptionCost,
  getTileByPosition,
  hasPlayerAffinity,
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
  effectiveAffinityContext,
  isTileDevelopableByPlayer,
  playerById,
  tileStateByPosition,
} from "./gameUi";

export function getTileEconomics(
  state: GameState,
  playerId: string | null,
  position: number | string,
  viewerPlayerId: string | null = playerId,
) {
  const boardTile = getTileByPosition(position);
  const tileState = tileStateByPosition(state, position);
  const player = playerId ? playerById(state, playerId) : undefined;
  const ownerId = tileState?.ownerId ?? null;
  const isMine = Boolean(playerId && ownerId === playerId);
  const affinityCtx: AffinityContext =
    ownerId !== null
      ? effectiveAffinityContext(state, ownerId, viewerPlayerId)
      : {};
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
    isMine &&
    ownerId !== null &&
    hasPlayerAffinity(affinityCtx, ownerId, AFFINITY_IDS.lean_manufacturing);
  const hasPropTechDiscount =
    isMine &&
    ownerId !== null &&
    hasPlayerAffinity(affinityCtx, ownerId, AFFINITY_IDS.proptech_pioneer);
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

export function mortgageEconomicsLabels(economics: {
  mortgaged: boolean;
  formattedStoredMortgageValue: string | null;
  formattedAvailableMortgageValue: string | null;
}): { label: string; formattedValue: string | null } {
  return {
    label: economics.mortgaged ? "Stored mortgage value" : "Mortgage gain",
    formattedValue: economics.mortgaged
      ? economics.formattedStoredMortgageValue
      : economics.formattedAvailableMortgageValue,
  };
}

export type TileEconomics = ReturnType<typeof getTileEconomics>;
