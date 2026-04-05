-- =============================================================================
-- 0004_passkey_auth.sql
-- Adds passkey (WebAuthn) credential storage and session management tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- passkey_credentials
-- Stores registered WebAuthn credentials per user.
-- credential_id and public_key are stored as hex-encoded strings.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id),
  credential_id       TEXT    UNIQUE NOT NULL,
  public_key          TEXT    NOT NULL,
  counter             INTEGER NOT NULL DEFAULT 0,
  device_type         TEXT    NOT NULL DEFAULT 'singleDevice',
  backed_up           INTEGER NOT NULL DEFAULT 0,
  transports          TEXT,
  created_at          INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- auth_sessions
-- Bearer-token sessions created after successful passkey authentication.
-- token is a random hex string used as the Authorization Bearer value.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL REFERENCES users(id),
  token               TEXT    UNIQUE NOT NULL,
  expires_at          INTEGER NOT NULL,
  created_at          INTEGER NOT NULL
);
