-- D1-backed invite claims make lobby invite tokens single-use atomically.
CREATE TABLE IF NOT EXISTS lobby_invites (
  token TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lobby_invites_lobby_id ON lobby_invites(lobby_id);
