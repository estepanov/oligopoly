// ---------------------------------------------------------------------------
// Game State Machine
// Pure, server-authoritative game state transition engine.
// Takes current state + action -> returns new state or error string.
// ---------------------------------------------------------------------------

import {
  ALL_TILES,
  CORNER_POSITIONS,
  DIAGONAL_TILES,
  getTileByPosition,
  TOTAL_BOARD_MARKET_VALUE,
} from "../config/board.js";
import {
  BOARD_SIZE,
  isDiagonalChoice,
  isDoubles,
  moveOnPerimeter,
  rollPathChoiceDie,
  TRIPLE_DOUBLES_LIMIT,
} from "./dice.js";
import { calculateMortgageValue, calculateRedemptionCost } from "./mortgage.js";
import {
  calculateDevelopmentCost,
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
  MAX_DEVELOPMENT_TOKENS,
} from "./rent.js";
import {
  ACTION_COSTS,
  ACTION_POINTS_PER_TURN,
  CORPORATE_TAX_I,
  CORPORATE_TAX_II,
  FREE_MARKET_MINIMUM,
  GOVERNMENT_GRANT,
  PASS_START_BONUS,
} from "./setup.js";
import { checkSoloWin } from "./winCondition.js";

// ---------------------------------------------------------------------------
// Deep clone helper (deepClone unavailable in target lib)
// ---------------------------------------------------------------------------
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  lastDiceRoll: [number, number] | null;
  winnerId: string | null;
  eliminatedPlayerIds: string[];
  settings: Record<string, unknown>;
}

export interface InternalPlayerState {
  playerId: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlayer(
  state: InternalGameState,
  playerId: string,
): InternalPlayerState | undefined {
  return state.players.find((p) => p.playerId === playerId);
}

function getCurrentPlayer(state: InternalGameState): InternalPlayerState {
  const pid = state.turnOrder[state.currentPlayerIndex];
  return state.players.find((p) => p.playerId === pid)!;
}

function getTileOwner(
  state: InternalGameState,
  position: number | string,
): string | null {
  const tile = state.tiles.find((t) => String(t.position) === String(position));
  return tile?.ownerId ?? null;
}

function isTilePurchasable(position: number | string): boolean {
  const tile = getTileByPosition(position);
  if (!tile) return false;
  return (
    tile.type === "sector_tile" ||
    tile.type === "sector_hub" ||
    tile.type === "utility"
  );
}

function countHubsOwned(state: InternalGameState, playerId: string): number {
  const hubPositions = [5, 15, 25, 35];
  return hubPositions.filter((pos) => {
    const ts = state.tiles.find((t) => t.position === pos);
    return ts?.ownerId === playerId && !ts.mortgaged;
  }).length;
}

function countUtilitiesOwned(
  state: InternalGameState,
  playerId: string,
): number {
  const utilPositions = [12, 28];
  return utilPositions.filter((pos) => {
    const ts = state.tiles.find((t) => t.position === pos);
    return ts?.ownerId === playerId && !ts.mortgaged;
  }).length;
}

function hasSectorControl(
  state: InternalGameState,
  playerId: string,
  sectorId: string,
): boolean {
  const sectorTiles = ALL_TILES.filter(
    (t) => t.sectorId === sectorId && t.type === "sector_tile",
  );
  return sectorTiles.every((t) => {
    const ts = state.tiles.find(
      (ts) => String(ts.position) === String(t.position),
    );
    return ts?.ownerId === playerId && !ts.mortgaged;
  });
}

function playerMarketValue(state: InternalGameState, playerId: string): number {
  return state.tiles
    .filter((t) => t.ownerId === playerId)
    .reduce((sum, t) => {
      const tile = getTileByPosition(t.position);
      return sum + (tile?.cost ?? 0);
    }, 0);
}

function checkWinConditions(state: InternalGameState): string | null {
  for (const p of state.players) {
    if (state.eliminatedPlayerIds.includes(p.playerId)) continue;
    const mv = playerMarketValue(state, p.playerId);
    if (checkSoloWin(mv, TOTAL_BOARD_MARKET_VALUE)) {
      return p.playerId;
    }
  }
  const activePlayers = state.players.filter(
    (p) => !state.eliminatedPlayerIds.includes(p.playerId),
  );
  if (activePlayers.length === 1) {
    return activePlayers[0].playerId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core State Machine
// ---------------------------------------------------------------------------

/**
 * Initialize tile states from the board config. Called when game starts
 * and the initial state doesn't include tiles yet.
 */
export function initTileStates(): InternalTileState[] {
  return ALL_TILES.filter(
    (t) =>
      t.type === "sector_tile" ||
      t.type === "sector_hub" ||
      t.type === "utility",
  ).map((t) => ({
    position: t.position,
    ownerId: null,
    mortgaged: false,
    developmentTokens: 0,
  }));
}

/**
 * Convert a raw state_json from DB into our internal format,
 * ensuring all fields exist.
 */
export function normalizeGameState(
  raw: Record<string, unknown>,
): InternalGameState {
  const state = raw as unknown as InternalGameState;
  if (!state.tiles || state.tiles.length === 0) {
    state.tiles = initTileStates();
  }
  if (!state.pendingBuyTilePosition && state.pendingBuyTilePosition !== null) {
    state.pendingBuyTilePosition = null;
  }
  if (!state.lastDiceRoll) {
    state.lastDiceRoll = null;
  }
  if (!state.winnerId) {
    state.winnerId = null;
  }
  if (!state.eliminatedPlayerIds) {
    state.eliminatedPlayerIds = [];
  }
  if (!state.affinityAssignments) {
    state.affinityAssignments = {};
  }
  // If phase is old-style "market_event" or "action", map to new phases
  if (state.phase === "market_event") {
    state.phase = "waiting_for_roll";
  }
  return state;
}

/**
 * Apply a game action to the current state. Returns new state + log entries.
 * Throws a string error key on invalid actions.
 */
export function applyAction(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase === "game_over") {
    throw "game.completed";
  }

  const currentPid = state.turnOrder[state.currentPlayerIndex];
  if (playerId !== currentPid) {
    throw "game.not_your_turn";
  }

  switch (action.type) {
    case "roll_dice":
      return handleRollDice(state, playerId, action);
    case "buy_tile":
      return handleBuyTile(state, playerId, action);
    case "decline_tile":
      return handleDeclineTile(state, playerId, action);
    case "end_turn":
      return handleEndTurn(state, playerId);
    case "path_choice":
      return handlePathChoice(state, playerId, action);
    case "develop_tile":
      return handleDevelopTile(state, playerId, action);
    case "mortgage_tile":
      return handleMortgageTile(state, playerId, action);
    case "redeem_tile":
      return handleRedeemTile(state, playerId, action);
    default:
      throw "game.invalid_action";
  }
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

function handleRollDice(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "waiting_for_roll" && state.phase !== "rolling_doubles") {
    throw "game.already_rolled";
  }

  const dice = action.result;
  if (!dice || dice.length !== 2) throw "game.invalid_action";
  const [d1, d2] = dice;
  const total = d1 + d2;
  const doubles = isDoubles(dice);

  const player = getPlayer(state, playerId)!;
  const logs: LogEntry[] = [];

  let newState = deepClone(state);
  const p = getPlayer(newState, playerId)!;

  logs.push({
    playerId,
    actionType: "roll_dice",
    payload: { result: [d1, d2], doubles },
  });

  // Track doubles
  if (doubles) {
    p.doublesCount += 1;
  } else {
    p.doublesCount = 0;
  }

  // Three consecutive doubles -> Regulation Zone
  if (p.doublesCount >= TRIPLE_DOUBLES_LIMIT) {
    p.position = CORNER_POSITIONS.REGULATION_ZONE;
    p.inRegulation = true;
    p.doublesCount = 0;
    p.isOnDiagonal = false;
    newState.phase = "action";
    newState.lastDiceRoll = dice;
    logs.push({
      playerId,
      actionType: "sent_to_regulation",
      payload: { reason: "triple_doubles" },
    });
    return { state: newState, logEntries: logs };
  }

  // Movement
  let skipLandingResolve = false;
  if (p.isOnDiagonal) {
    // Move on diagonal
    const currentDiagIndex = DIAGONAL_TILES.findIndex(
      (t) => String(t.position) === String(p.position),
    );
    const newDiagIndex = currentDiagIndex + total;

    if (newDiagIndex >= DIAGONAL_TILES.length) {
      // Roll off diagonal -> arrive at FREE MARKET, collect pool,
      // then continue remaining steps on the perimeter from position 20.
      p.isOnDiagonal = false;
      const pool = Math.max(newState.freeMarketPool, FREE_MARKET_MINIMUM);
      p.capital += pool;
      newState.freeMarketPool = 0;
      logs.push({
        playerId,
        actionType: "collected_free_market",
        payload: { amount: pool },
      });

      const remainingSteps = newDiagIndex - DIAGONAL_TILES.length;
      if (remainingSteps > 0) {
        const { newPosition } = moveOnPerimeter(
          CORNER_POSITIONS.FREE_MARKET,
          remainingSteps,
        );
        p.position = newPosition;
      } else {
        p.position = CORNER_POSITIONS.FREE_MARKET;
        skipLandingResolve = true;
      }
    } else {
      p.position = DIAGONAL_TILES[newDiagIndex].position;
    }
  } else {
    // Perimeter movement
    const currentPos = p.position as number;
    const { newPosition, passedStart } = moveOnPerimeter(currentPos, total);

    if (passedStart) {
      p.capital += PASS_START_BONUS;
      logs.push({
        playerId,
        actionType: "passed_start",
        payload: { bonus: PASS_START_BONUS },
      });

      if (newPosition === CORNER_POSITIONS.START) {
        // Landed exactly on START — player chooses path on their next roll
        p.position = newPosition;
        newState.lastDiceRoll = dice;
        newState.phase = "waiting_for_path_choice";
        skipLandingResolve = true;
      } else {
        // Passed through START — roll path-choice die to determine route
        const pathDie = rollPathChoiceDie();
        const stepsFromStart = newPosition;

        if (isDiagonalChoice(pathDie)) {
          // Route remaining movement onto the diagonal
          p.isOnDiagonal = true;
          if (stepsFromStart <= DIAGONAL_TILES.length) {
            p.position = DIAGONAL_TILES[stepsFromStart - 1].position;
          } else {
            // Overran the diagonal — arrive at FREE MARKET + continue
            p.isOnDiagonal = false;
            const pool = Math.max(newState.freeMarketPool, FREE_MARKET_MINIMUM);
            p.capital += pool;
            newState.freeMarketPool = 0;
            logs.push({
              playerId,
              actionType: "collected_free_market",
              payload: { amount: pool },
            });
            const overflow = stepsFromStart - DIAGONAL_TILES.length;
            if (overflow > 0) {
              const { newPosition: overflowPos } = moveOnPerimeter(
                CORNER_POSITIONS.FREE_MARKET,
                overflow,
              );
              p.position = overflowPos;
            } else {
              p.position = CORNER_POSITIONS.FREE_MARKET;
              skipLandingResolve = true;
            }
          }
          logs.push({
            playerId,
            actionType: "path_choice_auto",
            payload: { die: pathDie, choice: "diagonal" },
          });
        } else {
          // Stay on perimeter — position already computed
          p.position = newPosition;
          logs.push({
            playerId,
            actionType: "path_choice_auto",
            payload: { die: pathDie, choice: "perimeter" },
          });
        }
      }
    } else {
      p.position = newPosition;
    }
  }

  newState.lastDiceRoll = dice;

  // Resolve landing tile (skip if already handled, e.g., diagonal overflow to FREE MARKET)
  if (!skipLandingResolve) {
    const landingResult = resolveLanding(newState, playerId, logs);
    newState = landingResult.state;
    logs.push(...landingResult.additionalLogs);
  }

  // Determine next phase (preserve special phases already set)
  if (
    newState.phase !== "waiting_for_buy" &&
    newState.phase !== "game_over" &&
    newState.phase !== "waiting_for_path_choice"
  ) {
    if (doubles && p.doublesCount < TRIPLE_DOUBLES_LIMIT) {
      newState.phase = "rolling_doubles";
    } else {
      newState.phase = "action";
    }
  }

  return { state: newState, logEntries: logs };
}

function resolveLanding(
  state: InternalGameState,
  playerId: string,
  existingLogs: LogEntry[],
): { state: InternalGameState; additionalLogs: LogEntry[] } {
  const logs: LogEntry[] = [];
  const p = getPlayer(state, playerId)!;
  const pos = p.position;
  const tile = getTileByPosition(pos);

  if (!tile) return { state, additionalLogs: logs };

  // Corner effects
  if (typeof pos === "number") {
    if (pos === CORNER_POSITIONS.GO_TO_REGULATION) {
      p.position = CORNER_POSITIONS.REGULATION_ZONE;
      p.inRegulation = true;
      p.isOnDiagonal = false;
      logs.push({
        playerId,
        actionType: "sent_to_regulation",
        payload: { reason: "go_to_regulation_tile" },
      });
      return { state, additionalLogs: logs };
    }

    if (pos === CORNER_POSITIONS.FREE_MARKET) {
      const pool = Math.max(state.freeMarketPool, FREE_MARKET_MINIMUM);
      p.capital += pool;
      state.freeMarketPool = 0;
      logs.push({
        playerId,
        actionType: "collected_free_market",
        payload: { amount: pool },
      });
      return { state, additionalLogs: logs };
    }
  }

  // Special tiles
  if (tile.type === "special") {
    if (tile.name === "CORPORATE TAX I") {
      p.capital -= CORPORATE_TAX_I;
      state.freeMarketPool += CORPORATE_TAX_I;
      logs.push({
        playerId,
        actionType: "paid_tax",
        payload: { amount: CORPORATE_TAX_I, tile: tile.name },
      });
    } else if (tile.name === "CORPORATE TAX II") {
      p.capital -= CORPORATE_TAX_II;
      state.freeMarketPool += CORPORATE_TAX_II;
      logs.push({
        playerId,
        actionType: "paid_tax",
        payload: { amount: CORPORATE_TAX_II, tile: tile.name },
      });
    } else if (tile.name === "GOVERNMENT GRANT") {
      p.capital += GOVERNMENT_GRANT;
      logs.push({
        playerId,
        actionType: "received_grant",
        payload: { amount: GOVERNMENT_GRANT },
      });
    }
    // MARKET EVENT, DISRUPTION CARD, FLASH CRASH, BLACK MARKET RELAY:
    // These require card deck mechanics (draw + resolve). For now, log them
    // as events. Full card resolution is a future enhancement.
    if (
      tile.name === "MARKET EVENT" ||
      tile.name === "DISRUPTION CARD" ||
      tile.name === "FLASH CRASH" ||
      tile.name === "BLACK MARKET RELAY"
    ) {
      logs.push({
        playerId,
        actionType: "special_tile_event",
        payload: { tileName: tile.name, position: pos },
      });
    }
    return { state, additionalLogs: logs };
  }

  // Purchasable tile (sector_tile, sector_hub, utility)
  if (isTilePurchasable(pos)) {
    const owner = getTileOwner(state, pos);
    if (owner === null) {
      // Unowned - offer right of first refusal
      state.pendingBuyTilePosition = pos;
      state.phase = "waiting_for_buy";
      logs.push({
        playerId,
        actionType: "tile_available",
        payload: { position: pos, name: tile.name, cost: tile.cost },
      });
    } else if (owner !== playerId) {
      // Owned by someone else - pay rent
      const rentResult = calculateRent(state, pos, playerId);
      p.capital -= rentResult.rent;
      const ownerPlayer = getPlayer(state, owner)!;
      ownerPlayer.capital += rentResult.rent;
      logs.push({
        playerId,
        actionType: "paid_rent",
        payload: {
          to: owner,
          amount: rentResult.rent,
          position: pos,
          name: tile.name,
        },
      });
    }
  }

  return { state, additionalLogs: logs };
}

function calculateRent(
  state: InternalGameState,
  position: number | string,
  _visitorId: string,
): { rent: number } {
  const tile = getTileByPosition(position);
  if (!tile || tile.cost === null) return { rent: 0 };

  const tileState = state.tiles.find(
    (t) => String(t.position) === String(position),
  );
  if (!tileState || !tileState.ownerId || tileState.mortgaged)
    return { rent: 0 };

  const ownerId = tileState.ownerId;

  if (tile.type === "sector_hub") {
    const hubCount = countHubsOwned(state, ownerId);
    return { rent: calculateHubRent(hubCount) };
  }

  if (tile.type === "utility") {
    const utilCount = countUtilitiesOwned(state, ownerId);
    const diceTotal = state.lastDiceRoll
      ? state.lastDiceRoll[0] + state.lastDiceRoll[1]
      : 7;
    return { rent: calculateUtilityRent(utilCount, diceTotal) };
  }

  if (tile.type === "sector_tile" && tile.baseRent !== null && tile.sectorId) {
    const sectorCtrl = hasSectorControl(state, ownerId, tile.sectorId);
    const devTokens = tileState.developmentTokens;
    return {
      rent: calculateSectorTileRent(tile.baseRent, devTokens, sectorCtrl),
    };
  }

  return { rent: 0 };
}

function handleBuyTile(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "waiting_for_buy") {
    throw "game.no_pending_buy";
  }
  if (
    action.tilePosition === undefined ||
    String(action.tilePosition) !== String(state.pendingBuyTilePosition)
  ) {
    throw "game.wrong_tile";
  }

  const tile = getTileByPosition(action.tilePosition);
  if (!tile || tile.cost === null) throw "game.tile_not_purchasable";

  const p = getPlayer(state, playerId)!;
  if (p.capital < tile.cost) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital -= tile.cost;
  np.ownedTilePositions.push(tile.position);

  const ts = newState.tiles.find(
    (t) => String(t.position) === String(tile.position),
  );
  if (ts) {
    ts.ownerId = playerId;
  }

  newState.pendingBuyTilePosition = null;

  // Check doubles -> continue rolling, else action phase
  if (np.doublesCount > 0 && np.doublesCount < TRIPLE_DOUBLES_LIMIT) {
    newState.phase = "rolling_doubles";
  } else {
    newState.phase = "action";
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "bought_tile",
      payload: { position: tile.position, name: tile.name, cost: tile.cost },
    },
  ];

  // Check win
  const winner = checkWinConditions(newState);
  if (winner) {
    newState.winnerId = winner;
    newState.phase = "game_over";
    logs.push({
      playerId: winner,
      actionType: "game_won",
      payload: {
        winnerId: winner,
        type: "solo",
        marketValue: playerMarketValue(newState, winner),
        totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
      },
    });
  }

  return { state: newState, logEntries: logs };
}

function handleDeclineTile(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "waiting_for_buy") {
    throw "game.no_pending_buy";
  }
  if (
    action.tilePosition === undefined ||
    String(action.tilePosition) !== String(state.pendingBuyTilePosition)
  ) {
    throw "game.wrong_tile";
  }

  const newState = deepClone(state);
  newState.pendingBuyTilePosition = null;

  const p = getPlayer(newState, playerId)!;

  if (p.doublesCount > 0 && p.doublesCount < TRIPLE_DOUBLES_LIMIT) {
    newState.phase = "rolling_doubles";
  } else {
    newState.phase = "action";
  }

  const tile = getTileByPosition(action.tilePosition);
  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "declined_tile",
      payload: {
        position: action.tilePosition,
        name: tile?.name ?? "Unknown",
      },
    },
  ];

  return { state: newState, logEntries: logs };
}

function handleEndTurn(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  const allowedPhases = ["action", "rolling_doubles"];
  if (!allowedPhases.includes(state.phase)) {
    throw "game.cannot_end_turn";
  }

  const newState = deepClone(state);
  const logs: LogEntry[] = [];

  const p = getPlayer(newState, playerId)!;
  p.doublesCount = 0;
  p.actionPointsRemaining = 0;

  // Regulation penalty tracking:
  // If the player was serving a regulation penalty this turn (regulationServed),
  // clear it now. If they were just sent to regulation this turn, keep the flag
  // so the penalty applies on their *next* turn.
  if (p.inRegulation && state.phase === "action") {
    // The player had inRegulation entering this turn and completed it.
    // Check if they rolled this turn (meaning they served the penalty turn).
    // We use a heuristic: if lastDiceRoll is set, they rolled and moved,
    // which means this was their penalty turn.
    if (newState.lastDiceRoll) {
      p.inRegulation = false;
      logs.push({
        playerId,
        actionType: "regulation_served",
        payload: null,
      });
    }
  }

  logs.push({ playerId, actionType: "end_turn", payload: null });

  // Advance to next non-eliminated player
  let nextIndex = (newState.currentPlayerIndex + 1) % newState.turnOrder.length;
  let attempts = 0;
  while (
    newState.eliminatedPlayerIds.includes(newState.turnOrder[nextIndex]) &&
    attempts < newState.turnOrder.length
  ) {
    nextIndex = (nextIndex + 1) % newState.turnOrder.length;
    attempts++;
  }

  const roundWrapped =
    nextIndex <= newState.currentPlayerIndex || nextIndex === 0;
  newState.currentPlayerIndex = nextIndex;

  if (roundWrapped && nextIndex === 0) {
    newState.round += 1;
    logs.push({
      playerId: null,
      actionType: "new_round",
      payload: { round: newState.round },
    });
  }

  // Set up next player's turn
  const nextPlayerId = newState.turnOrder[nextIndex];
  const nextPlayer = getPlayer(newState, nextPlayerId)!;
  // Regulation penalty: skip optional actions (0 AP) on the penalty turn
  nextPlayer.actionPointsRemaining = nextPlayer.inRegulation
    ? 0
    : ACTION_POINTS_PER_TURN;
  newState.phase = "waiting_for_roll";
  newState.lastDiceRoll = null;
  newState.pendingBuyTilePosition = null;

  return { state: newState, logEntries: logs };
}

function handlePathChoice(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "waiting_for_path_choice") {
    throw "game.path_choice_not_needed";
  }

  const choice = action.choice;
  if (choice !== "perimeter" && choice !== "diagonal") {
    throw "game.invalid_action";
  }

  const newState = deepClone(state);
  const p = getPlayer(newState, playerId)!;

  if (choice === "diagonal") {
    p.isOnDiagonal = true;
    p.position = "D1";
  } else {
    p.isOnDiagonal = false;
    p.position = 1;
  }

  newState.phase = "action";

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "path_choice",
      payload: { choice },
    },
  ];

  return { state: newState, logEntries: logs };
}

function handleDevelopTile(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const p = getPlayer(state, playerId)!;
  if (p.actionPointsRemaining < ACTION_COSTS.DEVELOP_TILE)
    throw "game.insufficient_ap";

  const pos = action.tilePosition;
  if (pos === undefined) throw "game.invalid_action";

  const tile = getTileByPosition(pos);
  if (!tile || tile.type !== "sector_tile") throw "game.tile_not_purchasable";

  const tileState = state.tiles.find((t) => String(t.position) === String(pos));
  if (!tileState || tileState.ownerId !== playerId) throw "game.tile_not_owned";
  if (tileState.mortgaged) throw "game.tile_mortgaged";
  if (tileState.developmentTokens >= MAX_DEVELOPMENT_TOKENS)
    throw "game.max_development";

  const tokenNum = tileState.developmentTokens + 1;
  const cost = calculateDevelopmentCost(tile.cost!, tokenNum);
  if (p.capital < cost) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital -= cost;
  np.actionPointsRemaining -= ACTION_COSTS.DEVELOP_TILE;

  const nts = newState.tiles.find((t) => String(t.position) === String(pos))!;
  nts.developmentTokens += 1;
  np.developmentTokens[String(pos)] = nts.developmentTokens;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "developed_tile",
      payload: {
        position: pos,
        name: tile.name,
        tokenNumber: nts.developmentTokens,
        cost,
      },
    },
  ];

  return { state: newState, logEntries: logs };
}

function handleMortgageTile(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const pos = action.tilePosition;
  if (pos === undefined) throw "game.invalid_action";

  const tileState = state.tiles.find((t) => String(t.position) === String(pos));
  if (!tileState || tileState.ownerId !== playerId) throw "game.tile_not_owned";
  if (tileState.mortgaged) throw "game.tile_mortgaged";

  const tile = getTileByPosition(pos);
  if (!tile || tile.cost === null) throw "game.invalid_action";

  const mortgageValue = calculateMortgageValue(tile.cost);

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital += mortgageValue;
  np.mortgagedTilePositions.push(pos);

  const nts = newState.tiles.find((t) => String(t.position) === String(pos))!;
  nts.mortgaged = true;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "mortgaged_tile",
      payload: {
        position: pos,
        name: tile.name,
        mortgageValue,
      },
    },
  ];

  return { state: newState, logEntries: logs };
}

function handleRedeemTile(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  if (state.phase !== "action") throw "game.invalid_action";

  const pos = action.tilePosition;
  if (pos === undefined) throw "game.invalid_action";

  const tileState = state.tiles.find((t) => String(t.position) === String(pos));
  if (!tileState || tileState.ownerId !== playerId) throw "game.tile_not_owned";
  if (!tileState.mortgaged) throw "game.tile_not_mortgaged";

  const tile = getTileByPosition(pos);
  if (!tile || tile.cost === null) throw "game.invalid_action";

  const redemptionCost = calculateRedemptionCost(tile.cost);
  const p = getPlayer(state, playerId)!;
  if (p.capital < redemptionCost) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital -= redemptionCost;
  np.mortgagedTilePositions = np.mortgagedTilePositions.filter(
    (p) => String(p) !== String(pos),
  );

  const nts = newState.tiles.find((t) => String(t.position) === String(pos))!;
  nts.mortgaged = false;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "redeemed_tile",
      payload: {
        position: pos,
        name: tile.name,
        redemptionCost,
      },
    },
  ];

  return { state: newState, logEntries: logs };
}
