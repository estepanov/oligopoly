-- =============================================================================
-- 0002_lobby_tables.sql
-- Lobby and lobby_players tables for pre-game rooms.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lobbies
-- Pre-game rooms where players gather, configure settings, and start games.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lobbies (
  id                    TEXT    PRIMARY KEY,
  name                  TEXT    NOT NULL,
  host_id               TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'waiting',
  max_players           INTEGER NOT NULL,
  is_private            INTEGER NOT NULL DEFAULT 0,
  optional_rule_ids_json TEXT,
  created_at            INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- lobby_players
-- Players currently in a lobby. Composite PK prevents duplicate joins.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lobby_players (
  lobby_id              TEXT    NOT NULL,
  user_id               TEXT    NOT NULL,
  is_admin              INTEGER NOT NULL DEFAULT 0,
  joined_at             INTEGER NOT NULL,
  PRIMARY KEY (lobby_id, user_id)
);
