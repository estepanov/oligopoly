-- =============================================================================
-- 0005_lobby_cleanup_and_membership_index.sql
-- Removes existing empty lobbies and adds an index for per-user lobby lookups.
-- =============================================================================

DELETE FROM lobbies
WHERE NOT EXISTS (
  SELECT 1
  FROM lobby_players
  WHERE lobby_players.lobby_id = lobbies.id
);

CREATE INDEX IF NOT EXISTS idx_lobby_players_user_id
  ON lobby_players(user_id);
