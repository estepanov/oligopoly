import type { GameResult } from "@oligopoly/shared";
import {
  ACHIEVEMENTS_REGISTRY,
  type CompletedGameSnapshot,
  calculateGameRankPoints,
  getRankForPoints,
  hasSectorControl,
  type InternalGameState,
  playerWonGame,
  type RecentGameSummary,
  SECTORS,
} from "@oligopoly/shared";

const MAX_RECENT_GAMES = 20;

type LeaderboardWinsEntry = {
  userId: string;
  username: string;
  wins: number;
};

type LeaderboardCompletionsEntry = {
  userId: string;
  username: string;
  completions: number;
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
    const entries: LeaderboardWinsEntry[] = raw
      ? (JSON.parse(raw) as LeaderboardWinsEntry[])
      : [];
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

  const entries: LeaderboardCompletionsEntry[] = raw
    ? (JSON.parse(raw) as LeaderboardCompletionsEntry[])
    : [];
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

  const playerIds = JSON.parse(gameRow.player_ids_json) as string[];
  const alreadyProcessed = await db
    .prepare(
      "SELECT recent_games_json FROM user_stats WHERE user_id = ? LIMIT 1",
    )
    .bind(playerIds[0])
    .first<{ recent_games_json: string }>();
  if (alreadyProcessed?.recent_games_json.includes(`"gameId":"${gameId}"`)) {
    return;
  }

  const statements: D1PreparedStatement[] = [];
  const achievementStatements: D1PreparedStatement[] = [];

  for (const playerId of playerIds) {
    if (state.kickedPlayerIds?.includes(playerId)) {
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

    const gamesPlayed = (statsRow?.games_played ?? 0) + 1;
    const won = playerWonGame(state, playerId, winnerId);
    const wins = (statsRow?.wins ?? 0) + (won ? 1 : 0);
    const tradesCompleted = statsRow?.trades_completed ?? 0;
    const auctionsWon = statsRow?.auctions_won ?? 0;

    const recentGames = statsRow?.recent_games_json
      ? (JSON.parse(statsRow.recent_games_json) as RecentGameSummary[])
      : [];
    recentGames.unshift({
      gameId,
      result: gameResultForPlayer(state, playerId, winnerId),
      endedAt,
    });

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
}
