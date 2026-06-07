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
  LeaderboardCompletionsEntrySchema,
  type LeaderboardSummary,
  LeaderboardSummarySchema,
  LeaderboardWinsEntrySchema,
  RecentGameSummarySchema,
} from "@oligopoly/validation";
import { z } from "zod";
import { safeParseJson } from "../lib/jsonParse";

const MAX_RECENT_GAMES = 20;

const recentGamesListSchema = z.array(RecentGameSummarySchema);

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

async function mergeLeaderboardList<
  T extends { userId: string; username: string },
>(
  kv: KVNamespace,
  storageKey: "leaderboard:wins" | "leaderboard:completions",
  userId: string,
  username: string,
  increment: number,
  listSchema: z.ZodType<T[]>,
  sortDesc: (a: T, b: T) => number,
  bump: (row: T, delta: number) => void,
  seed: (userId: string, username: string, delta: number) => T,
): Promise<void> {
  const raw = await kv.get(storageKey);
  const rows = safeParseJson(raw, listSchema, []);
  const found = rows.find((r) => r.userId === userId);
  if (found) {
    bump(found, increment);
    found.username = username;
  } else {
    rows.push(seed(userId, username, increment));
  }
  rows.sort(sortDesc);
  await kv.put(storageKey, JSON.stringify(rows.slice(0, 100)));
}

async function upsertLeaderboardEntry(
  kv: KVNamespace,
  metric: "wins" | "completions",
  userId: string,
  username: string,
  increment: number,
): Promise<void> {
  if (metric === "wins") {
    await mergeLeaderboardList(
      kv,
      "leaderboard:wins",
      userId,
      username,
      increment,
      z.array(LeaderboardWinsEntrySchema),
      (a, b) => b.wins - a.wins,
      (row, d) => {
        row.wins += d;
      },
      (uid, un, d) => ({ userId: uid, username: un, wins: d }),
    );
    return;
  }
  await mergeLeaderboardList(
    kv,
    "leaderboard:completions",
    userId,
    username,
    increment,
    z.array(LeaderboardCompletionsEntrySchema),
    (a, b) => b.completions - a.completions,
    (row, d) => {
      row.completions += d;
    },
    (uid, un, d) => ({ userId: uid, username: un, completions: d }),
  );
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

  const playerIdsFromRow = safeParseJson(
    gameRow.player_ids_json,
    z.array(z.string()),
    [],
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
    const recent = safeParseJson(
      row.recent_games_json ?? null,
      recentGamesListSchema,
      [],
    );
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

    const recentGames: RecentGameSummary[] = statsRow?.recent_games_json
      ? safeParseJson(statsRow.recent_games_json, recentGamesListSchema, [])
      : [];
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
      await upsertLeaderboardEntry(kv, "completions", playerId, username, 1);
      if (won) {
        await upsertLeaderboardEntry(kv, "wins", playerId, username, 1);
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
