-- =============================================================================
-- 0003_add_user_role.sql
-- Adds a role column to the users table for global role-based access control.
-- Default value is 'user'; admin accounts should be set to 'global_admin'.
-- =============================================================================

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
