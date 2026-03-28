-- =============================================================================
-- 0002_games_and_game_log.sql
-- Adds games and game_log tables.
--
-- Notes:
--   - All timestamps are Unix epoch milliseconds (INTEGER).
--   - Foreign key constraints are advisory; D1 does not enforce them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- games
-- One row per game instance. player_ids_json is a JSON array of user IDs.
-- state_json holds the full serialized game state (updated in-place).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id                  TEXT    PRIMARY KEY,
  lobby_id            TEXT,
  status              TEXT    NOT NULL DEFAULT 'active',
  started_at          INTEGER NOT NULL,
  ended_at            INTEGER,
  winner_id           TEXT,
  player_ids_json     TEXT    NOT NULL,
  state_json          TEXT
);

-- -----------------------------------------------------------------------------
-- game_log
-- Append-only log of all in-game actions, one row per action.
-- payload_json holds action-specific data (nullable for system events).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_log (
  id                  TEXT    PRIMARY KEY,
  game_id             TEXT    NOT NULL REFERENCES games(id),
  round               INTEGER NOT NULL,
  player_id           TEXT,
  action_type         TEXT    NOT NULL,
  payload_json        TEXT,
  created_at          INTEGER NOT NULL
);
