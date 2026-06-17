import {
  TradeErrorKeys,
  type TradeOffer,
  type TradeOfferTransfer,
} from "@oligopoly/validation";
import { getTileByPosition } from "../config/board.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { transferCapital } from "./marketEventPrimitives.js";
import { isActionBlockedByContracts } from "./negotiation.js";
import { revokeUnqualifiedRateCards } from "./rateCards.js";
import { ACTION_COSTS } from "./setup.js";
import { deepClone, getPlayer, transferTileOwnership } from "./stateUtils.js";
import type { BindingContract } from "./types.js";
import { applyWinIfThresholdCrossed } from "./winResolution.js";

export const DEFAULT_TRADE_TIMEOUT_MINUTES = 5;
export const MAX_TRADE_COUNTERS = 2;
export const TRADE_OFFER_HISTORY_LIMIT = 20;

type TradeValidationContext = {
  proposer: InternalPlayerState;
  recipient: InternalPlayerState;
  gives: TradeOfferTransfer;
  receives: TradeOfferTransfer;
};

export function tradeTransferValue(transfer: TradeOfferTransfer): number {
  return (
    transfer.capital +
    transfer.tilePositions.reduce<number>(
      (total, position) => total + (getTileByPosition(position)?.cost ?? 0),
      0,
    )
  );
}

/**
 * Shared skeleton for the two trade-creation paths (propose + counter): resolve
 * parties → normalize transfers → validate terms → build the offer → clone →
 * mutate `tradeOffers` → emit the creation log. The handlers differ ONLY in the
 * parameters captured here (AP deduction, parent link, counter count, the
 * predecessor offer to flip to `countered`, and the log action type), so both
 * become thin callers and the common logic can't drift between them.
 */
function commitTradeMutation(
  state: InternalGameState,
  params: {
    proposerId: string;
    recipientId: string;
    gives: TradeOfferTransfer;
    receives: TradeOfferTransfer;
    deductAp: number;
    counterCount: number;
    parentOfferId?: string;
    logActionType: "trade_proposed" | "trade_countered";
    nowMs: number;
    timeoutMinutes: number | undefined;
  },
): ApplyActionResult {
  const proposer = getPlayer(state, params.proposerId);
  const recipient = getPlayer(state, params.recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;
  if (
    isEliminated(state, params.proposerId) ||
    isEliminated(state, params.recipientId)
  ) {
    throw TradeErrorKeys.INVALID_PARTY;
  }
  if (proposer.actionPointsRemaining < params.deductAp) {
    throw "game.insufficient_ap";
  }

  validateTradeTerms(state, {
    proposer,
    recipient,
    gives: params.gives,
    receives: params.receives,
  });

  const offer = buildTradeOffer(state, {
    proposerId: params.proposerId,
    recipientId: params.recipientId,
    gives: params.gives,
    receives: params.receives,
    nowMs: params.nowMs,
    timeoutMinutes: params.timeoutMinutes,
    counterCount: params.counterCount,
    ...(params.parentOfferId ? { parentOfferId: params.parentOfferId } : {}),
  });

  const newState = deepClone(state);
  if (params.deductAp > 0) {
    const workingProposer = getPlayer(newState, params.proposerId);
    if (!workingProposer) throw TradeErrorKeys.INVALID_PARTY;
    workingProposer.actionPointsRemaining -= params.deductAp;
  }
  if (params.parentOfferId) {
    const parent = findTradeOffer(newState, params.parentOfferId);
    if (!parent) throw TradeErrorKeys.OFFER_NOT_FOUND;
    parent.status = "countered";
  }
  newState.tradeOffers = pruneTradeOffers([
    ...(newState.tradeOffers ?? []),
    offer,
  ]);

  return {
    state: newState,
    logEntries: [
      {
        playerId: params.proposerId,
        actionType: params.logActionType,
        payload: tradeLogPayload(offer),
      },
    ],
  };
}

export function handleProposeTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  // Like `handleCounterTrade`, the `action`-phase gate is NOT repeated here: the
  // dispatcher enforces it centrally from the `TRADE_ACTION_ROUTES` metadata
  // (propose_trade is `scope: "turn"`, `requiresActionPhase: true`), running the
  // gate AFTER the not-your-turn check so off-turn proposals still throw
  // `game.not_your_turn` before `game.invalid_phase`. Keeping the gate in one
  // place stops a handler edit from contradicting the declared routing rule.
  const recipientId = action.recipientId;
  if (!recipientId || recipientId === playerId) {
    throw TradeErrorKeys.INVALID_PARTY;
  }

  return commitTradeMutation(state, {
    proposerId: playerId,
    recipientId,
    gives: normalizeTransfer(action.gives),
    receives: normalizeTransfer(action.receives),
    deductAp: ACTION_COSTS.PROPOSE_TRADE,
    counterCount: 0,
    logActionType: "trade_proposed",
    nowMs,
    timeoutMinutes: action.timeoutMinutes,
  });
}

export function handleAcceptTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const offer = pendingOfferForResponse(state, playerId, action.offerId, nowMs);

  const proposer = getPlayer(state, offer.proposerId);
  const recipient = getPlayer(state, offer.recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;

  validateTradeTerms(state, {
    proposer,
    recipient,
    gives: offer.gives,
    receives: offer.receives,
  });

  const newState = deepClone(state);
  const workingOffer = findTradeOffer(newState, offer.id);
  if (!workingOffer) throw TradeErrorKeys.OFFER_NOT_FOUND;

  applyTradeSettlement(newState, workingOffer);
  workingOffer.status = "accepted";
  newState.tradeOffers = pruneTradeOffers(newState.tradeOffers ?? []);

  // Intentional: although the asset transfers are publicly observable in state,
  // the `trade_accepted` log line carries the full terms and stays private to the
  // two parties (redacted by `redactLogEntriesForViewer`). We deliberately do not
  // emit a public "trade completed" line — keeping the negotiated terms private is
  // the conservative choice.
  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "trade_accepted",
      payload: tradeLogPayload(workingOffer),
    },
  ];

  let settledState = revokeUnqualifiedRateCards(newState, logs, {
    type: "trade",
  });
  settledState = applyWinIfThresholdCrossed(settledState, logs);
  return { state: settledState, logEntries: logs };
}

export function handleRejectTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const offer = pendingOfferForResponse(
    state,
    playerId,
    action.offerId,
    nowMs,
    {
      allowExpired: true,
    },
  );
  const newState = deepClone(state);
  const workingOffer = findTradeOffer(newState, offer.id);
  if (!workingOffer) throw TradeErrorKeys.OFFER_NOT_FOUND;
  workingOffer.status = isOfferExpired(workingOffer, nowMs)
    ? "expired"
    : "rejected";
  newState.tradeOffers = pruneTradeOffers(newState.tradeOffers ?? []);

  return {
    state: newState,
    logEntries: [
      {
        playerId,
        actionType:
          workingOffer.status === "expired"
            ? "trade_expired"
            : "trade_rejected",
        payload: tradeLogPayload(workingOffer),
      },
    ],
  };
}

export function handleCounterTrade(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
  nowMs: number = Date.now(),
): ApplyActionResult {
  // Per the game rules, a recipient may accept/reject a pending offer at ANY
  // time (even off-turn), but may only propose a COUNTER "while the game is in
  // an action phase" (see oligopoly_game_rules.md). `counter_trade` is therefore
  // routed globally (the recipient need not be the active player) yet gated to
  // the action phase. Both facts live in the `TRADE_ACTION_ROUTES` metadata in
  // gameStateMachine.ts (scope: "global", requiresActionPhase: true), which the
  // dispatcher reads to enforce the gate centrally — so the handler no longer
  // repeats the `state.phase !== "action"` check. Countering charges no action
  // point (unlike `handleProposeTrade`).
  const offer = pendingOfferForResponse(state, playerId, action.offerId, nowMs);
  if (offer.counterCount >= MAX_TRADE_COUNTERS) {
    throw TradeErrorKeys.COUNTER_LIMIT_REACHED;
  }

  return commitTradeMutation(state, {
    proposerId: playerId,
    recipientId: offer.proposerId,
    gives: normalizeTransfer(action.gives),
    receives: normalizeTransfer(action.receives),
    deductAp: 0,
    counterCount: offer.counterCount + 1,
    parentOfferId: offer.id,
    logActionType: "trade_countered",
    nowMs,
    timeoutMinutes: action.timeoutMinutes,
  });
}

/**
 * Shared "flip pending→expired + emit `trade_expired` log + prune" loop, in
 * place on `state`. The two public expiry paths differ ONLY in which pending
 * offers they select (timed expiry vs game-over expires all), so both delegate
 * here. Returns the number of offers expired.
 */
function expireSelectedTradeOffers(
  state: InternalGameState,
  shouldExpire: (offer: TradeOffer) => boolean,
  logs: LogEntry[],
): number {
  let expired = 0;
  for (const offer of state.tradeOffers ?? []) {
    if (offer.status !== "pending" || !shouldExpire(offer)) continue;
    offer.status = "expired";
    expired += 1;
    logs.push({
      playerId: null,
      actionType: "trade_expired",
      payload: tradeLogPayload(offer),
    });
  }
  state.tradeOffers = pruneTradeOffers(state.tradeOffers ?? []);
  return expired;
}

export function expirePendingTradeOffers(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const newState = deepClone(state);
  const logs: LogEntry[] = [];
  const expired = expireSelectedTradeOffers(
    newState,
    (offer) => offer.expiresAt <= nowMs,
    logs,
  );
  if (expired === 0) return null;

  return { state: newState, logEntries: logs };
}

/**
 * Terminate every still-`pending` trade offer when the game ends. Called from
 * `finalizeWin` (the single chokepoint for ALL win paths) so no offer is left
 * dangling after `game_over` — `applyAction` rejects every later action with
 * `game.completed`, and the DO clears trade-offer alarms, so without this an
 * offer could stay `pending` forever. Mutates `state` in place and appends a
 * `trade_expired` log entry per offer (a terminal status already understood by
 * the trade desk and redacted to the two parties by `redactLogEntriesForViewer`).
 */
export function expirePendingTradeOffersForGameOver(
  state: InternalGameState,
  logs: LogEntry[],
): void {
  // Game over expires EVERY pending offer regardless of `expiresAt`.
  expireSelectedTradeOffers(state, () => true, logs);
}

export function nextTradeOfferExpiry(state: InternalGameState): number | null {
  const expiries = (state.tradeOffers ?? [])
    .filter((offer) => offer.status === "pending")
    .map((offer) => offer.expiresAt);
  return expiries.length ? Math.min(...expiries) : null;
}

/**
 * Pure predicate mirroring `handleProposeTrade`'s gating (minus offer-content
 * validation): a player may propose a trade iff they are the active player, the
 * game is in the `action` phase, and they hold enough action points. Exposed for
 * the web UI and AI to gate the "propose" affordance without re-deriving rules.
 */
export function canProposeTrade(
  state: InternalGameState,
  playerId: string,
): boolean {
  if (state.phase !== "action") return false;
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) return false;
  if (isEliminated(state, playerId)) return false;
  const player = getPlayer(state, playerId);
  if (!player) return false;
  return player.actionPointsRemaining >= ACTION_COSTS.PROPOSE_TRADE;
}

/**
 * Pure predicate mirroring `handleCounterTrade`'s gating (minus offer-content
 * validation): a player may counter `offerId` iff a pending offer with that id
 * exists, names them as recipient, has not expired, is below the counter cap,
 * and the game is in the `action` phase. Exposed for the web UI and AI.
 */
export function canCounterTrade(
  state: InternalGameState,
  playerId: string,
  offerId: string,
  nowMs: number = Date.now(),
): boolean {
  if (state.phase !== "action") return false;
  const offer = findTradeOffer(state, offerId);
  if (!offer || offer.status !== "pending") return false;
  if (offer.recipientId !== playerId) return false;
  if (isOfferExpired(offer, nowMs)) return false;
  if (
    isEliminated(state, offer.proposerId) ||
    isEliminated(state, offer.recipientId)
  ) {
    return false;
  }
  return offer.counterCount < MAX_TRADE_COUNTERS;
}

const TRADE_RESPONSE_ACTION_TYPES = new Set<GameActionInput["type"]>([
  "accept_trade",
  "reject_trade",
  "counter_trade",
]);

/**
 * True when `action` is a trade response targeting an offer that the pre-action
 * expiry pass just flipped to `expired`. The player's response is a no-op
 * against a now-expired offer, but the expiry itself must still persist — see
 * `reconcileTradeOffersBeforeAction` for why we return the expiry result
 * instead of routing the (doomed) response handler, which would throw
 * `OFFER_NOT_PENDING` and discard the expiry.
 */
function targetsOfferExpiredByPreAction(
  action: GameActionInput,
  expiryResult: ApplyActionResult,
): boolean {
  if (!TRADE_RESPONSE_ACTION_TYPES.has(action.type)) return false;
  const offerId = action.offerId;
  if (!offerId) return false;
  return (expiryResult.state.tradeOffers ?? []).some(
    (offer) => offer.id === offerId && offer.status === "expired",
  );
}

/**
 * Single canonical pre-action trade-expiry pass. Reconciles any pending trade
 * offers whose deadline has passed BEFORE the action is routed, using the one
 * `nowMs` clock the whole action observes — so "stale pending offers until the
 * alarm fires" never leaks into action handling. Lives here (not in the
 * dispatcher) so all trade-specific temporal logic stays with the trade engine;
 * `applyAction` just calls this one function and stays thin.
 *
 * Perf: only does the expiry pass (which deep-clones) when an offer is actually
 * due (`nextTradeOfferExpiry(state) <= nowMs`); otherwise it passes `state`
 * through untouched.
 *
 * The subtle response-vs-expiry race lives here: when a trade RESPONSE targets
 * an offer this pass just expired, the response is a no-op but the expiry must
 * still persist, so `shortCircuitResult` carries the expiry result for the
 * caller to return directly (routing the response handler would throw
 * `OFFER_NOT_PENDING` and discard the persisted `expired` status + log).
 */
export function reconcileTradeOffersBeforeAction(
  state: InternalGameState,
  action: GameActionInput,
  nowMs: number,
): {
  workingState: InternalGameState;
  expiryLogs: LogEntry[];
  shortCircuitResult?: ApplyActionResult;
} {
  const nextExpiry = nextTradeOfferExpiry(state);
  const expiryResult =
    nextExpiry !== null && nextExpiry <= nowMs
      ? expirePendingTradeOffers(state, nowMs)
      : null;
  if (!expiryResult) {
    return { workingState: state, expiryLogs: [] };
  }

  if (targetsOfferExpiredByPreAction(action, expiryResult)) {
    // Hand the raw expiry result back as the short-circuit; `applyAction` runs
    // its own primary-log-index finalizer on it, so the log-index behavior stays
    // identical to routing through the dispatcher without duplicating the rule.
    return {
      workingState: expiryResult.state,
      expiryLogs: [],
      shortCircuitResult: expiryResult,
    };
  }

  return {
    workingState: expiryResult.state,
    expiryLogs: expiryResult.logEntries,
  };
}

function applyTradeSettlement(
  state: InternalGameState,
  offer: TradeOffer,
): void {
  const proposer = getPlayer(state, offer.proposerId);
  const recipient = getPlayer(state, offer.recipientId);
  if (!proposer || !recipient) throw TradeErrorKeys.INVALID_PARTY;

  transferCapital(proposer, recipient, offer.gives.capital);
  transferCapital(recipient, proposer, offer.receives.capital);

  for (const tilePosition of offer.gives.tilePositions) {
    if (
      !transferTileOwnership(
        state,
        offer.proposerId,
        offer.recipientId,
        tilePosition,
      )
    ) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
  }

  for (const tilePosition of offer.receives.tilePositions) {
    if (
      !transferTileOwnership(
        state,
        offer.recipientId,
        offer.proposerId,
        tilePosition,
      )
    ) {
      throw TradeErrorKeys.TILE_NOT_OWNED;
    }
  }
}

function pruneTradeOffers(offers: TradeOffer[]): TradeOffer[] {
  const pending = offers.filter((offer) => offer.status === "pending");
  const resolved = offers.filter((offer) => offer.status !== "pending");
  return [...resolved.slice(-TRADE_OFFER_HISTORY_LIMIT), ...pending];
}

function nextTradeOfferSequence(state: InternalGameState): number {
  const prefix = `trade-${state.gameId}-`;
  let maxSequence = 0;
  for (const offer of state.tradeOffers ?? []) {
    if (!offer.id.startsWith(prefix)) continue;
    const sequence = Number.parseInt(offer.id.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }
  return maxSequence + 1;
}

function buildTradeOffer(
  state: InternalGameState,
  params: {
    proposerId: string;
    recipientId: string;
    gives: TradeOfferTransfer;
    receives: TradeOfferTransfer;
    nowMs: number;
    timeoutMinutes: number | undefined;
    counterCount: number;
    parentOfferId?: string;
  },
): TradeOffer {
  const timeoutMinutes = params.timeoutMinutes ?? DEFAULT_TRADE_TIMEOUT_MINUTES;
  return {
    id: `trade-${state.gameId}-${nextTradeOfferSequence(state)}`,
    gameId: state.gameId,
    proposerId: params.proposerId,
    recipientId: params.recipientId,
    gives: params.gives,
    receives: params.receives,
    status: "pending",
    createdAt: params.nowMs,
    expiresAt: params.nowMs + timeoutMinutes * 60_000,
    counterCount: params.counterCount,
    ...(params.parentOfferId ? { parentOfferId: params.parentOfferId } : {}),
  };
}

function normalizeTransfer(
  transfer: TradeOfferTransfer | undefined,
): TradeOfferTransfer {
  return {
    capital: transfer?.capital ?? 0,
    tilePositions: transfer?.tilePositions ?? [],
  };
}

function validateTradeTerms(
  state: InternalGameState,
  { proposer, recipient, gives, receives }: TradeValidationContext,
): void {
  if (!hasTransferValue(gives) && !hasTransferValue(receives)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (hasDuplicatePositions(gives.tilePositions)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (hasDuplicatePositions(receives.tilePositions)) {
    throw TradeErrorKeys.INVALID_TERMS;
  }
  if (
    proposer.capital < gives.capital ||
    recipient.capital < receives.capital
  ) {
    throw TradeErrorKeys.INSUFFICIENT_CAPITAL;
  }

  validateTransferTiles(state, proposer.playerId, gives);
  validateTransferTiles(state, recipient.playerId, receives);
}

/**
 * Minimal structural shape needed to evaluate tile-tradeability. Both the
 * engine's `InternalGameState` and the client `GameState` satisfy it, so the web
 * trade desk can call the shared predicate without an unsafe cast.
 */
type TradeableTileStateView = {
  tiles?: Array<{
    position: number | string;
    ownerId?: string | null;
    mortgaged?: boolean;
  }>;
  activeContracts?: BindingContract[];
  players?: Array<{
    playerId: string;
    ownedTilePositions: Array<number | string>;
  }>;
};

/**
 * Discriminated result of the canonical tile-tradeability check. `reason`
 * pinpoints WHY a tile is not tradeable so a single mapping (in
 * `validateTransferTiles`) can translate it to the specific `TradeErrorKeys`
 * callers and tests distinguish, without a second pass over tile state.
 */
export type TileTradeability =
  | { ok: true }
  | { ok: false; reason: "not_owned" | "mortgaged" | "contract_locked" };

/**
 * Single canonical tile-tradeability contract: a tile may be put on the trade
 * desk only when `playerId` owns it, it is not mortgaged, and it is not blocked
 * from sale by an active binding `sell_tile` contract. This is the source of
 * truth behind `validateTransferTiles` (which maps the failure `reason` to a
 * specific error key), the web trade-desk helper, and the trade AI's target
 * selection — so the rules live in ONE place and can't drift.
 */
export function tileTradeability(
  state: TradeableTileStateView,
  playerId: string,
  position: number | string,
): TileTradeability {
  const tileState = state.tiles?.find(
    (tile) => String(tile.position) === String(position),
  );
  if (!tileState || tileState.ownerId !== playerId) {
    return { ok: false, reason: "not_owned" };
  }
  if (tileState.mortgaged) {
    return { ok: false, reason: "mortgaged" };
  }
  if (
    isActionBlockedByContracts(state.activeContracts ?? [], {
      type: "sell_tile",
      playerId,
      tileId: String(position),
    }).blocked
  ) {
    return { ok: false, reason: "contract_locked" };
  }
  return { ok: true };
}

/**
 * Thin boolean wrapper over `tileTradeability` for callers that only need a
 * yes/no answer (the web trade desk, the trade AI's target selection).
 */
export function isTileTradeable(
  state: TradeableTileStateView,
  playerId: string,
  position: number | string,
): boolean {
  return tileTradeability(state, playerId, position).ok;
}

/**
 * All positions `playerId` could legally offer in a trade (owned, not
 * mortgaged, not contract-locked), preserving the player's ownership order.
 */
export function listTradeableTilePositions(
  state: TradeableTileStateView,
  playerId: string,
): Array<number | string> {
  const player = state.players?.find((entry) => entry.playerId === playerId);
  if (!player) return [];
  return player.ownedTilePositions.filter((position) =>
    isTileTradeable(state, playerId, position),
  );
}

// Single place mapping a tile-tradeability failure reason to the error key the
// trade desk and tests rely on. `contract_locked` surfaces as INVALID_TERMS
// (the historical key for "owned + un-mortgaged but blocked by a sell contract").
const TILE_REASON_TO_ERROR_KEY: Record<
  Exclude<TileTradeability, { ok: true }>["reason"],
  string
> = {
  not_owned: TradeErrorKeys.TILE_NOT_OWNED,
  mortgaged: TradeErrorKeys.TILE_MORTGAGED,
  contract_locked: TradeErrorKeys.INVALID_TERMS,
};

function validateTransferTiles(
  state: InternalGameState,
  ownerId: string,
  transfer: TradeOfferTransfer,
): void {
  for (const tilePosition of transfer.tilePositions) {
    // Eligibility is decided ONCE by the canonical predicate; its discriminated
    // `reason` maps to the SPECIFIC error key callers and tests distinguish
    // (not-owned vs mortgaged vs contract-locked) — no second pass over tiles.
    const result = tileTradeability(state, ownerId, tilePosition);
    if (result.ok) continue;
    throw TILE_REASON_TO_ERROR_KEY[result.reason];
  }
}

function pendingOfferForResponse(
  state: InternalGameState,
  playerId: string,
  offerId: string | undefined,
  nowMs: number,
  options: { allowExpired?: boolean } = {},
): TradeOffer {
  if (!offerId) throw TradeErrorKeys.OFFER_NOT_FOUND;
  const offer = findTradeOffer(state, offerId);
  if (!offer) throw TradeErrorKeys.OFFER_NOT_FOUND;
  if (offer.status !== "pending") throw TradeErrorKeys.OFFER_NOT_PENDING;
  if (offer.recipientId !== playerId) throw TradeErrorKeys.INVALID_PARTY;
  // Mirror propose/counter: a settled/responded offer must not involve an
  // eliminated party (latent today — `eliminatedPlayerIds` isn't populated yet —
  // but kept consistent so accept/reject/counter all reject eliminated parties).
  if (
    isEliminated(state, offer.proposerId) ||
    isEliminated(state, offer.recipientId)
  ) {
    throw TradeErrorKeys.INVALID_PARTY;
  }
  if (!options.allowExpired && isOfferExpired(offer, nowMs)) {
    throw TradeErrorKeys.OFFER_EXPIRED;
  }
  return offer;
}

function isOfferExpired(offer: TradeOffer, nowMs: number): boolean {
  return offer.expiresAt <= nowMs;
}

function findTradeOffer(
  state: InternalGameState,
  offerId: string,
): TradeOffer | undefined {
  return state.tradeOffers?.find((offer) => offer.id === offerId);
}

function isEliminated(state: InternalGameState, playerId: string): boolean {
  return (state.eliminatedPlayerIds ?? []).includes(playerId);
}

function hasTransferValue(transfer: TradeOfferTransfer): boolean {
  return transfer.capital > 0 || transfer.tilePositions.length > 0;
}

function hasDuplicatePositions(positions: Array<number | string>): boolean {
  return new Set(positions.map(String)).size !== positions.length;
}

function tradeLogPayload(offer: TradeOffer): Record<string, unknown> {
  return {
    offerId: offer.id,
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    gives: offer.gives,
    receives: offer.receives,
    status: offer.status,
    expiresAt: offer.expiresAt,
    counterCount: offer.counterCount,
    parentOfferId: offer.parentOfferId,
  };
}
