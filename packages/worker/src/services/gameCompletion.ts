import type {
  CompletedGameSnapshot,
  GameResult,
  InternalGameState,
  RecentGameSummary,
} from "@oligopoly/shared";
import {
  ACHIEVEMENTS_REGISTRY,
  calculateGameRankPoints,
  getRankForPoints,
  hasSectorControl,
  isAiControlledActor,
  playerWonGame,
  SECTORS,
} from "@oligopoly/shared";
import {
  type LeaderboardCompletionsEntry,
  type LeaderboardSummary,
  LeaderboardSummarySchema,
  type LeaderboardWinsEntry,
} from "@oligopoly/validation";

const MAX_RECENT_GAMES = 20;

const EMPTY_LEADERBOARD_SUMMARY: LeaderboardSummary = {
  humanWins: 0,
  aiWins: 0,
};

function countSectorsControlled(
  state: CompletedGameSnapshot,
  playerId: string,
): number {
  return Object.keys(SECTORS).filter((sectorId) =>
    hasSectorControl(state, playerId, sectorId),
  ).length;
}

function gameResultForPlayer(
  state: InternalGameState,
  playerId: string,
  winnerId: string,
): GameResult {
  if (state.kickedPlayerIds?.includes(playerId)) {
    return "kicked";
  }
  return playerWonGame(state, playerId, winnerId) ? "won" : "lost";
}

async function fetchUsername(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare("SELECT username FROM users WHERE id = ?")
    .bind(userId)
    .first<{ username: string }>();
  return row?.username ?? userId;
}

/** Never throws — corrupt or non-array JSON becomes []. */
function tryParseJsonArray(raw: string | null | undefined): unknown[] {
  if (raw == null || raw === "") return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function upsertLeaderboardEntry(
  kv: KVNamespace,
  key: "leaderboard:wins" | "leaderboard:completions",
  userId: string,
  username: string,
  _metricKey: "wins" | "completions",
  increment: number,
): Promise<void> {
  const raw = await kv.get(key);
  if (key === "leaderboard:wins") {
    const entries = tryParseJsonArray(raw) as LeaderboardWinsEntry[];
    const existing = entries.find((entry) => entry.userId === userId);
    if (existing) {
      existing.wins += increment;
      existing.username = username;
    } else {
      entries.push({ userId, username, wins: increment });
    }
    entries.sort((a, b) => b.wins - a.wins);
    await kv.put(key, JSON.stringify(entries.slice(0, 100)));
    return;
  }

  const entries = tryParseJsonArray(raw) as LeaderboardCompletionsEntry[];
  const existing = entries.find((entry) => entry.userId === userId);
  if (existing) {
    existing.completions += increment;
    existing.username = username;
  } else {
    entries.push({ userId, username, completions: increment });
  }
  entries.sort((a, b) => b.completions - a.completions);
  await kv.put(key, JSON.stringify(entries.slice(0, 100)));
}

async function incrementLeaderboardSummary(
  kv: KVNamespace,
  increment: LeaderboardSummary,
): Promise<void> {
  const raw = await kv.get("leaderboard:summary");
  let existing = EMPTY_LEADERBOARD_SUMMARY;
  if (raw) {
    try {
      const parsed = LeaderboardSummarySchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        existing = parsed.data;
      }
    } catch {
      // Malformed JSON — treat as empty summary.
    }
  }
  const merged: LeaderboardSummary = {
    humanWins: Math.max(0, (existing.humanWins ?? 0) + increment.humanWins),
    aiWins: Math.max(0, (existing.aiWins ?? 0) + increment.aiWins),
  };
  const nextParsed = LeaderboardSummarySchema.safeParse(merged);
  const next = nextParsed.success ? nextParsed.data : merged;
  await kv.put("leaderboard:summary", JSON.stringify(next));
}

/**
 * Synthetic AI lobby seats use `ai:*` ids and are not backed by D1 users.
 * Human seats keep their user id under timeout AI takeover — use
 * `isAiControlledActor` when classifying runtime control, not for this filter.
 */
function isDedicatedSyntheticAiPlayerId(playerId: string): boolean {
  return playerId.startsWith("ai:");
}

function leaderboardOutcomeForGame(
  state: InternalGameState,
  winnerId: string,
): LeaderboardSummary {
  const winners = state.players.filter((player) =>
    playerWonGame(state, player.playerId, winnerId),
  );
  if (winners.length === 0) {
    return { humanWins: 0, aiWins: 0 };
  }

  const hasHumanWinner = winners.some(
    (player) => !isAiControlledActor(state, player.playerId),
  );
  return hasHumanWinner
    ? { humanWins: 1, aiWins: 0 }
    : { humanWins: 0, aiWins: 1 };
}

async function unlockAchievementIfNew(
  db: D1Database,
  userId: string,
  achievementId: keyof typeof ACHIEVEMENTS_REGISTRY,
  now: number,
): Promise<{ statement: D1PreparedStatement | null; rankPoints: number }> {
  const existing = await db
    .prepare("SELECT id FROM achievements WHERE user_id = ? AND id = ?")
    .bind(userId, achievementId)
    .first();
  if (existing) {
    return { statement: null, rankPoints: 0 };
  }

  const achievement = ACHIEVEMENTS_REGISTRY[achievementId];
  return {
    statement: db
      .prepare(
        "INSERT INTO achievements (id, user_id, unlocked_at) VALUES (?, ?, ?)",
      )
      .bind(achievementId, userId, now),
    rankPoints: achievement.rankPoints,
  };
}

export async function processGameCompletion(
  db: D1Database,
  kv: KVNamespace | undefined,
  gameId: string,
  state: InternalGameState,
  endedAt: number,
): Promise<void> {
  const winnerId = state.winnerId;
  if (!winnerId) {
    return;
  }

  const gameRow = await db
    .prepare("SELECT player_ids_json FROM games WHERE id = ?")
    .bind(gameId)
    .first<{ player_ids_json: string }>();
  if (!gameRow) {
    return;
  }

  const playerIdsFromRow = tryParseJsonArray(gameRow.player_ids_json).filter(
    (id): id is string => typeof id === "string",
  );
  const playerIds =
    playerIdsFromRow.length > 0
      ? playerIdsFromRow
      : state.players.map((player) => player.playerId);
  if (playerIds.length === 0) {
    return;
  }
  const humanPlayerIds = playerIds.filter(
    (playerId) => !isDedicatedSyntheticAiPlayerId(playerId),
  );
  const idempotencyCandidates =
    humanPlayerIds.length > 0 ? humanPlayerIds : playerIds.slice(0, 1);

  for (const userId of idempotencyCandidates) {
    const row = await db
      .prepare(
        "SELECT recent_games_json FROM user_stats WHERE user_id = ? LIMIT 1",
      )
      .bind(userId)
      .first<{ recent_games_json: string | null }>();
    if (!row) continue;
    const recent = tryParseJsonArray(
      row.recent_games_json ?? null,
    ) as RecentGameSummary[];
    if (recent.some((entry) => entry?.gameId === gameId)) {
      return;
    }
  }

  const statements: D1PreparedStatement[] = [];
  const achievementStatements: D1PreparedStatement[] = [];
  const leaderboardSummary = leaderboardOutcomeForGame(state, winnerId);

  for (const playerId of playerIds) {
    const isKicked = state.kickedPlayerIds?.includes(playerId) ?? false;
    const aiSeat = isDedicatedSyntheticAiPlayerId(playerId);
    const won = playerWonGame(state, playerId, winnerId);

    if (aiSeat) {
      continue;
    }

    const statsRow = await db
      .prepare(
        "SELECT games_played, wins, trades_completed, auctions_won, recent_games_json FROM user_stats WHERE user_id = ?",
      )
      .bind(playerId)
      .first<{
        games_played: number;
        wins: number;
        trades_completed: number;
        auctions_won: number;
        recent_games_json: string;
      }>();

    const recentGames = (
      statsRow?.recent_games_json
        ? tryParseJsonArray(statsRow.recent_games_json)
        : []
    ) as RecentGameSummary[];
    recentGames.unshift({
      gameId,
      result: gameResultForPlayer(state, playerId, winnerId),
      endedAt,
    });

    if (isKicked) {
      if (statsRow) {
        statements.push(
          db
            .prepare(
              "UPDATE user_stats SET recent_games_json = ? WHERE user_id = ?",
            )
            .bind(
              JSON.stringify(recentGames.slice(0, MAX_RECENT_GAMES)),
              playerId,
            ),
        );
      } else {
        statements.push(
          db
            .prepare(
              "INSERT INTO user_stats (user_id, games_played, wins, trades_completed, auctions_won, recent_games_json) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(
              playerId,
              0,
              0,
              0,
              0,
              JSON.stringify(recentGames.slice(0, MAX_RECENT_GAMES)),
            ),
        );
      }
      continue;
    }

    const gamesPlayed = (statsRow?.games_played ?? 0) + 1;
    const wins = (statsRow?.wins ?? 0) + (won ? 1 : 0);
    const tradesCompleted = statsRow?.trades_completed ?? 0;
    const auctionsWon = statsRow?.auctions_won ?? 0;

    if (statsRow) {
      statements.push(
        db
          .prepare(
            "UPDATE user_stats SET games_played = ?, wins = ?, recent_games_json = ? WHERE user_id = ?",
          )
          .bind(
            gamesPlayed,
            wins,
            JSON.stringify(recentGames.slice(0, MAX_RECENT_GAMES)),
            playerId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            "INSERT INTO user_stats (user_id, games_played, wins, trades_completed, auctions_won, recent_games_json) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            playerId,
            gamesPlayed,
            wins,
            tradesCompleted,
            auctionsWon,
            JSON.stringify(recentGames.slice(0, MAX_RECENT_GAMES)),
          ),
      );
    }

    let achievementPoints = 0;
    const achievementIds: Array<keyof typeof ACHIEVEMENTS_REGISTRY> = [
      "first_steps",
    ];
    if (won) achievementIds.push("champion");
    if (gamesPlayed >= 10) achievementIds.push("full_house");
    if (wins >= 10) achievementIds.push("dynasty");
    if (
      won &&
      state.players.find((entry) => entry.playerId === playerId)?.syndicateId
    ) {
      achievementIds.push("kingmaker");
    }

    for (const achievementId of achievementIds) {
      const unlocked = await unlockAchievementIfNew(
        db,
        playerId,
        achievementId,
        endedAt,
      );
      if (unlocked.statement) {
        achievementStatements.push(unlocked.statement);
      }
      achievementPoints += unlocked.rankPoints;
    }

    const rankPointsEarned = calculateGameRankPoints({
      completed: true,
      won,
      sectorsControlled: countSectorsControlled(state, playerId),
      tradesCompleted,
      auctionsWon,
      achievementPoints,
    });

    const rankRow = await db
      .prepare("SELECT rank_points FROM user_ranks WHERE user_id = ?")
      .bind(playerId)
      .first<{ rank_points: number }>();
    const totalRankPoints = (rankRow?.rank_points ?? 0) + rankPointsEarned;
    const rank = getRankForPoints(totalRankPoints);

    if (rankRow) {
      statements.push(
        db
          .prepare(
            "UPDATE user_ranks SET rank_points = ?, tier = ?, title = ? WHERE user_id = ?",
          )
          .bind(totalRankPoints, rank.tier, rank.title, playerId),
      );
    } else {
      statements.push(
        db
          .prepare(
            "INSERT INTO user_ranks (user_id, tier, title, rank_points) VALUES (?, ?, ?, ?)",
          )
          .bind(playerId, rank.tier, rank.title, totalRankPoints),
      );
    }

    if (kv) {
      const username = await fetchUsername(db, playerId);
      await upsertLeaderboardEntry(
        kv,
        "leaderboard:completions",
        playerId,
        username,
        "completions",
        1,
      );
      if (won) {
        await upsertLeaderboardEntry(
          kv,
          "leaderboard:wins",
          playerId,
          username,
          "wins",
          1,
        );
      }
    }
  }

  if (achievementStatements.length > 0 || statements.length > 0) {
    await db.batch([...achievementStatements, ...statements]);
  }

  if (
    kv &&
    (leaderboardSummary.humanWins > 0 || leaderboardSummary.aiWins > 0)
  ) {
    await incrementLeaderboardSummary(kv, leaderboardSummary);
  }
}
