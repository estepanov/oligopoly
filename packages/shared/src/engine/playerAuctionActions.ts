import { getTileByPosition } from "../config/board.js";
import { startDeclineAuction } from "./auction.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { assertActionNotBlockedByContracts } from "./negotiationActions.js";
import { ACTION_COSTS } from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export function handleInitiateAuction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const tilePosition = action.tilePosition;
  if (tilePosition === undefined) throw "game.invalid_action";

  const tile = getTileByPosition(tilePosition);
  if (!tile || tile.cost === null) throw "game.tile_not_purchasable";

  const tileState = state.tiles.find(
    (entry) => String(entry.position) === String(tilePosition),
  );

  const player = getPlayer(state, playerId);
  if (!player || player.actionPointsRemaining < ACTION_COSTS.INITIATE_AUCTION) {
    throw "game.insufficient_ap";
  }

  if (tileState?.ownerId !== playerId) {
    throw "game.tile_not_owned";
  }
  if (tileState.mortgaged) {
    throw "game.tile_mortgaged";
  }

  assertActionNotBlockedByContracts(state, playerId, {
    type: "initiate_auction",
    tileId: String(tilePosition),
  });

  const reservePrice = action.amount ?? Math.floor(tile.cost * 0.5);

  const newState = deepClone(state);
  const actor = getPlayer(newState, playerId)!;
  actor.actionPointsRemaining -= ACTION_COSTS.INITIATE_AUCTION;

  const eligiblePlayerIds = newState.turnOrder.filter(
    (id) => id !== playerId && !newState.eliminatedPlayerIds.includes(id),
  );

  const auctionBase = startDeclineAuction(newState, tilePosition, "action");
  if (!auctionBase.pendingAuction) {
    throw "game.invalid_action";
  }

  auctionBase.pendingAuction = {
    ...auctionBase.pendingAuction,
    trigger: "player_initiated",
    sellerId: playerId,
    reservePrice,
    eligiblePlayerIds,
    tieBreakMinBid: reservePrice,
  };

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "player_auction_started",
      payload: {
        position: tilePosition,
        reservePrice,
        name: tile.name,
      },
    },
  ];

  return { state: auctionBase, logEntries: logs };
}
