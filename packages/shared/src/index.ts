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
export { OPTIONAL_MARKET_EVENT_CARDS_REGISTRY } from "./config/marketEventCards.js";
export { OPTIONAL_RULES_REGISTRY } from "./config/optionalRules.js";
export {
  ALL_TILES,
  CORNER_POSITIONS,
  DIAGONAL_TILES,
  DISRUPTION_CARD_POSITIONS,
  MARKET_EVENT_POSITIONS,
  PERIMETER_SIZE,
  DIAGONAL_SIZE,
  PERIMETER_TILES,
  SECTOR_HUB_POSITIONS,
  SECTORS,
  TOTAL_BOARD_MARKET_VALUE,
  UTILITY_POSITIONS,
  getDiagonalTile,
  getPerimeterTile,
  getTileByPosition,
  getTilesBySector,
} from "./config/board.js";
export type {
  BoardTile,
  Sector,
  SectorId,
  TileType,
} from "./config/board.js";
export {
  MARKET_EVENT_DECK,
  MARKET_EVENT_DECK_IDS,
} from "./config/marketEventDeck.js";
export type { MarketEventCard, MarketEventCategory } from "./config/marketEventDeck.js";
export {
  DISRUPTION_DECK,
  DISRUPTION_DECK_IDS,
} from "./config/disruptionDeck.js";
export type { DisruptionCard } from "./config/disruptionDeck.js";
export {
  AFFINITY_CARDS,
  AFFINITY_CARD_IDS,
} from "./config/affinityCards.js";
export type { AffinityCard } from "./config/affinityCards.js";
export {
  RANK_THRESHOLDS,
  RANK_POINT_RULES,
  getRankForPoints,
  calculateGameRankPoints,
  applyHigherRankBonus,
} from "./config/ranks.js";
export type { RankThreshold } from "./config/ranks.js";

// ---------------------------------------------------------------------------
// Engine — negotiation, charter, trustworthiness
// ---------------------------------------------------------------------------
export {
  validateContributionWeights,
  validateRevenueSplit,
} from "./engine/charter.js";
export {
  calcThreadExpiry,
  isActionBlockedByContracts,
  isThreadExpired,
  validateContractTerms,
  validateContractTileOwnership,
} from "./engine/negotiation.js";
export type { TrustworthinessRestrictions } from "./engine/trustworthiness.js";
export {
  applyHandshakeBreach,
  applyThreadExpiry,
  getTrustworthinessRestrictions,
} from "./engine/trustworthiness.js";
export type { BindingContract, BindingContractTerm } from "./engine/types.js";

// ---------------------------------------------------------------------------
// Engine — rent, mortgage, setup, win conditions, contribution, dice
// ---------------------------------------------------------------------------
export {
  calculateSectorTileRent,
  calculateHubRent,
  calculateUtilityRent,
  calculateDevelopmentCost,
  MAX_DEVELOPMENT_TOKENS,
  RENT_MULTIPLIERS,
  HUB_RENT,
  UTILITY_RENT_MULTIPLIER,
  RATE_CARD_MIN,
  RATE_CARD_MAX,
} from "./engine/rent.js";
export {
  calculateMortgageValue,
  calculateRedemptionCost,
  calculateAbsorptionPrice,
  MORTGAGE_RATE,
  REDEMPTION_RATE,
  PROPTECH_REDEMPTION_RATE,
  FORECLOSURE_RESERVE,
} from "./engine/mortgage.js";
export {
  getStartingCapital,
  STARTING_CAPITAL,
  SPEED_MARKET_MULTIPLIER,
  ACTION_POINTS_PER_TURN,
  PASS_START_BONUS,
  FREE_MARKET_MINIMUM,
  CORPORATE_TAX_I,
  CORPORATE_TAX_II,
  GOVERNMENT_GRANT,
  FLASH_CRASH_LOSS_PCT,
  FLASH_CRASH_WINDFALL_PCT,
  DIAGONAL_TRAVERSE_BONUS,
  ACTION_COSTS,
  MAX_ABSORPTION_PER_PLAYER,
} from "./engine/setup.js";
export {
  checkSyndicateWin,
  checkSoloWin,
  SYNDICATE_WIN_THRESHOLD,
  SOLO_WIN_THRESHOLD,
} from "./engine/winCondition.js";
export {
  calculateContributionScores,
  DEFAULT_CONTRIBUTION_WEIGHTS,
} from "./engine/contributionScore.js";
export type {
  ContributionInput,
  ContributionResult,
} from "./engine/contributionScore.js";
export {
  rollDice,
  isDoubles,
  rollPathChoiceDie,
  isPerimeterChoice,
  isDiagonalChoice,
  moveOnPerimeter,
  TRIPLE_DOUBLES_LIMIT,
  DIAGONAL_ENTRY_POSITION,
  DIAGONAL_EXIT_POSITION,
  BOARD_SIZE,
} from "./engine/dice.js";
