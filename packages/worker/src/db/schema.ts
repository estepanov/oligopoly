import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// -----------------------------------------------------------------------------
// users
// -----------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  avatarUrl: text("avatar_url"),
  fullName: text("full_name"),
  email: text("email").unique(),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone"),
  currency: text("currency"),
  country: text("country"),
  themePreference: text("theme_preference").notNull().default("system"),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// -----------------------------------------------------------------------------
// user_visibility
// -----------------------------------------------------------------------------
export const userVisibility = sqliteTable("user_visibility", {
  userId: text("user_id").primaryKey(),
  rank: text("rank").notNull().default("public"),
  careerStats: text("career_stats").notNull().default("public"),
  achievements: text("achievements").notNull().default("public"),
  recentGames: text("recent_games").notNull().default("public"),
  onlineStatus: text("online_status").notNull().default("authenticated"),
  lastSeen: text("last_seen").notNull().default("authenticated"),
  favoriteSector: text("favorite_sector").notNull().default("public"),
});

// -----------------------------------------------------------------------------
// user_ranks
// -----------------------------------------------------------------------------
export const userRanks = sqliteTable("user_ranks", {
  userId: text("user_id").primaryKey(),
  tier: integer("tier").notNull().default(0),
  title: text("title"),
  rankPoints: integer("rank_points").notNull().default(0),
});

// -----------------------------------------------------------------------------
// achievements
// Composite PK (user_id, id) prevents duplicates.
// -----------------------------------------------------------------------------
export const achievements = sqliteTable(
  "achievements",
  {
    id: text("id").notNull(),
    userId: text("user_id").notNull(),
    unlockedAt: integer("unlocked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

// -----------------------------------------------------------------------------
// trustworthiness
// Range 0..10, default 7.
// -----------------------------------------------------------------------------
export const trustworthiness = sqliteTable("trustworthiness", {
  userId: text("user_id").primaryKey(),
  score: integer("score").notNull().default(7),
  lastUpdatedAt: integer("last_updated_at").notNull(),
});

// -----------------------------------------------------------------------------
// handshake_agreements
// Declared before negotiation_threads because threads may reference them.
// -----------------------------------------------------------------------------
export const handshakeAgreements = sqliteTable("handshake_agreements", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  partyIdsJson: text("party_ids_json").notNull(),
  summary: text("summary").notNull(),
  signedAt: integer("signed_at").notNull(),
  settledAt: integer("settled_at"),
  brokenBy: text("broken_by"),
});

// -----------------------------------------------------------------------------
// binding_contracts
// Declared before negotiation_threads because threads may reference them.
// -----------------------------------------------------------------------------
export const bindingContracts = sqliteTable("binding_contracts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  partyA: text("party_a").notNull(),
  partyB: text("party_b").notNull(),
  status: text("status").notNull().default("active"),
  startsRound: integer("starts_round").notNull(),
  expiresRound: integer("expires_round"),
  signedAt: integer("signed_at").notNull(),
  fulfilledAt: integer("fulfilled_at"),
  breachedAt: integer("breached_at"),
});

// -----------------------------------------------------------------------------
// binding_contract_terms
// term_json stores the full BindingContractTerm discriminated union payload.
// -----------------------------------------------------------------------------
export const bindingContractTerms = sqliteTable("binding_contract_terms", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  termJson: text("term_json").notNull(),
});

// -----------------------------------------------------------------------------
// negotiation_threads
// -----------------------------------------------------------------------------
export const negotiationThreads = sqliteTable("negotiation_threads", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  createdBy: text("created_by").notNull(),
  partyIdsJson: text("party_ids_json").notNull(),
  status: text("status").notNull().default("open"),
  startedRound: integer("started_round").notNull(),
  expiresAfterRound: integer("expires_after_round").notNull(),
  visibility: text("visibility").notNull().default("private"),
  proposedContractId: text("proposed_contract_id"),
  handshakeRecordId: text("handshake_record_id"),
  createdAt: integer("created_at").notNull(),
});

// -----------------------------------------------------------------------------
// negotiation_messages
// -----------------------------------------------------------------------------
export const negotiationMessages = sqliteTable("negotiation_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  senderId: text("sender_id").notNull(),
  content: text("content").notNull(),
  sentAt: integer("sent_at").notNull(),
});

// -----------------------------------------------------------------------------
// syndicate_charters
// -----------------------------------------------------------------------------
export const syndicateCharters = sqliteTable("syndicate_charters", {
  syndicateId: text("syndicate_id").primaryKey(),
  charterJson: text("charter_json").notNull(),
  ratifiedAt: integer("ratified_at").notNull(),
});

// -----------------------------------------------------------------------------
// admin_audit_log
// Append-only log of admin actions.
// -----------------------------------------------------------------------------
export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  targetId: text("target_id"),
  action: text("action").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at").notNull(),
});

// -----------------------------------------------------------------------------
// games
// -----------------------------------------------------------------------------
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  lobbyId: text("lobby_id"),
  status: text("status").notNull().default("active"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  winnerId: text("winner_id"),
  playerIdsJson: text("player_ids_json").notNull(),
  stateJson: text("state_json"),
});

// -----------------------------------------------------------------------------
// game_log
// Append-only log of all in-game actions, one row per action.
// -----------------------------------------------------------------------------
export const gameLog = sqliteTable("game_log", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  round: integer("round").notNull(),
  playerId: text("player_id"),
  actionType: text("action_type").notNull(),
  payloadJson: text("payload_json"),
  createdAt: integer("created_at").notNull(),
});

// -----------------------------------------------------------------------------
// lobbies
// -----------------------------------------------------------------------------
export const lobbies = sqliteTable("lobbies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  hostId: text("host_id").notNull(),
  status: text("status").notNull().default("waiting"),
  maxPlayers: integer("max_players").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" })
    .notNull()
    .default(false),
  optionalRuleIdsJson: text("optional_rule_ids_json"),
  createdAt: integer("created_at").notNull(),
  turnTimeout: text("turn_timeout").notNull().default("5min"),
  auctionBidWindow: text("auction_bid_window").notNull().default("1min"),
  auctionSettleDelay: text("auction_settle_delay").notNull().default("30s"),
  auctionExtensionWindow: text("auction_extension_window")
    .notNull()
    .default("15s"),
  auctionType: text("auction_type").notNull().default("sealed_bids"),
  voiceVideoEnabled: integer("voice_video_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  spectatorMode: text("spectator_mode").notNull().default("disabled"),
  marketEventDeckJson: text("market_event_deck_json"),
  optionalEventCardIdsJson: text("optional_event_card_ids_json"),
  currencyName: text("currency_name").notNull().default("Capital"),
  currencySymbol: text("currency_symbol").notNull().default("¤"),
  currencyMultiplier: text("currency_multiplier").notNull().default("1"),
  aiSlotsJson: text("ai_slots_json").notNull().default("[]"),
});

// -----------------------------------------------------------------------------
// lobby_players
// Composite PK (lobby_id, user_id) prevents duplicate joins.
// -----------------------------------------------------------------------------
export const lobbyPlayers = sqliteTable(
  "lobby_players",
  {
    lobbyId: text("lobby_id").notNull(),
    userId: text("user_id").notNull(),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    joinedAt: integer("joined_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.lobbyId, t.userId] })],
);
