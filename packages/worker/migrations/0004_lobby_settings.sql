-- =============================================================================
-- 0004_lobby_settings.sql
-- Adds enhanced lobby settings columns to the lobbies table.
-- All new columns have sensible defaults matching game rules.
-- =============================================================================

ALTER TABLE lobbies ADD COLUMN turn_timeout TEXT NOT NULL DEFAULT '5min';
ALTER TABLE lobbies ADD COLUMN auction_bid_window TEXT NOT NULL DEFAULT '1min';
ALTER TABLE lobbies ADD COLUMN auction_settle_delay TEXT NOT NULL DEFAULT '30s';
ALTER TABLE lobbies ADD COLUMN auction_type TEXT NOT NULL DEFAULT 'sealed_bids';
ALTER TABLE lobbies ADD COLUMN voice_video_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lobbies ADD COLUMN spectator_mode TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE lobbies ADD COLUMN market_event_deck_json TEXT;
ALTER TABLE lobbies ADD COLUMN optional_event_card_ids_json TEXT;
ALTER TABLE lobbies ADD COLUMN currency_name TEXT NOT NULL DEFAULT 'Capital';
ALTER TABLE lobbies ADD COLUMN currency_symbol TEXT NOT NULL DEFAULT '¤';
ALTER TABLE lobbies ADD COLUMN currency_multiplier TEXT NOT NULL DEFAULT '1';
