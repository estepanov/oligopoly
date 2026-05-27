import type {
  AiPersonality,
  GameAction,
  GamePhase,
  InGameHandshakeAgreement,
  PendingInsiderPeek,
} from "@oligopoly/validation";
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

export type HandshakeAgreementState = InGameHandshakeAgreement;

export interface PendingSyndicateVoteState {
  syndicateId: string;
  voteType: "dissolve_syndicate";
  votes: Record<string, boolean>;
}

export type PendingInsiderPeekState = PendingInsiderPeek & {
  trigger: "round_start" | "tile";
};

export interface MarketEventModifiersState {
  utilityRentMultiplier?: number;
  utilityRentMultiplierUntilRound?: number;
  syntheticCdoMortgageRound?: number;
}

export interface InternalGameState {
  gameId: string;
  round: number;
  phase: GamePhase;
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
  handshakeAgreements?: HandshakeAgreementState[];
  pendingSyndicateVote?: PendingSyndicateVoteState | null;
  pendingInsiderPeek?: PendingInsiderPeekState | null;
  marketEventModifiers?: MarketEventModifiersState;
  /** tile positions frozen from rent collection until end of round */
  frozenTilePositions?: (number | string)[];
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
  visibility?: "private" | "open";
}

export interface InternalAiPlayerState {
  playerId: string;
  name: string;
  personality: AiPersonality;
  takeoverForPlayerId?: string | null;
}

export interface InternalPlayerState {
  playerId: string;
  /** Optional rule: hostile takeover used this game */
  hostileTakeoverUsed?: boolean;
  /** Optional rule: market manipulation used this round */
  marketManipulationUsedThisRound?: boolean;
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
  mortgageRate?: number | null;
  developmentTokens: number;
}

type ActionWithField<K extends PropertyKey> = Extract<
  GameAction,
  { [P in K]?: unknown }
>;
type FieldFromAction<K extends PropertyKey> =
  ActionWithField<K> extends {
    [P in K]?: infer V;
  }
    ? V
    : never;
type KeysOfUnion<T> = T extends T ? keyof T : never;
type GameActionPayloadKey = Exclude<KeysOfUnion<GameAction>, "type">;

type ServerInjectedGameActionFields = {
  /** Server-generated when rolling through START to choose perimeter vs diagonal. */
  pathChoiceDie?: number;
};

/** Engine action input: payload keys are derived from the validated GameAction union. */
export type GameActionInput = {
  type: GameAction["type"];
} & {
  [K in GameActionPayloadKey]?: FieldFromAction<K>;
} & ServerInjectedGameActionFields;

export interface ApplyActionResult {
  state: InternalGameState;
  logEntries: LogEntry[];
  primaryLogIndex?: number;
}

export interface LogEntry {
  playerId: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
  broadcast?: boolean;
}

export type CompletedGameSnapshot = Pick<
  InternalGameState,
  "winnerId" | "players" | "kickedPlayerIds" | "tiles" | "syndicates"
>;
