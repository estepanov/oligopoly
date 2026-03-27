-- 0001_initial_schema.sql
-- Initial D1 schema for Oligopoly Online
-- All timestamps are stored as Unix epoch milliseconds (INTEGER).
-- Foreign key constraints are advisory — D1 does not enforce them by default.

-- ============================================================================
-- Users
-- ============================================================================
-- user_settings fields are merged into this table for simplicity.
-- Aligned with UpdateUserSettingsInput schema in @oligopoly/validation.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  full_name TEXT,
  email TEXT UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT,
  currency TEXT,
  country TEXT,
  theme_preference TEXT NOT NULL DEFAULT 'system',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================================================
-- User Visibility
-- ============================================================================
-- One column per ProfileVisibility field from @oligopoly/validation.
-- Defaults match DEFAULT_PROFILE_VISIBILITY in @oligopoly/shared.
CREATE TABLE IF NOT EXISTS user_visibility (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  rank TEXT NOT NULL DEFAULT 'public',
  career_stats TEXT NOT NULL DEFAULT 'public',
  achievements TEXT NOT NULL DEFAULT 'public',
  recent_games TEXT NOT NULL DEFAULT 'public',
  online_status TEXT NOT NULL DEFAULT 'authenticated',
  last_seen TEXT NOT NULL DEFAULT 'authenticated',
  favorite_sector TEXT NOT NULL DEFAULT 'public'
);

-- ============================================================================
-- User Ranks
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_ranks (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  tier INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  rank_points INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- Achievements
-- ============================================================================
-- Keyed by (user_id, id) to allow multiple achievements per user.
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- ============================================================================
-- Trustworthiness
-- ============================================================================
-- Starting score is 7 (TRUSTWORTHINESS_DEFAULT in @oligopoly/shared).
CREATE TABLE IF NOT EXISTS trustworthiness (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  score INTEGER NOT NULL DEFAULT 7,
  last_updated_at INTEGER NOT NULL
);

-- ============================================================================
-- Negotiation Threads
-- ============================================================================
-- Maps to NegotiationThread interface in the technical plan.
-- party_ids stored as JSON array text (e.g. '["player1","player2"]').
CREATE TABLE IF NOT EXISTS negotiation_threads (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  party_ids TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  started_round INTEGER NOT NULL,
  expires_after_round INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  proposed_contract_id TEXT,
  handshake_record_id TEXT
);

-- ============================================================================
-- Negotiation Messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS negotiation_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES negotiation_threads(id),
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

-- ============================================================================
-- Binding Contracts
-- ============================================================================
-- Maps to BindingContract interface in @oligopoly/shared.
CREATE TABLE IF NOT EXISTS binding_contracts (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  party_a TEXT NOT NULL,
  party_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_round INTEGER NOT NULL,
  expires_round INTEGER,
  signed_at INTEGER NOT NULL,
  fulfilled_at INTEGER,
  breached_at INTEGER
);

-- ============================================================================
-- Binding Contract Terms
-- ============================================================================
-- Each term stored as a JSON blob matching BindingContractTerm discriminated union.
CREATE TABLE IF NOT EXISTS binding_contract_terms (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES binding_contracts(id),
  term_json TEXT NOT NULL
);

-- ============================================================================
-- Handshake Agreements
-- ============================================================================
-- Maps to HandshakeAgreement interface in the technical plan.
-- party_ids stored as JSON array text.
CREATE TABLE IF NOT EXISTS handshake_agreements (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  party_ids TEXT NOT NULL,
  summary TEXT NOT NULL,
  signed_at INTEGER NOT NULL,
  settled_at INTEGER,
  broken_by TEXT
);

-- ============================================================================
-- Syndicate Charters
-- ============================================================================
-- charter_json stores the full SyndicateCharter object as JSON.
CREATE TABLE IF NOT EXISTS syndicate_charters (
  syndicate_id TEXT PRIMARY KEY,
  charter_json TEXT NOT NULL,
  ratified_at INTEGER NOT NULL
);

-- ============================================================================
-- Admin Audit Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  target_id TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
