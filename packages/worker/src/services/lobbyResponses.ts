import { parseAiSlots } from "./lobbyAi.js";

export type LobbyRow = {
  id: string;
  name: string;
  host_id: string;
  status: string;
  max_players: number;
  is_private: number;
  optional_rule_ids_json: string | null;
  created_at: number;
  turn_timeout: string;
  auction_bid_window: string;
  auction_settle_delay: string;
  auction_extension_window: string;
  auction_type: string;
  voice_video_enabled: number;
  spectator_mode: string;
  market_event_deck_json: string | null;
  optional_event_card_ids_json: string | null;
  currency_name: string;
  currency_symbol: string;
  currency_multiplier: string;
  ai_slots_json: string | null;
};

export type LobbyPlayerRow = {
  lobby_id: string;
  user_id: string;
  is_admin: number;
  joined_at: number;
  is_ready?: number;
};

const getActiveGameIdForLobby = async (
  db: D1Database,
  lobbyId: string,
): Promise<string | undefined> => {
  const row = await db
    .prepare(
      "SELECT id FROM games WHERE lobby_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    )
    .bind(lobbyId)
    .first<{ id: string }>();
  return row?.id;
};

export const toLobbyResponse = (
  row: LobbyRow,
  players: LobbyPlayerRow[] = [],
  gameId?: string,
) => ({
  id: row.id,
  name: row.name,
  hostId: row.host_id,
  status: row.status,
  maxPlayers: row.max_players,
  isPrivate: row.is_private === 1,
  optionalRuleIds: row.optional_rule_ids_json
    ? JSON.parse(row.optional_rule_ids_json)
    : [],
  createdAt: row.created_at,
  players: players.map((p) => ({
    userId: p.user_id,
    isAdmin: p.is_admin === 1,
    isReady: (p.is_ready ?? 0) === 1,
    joinedAt: p.joined_at,
  })),
  turnTimeout: row.turn_timeout ?? "5min",
  auctionBidWindow: row.auction_bid_window ?? "1min",
  auctionSettleDelay: row.auction_settle_delay ?? "30s",
  auctionExtensionWindow: row.auction_extension_window ?? "15s",
  auctionType: row.auction_type ?? "sealed_bids",
  voiceVideoEnabled: (row.voice_video_enabled ?? 0) === 1,
  spectatorMode: row.spectator_mode ?? "disabled",
  marketEventDeckCardIds: row.market_event_deck_json
    ? JSON.parse(row.market_event_deck_json)
    : null,
  optionalMarketEventCardIds: row.optional_event_card_ids_json
    ? JSON.parse(row.optional_event_card_ids_json)
    : [],
  currencyName: row.currency_name ?? "Capital",
  currencySymbol: row.currency_symbol ?? "$",
  currencyMultiplier: row.currency_multiplier ?? "1",
  aiSlots: parseAiSlots(row.ai_slots_json),
  ...(gameId ? { gameId } : {}),
});

export const buildLobbyResponse = async (
  db: D1Database,
  row: LobbyRow,
  players: LobbyPlayerRow[] = [],
) => {
  const gameId =
    row.status === "in_game"
      ? await getActiveGameIdForLobby(db, row.id)
      : undefined;
  return toLobbyResponse(row, players, gameId);
};

export type LobbyResponsePayload = Awaited<
  ReturnType<typeof buildLobbyResponse>
>;
