import { zValidator } from "@hono/zod-validator";
import {
  DEFAULT_PROFILE_VISIBILITY,
  type FullUserProfile,
  type NotificationPrefs,
  type PrivateUserProfile,
  serializeProfileForAudience,
} from "@oligopoly/shared";
import type { ProfileVisibility } from "@oligopoly/validation";
import { UpdateUserSettingsInputSchema } from "@oligopoly/validation";
import { Hono } from "hono";
import { z } from "zod";
import { listGames } from "../services/gameListings.js";

type Bindings = {
  DB?: D1Database;
  KV?: KVNamespace;
};

type Variables = {
  userId?: string;
};

export const userRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// ---------------------------------------------------------------------------
// Helper: read userId from request context (set by auth middleware, if any)
// ---------------------------------------------------------------------------
function getUserId(c: {
  get: (key: string) => string | undefined;
}): string | undefined {
  return c.get("userId");
}

// ---------------------------------------------------------------------------
// Helper: build FullUserProfile from D1 rows
// ---------------------------------------------------------------------------
interface UserRow {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
  email: string | null;
  locale: string;
  timezone: string | null;
  currency: string | null;
  country: string | null;
  theme_preference: string;
  created_at: number;
  updated_at: number;
}

interface VisibilityRow {
  rank: string;
  career_stats: string;
  achievements: string;
  recent_games: string;
  online_status: string;
  last_seen: string;
  favorite_sector: string;
}

interface RankRow {
  tier: number;
  title: string | null;
}

interface AchievementRow {
  id: string;
  unlocked_at: number;
}

function rowToVisibility(row: VisibilityRow | null): ProfileVisibility {
  if (!row) return DEFAULT_PROFILE_VISIBILITY;
  return {
    rank:
      (row.rank as ProfileVisibility["rank"]) ??
      DEFAULT_PROFILE_VISIBILITY.rank,
    careerStats:
      (row.career_stats as ProfileVisibility["careerStats"]) ??
      DEFAULT_PROFILE_VISIBILITY.careerStats,
    achievements:
      (row.achievements as ProfileVisibility["achievements"]) ??
      DEFAULT_PROFILE_VISIBILITY.achievements,
    recentGames:
      (row.recent_games as ProfileVisibility["recentGames"]) ??
      DEFAULT_PROFILE_VISIBILITY.recentGames,
    onlineStatus:
      (row.online_status as ProfileVisibility["onlineStatus"]) ??
      DEFAULT_PROFILE_VISIBILITY.onlineStatus,
    lastSeen:
      (row.last_seen as ProfileVisibility["lastSeen"]) ??
      DEFAULT_PROFILE_VISIBILITY.lastSeen,
    favoriteSector:
      (row.favorite_sector as ProfileVisibility["favoriteSector"]) ??
      DEFAULT_PROFILE_VISIBILITY.favoriteSector,
  };
}

async function fetchFullProfile(
  db: D1Database,
  userId: string,
): Promise<{ profile: FullUserProfile; visibility: ProfileVisibility } | null> {
  const [userRow, visibilityRow, rankRow, achievementRows, statsRow] =
    await Promise.all([
      db
        .prepare("SELECT * FROM users WHERE id = ?")
        .bind(userId)
        .first<UserRow>(),
      db
        .prepare("SELECT * FROM user_visibility WHERE user_id = ?")
        .bind(userId)
        .first<VisibilityRow>(),
      db
        .prepare("SELECT tier, title FROM user_ranks WHERE user_id = ?")
        .bind(userId)
        .first<RankRow>(),
      db
        .prepare("SELECT id, unlocked_at FROM achievements WHERE user_id = ?")
        .bind(userId)
        .all<AchievementRow>(),
      db
        .prepare(
          "SELECT games_played, wins, trades_completed, auctions_won, favorite_sector, recent_games_json FROM user_stats WHERE user_id = ?",
        )
        .bind(userId)
        .first<{
          games_played: number;
          wins: number;
          trades_completed: number;
          auctions_won: number;
          favorite_sector: string | null;
          recent_games_json: string;
        }>(),
    ]);

  if (!userRow) return null;

  const visibility = rowToVisibility(visibilityRow);
  const winRate =
    statsRow && statsRow.games_played > 0
      ? statsRow.wins / statsRow.games_played
      : 0;

  const profile: FullUserProfile = {
    id: userRow.id,
    username: userRow.username,
    avatarUrl: userRow.avatar_url,
    rankTier: rankRow?.tier,
    rankTitle: rankRow?.title ?? undefined,
    careerStats: statsRow
      ? {
          gamesPlayed: statsRow.games_played,
          wins: statsRow.wins,
          winRate,
          tradesCompleted: statsRow.trades_completed,
          auctionsWon: statsRow.auctions_won,
          favoriteSector: statsRow.favorite_sector,
        }
      : undefined,
    achievements: achievementRows.results.map((a) => ({
      id: a.id,
      unlockedAt: a.unlocked_at,
    })),
    recentGames: statsRow?.recent_games_json
      ? (JSON.parse(
          statsRow.recent_games_json,
        ) as FullUserProfile["recentGames"])
      : [],
    onlineStatus: undefined,
    lastSeenAt: undefined,
    viewerContext: {
      isSelf: false,
      sharedActiveGame: false,
      sharedSyndicate: false,
    },
    email: userRow.email ?? "",
    fullName: userRow.full_name,
    locale: userRow.locale,
    timezone: userRow.timezone ?? "",
    currency: userRow.currency ?? "",
    country: userRow.country,
    themePreference: userRow.theme_preference,
    notificationPrefs: {} as NotificationPrefs,
    profileVisibility: visibility,
    usernameLastChangedAt: null,
  };

  return { profile, visibility };
}

// ---------------------------------------------------------------------------
// GET /api/users/check-username?username=
// ---------------------------------------------------------------------------
userRoutes.get(
  "/check-username",
  zValidator(
    "query",
    z.object({ username: z.string().min(1) }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: "username query parameter is required" }, 400);
      }
    },
  ),
  async (c) => {
    const { username } = c.req.valid("query");
    const db = c.env?.DB;

    if (!db) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const existing = await db
      .prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first<{ id: string }>();

    return c.json({ available: !existing });
  },
);

// ---------------------------------------------------------------------------
// GET /api/users/me
// ---------------------------------------------------------------------------
userRoutes.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const result = await fetchFullProfile(db, userId);
  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  const { profile, visibility } = result;
  profile.viewerContext = {
    isSelf: true,
    sharedActiveGame: false,
    sharedSyndicate: false,
  };

  const serialized = serializeProfileForAudience(profile, "owner", visibility);
  return c.json(serialized as PrivateUserProfile);
});

// ---------------------------------------------------------------------------
// PUT /api/users/me
// ---------------------------------------------------------------------------
userRoutes.put(
  "/me",
  zValidator("json", UpdateUserSettingsInputSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", details: result.error.flatten() },
        400,
      );
    }
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Auth adapter not configured" }, 401);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const body = c.req.valid("json");
    const now = Date.now();

    // Build partial UPDATE for users table
    const userUpdates: string[] = [];
    const userParams: unknown[] = [];

    if (body.username !== undefined) {
      userUpdates.push("username = ?");
      userParams.push(body.username);
    }
    if (body.locale !== undefined) {
      userUpdates.push("locale = ?");
      userParams.push(body.locale);
    }
    if (body.timezone !== undefined) {
      userUpdates.push("timezone = ?");
      userParams.push(body.timezone);
    }
    if (body.currency !== undefined) {
      userUpdates.push("currency = ?");
      userParams.push(body.currency);
    }
    if (body.themePreference !== undefined) {
      userUpdates.push("theme_preference = ?");
      userParams.push(body.themePreference);
    }

    if (userUpdates.length > 0) {
      userUpdates.push("updated_at = ?");
      userParams.push(now, userId);
      await db
        .prepare(`UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`)
        .bind(...userParams)
        .run();
    }

    // Merge profileVisibility changes
    if (body.profileVisibility) {
      const visUpdates: string[] = [];
      const visParams: unknown[] = [];
      const pv = body.profileVisibility;

      if (pv.rank !== undefined) {
        visUpdates.push("rank = ?");
        visParams.push(pv.rank);
      }
      if (pv.careerStats !== undefined) {
        visUpdates.push("career_stats = ?");
        visParams.push(pv.careerStats);
      }
      if (pv.achievements !== undefined) {
        visUpdates.push("achievements = ?");
        visParams.push(pv.achievements);
      }
      if (pv.recentGames !== undefined) {
        visUpdates.push("recent_games = ?");
        visParams.push(pv.recentGames);
      }
      if (pv.onlineStatus !== undefined) {
        visUpdates.push("online_status = ?");
        visParams.push(pv.onlineStatus);
      }
      if (pv.lastSeen !== undefined) {
        visUpdates.push("last_seen = ?");
        visParams.push(pv.lastSeen);
      }
      if (pv.favoriteSector !== undefined) {
        visUpdates.push("favorite_sector = ?");
        visParams.push(pv.favoriteSector);
      }

      if (visUpdates.length > 0) {
        // INSERT ... ON CONFLICT ... DO UPDATE: bind userId first (for INSERT), then all SET values (for UPDATE)
        await db
          .prepare(
            `INSERT INTO user_visibility (user_id) VALUES (?) ON CONFLICT(user_id) DO UPDATE SET ${visUpdates.join(", ")}`,
          )
          .bind(userId, ...visParams)
          .run();
      }
    }

    const result = await fetchFullProfile(db, userId);
    if (!result) {
      return c.json({ error: "User not found" }, 404);
    }

    const { profile, visibility } = result;
    profile.viewerContext = {
      isSelf: true,
      sharedActiveGame: false,
      sharedSyndicate: false,
    };

    const serialized = serializeProfileForAudience(
      profile,
      "owner",
      visibility,
    );
    return c.json(serialized as PrivateUserProfile);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/users/me
// ---------------------------------------------------------------------------
userRoutes.delete("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  return new Response(null, { status: 204 });
});

// ---------------------------------------------------------------------------
// GET /api/users/me/games
// ---------------------------------------------------------------------------
userRoutes.get("/me/games", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  return c.json(
    (await listGames(db, { participantId: userId })).map((game) => ({
      gameId: game.id,
      status: game.status,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      winnerId: game.winnerId,
      playerIds: game.playerIds,
      participated: game.playerIds.includes(userId),
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /api/users/me/achievements
// ---------------------------------------------------------------------------
userRoutes.get("/me/achievements", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const rows = await db
    .prepare("SELECT id, unlocked_at FROM achievements WHERE user_id = ?")
    .bind(userId)
    .all<AchievementRow>();

  return c.json(
    rows.results.map((a) => ({ id: a.id, unlockedAt: a.unlocked_at })),
  );
});

// ---------------------------------------------------------------------------
// GET /api/users/me/rank
// ---------------------------------------------------------------------------
userRoutes.get("/me/rank", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const row = await db
    .prepare(
      "SELECT tier, title, rank_points FROM user_ranks WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ tier: number; title: string | null; rank_points: number }>();

  if (!row) {
    return c.json({ tier: 0, title: null, rankPoints: 0 });
  }

  return c.json({
    tier: row.tier,
    title: row.title,
    rankPoints: row.rank_points,
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/me/notifications
// ---------------------------------------------------------------------------
userRoutes.get("/me/notifications", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  // Notification prefs not stored in schema yet; return empty object
  return c.json({});
});

// ---------------------------------------------------------------------------
// PUT /api/users/me/locale
// ---------------------------------------------------------------------------
userRoutes.put(
  "/me/locale",
  zValidator(
    "json",
    z.object({ locale: z.string().min(2).max(35) }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid locale value" }, 400);
      }
    },
  ),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Auth adapter not configured" }, 401);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const { locale } = c.req.valid("json");

    // Basic BCP-47 check: language tag with optional region, e.g. "en", "en-US", "zh-Hans-CN"
    if (!/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(locale)) {
      return c.json({ error: "Invalid BCP-47 locale tag" }, 400);
    }

    await db
      .prepare("UPDATE users SET locale = ?, updated_at = ? WHERE id = ?")
      .bind(locale, Date.now(), userId)
      .run();

    return c.json({ locale });
  },
);

// ---------------------------------------------------------------------------
// PUT /api/users/me/theme
// ---------------------------------------------------------------------------
userRoutes.put(
  "/me/theme",
  zValidator(
    "json",
    z.object({ themePreference: z.string().min(1) }),
    (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid theme value" }, 400);
      }
    },
  ),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Auth adapter not configured" }, 401);
    }

    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const { themePreference } = c.req.valid("json");

    await db
      .prepare(
        "UPDATE users SET theme_preference = ?, updated_at = ? WHERE id = ?",
      )
      .bind(themePreference, Date.now(), userId)
      .run();

    return c.json({ themePreference });
  },
);

// ---------------------------------------------------------------------------
// PUT /api/users/me/notifications
// ---------------------------------------------------------------------------
userRoutes.put(
  "/me/notifications",
  zValidator("json", z.record(z.unknown()), (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid notification preferences" }, 400);
    }
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Auth adapter not configured" }, 401);
    }

    // Notification prefs not yet persisted; echo back
    const prefs = c.req.valid("json");
    return c.json(prefs);
  },
);

// ---------------------------------------------------------------------------
// PUT /api/users/me/notifications/:gid
// ---------------------------------------------------------------------------
userRoutes.put(
  "/me/notifications/:gid",
  zValidator("json", z.record(z.unknown()), (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid notification preferences" }, 400);
    }
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Auth adapter not configured" }, 401);
    }

    const { gid } = c.req.param();
    const prefs = c.req.valid("json");
    return c.json({ gameId: gid, prefs });
  },
);

// ---------------------------------------------------------------------------
// GET /api/users/:id/presence
// ---------------------------------------------------------------------------
userRoutes.get("/:id/presence", async (c) => {
  const { id } = c.req.param();
  const db = c.env?.DB;

  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Presence not yet tracked; return offline
  return c.json({ userId: id, status: "offline" });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/viewer
// ---------------------------------------------------------------------------
userRoutes.get("/:id/viewer", async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Auth adapter not configured" }, 401);
  }

  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const { id } = c.req.param();
  const result = await fetchFullProfile(db, id);
  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  const { profile, visibility } = result;
  profile.viewerContext = {
    isSelf: userId === id,
    sharedActiveGame: false,
    sharedSyndicate: false,
  };

  const serialized = serializeProfileForAudience(profile, "viewer", visibility);
  return c.json(serialized);
});

// ---------------------------------------------------------------------------
// GET /api/users/:id  (public — no auth)
// ---------------------------------------------------------------------------
userRoutes.get("/:id", async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: "Database not configured" }, 500);
  }

  const { id } = c.req.param();
  const result = await fetchFullProfile(db, id);
  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  const { profile, visibility } = result;
  const serialized = serializeProfileForAudience(profile, "public", visibility);
  return c.json(serialized);
});
