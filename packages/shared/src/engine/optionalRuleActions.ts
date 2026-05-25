import { getTileByPosition } from "../config/board.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { areSameSyndicate } from "./syndicate.js";

const HOSTILE_TAKEOVER_MARKUP = 1.5;
const MARKET_MANIPULATION_COST = 50;

export function handleHostileTakeover(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (!isOptionalRuleEnabled(state.settings, "hostile_takeover")) {
    throw "game.invalid_action";
  }
  if (state.phase !== "action") throw "game.invalid_action";

  const targetId = action.targetPlayerId;
  const tilePosition = action.tilePosition;
  if (!targetId || tilePosition === undefined) throw "game.invalid_action";
  if (targetId === playerId) throw "game.invalid_action";
  if (areSameSyndicate(state, playerId, targetId)) {
    throw "game.invalid_action";
  }

  const buyer = getPlayer(state, playerId);
  const seller = getPlayer(state, targetId);
  const tile = getTileByPosition(tilePosition);
  if (!buyer || !seller || !tile || tile.cost === null) {
    throw "game.invalid_action";
  }
  if (buyer.hostileTakeoverUsed) throw "game.invalid_action";

  const tileState = state.tiles.find(
    (entry) => String(entry.position) === String(tilePosition),
  );
  if (
    !tileState?.ownerId ||
    tileState.ownerId !== targetId ||
    tileState.mortgaged ||
    tile.type !== "sector_tile"
  ) {
    throw "game.invalid_action";
  }

  const price = Math.ceil(tile.cost * HOSTILE_TAKEOVER_MARKUP);
  if (buyer.capital < price) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const buyerState = getPlayer(newState, playerId)!;
  const sellerState = getPlayer(newState, targetId)!;
  buyerState.capital -= price;
  sellerState.capital += price;
  buyerState.hostileTakeoverUsed = true;

  const updatedTile = newState.tiles.find(
    (entry) => String(entry.position) === String(tilePosition),
  )!;
  updatedTile.ownerId = playerId;
  sellerState.ownedTilePositions = sellerState.ownedTilePositions.filter(
    (pos) => String(pos) !== String(tilePosition),
  );
  buyerState.ownedTilePositions.push(tilePosition);

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "hostile_takeover",
      payload: {
        targetPlayerId: targetId,
        tilePosition,
        price,
      },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function handleMarketManipulation(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (!isOptionalRuleEnabled(state.settings, "market_manipulation")) {
    throw "game.invalid_action";
  }
  if (state.phase !== "action") throw "game.invalid_action";

  const targetId = action.targetPlayerId;
  const tilePosition = action.tilePosition;
  if (!targetId || tilePosition === undefined) throw "game.invalid_action";

  const actor = getPlayer(state, playerId);
  if (!actor || actor.marketManipulationUsedThisRound) {
    throw "game.invalid_action";
  }
  if (actor.capital < MARKET_MANIPULATION_COST) {
    throw "game.insufficient_capital";
  }

  const tileState = state.tiles.find(
    (entry) => String(entry.position) === String(tilePosition),
  );
  if (!tileState?.ownerId || tileState.ownerId !== targetId) {
    throw "game.invalid_action";
  }

  const newState = deepClone(state);
  const actorState = getPlayer(newState, playerId)!;
  actorState.capital -= MARKET_MANIPULATION_COST;
  actorState.marketManipulationUsedThisRound = true;
  if (!newState.frozenTilePositions) {
    newState.frozenTilePositions = [];
  }
  if (
    !newState.frozenTilePositions.some(
      (pos) => String(pos) === String(tilePosition),
    )
  ) {
    newState.frozenTilePositions.push(tilePosition);
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "market_manipulation",
      payload: {
        targetPlayerId: targetId,
        tilePosition,
        cost: MARKET_MANIPULATION_COST,
      },
    },
  ];

  return { state: newState, logEntries: logs };
}
