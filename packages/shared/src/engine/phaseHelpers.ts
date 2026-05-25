import { TRIPLE_DOUBLES_LIMIT } from "./dice.js";
import type { InternalGameState } from "./gameStateTypes.js";
import { getPlayerFromState } from "./stateUtils.js";

export function resolvePostMovePhase(
  state: InternalGameState,
  playerId: string,
): "rolling_doubles" | "action" {
  const player = getPlayerFromState(state, playerId);
  if (
    player &&
    player.doublesCount > 0 &&
    player.doublesCount < TRIPLE_DOUBLES_LIMIT
  ) {
    return "rolling_doubles";
  }
  return "action";
}
