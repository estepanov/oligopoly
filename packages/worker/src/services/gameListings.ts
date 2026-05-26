import type { GameSummary } from "@oligopoly/validation";

type GameListRow = {
  id: string;
  status: string;
  player_ids_json: string;
  started_at: number;
  ended_at: number | null;
  winner_id: string | null;
};

export type ListedGame = {
  id: string;
  status: string;
  playerIds: string[];
  startedAt: number;
  endedAt: number | null;
  winnerId: string | null;
};

function parsePlayerIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function participantLikePattern(participantId: string): string {
  return `%\"${participantId.replace(/[\\%_]/g, "\\$&")}\"%`;
}

export async function listGames(
  db: D1Database,
  options: {
    status?: string;
    participantId?: string;
    limit?: number;
  } = {},
): Promise<ListedGame[]> {
  const { status, participantId, limit = 50 } = options;
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (participantId) {
    clauses.push("player_ids_json LIKE ? ESCAPE '\\'");
    params.push(participantLikePattern(participantId));
  }

  const whereClause = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const query =
    "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games" +
    whereClause +
    " ORDER BY started_at DESC LIMIT ?";

  const { results } = await db
    .prepare(query)
    .bind(...params, limit)
    .all<GameListRow>();

  return results.map((row) => ({
    id: row.id,
    status: row.status,
    playerIds: parsePlayerIds(row.player_ids_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerId: row.winner_id,
  }));
}

export function toGameSummary(game: ListedGame): GameSummary {
  return {
    id: game.id,
    status: game.status as GameSummary["status"],
    playerCount: game.playerIds.length,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    winnerId: game.winnerId,
  };
}
