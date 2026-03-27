-- =============================================================================
-- 0001_initial_schema.sql
-- Initial D1 schema for Oligopoly Online.
--
-- Notes:
--   - All timestamps are Unix epoch milliseconds (INTEGER).
--   - Foreign key constraints are advisory; D1 does not enforce them.
--   - user_settings fields are merged into users + user_visibility tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users
-- Core identity and settings merged from user_settings spec.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT    PRIMARY KEY,
  username            TEXT    UNIQUE NOT NULL,
  avatar_url          TEXT,
  full_name           TEXT,
  email               TEXT    UNIQUE,
  locale              TEXT    NOT NULL DEFAULT 'en',
  timezone            TEXT,
  currency            TEXT,
  country             TEXT,
  theme_preference    TEXT    NOT NULL DEFAULT 'system',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- user_visibility
-- One row per user; one column per ProfileVisibility field.
-- Defaults match DEFAULT_PROFILE_VISIBILITY in @oligopoly/shared.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_visibility (
  user_id             TEXT    PRIMARY KEY REFERENCES users(id),
  rank                TEXT    NOT NULL DEFAULT 'public',
  career_stats        TEXT    NOT NULL DEFAULT 'public',
  achievements        TEXT    NOT NULL DEFAULT 'public',
  recent_games        TEXT    NOT NULL DEFAULT 'public',
  online_status       TEXT    NOT NULL DEFAULT 'authenticated',
  last_seen           TEXT    NOT NULL DEFAULT 'authenticated',
  favorite_sector     TEXT    NOT NULL DEFAULT 'public'
);

-- -----------------------------------------------------------------------------
-- user_ranks
-- Rank tier, title, and cumulative rank points per user.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_ranks (
  user_id             TEXT    PRIMARY KEY,
  tier                INTEGER NOT NULL DEFAULT 0,
  title               TEXT,
  rank_points         INTEGER NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- achievements
-- Unlocked achievement records per user. Composite PK prevents duplicates.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievements (
  id                  TEXT    NOT NULL,
  user_id             TEXT    NOT NULL REFERENCES users(id),
  unlocked_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- -----------------------------------------------------------------------------
-- trustworthiness
-- Current trust score per user; range 0..10, default 7.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trustworthiness (
  user_id             TEXT    PRIMARY KEY REFERENCES users(id),
  score               INTEGER NOT NULL DEFAULT 7,
  last_updated_at     INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- handshake_agreements
-- Declared before negotiation_threads because threads may reference them.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handshake_agreements (
  id                  TEXT    PRIMARY KEY,
  game_id             TEXT    NOT NULL,
  party_ids_json      TEXT    NOT NULL,
  summary             TEXT    NOT NULL,
  signed_at           INTEGER NOT NULL,
  settled_at          INTEGER,
  broken_by           TEXT
);

-- -----------------------------------------------------------------------------
-- binding_contracts
-- Declared before negotiation_threads because threads may reference them.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS binding_contracts (
  id                  TEXT    PRIMARY KEY,
  game_id             TEXT    NOT NULL,
  party_a             TEXT    NOT NULL,
  party_b             TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'active',
  starts_round        INTEGER NOT NULL,
  expires_round       INTEGER,
  signed_at           INTEGER NOT NULL,
  fulfilled_at        INTEGER,
  breached_at         INTEGER
);

-- -----------------------------------------------------------------------------
-- binding_contract_terms
-- Individual terms belonging to a binding contract.
-- term_json stores the full BindingContractTerm discriminated union payload.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS binding_contract_terms (
  id                  TEXT    PRIMARY KEY,
  contract_id         TEXT    NOT NULL REFERENCES binding_contracts(id),
  term_json           TEXT    NOT NULL
);

-- -----------------------------------------------------------------------------
-- negotiation_threads
-- All fields from NegotiationThread type. Messages in separate table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negotiation_threads (
  id                      TEXT    PRIMARY KEY,
  game_id                 TEXT    NOT NULL,
  created_by              TEXT    NOT NULL,
  party_ids_json          TEXT    NOT NULL,
  status                  TEXT    NOT NULL DEFAULT 'open',
  started_round           INTEGER NOT NULL,
  expires_after_round     INTEGER NOT NULL,
  visibility              TEXT    NOT NULL DEFAULT 'private',
  proposed_contract_id    TEXT    REFERENCES binding_contracts(id),
  handshake_record_id     TEXT    REFERENCES handshake_agreements(id),
  created_at              INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- negotiation_messages
-- Messages within a negotiation thread.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id                  TEXT    PRIMARY KEY,
  thread_id           TEXT    NOT NULL REFERENCES negotiation_threads(id),
  sender_id           TEXT    NOT NULL,
  content             TEXT    NOT NULL,
  sent_at             INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- syndicate_charters
-- Full charter stored as JSON alongside denormalized ratified_at for queries.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS syndicate_charters (
  syndicate_id        TEXT    PRIMARY KEY,
  charter_json        TEXT    NOT NULL,
  ratified_at         INTEGER NOT NULL
);

-- -----------------------------------------------------------------------------
-- admin_audit_log
-- Append-only log of admin actions.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                  TEXT    PRIMARY KEY,
  admin_id            TEXT    NOT NULL,
  target_id           TEXT,
  action              TEXT    NOT NULL,
  metadata_json       TEXT,
  created_at          INTEGER NOT NULL
);
