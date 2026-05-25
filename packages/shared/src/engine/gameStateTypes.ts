import type { AiPersonality } from "@oligopoly/validation";
import type {
  AuctionResumePhase,
  PendingAuctionState,
} from "./auctionTypes.js";
import type { SyndicateCharterState, SyndicateState } from "./syndicate.js";
import type { BindingContract } from "./types.js";

export interface RateCardState {
  sectorId: string;
  syndicateId: string;
  multiplier: number;
  roundsWithoutLanding: number;
}

export interface PendingForeclosureState {
  debtorId: string;
  debtRemaining: number;
  tileQueue: (number | string)[];
  resumePhase: AuctionResumePhase;
  creditorId?: string;
}

export interface FinalRoundState {
  pendingWinnerId: string;
  winType: "syndicate" | "solo";
  /** Player IDs that still owe one final full turn */
  remainingTurnPlayerIds: string[];
}

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
  pendingForeclosure?: PendingForeclosureState | null;
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
  charters?: Record<string, SyndicateCharterState>;
  rateCards?: RateCardState[];
  activeContracts?: BindingContract[];
  negotiationThreads?: NegotiationThreadState[];
  finalRound?: FinalRoundState | null;
  pendingDisruptionNullify?: {
    cardId: string;
    drawingPlayerId: string;
    trigger: string;
    tilePosition?: number | string;
    remainingDraws?: number;
  } | null;
}

export interface NegotiationThreadState {
  id: string;
  createdBy: string;
  partyIds: string[];
  status: "open" | "agreed" | "expired" | "cancelled";
  startedRound: number;
  expiresAfterRound: number;
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
  outstandingDebt?: number;
  rentCollectedTotal?: number;
  dealValueTotal?: number;
  coordinationAcknowledged?: boolean;
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
  targetPlayerIds?: string[];
  sectorId?: string;
  multiplier?: number;
  charter?: SyndicateCharterState;
  contractId?: string;
  handshakeId?: string;
  voteType?: string;
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
