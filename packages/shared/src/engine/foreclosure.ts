import { getTileByPosition } from "../config/board.js";
import { startForeclosureAuction } from "./auction.js";
import type { InternalGameState, LogEntry } from "./gameStateTypes.js";
import { FORECLOSURE_RESERVE } from "./mortgage.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export function getMortgagedTileQueue(
  state: InternalGameState,
  playerId: string,
): (number | string)[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return [...player.mortgagedTilePositions];
}

export function startForeclosureSequence(
  state: InternalGameState,
  debtorId: string,
  debtRemaining: number,
  resumePhase: string,
  logs: LogEntry[],
): InternalGameState {
  const tileQueue = getMortgagedTileQueue(state, debtorId);
  const newState = deepClone(state);

  logs.push({
    playerId: debtorId,
    actionType: "rent_shortfall",
    payload: { debtRemaining, mortgagedCount: tileQueue.length },
  });

  if (tileQueue.length === 0) {
    logs.push({
      playerId: null,
      actionType: "bank_absorbed_debt",
      payload: { debtorId, amount: debtRemaining },
    });
    return newState;
  }

  newState.pendingForeclosure = {
    debtorId,
    debtRemaining,
    tileQueue,
    resumePhase,
  };

  return startNextForeclosureAuction(newState, logs);
}

export function startNextForeclosureAuction(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  const pending = state.pendingForeclosure;
  if (!pending || pending.tileQueue.length === 0) {
    if (pending && pending.debtRemaining > 0) {
      logs.push({
        playerId: null,
        actionType: "bank_absorbed_debt",
        payload: {
          debtorId: pending.debtorId,
          amount: pending.debtRemaining,
        },
      });
    }
    const cleared = deepClone(state);
    cleared.pendingForeclosure = null;
    if (cleared.pendingAuction) {
      return cleared;
    }
    cleared.phase = pending?.resumePhase ?? cleared.phase;
    return cleared;
  }

  const [nextTile, ...rest] = pending.tileQueue;
  const newState = deepClone(state);
  newState.pendingForeclosure = { ...pending, tileQueue: rest };

  const auctionState = startForeclosureAuction(
    newState,
    nextTile,
    pending.resumePhase as "action",
  );

  logs.push({
    playerId: pending.debtorId,
    actionType: "foreclosure_auction_started",
    payload: {
      position: nextTile,
      name: getTileByPosition(nextTile)?.name ?? "Unknown",
      reservePrice: FORECLOSURE_RESERVE,
      debtRemaining: pending.debtRemaining,
    },
  });

  return auctionState;
}

export function applyForeclosureAuctionProceeds(
  state: InternalGameState,
  proceeds: number,
  logs: LogEntry[],
): InternalGameState {
  const pending = state.pendingForeclosure;
  if (!pending) return state;

  const newState = deepClone(state);
  const applied = Math.min(proceeds, pending.debtRemaining);
  const remaining = pending.debtRemaining - applied;
  newState.pendingForeclosure = { ...pending, debtRemaining: remaining };

  const debtor = getPlayer(newState, pending.debtorId);
  const surplus = proceeds - applied;
  if (debtor && surplus > 0) {
    debtor.capital += surplus;
  }

  logs.push({
    playerId: pending.debtorId,
    actionType: "foreclosure_proceeds",
    payload: { proceeds, debtRemaining: remaining },
  });

  if (newState.pendingForeclosure.tileQueue.length > 0) {
    return startNextForeclosureAuction(newState, logs);
  }

  if (remaining > 0) {
    logs.push({
      playerId: null,
      actionType: "bank_absorbed_debt",
      payload: { debtorId: pending.debtorId, amount: remaining },
    });
  }

  newState.pendingForeclosure = null;
  if (!newState.pendingAuction) {
    newState.phase = pending.resumePhase;
  }
  return newState;
}
