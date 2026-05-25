import type { AiPersonality } from "@oligopoly/validation";
import type { PendingAuctionState } from "./auction.js";
import type { SyndicateState } from "./syndicate.js";

export interface InternalGameState {
  gameId: string;
  round: number;
  phase: string;
  currentPlayerIndex: number;
  turnOrder: string[];
  freeMarketPool: number;
  affinityAssignments: Record<string, string>;
  players: InternalPlayerState[];
  tiles: InternalTileState[];
  pendingBuyTilePosition: number | string | null;
  pendingAuction?: PendingAuctionState;
  lastDiceRoll: [number, number] | null;
  winnerId: string | null;
  eliminatedPlayerIds: string[];
  kickedPlayerIds?: string[];
  settings: Record<string, unknown>;
  aiPlayers?: InternalAiPlayerState[];
  marketEventDeckRemaining?: string[];
  marketEventDiscard?: string[];
  disruptionDeckRemaining?: string[];
  disruptionDiscard?: string[];
  syndicates?: Record<string, SyndicateState>;
  pendingDisruptionNullify?: {
    cardId: string;
    drawingPlayerId: string;
    trigger: string;
    tilePosition?: number | string;
    remainingDraws?: number;
  } | null;
}

export interface InternalAiPlayerState {
  playerId: string;
  name: string;
  personality: AiPersonality;
  takeoverForPlayerId?: string | null;
}

export interface InternalPlayerState {
  playerId: string;
  kind?: "human" | "ai";
  displayName?: string;
  aiPersonality?: AiPersonality;
  position: number | string;
  capital: number;
  ownedTilePositions: (number | string)[];
  mortgagedTilePositions: (number | string)[];
  developmentTokens: Record<string, number>;
  trustworthiness: number;
  actionPointsRemaining: number;
  inRegulation: boolean;
  doublesCount: number;
  isOnDiagonal: boolean;
  syndicateId?: string | null;
  usedAffinityIds?: string[];
}

export interface InternalTileState {
  position: number | string;
  ownerId: string | null;
  mortgaged: boolean;
  developmentTokens: number;
}

export interface GameActionInput {
  type: string;
  result?: [number, number];
  tilePosition?: number | string;
  tokenNumber?: number;
  choice?: "perimeter" | "diagonal";
  amount?: number;
  pathChoiceDie?: number;
  pass?: true;
  memberIds?: string[];
  affinityId?: string;
  targetPlayerId?: string;
}

export interface ApplyActionResult {
  state: InternalGameState;
  logEntries: LogEntry[];
}

export interface LogEntry {
  playerId: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
}

export type CompletedGameSnapshot = Pick<
  InternalGameState,
  "winnerId" | "players" | "kickedPlayerIds" | "tiles" | "syndicates"
>;
