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

export { ACHIEVEMENTS_REGISTRY } from "./config/achievements.js";
export { OPTIONAL_MARKET_EVENT_CARDS_REGISTRY } from "./config/marketEventCards.js";
export { OPTIONAL_RULES_REGISTRY } from "./config/optionalRules.js";
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
