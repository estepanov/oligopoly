-- =============================================================================
-- 0006_multiplayer_ai_runtime.sql
-- Adds lobby AI slot storage for solo-vs-AI and mixed human/AI games.
-- =============================================================================

ALTER TABLE lobbies ADD COLUMN ai_slots_json TEXT NOT NULL DEFAULT '[]';
