type Row = Record<string, unknown>;

export type WorkerD1Stub = D1Database & {
  _tables: Record<string, Row[]>;
};

export function createWorkerD1Stub(): WorkerD1Stub {
  const tables: Record<string, Row[]> = {
    users: [
      { id: "user-1", username: "user-1", role: "user" },
      { id: "user-2", username: "user-2", role: "user" },
      { id: "user-3", username: "user-3", role: "user" },
      { id: "user-4", username: "user-4", role: "user" },
    ],
    lobbies: [],
    lobby_players: [],
    lobby_invites: [],
    games: [],
    game_log: [],
    user_ranks: [],
    user_stats: [],
    achievements: [],
  };

  let lastChanges = 0;

  // Follow-up writes in persistGameActionResult are gated on the games row
  // already holding the freshly-written state (an `AND EXISTS (SELECT 1 FROM
  // games WHERE id = ? AND state_json = ?)` predicate). Mirror that here so the
  // batch's optimistic-conflict semantics hold: when the guard fails the
  // follow-up is a no-op, exactly as in real D1.
  const appliedGuardSatisfied = (gameId: unknown, stateJson: unknown) =>
    tables.games.some((r) => r.id === gameId && r.state_json === stateJson);

  const execSql = (sql: string, binds: unknown[]) => {
    const trimmed = sql.replace(/\s+/g, " ").trim();
    const hasAppliedGuard = trimmed.includes(
      "EXISTS (SELECT 1 FROM games WHERE id = ? AND state_json = ?)",
    );

    if (trimmed.startsWith("INSERT INTO lobbies")) {
      const [
        id,
        name,
        host_id,
        max_players,
        is_private,
        optional_rule_ids_json,
        created_at,
        turn_timeout,
        auction_bid_window,
        auction_settle_delay,
        auction_extension_window,
        auction_type,
        voice_video_enabled,
        spectator_mode,
        market_event_deck_json,
        optional_event_card_ids_json,
        currency_name,
        currency_symbol,
        currency_multiplier,
        ai_slots_json,
      ] = binds as [
        string,
        string,
        string,
        number,
        number,
        string,
        number,
        string,
        string,
        string,
        string,
        string,
        number,
        string,
        string | null,
        string,
        string,
        string,
        string,
        string,
      ];
      tables.lobbies.push({
        id,
        name,
        host_id,
        status: "waiting",
        max_players,
        is_private,
        optional_rule_ids_json,
        created_at,
        turn_timeout: turn_timeout ?? "5min",
        auction_bid_window: auction_bid_window ?? "1min",
        auction_settle_delay: auction_settle_delay ?? "30s",
        auction_extension_window: auction_extension_window ?? "15s",
        auction_type: auction_type ?? "sealed_bids",
        voice_video_enabled: voice_video_enabled ?? 0,
        spectator_mode: spectator_mode ?? "disabled",
        market_event_deck_json: market_event_deck_json ?? null,
        optional_event_card_ids_json: optional_event_card_ids_json ?? null,
        currency_name: currency_name ?? "Capital",
        currency_symbol: currency_symbol ?? "$",
        currency_multiplier: currency_multiplier ?? "1",
        ai_slots_json: ai_slots_json ?? "[]",
      });
      return { results: [], success: true };
    }

    if (trimmed.startsWith("INSERT INTO lobby_players")) {
      if (binds.length === 4) {
        const [lobby_id, user_id, is_admin, joined_at] = binds as [
          string,
          string,
          number,
          number,
        ];
        tables.lobby_players.push({
          lobby_id,
          user_id,
          is_admin,
          joined_at,
          is_ready: 0,
        });
      } else {
        const [lobby_id, user_id, joined_at] = binds as [
          string,
          string,
          number,
        ];
        const isAdmin = trimmed.includes(", 1,") ? 1 : 0;
        tables.lobby_players.push({
          lobby_id,
          user_id,
          is_admin: isAdmin,
          joined_at,
          is_ready: 0,
        });
      }
      return { results: [], success: true };
    }

    if (trimmed.startsWith("INSERT INTO lobby_invites")) {
      const [token, lobby_id, expires_at, created_at] = binds as [
        string,
        string,
        number,
        number,
      ];
      tables.lobby_invites.push({ token, lobby_id, expires_at, created_at });
      return { results: [], success: true };
    }

    if (trimmed.startsWith("DELETE FROM lobby_invites")) {
      const [token, lobby_id, now] = binds as [string, string, number];
      const invite = tables.lobby_invites.find(
        (row) =>
          row.token === token &&
          row.lobby_id === lobby_id &&
          row.expires_at > now,
      );
      tables.lobby_invites = tables.lobby_invites.filter(
        (row) => row !== invite,
      );
      return { results: invite ? [invite] : [], first: invite ?? null };
    }

    if (
      trimmed.startsWith(
        "INSERT INTO games (id, started_at, player_ids_json) SELECT id, started_at, player_ids_json FROM games WHERE id = ? AND changes() = 0",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]);
      if (lastChanges === 0 && row) {
        throw new Error("UNIQUE constraint failed: games.id");
      }
      return { results: [], success: true, meta: { changes: 0 } };
    }

    if (trimmed.startsWith("INSERT INTO games")) {
      const [id, lobby_id, started_at, player_ids_json, state_json] = binds as [
        string,
        string,
        number,
        string,
        string,
      ];
      tables.games.push({
        id,
        lobby_id,
        status: "active",
        started_at,
        ended_at: null,
        winner_id: null,
        player_ids_json,
        state_json,
      });
      return { results: [], success: true };
    }

    if (trimmed.startsWith("INSERT INTO game_log")) {
      // Guarded log inserts append [gameId, stateJson] for the EXISTS predicate.
      const insertBinds = hasAppliedGuard ? binds.slice(0, -2) : binds;
      if (hasAppliedGuard) {
        const [guardGameId, guardStateJson] = binds.slice(-2);
        if (!appliedGuardSatisfied(guardGameId, guardStateJson)) {
          return { results: [], success: true, meta: { changes: 0 } };
        }
      }
      if (insertBinds.length === 7) {
        const [
          id,
          game_id,
          round,
          player_id,
          action_type,
          payload_json,
          created_at,
        ] = insertBinds as [
          string,
          string,
          number,
          string | null,
          string,
          string | null,
          number,
        ];
        tables.game_log.push({
          id,
          game_id,
          round,
          player_id,
          action_type,
          payload_json,
          created_at,
        });
      } else {
        const [id, game_id, payload_json, created_at] = insertBinds as [
          string,
          string,
          string,
          number,
        ];
        tables.game_log.push({
          id,
          game_id,
          round: 1,
          player_id: null,
          action_type: "game_started",
          payload_json,
          created_at,
        });
      }
      return { results: [], success: true };
    }

    if (trimmed.startsWith("SELECT * FROM lobbies WHERE id = ?")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.includes(
        "FROM lobbies WHERE status = 'waiting' AND is_private = 0",
      ) &&
      trimmed.includes("ORDER BY")
    ) {
      const limit = binds[binds.length - 1] as number;
      let rows = tables.lobbies.filter(
        (r) => r.status === "waiting" && r.is_private === 0,
      );
      if (binds.length === 4) {
        const cursorTime = binds[0] as number;
        const cursorId = binds[2] as string;
        rows = rows.filter(
          (r) =>
            (r.created_at as number) < cursorTime ||
            ((r.created_at as number) === cursorTime &&
              (r.id as string) < cursorId),
        );
      }
      rows.sort((a, b) => {
        const timeDiff = (b.created_at as number) - (a.created_at as number);
        if (timeDiff !== 0) return timeDiff;
        return (b.id as string) < (a.id as string) ? -1 : 1;
      });
      return { results: rows.slice(0, limit) };
    }

    if (
      trimmed.startsWith(
        "SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?",
      )
    ) {
      const row =
        tables.lobby_players.find(
          (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
        ) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (trimmed.startsWith("SELECT * FROM lobby_players WHERE lobby_id IN")) {
      const ids = new Set(binds as string[]);
      const rows = tables.lobby_players.filter((r) =>
        ids.has(r.lobby_id as string),
      );
      return { results: rows };
    }

    if (trimmed.startsWith("SELECT * FROM lobby_players WHERE lobby_id = ?")) {
      const rows = tables.lobby_players.filter((r) => r.lobby_id === binds[0]);
      return { results: rows };
    }

    if (trimmed.startsWith("SELECT * FROM lobby_players WHERE user_id = ?")) {
      const rows = tables.lobby_players.filter((r) => r.user_id === binds[0]);
      return { results: rows };
    }

    if (
      trimmed.includes("SELECT id, status, state_json FROM games WHERE id = ?")
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.includes(
        "SELECT id, status, player_ids_json, state_json FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.includes(
        "SELECT id, status, player_ids_json, started_at, ended_at, winner_id FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (trimmed.includes("SELECT player_ids_json FROM games WHERE id = ?")) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return {
        results: row ? [row] : [],
        first: row ? { player_ids_json: row.player_ids_json } : null,
      };
    }

    if (
      trimmed.includes("SELECT id, player_ids_json FROM games WHERE id = ?")
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    // Use startsWith so this does not also intercept UPDATE statements that
    // embed `SELECT lobby_id FROM games WHERE id = ?` as a subquery.
    if (trimmed.startsWith("SELECT lobby_id FROM games WHERE id = ?")) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return {
        results: row ? [row] : [],
        first: row ? { lobby_id: row.lobby_id } : null,
      };
    }

    if (
      trimmed.includes(
        "SELECT id, player_ids_json, state_json FROM games WHERE id = ?",
      )
    ) {
      const row = tables.games.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.startsWith(
        "SELECT id FROM games WHERE lobby_id = ? AND status = 'active'",
      )
    ) {
      const rows = tables.games
        .filter((r) => r.lobby_id === binds[0] && r.status === "active")
        .sort((a, b) => (b.started_at as number) - (a.started_at as number));
      const row = rows[0] ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.startsWith(
        "UPDATE games SET state_json = ? WHERE id = ? AND state_json = ?",
      )
    ) {
      const row = tables.games.find(
        (r) => r.id === binds[1] && r.state_json === binds[2],
      );
      if (row) row.state_json = binds[0];
      lastChanges = row ? 1 : 0;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (trimmed.startsWith("UPDATE games SET state_json = ? WHERE id = ?")) {
      const row = tables.games.find((r) => r.id === binds[1]);
      if (row) row.state_json = binds[0];
      lastChanges = row ? 1 : 0;
      return { results: [], success: true, meta: { changes: row ? 1 : 0 } };
    }

    if (trimmed.startsWith("UPDATE games SET status = 'completed'")) {
      if (hasAppliedGuard && !appliedGuardSatisfied(binds[3], binds[4])) {
        return { results: [], success: true, meta: { changes: 0 } };
      }
      const row = tables.games.find((r) => r.id === binds[2]);
      if (row) {
        row.status = "completed";
        row.winner_id = binds[0];
        row.ended_at = binds[1];
      }
      return { results: [], success: true };
    }

    if (trimmed.startsWith("UPDATE lobbies SET status = 'in_game'")) {
      const row = tables.lobbies.find((r) => r.id === binds[0]);
      if (row) row.status = "in_game";
      return { results: [], success: true };
    }

    if (trimmed.startsWith("UPDATE lobbies SET status = 'finished'")) {
      if (hasAppliedGuard && !appliedGuardSatisfied(binds[1], binds[2])) {
        return { results: [], success: true, meta: { changes: 0 } };
      }
      const lobbyId = trimmed.includes("(SELECT lobby_id FROM games")
        ? tables.games.find((r) => r.id === binds[0])?.lobby_id
        : binds[0];
      const row = tables.lobbies.find((r) => r.id === lobbyId);
      if (row) row.status = "finished";
      return { results: [], success: true };
    }

    if (trimmed.startsWith("UPDATE lobbies SET")) {
      const id = binds[binds.length - 1];
      const row = tables.lobbies.find((r) => r.id === id);
      if (row) {
        const setPart = trimmed.match(/SET (.+?) WHERE/)?.[1] ?? "";
        const fields = setPart.split(",").map((f) => f.trim().split(" = ")[0]);
        for (let i = 0; i < fields.length; i++) {
          row[fields[i]] = binds[i];
        }
      }
      return { results: [], success: true };
    }

    if (trimmed.startsWith("UPDATE lobby_players SET is_ready = 1")) {
      const row = tables.lobby_players.find(
        (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
      );
      if (row) row.is_ready = 1;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (trimmed.startsWith("UPDATE lobby_players SET is_ready = 0")) {
      const row = tables.lobby_players.find(
        (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
      );
      if (row) row.is_ready = 0;
      return { meta: { changes: row ? 1 : 0 } };
    }

    if (trimmed.startsWith("UPDATE lobby_players SET is_admin = 1")) {
      const row = tables.lobby_players.find(
        (r) => r.lobby_id === binds[0] && r.user_id === binds[1],
      );
      if (row) row.is_admin = 1;
      return { results: [], success: true };
    }

    if (trimmed.startsWith("DELETE FROM lobby_players")) {
      tables.lobby_players = tables.lobby_players.filter(
        (r) => !(r.lobby_id === binds[0] && r.user_id === binds[1]),
      );
      return { results: [], success: true };
    }

    if (trimmed.startsWith("DELETE FROM lobbies WHERE id = ?")) {
      tables.lobbies = tables.lobbies.filter((r) => r.id !== binds[0]);
      return { results: [], success: true };
    }

    if (trimmed.startsWith("INSERT INTO users")) {
      const [id, username] = binds as [string, string];
      tables.users.push({ id, username, role: "user" });
      return { results: [], success: true };
    }

    if (trimmed.startsWith("SELECT id FROM users WHERE username = ?")) {
      const row = tables.users.find((r) => r.username === binds[0]) ?? null;
      const projected = row ? { id: row.id } : null;
      return { results: projected ? [projected] : [], first: projected };
    }

    if (trimmed.startsWith("SELECT id, role FROM users WHERE id = ?")) {
      const row = tables.users.find((r) => r.id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (trimmed.startsWith("SELECT username FROM users WHERE id = ?")) {
      const row = tables.users.find((r) => r.id === binds[0]) ?? null;
      return {
        results: row ? [row] : [],
        first: row ? { username: row.username } : null,
      };
    }

    if (
      trimmed.startsWith(
        "SELECT recent_games_json FROM user_stats WHERE user_id = ? LIMIT 1",
      )
    ) {
      const row =
        tables.user_stats.find((entry) => entry.user_id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.startsWith(
        "SELECT games_played, wins, trades_completed, auctions_won, recent_games_json FROM user_stats WHERE user_id = ?",
      )
    ) {
      const row = tables.user_stats.find((r) => r.user_id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.startsWith(
        "INSERT INTO user_stats (user_id, games_played, wins, trades_completed, auctions_won, recent_games_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
    ) {
      const [
        user_id,
        games_played,
        wins,
        trades_completed,
        auctions_won,
        recent_games_json,
      ] = binds as [string, number, number, number, number, string];
      tables.user_stats.push({
        user_id,
        games_played,
        wins,
        trades_completed,
        auctions_won,
        recent_games_json,
      });
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith(
        "UPDATE user_stats SET recent_games_json = ? WHERE user_id = ?",
      )
    ) {
      const row = tables.user_stats.find((r) => r.user_id === binds[1]);
      if (row) {
        row.recent_games_json = binds[0];
      }
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith(
        "UPDATE user_stats SET games_played = ?, wins = ?, recent_games_json = ? WHERE user_id = ?",
      )
    ) {
      const row = tables.user_stats.find((r) => r.user_id === binds[3]);
      if (row) {
        row.games_played = binds[0];
        row.wins = binds[1];
        row.recent_games_json = binds[2];
      }
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith(
        "SELECT id FROM achievements WHERE user_id = ? AND id = ?",
      )
    ) {
      const row =
        tables.achievements.find(
          (r) => r.user_id === binds[0] && r.id === binds[1],
        ) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (
      trimmed.startsWith(
        "INSERT INTO achievements (id, user_id, unlocked_at) VALUES (?, ?, ?)",
      )
    ) {
      const [id, user_id, unlocked_at] = binds as [string, string, number];
      tables.achievements.push({ id, user_id, unlocked_at });
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith("SELECT rank_points FROM user_ranks WHERE user_id = ?")
    ) {
      const row = tables.user_ranks.find((r) => r.user_id === binds[0]) ?? null;
      return {
        results: row ? [row] : [],
        first: row ? { rank_points: row.rank_points } : null,
      };
    }

    if (
      trimmed.startsWith(
        "UPDATE user_ranks SET rank_points = ?, tier = ?, title = ? WHERE user_id = ?",
      )
    ) {
      const row = tables.user_ranks.find((r) => r.user_id === binds[3]);
      if (row) {
        row.rank_points = binds[0];
        row.tier = binds[1];
        row.title = binds[2];
      } else {
        tables.user_ranks.push({
          user_id: binds[3],
          rank_points: binds[0],
          tier: binds[1],
          title: binds[2],
        });
      }
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith(
        "INSERT INTO user_ranks (user_id, tier, title, rank_points) VALUES (?, ?, ?, ?)",
      )
    ) {
      tables.user_ranks.push({
        user_id: binds[0],
        tier: binds[1],
        title: binds[2],
        rank_points: binds[3],
      });
      return { results: [], success: true };
    }

    if (
      trimmed.startsWith("SELECT rank_tier FROM user_ranks WHERE user_id = ?")
    ) {
      const row = tables.user_ranks.find((r) => r.user_id === binds[0]) ?? null;
      return { results: row ? [row] : [], first: row };
    }

    if (trimmed.includes("COUNT(*)")) {
      const rows = tables.lobby_players.filter((r) => r.lobby_id === binds[0]);
      return { results: [{ cnt: rows.length }], first: { cnt: rows.length } };
    }

    if (trimmed.includes("FROM games") && trimmed.includes("ORDER BY")) {
      let rows = [...tables.games];
      const statusIdx = trimmed.indexOf("status = ?");
      if (statusIdx !== -1) {
        rows = rows.filter((r) => r.status === binds[0]);
      }
      return { results: rows };
    }

    if (trimmed.includes("FROM game_log WHERE game_id = ?")) {
      const rows = tables.game_log.filter((r) => r.game_id === binds[0]);
      return { results: rows };
    }

    return { results: [] };
  };

  const prepare = (sql: string) => {
    let boundValues: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        boundValues = args;
        return stmt;
      },
      run: async () => execSql(sql, boundValues),
      all: async <T>() => {
        const result = execSql(sql, boundValues);
        return { results: result.results as T[] };
      },
      first: async <T>() => {
        const result = execSql(sql, boundValues);
        return (result.first ?? result.results[0] ?? null) as T | null;
      },
      _exec: () => execSql(sql, boundValues),
      _sql: sql,
    };
    return stmt;
  };

  const batch = async (stmts: unknown[]) => {
    return stmts.map((s) => {
      const stmt = s as { _exec: () => { results: unknown[] } };
      return stmt._exec();
    });
  };

  return { prepare, batch, _tables: tables } as unknown as WorkerD1Stub;
}
