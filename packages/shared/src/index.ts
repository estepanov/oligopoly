export type {
  HealthResponse,
  ProfileVisibility,
  UpdateUserSettingsInput,
  VisibilitySetting,
} from "@oligopoly/validation";
export {
  HealthResponseSchema,
  NegotiationErrorKeys,
  ProfileVisibilitySchema,
  UpdateUserSettingsInputSchema,
  VisibilitySettingSchema,
} from "@oligopoly/validation";
export { serializeProfileForAudience } from "./profile/serializeProfileForAudience.js";
export type {
  AchievementUnlock,
  CareerStats,
  FullUserProfile,
  GameResult,
  NotificationPrefs,
  OnlineStatus,
  PrivateUserProfile,
  PublicUserProfile,
  RecentGameSummary,
  ViewerContext,
  ViewerUserProfile,
} from "./profile/types.js";

export const DEFAULT_PROFILE_VISIBILITY = {
  rank: "public" as const,
  careerStats: "public" as const,
  achievements: "public" as const,
  recentGames: "public" as const,
  onlineStatus: "authenticated" as const,
  lastSeen: "authenticated" as const,
  favoriteSector: "public" as const,
};

export const TRUSTWORTHINESS_DEFAULT = 7;
export const TRUSTWORTHINESS_MIN = 0;
export const TRUSTWORTHINESS_MAX = 10;
export const TRUSTWORTHINESS_BINDING_THRESHOLD = 5;
export const HANDSHAKE_BREACH_PENALTY = -2;
export const THREAD_EXPIRY_PENALTY = -1;
export const NEGOTIATION_THREAD_DURATION = 3;

export function clampTrustworthiness(score: number): number {
  return Math.max(TRUSTWORTHINESS_MIN, Math.min(TRUSTWORTHINESS_MAX, score));
}

export function canCreateBindingContract(trustScore: number): boolean {
  return trustScore >= TRUSTWORTHINESS_BINDING_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Config registries
// ---------------------------------------------------------------------------
export { ACHIEVEMENTS_REGISTRY } from "./config/achievements.js";
export type { AffinityCard } from "./config/affinityCards.js";
export {
  AFFINITY_CARD_IDS,
  AFFINITY_CARDS,
} from "./config/affinityCards.js";
export type {
  BoardTile,
  Sector,
  SectorId,
  TileType,
} from "./config/board.js";
export {
  ALL_TILES,
  CORNER_POSITIONS,
  DIAGONAL_SIZE,
  DIAGONAL_TILES,
  DISRUPTION_CARD_POSITIONS,
  getDiagonalTile,
  getPerimeterTile,
  getTileByPosition,
  getTilesBySector,
  MARKET_EVENT_POSITIONS,
  PERIMETER_SIZE,
  PERIMETER_TILES,
  SECTOR_HUB_POSITIONS,
  SECTORS,
  TOTAL_BOARD_MARKET_VALUE,
  UTILITY_POSITIONS,
} from "./config/board.js";
export type { DisruptionCard } from "./config/disruptionDeck.js";
export {
  DISRUPTION_DECK,
  DISRUPTION_DECK_IDS,
} from "./config/disruptionDeck.js";
export { OPTIONAL_MARKET_EVENT_CARDS_REGISTRY } from "./config/marketEventCards.js";
export type {
  MarketEventCard,
  MarketEventCategory,
} from "./config/marketEventDeck.js";
export {
  MARKET_EVENT_DECK,
  MARKET_EVENT_DECK_IDS,
} from "./config/marketEventDeck.js";
export { OPTIONAL_RULES_REGISTRY } from "./config/optionalRules.js";
export type { RankThreshold } from "./config/ranks.js";
export {
  applyHigherRankBonus,
  calculateGameRankPoints,
  getRankForPoints,
  RANK_POINT_RULES,
  RANK_THRESHOLDS,
} from "./config/ranks.js";

// ---------------------------------------------------------------------------
// Engine — negotiation, charter, trustworthiness
// ---------------------------------------------------------------------------
export {
  validateContributionWeights,
  validateRevenueSplit,
} from "./engine/charter.js";
export type {
  ContributionInput,
  ContributionResult,
} from "./engine/contributionScore.js";
export {
  calculateContributionScores,
  DEFAULT_CONTRIBUTION_WEIGHTS,
} from "./engine/contributionScore.js";
export {
  BOARD_SIZE,
  DIAGONAL_ENTRY_POSITION,
  DIAGONAL_EXIT_POSITION,
  isDiagonalChoice,
  isDoubles,
  isPerimeterChoice,
  moveOnPerimeter,
  rollDice,
  rollPathChoiceDie,
  TRIPLE_DOUBLES_LIMIT,
} from "./engine/dice.js";
export {
  calculateAbsorptionPrice,
  calculateMortgageValue,
  calculateRedemptionCost,
  FORECLOSURE_RESERVE,
  MORTGAGE_RATE,
  PROPTECH_REDEMPTION_RATE,
  REDEMPTION_RATE,
} from "./engine/mortgage.js";
export {
  calcThreadExpiry,
  isActionBlockedByContracts,
  isThreadExpired,
  validateContractTerms,
  validateContractTileOwnership,
} from "./engine/negotiation.js";
// ---------------------------------------------------------------------------
// Engine — rent, mortgage, setup, win conditions, contribution, dice
// ---------------------------------------------------------------------------
export {
  calculateDevelopmentCost,
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
  HUB_RENT,
  MAX_DEVELOPMENT_TOKENS,
  RATE_CARD_MAX,
  RATE_CARD_MIN,
  RENT_MULTIPLIERS,
  UTILITY_RENT_MULTIPLIER,
} from "./engine/rent.js";
export {
  ACTION_COSTS,
  ACTION_POINTS_PER_TURN,
  CORPORATE_TAX_I,
  CORPORATE_TAX_II,
  DIAGONAL_TRAVERSE_BONUS,
  FLASH_CRASH_LOSS_PCT,
  FLASH_CRASH_WINDFALL_PCT,
  FREE_MARKET_MINIMUM,
  GOVERNMENT_GRANT,
  getStartingCapital,
  MAX_ABSORPTION_PER_PLAYER,
  PASS_START_BONUS,
  SPEED_MARKET_MULTIPLIER,
  STARTING_CAPITAL,
} from "./engine/setup.js";
export type { TrustworthinessRestrictions } from "./engine/trustworthiness.js";
export {
  applyHandshakeBreach,
  applyThreadExpiry,
  getTrustworthinessRestrictions,
} from "./engine/trustworthiness.js";
export type { BindingContract, BindingContractTerm } from "./engine/types.js";
export {
  checkSoloWin,
  checkSyndicateWin,
  SOLO_WIN_THRESHOLD,
  SYNDICATE_WIN_THRESHOLD,
} from "./engine/winCondition.js";
