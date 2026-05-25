import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export function handlePayDebt(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  const player = getPlayer(state, playerId);
  if (!player || (player.outstandingDebt ?? 0) <= 0) {
    throw "game.invalid_action";
  }

  const debt = player.outstandingDebt ?? 0;
  const payAmount = action.amount ?? debt;
  const payment = Math.min(payAmount, debt, player.capital);

  if (payment <= 0) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital -= payment;
  np.outstandingDebt = debt - payment;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "debt_paid",
      payload: { amount: payment, remaining: np.outstandingDebt },
    },
  ];

  return { state: newState, logEntries: logs };
}
