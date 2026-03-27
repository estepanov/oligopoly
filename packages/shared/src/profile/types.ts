import type { ProfileVisibility } from "@oligopoly/validation";

export type GameResult = "won" | "lost" | "drew" | "kicked";
export type OnlineStatus = "online" | "offline";

export interface CareerStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  tradesCompleted: number;
  auctionsWon: number;
  favoriteSector: string | null;
}

export interface AchievementUnlock {
  id: string;
  unlockedAt: number;
}

export interface RecentGameSummary {
  gameId: string;
  result: GameResult;
  endedAt: number;
}

export interface ViewerContext {
  isSelf: boolean;
  sharedActiveGame: boolean;
  sharedSyndicate: boolean;
}

export type NotificationPrefs = Record<string, unknown>;

export interface PublicUserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  rankTier?: number;
  rankTitle?: string;
  careerStats?: CareerStats;
  achievements?: AchievementUnlock[];
  recentGames?: RecentGameSummary[];
  onlineStatus?: OnlineStatus;
  lastSeenAt?: number;
}

export interface ViewerUserProfile extends PublicUserProfile {
  viewerContext: ViewerContext;
}

export interface PrivateUserProfile extends ViewerUserProfile {
  email: string;
  fullName: string | null;
  locale: string;
  timezone: string;
  currency: string;
  country: string | null;
  themePreference: string;
  notificationPrefs: NotificationPrefs;
  profileVisibility: ProfileVisibility;
  usernameLastChangedAt: number | null;
}

export type FullUserProfile = PrivateUserProfile;
