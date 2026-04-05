CREATE TABLE `achievements` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`target_id` text,
	`action` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `binding_contract_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`term_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `binding_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`party_a` text NOT NULL,
	`party_b` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_round` integer NOT NULL,
	`expires_round` integer,
	`signed_at` integer NOT NULL,
	`fulfilled_at` integer,
	`breached_at` integer
);
--> statement-breakpoint
CREATE TABLE `game_log` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`round` integer NOT NULL,
	`player_id` text,
	`action_type` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`winner_id` text,
	`player_ids_json` text NOT NULL,
	`state_json` text
);
--> statement-breakpoint
CREATE TABLE `handshake_agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`party_ids_json` text NOT NULL,
	`summary` text NOT NULL,
	`signed_at` integer NOT NULL,
	`settled_at` integer,
	`broken_by` text
);
--> statement-breakpoint
CREATE TABLE `lobbies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host_id` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`max_players` integer NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`optional_rule_ids_json` text,
	`created_at` integer NOT NULL,
	`turn_timeout` text DEFAULT '5min' NOT NULL,
	`auction_bid_window` text DEFAULT '1min' NOT NULL,
	`auction_settle_delay` text DEFAULT '30s' NOT NULL,
	`auction_type` text DEFAULT 'sealed_bids' NOT NULL,
	`voice_video_enabled` integer DEFAULT false NOT NULL,
	`spectator_mode` text DEFAULT 'disabled' NOT NULL,
	`market_event_deck_json` text,
	`optional_event_card_ids_json` text,
	`currency_name` text DEFAULT 'Capital' NOT NULL,
	`currency_symbol` text DEFAULT '¤' NOT NULL,
	`currency_multiplier` text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lobby_players` (
	`lobby_id` text NOT NULL,
	`user_id` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`lobby_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `negotiation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `negotiation_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`created_by` text NOT NULL,
	`party_ids_json` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`started_round` integer NOT NULL,
	`expires_after_round` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`proposed_contract_id` text,
	`handshake_record_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `syndicate_charters` (
	`syndicate_id` text PRIMARY KEY NOT NULL,
	`charter_json` text NOT NULL,
	`ratified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trustworthiness` (
	`user_id` text PRIMARY KEY NOT NULL,
	`score` integer DEFAULT 7 NOT NULL,
	`last_updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_ranks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`title` text,
	`rank_points` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_visibility` (
	`user_id` text PRIMARY KEY NOT NULL,
	`rank` text DEFAULT 'public' NOT NULL,
	`career_stats` text DEFAULT 'public' NOT NULL,
	`achievements` text DEFAULT 'public' NOT NULL,
	`recent_games` text DEFAULT 'public' NOT NULL,
	`online_status` text DEFAULT 'authenticated' NOT NULL,
	`last_seen` text DEFAULT 'authenticated' NOT NULL,
	`favorite_sector` text DEFAULT 'public' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`avatar_url` text,
	`full_name` text,
	`email` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`timezone` text,
	`currency` text,
	`country` text,
	`theme_preference` text DEFAULT 'system' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);