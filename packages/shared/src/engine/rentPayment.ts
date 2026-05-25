import { getTileByPosition } from "../config/board.js";
import { startForeclosureSequence } from "./foreclosure.js";
import type { InternalGameState, LogEntry } from "./gameStateTypes.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export interface RentSettlementResult {
  state: InternalGameState;
  logs: LogEntry[];
  shortfall: number;
}

/**
 * Settle rent from visitor to owner. Handles partial payment, debt spiral, and foreclosure.
 */
export function settleRentPayment(
  state: InternalGameState,
  visitorId: string,
  ownerId: string,
  rent: number,
  position: number | string,
): RentSettlementResult {
  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  const visitor = getPlayer(newState, visitorId);
  const owner = getPlayer(newState, ownerId);
  if (!visitor || !owner) {
    return { state: newState, logs, shortfall: 0 };
  }

  const tile = getTileByPosition(position);
  const paid = Math.min(visitor.capital, rent);
  const shortfall = rent - paid;

  if (paid > 0) {
    visitor.capital -= paid;
    owner.capital += paid;
    owner.rentCollectedTotal = (owner.rentCollectedTotal ?? 0) + paid;
    logs.push({
      playerId: visitorId,
      actionType: "paid_rent",
      payload: {
        to: ownerId,
        amount: paid,
        requested: rent,
        position,
        name: tile?.name ?? "Unknown",
        partial: shortfall > 0,
      },
    });
  }

  if (shortfall <= 0) {
    return { state: newState, logs, shortfall: 0 };
  }

  if (isOptionalRuleEnabled(newState.settings, "debt_spiral")) {
    visitor.outstandingDebt = (visitor.outstandingDebt ?? 0) + shortfall;
    logs.push({
      playerId: visitorId,
      actionType: "debt_accrued",
      payload: { amount: shortfall, total: visitor.outstandingDebt },
    });
    return { state: newState, logs, shortfall };
  }

  const foreclosureState = startForeclosureSequence(
    newState,
    visitorId,
    shortfall,
    state.phase,
    logs,
  );
  return {
    state: foreclosureState,
    logs,
    shortfall,
  };
}
