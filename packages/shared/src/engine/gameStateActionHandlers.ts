// Tile movement, landing resolution, auctions-on-turn, and property actions.

import {
  CORNER_POSITIONS,
  DIAGONAL_TILES,
  getTileByPosition,
} from "../config/board.js";
import {
  AFFINITY_IDS,
  applyAcquisitionCostAffinity,
  applyLastMileLogisticsTraverseBonus,
  hasPlayerAffinity,
} from "./affinity.js";
import { recordAuctionSubmission, startDeclineAuction } from "./auction.js";
import { processCoordinationPhase } from "./coordinationPhase.js";
import {
  isDiagonalChoice,
  isDoubles,
  moveOnPerimeter,
  rollPathChoiceDie,
  TRIPLE_DOUBLES_LIMIT,
} from "./dice.js";
import {
  disruptionDrawCount,
  drawAndResolveDisruptionCards,
  resolveBlackMarketRelay,
  resolveFlashCrash,
} from "./disruptionEvents.js";
import { collectFreeMarketPool } from "./freeMarket.js";
import type {
  ApplyActionResult,
  GameActionInput,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { syntheticCdoMortgageBoostActive } from "./marketEventModifiers.js";
import {
  drawAndResolveMarketEvent,
  drawTurnStartMarketEvent,
} from "./marketEvents.js";
import {
  calculateMortgageValueForState,
  calculateRedemptionCost,
  MORTGAGE_RATE,
} from "./mortgage.js";
import {
  isOptionalRuleEnabled,
  regulationPenaltiesEnabled,
} from "./optionalRulesEngine.js";
import { resolvePostMovePhase } from "./phaseHelpers.js";
import { advanceToFirstPlayerOfNewRound } from "./rateCardActions.js";
import {
  recordOpposingSectorLanding,
  revokeRateCardsForMortgage,
} from "./rateCards.js";
import { calculateDevelopmentCost, MAX_DEVELOPMENT_TOKENS } from "./rent.js";
import { settleRentPayment } from "./rentPayment.js";
import {
  computeAffinityRentBonusForTile,
  computeTileRent,
} from "./rentResolution.js";
import {
  ACTION_COSTS,
  ACTION_POINTS_PER_TURN,
  CORPORATE_TAX_I,
  CORPORATE_TAX_II,
  GOVERNMENT_GRANT,
  PASS_START_BONUS,
} from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { areSameSyndicate } from "./syndicate.js";
import {
  applyWinIfThresholdCrossed,
  markFinalRoundTurnComplete,
} from "./winResolution.js";

function exitDiagonalAtFreeMarket(
  state: InternalGameState,
  player: InternalPlayerState,
  playerId: string,
  logs: LogEntry[],
  overflowSteps: number,
): { skipLandingResolve: boolean } {
  player.isOnDiagonal = false;
  applyLastMileLogisticsTraverseBonus(state, playerId, logs);
  collectFreeMarketPool(state, playerId, logs);

  if (overflowSteps > 0) {
    const { newPosition } = moveOnPerimeter(
      CORNER_POSITIONS.FREE_MARKET,
      overflowSteps,
    );
    player.position = newPosition;
    return { skipLandingResolve: false };
  }

  player.position = CORNER_POSITIONS.FREE_MARKET;
  return { skipLandingResolve: true };
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

export function handleDrawMarketEvent(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  if (state.phase !== "waiting_for_market_event") {
    throw "game.invalid_phase";
  }
  return drawAndResolveMarketEvent(state, playerId, "round_start");
}

export function handleRollDice(
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

  const _player = getPlayer(state, playerId)!;
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
    p.doublesCount = 0;
    p.isOnDiagonal = false;
    newState.lastDiceRoll = dice;
    if (regulationPenaltiesEnabled(newState.settings)) {
      p.position = CORNER_POSITIONS.REGULATION_ZONE;
      p.inRegulation = true;
      logs.push({
        playerId,
        actionType: "sent_to_regulation",
        payload: { reason: "triple_doubles" },
      });
    }
    newState.phase = "action";
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
      const remainingSteps = newDiagIndex - DIAGONAL_TILES.length;
      const exitResult = exitDiagonalAtFreeMarket(
        newState,
        p,
        playerId,
        logs,
        remainingSteps,
      );
      skipLandingResolve = exitResult.skipLandingResolve;
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
        const pathDie = action.pathChoiceDie ?? rollPathChoiceDie();
        const stepsFromStart = newPosition;

        if (isDiagonalChoice(pathDie)) {
          // Route remaining movement onto the diagonal
          p.isOnDiagonal = true;
          if (stepsFromStart <= DIAGONAL_TILES.length) {
            p.position = DIAGONAL_TILES[stepsFromStart - 1].position;
          } else {
            const overflow = stepsFromStart - DIAGONAL_TILES.length;
            const exitResult = exitDiagonalAtFreeMarket(
              newState,
              p,
              playerId,
              logs,
              overflow,
            );
            skipLandingResolve = exitResult.skipLandingResolve;
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
    newState.phase !== "waiting_for_path_choice" &&
    newState.phase !== "waiting_for_disruption_nullify"
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
  _existingLogs: LogEntry[],
): { state: InternalGameState; additionalLogs: LogEntry[] } {
  const logs: LogEntry[] = [];
  const p = getPlayer(state, playerId)!;
  const pos = p.position;
  const tile = getTileByPosition(pos);

  if (!tile) return { state, additionalLogs: logs };

  // Corner effects
  if (typeof pos === "number") {
    if (pos === CORNER_POSITIONS.GO_TO_REGULATION) {
      if (regulationPenaltiesEnabled(state.settings)) {
        p.position = CORNER_POSITIONS.REGULATION_ZONE;
        p.inRegulation = true;
        p.isOnDiagonal = false;
        logs.push({
          playerId,
          actionType: "sent_to_regulation",
          payload: { reason: "go_to_regulation_tile" },
        });
      }
      return { state, additionalLogs: logs };
    }

    if (pos === CORNER_POSITIONS.FREE_MARKET) {
      collectFreeMarketPool(state, playerId, logs);
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
    if (tile.name === "MARKET EVENT") {
      const drawResult = drawAndResolveMarketEvent(
        state,
        playerId,
        "tile",
        pos,
      );
      return {
        state: drawResult.state,
        additionalLogs: [...logs, ...drawResult.logEntries],
      };
    }
    if (tile.name === "DISRUPTION CARD") {
      const drawResult = drawAndResolveDisruptionCards(
        state,
        playerId,
        disruptionDrawCount(state.settings),
        "tile",
        pos,
      );
      return {
        state: drawResult.state,
        additionalLogs: [...logs, ...drawResult.logEntries],
      };
    }
    if (tile.name === "FLASH CRASH") {
      const crashResult = resolveFlashCrash(state, playerId, pos);
      return {
        state: crashResult.state,
        additionalLogs: [...logs, ...crashResult.logEntries],
      };
    }
    if (tile.name === "BLACK MARKET RELAY") {
      const relayResult = resolveBlackMarketRelay(state, playerId, pos);
      return {
        state: relayResult.state,
        additionalLogs: [...logs, ...relayResult.logEntries],
      };
    }
    return { state, additionalLogs: logs };
  }

  // Purchasable tile (sector_tile, sector_hub, utility)
  if (isTilePurchasable(pos)) {
    const owner = getTileOwner(state, pos);
    if (owner === null) {
      if (isOptionalRuleEnabled(state.settings, "auction_everything")) {
        const auctionState = startDeclineAuction(
          state,
          pos,
          resolvePostMovePhase(state, playerId),
        );
        logs.push({
          playerId,
          actionType: "tile_available",
          payload: {
            position: pos,
            name: tile.name,
            cost: tile.cost,
            auctionEverything: true,
          },
        });
        logs.push({
          playerId: null,
          actionType: "auction_started",
          payload: {
            position: pos,
            name: tile.name,
            auctionType:
              auctionState.pendingAuction?.auctionType ?? "sealed_bids",
            reservePrice: 1,
          },
        });
        return { state: auctionState, additionalLogs: logs };
      }
      state.pendingBuyTilePosition = pos;
      state.phase = "waiting_for_buy";
      logs.push({
        playerId,
        actionType: "tile_available",
        payload: { position: pos, name: tile.name, cost: tile.cost },
      });
    } else if (
      owner !== playerId &&
      !areSameSyndicate(state, playerId, owner)
    ) {
      const { rent, ownerId: rentOwnerId } = computeTileRent(
        state,
        pos,
        playerId,
      );
      if (rentOwnerId && rent > 0) {
        const settlement = settleRentPayment(
          state,
          playerId,
          rentOwnerId,
          rent,
          pos,
        );
        state = settlement.state;
        logs.push(...settlement.logs);
        const ownerPlayer = getPlayer(state, rentOwnerId);
        const paidAmount = rent - settlement.shortfall;
        if (ownerPlayer && paidAmount > 0) {
          const rentBonus = computeAffinityRentBonusForTile(
            state,
            rentOwnerId,
            pos,
            paidAmount,
          );
          if (rentBonus > 0) {
            ownerPlayer.capital += rentBonus;
            logs.push({
              playerId: rentOwnerId,
              actionType: "affinity_bonus",
              payload: {
                amount: rentBonus,
                reason: "rent_subsidy",
                position: pos,
              },
            });
          }
        }
        if (tile.sectorId) {
          state = recordOpposingSectorLanding(state, playerId, tile.sectorId);
        }
      }
    }
  }

  return { state, additionalLogs: logs };
}

export function handleBuyTile(
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
  const purchaseCost = applyAcquisitionCostAffinity(
    state,
    playerId,
    tile.sectorId,
    tile.cost,
  );
  if (p.capital < purchaseCost) throw "game.insufficient_capital";

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital -= purchaseCost;
  np.ownedTilePositions.push(tile.position);

  const ts = newState.tiles.find(
    (t) => String(t.position) === String(tile.position),
  );
  if (ts) {
    ts.ownerId = playerId;
  }

  newState.pendingBuyTilePosition = null;

  newState.phase = resolvePostMovePhase(newState, playerId);

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "bought_tile",
      payload: { position: tile.position, name: tile.name, cost: tile.cost },
    },
  ];

  // Check win
  applyWinIfThresholdCrossed(newState, logs);

  return { state: newState, logEntries: logs };
}

export function handleDeclineTile(
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
  const newState = startDeclineAuction(
    state,
    action.tilePosition,
    resolvePostMovePhase(state, playerId),
  );

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "declined_tile",
      payload: {
        position: action.tilePosition,
        name: tile?.name ?? "Unknown",
      },
    },
    {
      playerId: null,
      actionType: "auction_started",
      payload: {
        position: action.tilePosition,
        name: tile?.name ?? "Unknown",
        auctionType: newState.pendingAuction?.auctionType ?? "sealed_bids",
      },
    },
  ];

  return { state: newState, logEntries: logs };
}

export function handleAuctionBid(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction) {
    throw "game.auction_not_active";
  }
  if (
    action.tilePosition === undefined ||
    String(action.tilePosition) !== String(auction.tilePosition)
  ) {
    throw "game.wrong_tile";
  }
  if (action.amount === undefined || action.amount < 1) {
    throw "game.invalid_action";
  }

  return recordAuctionSubmission(state, playerId, action.amount);
}

export function handleAuctionPass(
  state: InternalGameState,
  playerId: string,
  action: GameActionInput,
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction) {
    throw "game.auction_not_active";
  }
  if (
    action.tilePosition === undefined ||
    String(action.tilePosition) !== String(auction.tilePosition)
  ) {
    throw "game.wrong_tile";
  }

  if (state.pendingAuction?.auctionType === "live_bidding") {
    throw "game.invalid_action";
  }

  return recordAuctionSubmission(state, playerId, "pass");
}

export function handleEndTurn(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  const allowedPhases = ["action", "rolling_doubles"];
  if (!allowedPhases.includes(state.phase)) {
    throw "game.cannot_end_turn";
  }

  let newState = deepClone(state);
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

  if (newState.finalRound) {
    newState = markFinalRoundTurnComplete(newState, playerId, logs);
  }

  if (newState.phase === "game_over") {
    newState.aiPlayers = (newState.aiPlayers ?? []).filter(
      (ai) => ai.takeoverForPlayerId !== playerId,
    );
    return { state: newState, logEntries: logs };
  }

  if (roundWrapped && nextIndex === 0) {
    newState.round += 1;
    logs.push({
      playerId: null,
      actionType: "new_round",
      payload: { round: newState.round },
    });
    newState = processCoordinationPhase(newState, logs);
    const roundStart = advanceToFirstPlayerOfNewRound(newState, logs);
    newState = roundStart.state;
    newState.aiPlayers = (newState.aiPlayers ?? []).filter(
      (ai) => ai.takeoverForPlayerId !== playerId,
    );
    return { state: newState, logEntries: logs };
  }

  // Set up next player's turn
  const nextPlayerId = newState.turnOrder[nextIndex];
  const nextPlayer = getPlayer(newState, nextPlayerId)!;
  // Regulation penalty: skip optional actions (0 AP) on the penalty turn
  nextPlayer.actionPointsRemaining = nextPlayer.inRegulation
    ? 0
    : ACTION_POINTS_PER_TURN;
  newState.lastDiceRoll = null;
  newState.pendingBuyTilePosition = null;
  const drawResult = drawTurnStartMarketEvent(newState, nextPlayerId);
  logs.push(...drawResult.logEntries);
  newState = drawResult.state;

  newState.aiPlayers = (newState.aiPlayers ?? []).filter(
    (ai) => ai.takeoverForPlayerId !== playerId,
  );

  return { state: newState, logEntries: logs };
}

export function handlePathChoice(
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

export function handleDevelopTile(
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
  const cost = calculateDevelopmentCost(
    tile.cost!,
    tokenNum,
    hasPlayerAffinity(state, playerId, AFFINITY_IDS.lean_manufacturing),
  );
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

export function handleMortgageTile(
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

  const mortgageValue = calculateMortgageValueForState(state, tile.cost);

  const newState = deepClone(state);
  const np = getPlayer(newState, playerId)!;
  np.capital += mortgageValue;
  np.mortgagedTilePositions.push(pos);

  const nts = newState.tiles.find((t) => String(t.position) === String(pos))!;
  nts.mortgaged = true;
  nts.mortgageRate = syntheticCdoMortgageBoostActive(state)
    ? 0.6
    : MORTGAGE_RATE;

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
  const workingState = revokeRateCardsForMortgage(newState, pos, logs);

  return { state: workingState, logEntries: logs };
}

export function handleRedeemTile(
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

  const redemptionCost = calculateRedemptionCost(
    tile.cost,
    hasPlayerAffinity(state, playerId, AFFINITY_IDS.proptech_pioneer),
    tileState.mortgageRate ?? MORTGAGE_RATE,
  );
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
  nts.mortgageRate = null;

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
