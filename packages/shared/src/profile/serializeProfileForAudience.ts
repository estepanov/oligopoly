import type {
  ProfileVisibility,
  VisibilitySetting,
} from "@oligopoly/validation";
import type {
  FullUserProfile,
  PrivateUserProfile,
  PublicUserProfile,
  ViewerUserProfile,
} from "./types.js";

function clonePublicFields(profile: FullUserProfile): PublicUserProfile {
  return {
    id: profile.id,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    rankTier: profile.rankTier,
    rankTitle: profile.rankTitle,
    careerStats: profile.careerStats ? { ...profile.careerStats } : undefined,
    achievements: profile.achievements?.map((achievement) => ({
      ...achievement,
    })),
    recentGames: profile.recentGames?.map((game) => ({ ...game })),
    onlineStatus: profile.onlineStatus,
    lastSeenAt: profile.lastSeenAt,
  };
}

function clonePrivateProfile(profile: FullUserProfile): PrivateUserProfile {
  return {
    ...clonePublicFields(profile),
    viewerContext: { ...profile.viewerContext },
    email: profile.email,
    fullName: profile.fullName,
    locale: profile.locale,
    timezone: profile.timezone,
    currency: profile.currency,
    country: profile.country,
    themePreference: profile.themePreference,
    notificationPrefs: { ...profile.notificationPrefs },
    profileVisibility: { ...profile.profileVisibility },
    usernameLastChangedAt: profile.usernameLastChangedAt,
  };
}

function isVisibleToAudience(
  setting: VisibilitySetting,
  audience: "public" | "viewer",
): boolean {
  if (audience === "public") {
    return setting === "public";
  }

  return setting === "public" || setting === "authenticated";
}

export function serializeProfileForAudience(
  profile: FullUserProfile,
  audience: "public" | "viewer" | "owner",
  visibility: ProfileVisibility,
): PublicUserProfile | ViewerUserProfile | PrivateUserProfile {
  if (audience === "owner") {
    return clonePrivateProfile(profile);
  }

  const serialized: PublicUserProfile = {
    id: profile.id,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
  };

  if (isVisibleToAudience(visibility.rank, audience)) {
    serialized.rankTier = profile.rankTier;
    serialized.rankTitle = profile.rankTitle;
  }

  if (
    profile.careerStats &&
    isVisibleToAudience(visibility.careerStats, audience)
  ) {
    serialized.careerStats = {
      ...profile.careerStats,
      favoriteSector: isVisibleToAudience(visibility.favoriteSector, audience)
        ? profile.careerStats.favoriteSector
        : null,
    };
  }

  if (
    profile.achievements &&
    isVisibleToAudience(visibility.achievements, audience)
  ) {
    serialized.achievements = profile.achievements.map((achievement) => ({
      ...achievement,
    }));
  }

  if (
    profile.recentGames &&
    isVisibleToAudience(visibility.recentGames, audience)
  ) {
    serialized.recentGames = profile.recentGames.map((game) => ({ ...game }));
  }

  if (
    profile.onlineStatus &&
    isVisibleToAudience(visibility.onlineStatus, audience)
  ) {
    serialized.onlineStatus = profile.onlineStatus;
  }

  if (
    profile.lastSeenAt !== undefined &&
    isVisibleToAudience(visibility.lastSeen, audience)
  ) {
    serialized.lastSeenAt = profile.lastSeenAt;
  }

  if (audience === "public") {
    return serialized;
  }

  const viewerSerialized: ViewerUserProfile = {
    ...serialized,
    viewerContext: { ...profile.viewerContext },
  };

  return viewerSerialized;
}
