-- =============================================================================
-- 0003_user_stats.sql
-- Career stats and recent game history per user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_stats (
  user_id             TEXT    PRIMARY KEY REFERENCES users(id),
  games_played        INTEGER NOT NULL DEFAULT 0,
  wins                INTEGER NOT NULL DEFAULT 0,
  trades_completed    INTEGER NOT NULL DEFAULT 0,
  auctions_won        INTEGER NOT NULL DEFAULT 0,
  favorite_sector     TEXT,
  recent_games_json   TEXT    NOT NULL DEFAULT '[]'
);
