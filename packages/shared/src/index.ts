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
export { isLoopbackHostname, isLoopbackUrl } from "./net.js";
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
  SECTOR_IDS,
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
  AFFINITY_IDS,
  type AffinityContext,
  applyAcquisitionCostAffinity,
  getPlayerAffinityId,
  hasPlayerAffinity,
} from "./engine/affinity.js";
export type { AiDecision } from "./engine/ai.js";
export {
  chooseAiAction,
  chooseAiActionForPlayer,
  findNextAiActor,
  findNextAiActorForPhase,
  findNextAiAuctionActor,
  hasAiWork,
} from "./engine/ai.js";
export {
  applyTimeoutTakeover,
  clearTimeoutTakeoversForPlayer,
  isAiControlledActor,
  replaceKickedPlayerWithAi,
  resolveAiPersonality,
} from "./engine/aiControl.js";
export { generateFriendlyAiName } from "./engine/aiNames.js";
export type {
  DeclineAuctionType,
  PendingAuctionState,
} from "./engine/auction.js";
export {
  allEligiblePlayersSubmitted,
  closeAuctionBidWindowIfReady,
  currentAuctionHighBid,
  finalizeAuctionSettleIfReady,
  getActiveEligibleBidders,
  hasAuctionSubmission,
  isSealedAuction,
  recordAuctionSubmission,
  resolveDeclineAuctionType,
  settlePendingAuction,
  settleSealedAuction,
  startDeclineAuction,
  startForeclosureAuction,
  suggestAiAuctionBid,
} from "./engine/auction.js";
export {
  isLiveAuction,
  isVisibleAuction,
} from "./engine/auctionMode.js";
export {
  auctionBidWindowToMs,
  auctionExtensionWindowToMs,
  auctionSettleDelayToMs,
  computeAuctionBidDeadline,
  computeAuctionSettleDeadline,
  computeLiveAuctionExtensionDeadline,
  isAuctionBidWindowOpen,
  isAuctionSettleDelayActive,
} from "./engine/auctionTiming.js";
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
export { processCoordinationPhase } from "./engine/coordinationPhase.js";
export type {
  DeadlineCandidate,
  DeadlineKind,
} from "./engine/deadlines.js";
export {
  getActiveDeadlineCandidates,
  phaseHasOwnDeadline,
} from "./engine/deadlines.js";
export { shuffleDeterministic } from "./engine/deckShuffle.js";
export {
  BOARD_SIZE,
  DIAGONAL_ENTRY_POSITION,
  DIAGONAL_EXIT_POSITION,
  isDiagonalChoice,
  isDoubles,
  isPerimeterChoice,
  moveOnPerimeter,
  rollDice,
  rollFairD6,
  rollFairDice,
  rollPathChoiceDie,
  TRIPLE_DOUBLES_LIMIT,
} from "./engine/dice.js";
export type { DisruptionTrigger } from "./engine/disruptionEvents.js";
export {
  buildDisruptionDeck,
  disruptionDrawCount,
  drawAndResolveDisruptionCards,
  normalizeDisruptionDeck,
  resolveBlackMarketRelay,
  resolveDisruptionCard,
  resolveFlashCrash,
  resolvePendingDisruptionCard,
} from "./engine/disruptionEvents.js";
export {
  applyForeclosureAuctionProceeds,
  startForeclosureSequence,
} from "./engine/foreclosure.js";
export { collectFreeMarketPool } from "./engine/freeMarket.js";
export type {
  ApplyGameActionContext,
  ApplyGameActionFailure,
  ApplyGameActionResult,
  ApplyGameActionSuccess,
  EngineGameState,
} from "./engine/gameReducer.js";
export { applyGameAction } from "./engine/gameReducer.js";
// ---------------------------------------------------------------------------
// Game State Machine (authoritative for POST /api/games/:id/action)
// ---------------------------------------------------------------------------
export type {
  ApplyActionResult,
  GameActionInput,
  InternalAiPlayerState,
  InternalGameState,
  InternalPlayerState,
  InternalTileState,
  LogEntry,
} from "./engine/gameStateMachine.js";
export {
  applyAction,
  initTileStates,
  normalizeGameState,
} from "./engine/gameStateMachine.js";
export type {
  CompletedGameSnapshot,
  FinalRoundState,
  NegotiationThreadState,
  PendingForeclosureState,
  RateCardState,
  TradeOfferState,
} from "./engine/gameStateTypes.js";
export type { MarketEventTrigger } from "./engine/marketEvents.js";
export {
  buildMarketEventDeck,
  drawAndResolveMarketEvent,
  drawTurnStartMarketEvent,
  handleInsiderDiscardMarketEvent,
  handleInsiderKeepMarketEvent,
  normalizeMarketEventDeck,
  resolveMarketEventCard,
  shouldOfferInsiderPeek,
} from "./engine/marketEvents.js";
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
export {
  isOptionalRuleEnabled,
  regulationPenaltiesEnabled,
} from "./engine/optionalRulesEngine.js";
export type { PlayerChangeSnapshot } from "./engine/playerChangeLogs.js";
export {
  buildPlayerStateChangesBody,
  snapshotPlayerChanges,
} from "./engine/playerChangeLogs.js";
export {
  getActiveRateCardMultiplier,
  recordOpposingSectorLanding,
  syndicateQualifiesForRateCard,
} from "./engine/rateCards.js";
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
  RATE_CARD_STEP,
  RENT_MULTIPLIERS,
  UTILITY_RENT_MULTIPLIER,
} from "./engine/rent.js";
export { settleRentPayment } from "./engine/rentPayment.js";
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
export type { SyndicateCharterState } from "./engine/syndicate.js";
export {
  areSameSyndicate,
  buildDefaultSyndicateCharter,
  controllingPlayerIds,
  findSyndicateWinnerId,
  formSyndicateApCost,
  getSyndicateForPlayer,
  hasSectorControl,
  type SyndicateState,
  syndicateMarketValue,
  tileOwnedByController,
} from "./engine/syndicate.js";
export type { TileTradeability } from "./engine/tradeActions.js";
export {
  canCounterTrade,
  canProposeTrade,
  DEFAULT_TRADE_TIMEOUT_MINUTES,
  expirePendingTradeOffers,
  expirePendingTradeOffersForGameOver,
  isTileTradeable,
  listTradeableTilePositions,
  MAX_TRADE_COUNTERS,
  nextTradeOfferExpiry,
  reconcileTradeOffersBeforeAction,
  TRADE_OFFER_HISTORY_LIMIT,
  tileTradeability,
  tradeTransferValue,
} from "./engine/tradeActions.js";
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
export {
  applyWinIfThresholdCrossed,
  checkWinConditions,
  evaluateWin,
  playerMarketValue,
  playerWonGame,
} from "./engine/winResolution.js";
export {
  canCreateBindingContract,
  clampTrustworthiness,
  HANDSHAKE_BREACH_PENALTY,
  NEGOTIATION_THREAD_DURATION,
  THREAD_EXPIRY_PENALTY,
  TRUSTWORTHINESS_BINDING_THRESHOLD,
  TRUSTWORTHINESS_DEFAULT,
  TRUSTWORTHINESS_MAX,
  TRUSTWORTHINESS_MIN,
} from "./trustConstants.js";
