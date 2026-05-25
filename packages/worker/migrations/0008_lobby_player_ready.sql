-- Add ready flag for lobby players (human readiness before start)
ALTER TABLE lobby_players ADD COLUMN is_ready INTEGER NOT NULL DEFAULT 0;
