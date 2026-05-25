import {
  getTileByPosition,
  getTilesBySector,
  SECTOR_IDS,
} from "../config/board.js";
import { startDeclineAuction } from "./auction.js";
import type { AuctionResumePhase } from "./auctionTypes.js";
import { hashSeed } from "./deckShuffle.js";
import type {
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { activePlayers, adjustCapital } from "./marketEventPrimitives.js";
import type { MarketEventTrigger } from "./marketEvents.js";
import { getPlayer } from "./stateUtils.js";

export type OptionalMarketEventContext = {
  state: InternalGameState;
  cardId: string;
  drawingPlayerId: string;
  logs: LogEntry[];
  trigger?: MarketEventTrigger;
};

function auctionResumePhaseForTrigger(
  trigger: MarketEventTrigger | undefined,
): AuctionResumePhase {
  return trigger === "round_start" ? "waiting_for_roll" : "action";
}

function seededD6(
  state: InternalGameState,
  cardId: string,
  playerId: string,
): number {
  return (
    (hashSeed(`${state.gameId}:${state.round}:${cardId}:${playerId}`) % 6) + 1
  );
}

function sumOpponentDevelopmentTokens(
  state: InternalGameState,
  playerId: string,
): number {
  let tokens = 0;
  for (const other of activePlayers(state)) {
    if (other.playerId === playerId) continue;
    for (const pos of other.ownedTilePositions) {
      const tileState = state.tiles.find(
        (entry) => String(entry.position) === String(pos),
      );
      tokens += tileState?.developmentTokens ?? 0;
    }
  }
  return tokens;
}

function playerWithFewestTiles(
  state: InternalGameState,
): InternalPlayerState | null {
  let best: InternalPlayerState | null = null;
  for (const player of activePlayers(state)) {
    if (
      !best ||
      player.ownedTilePositions.length < best.ownedTilePositions.length
    ) {
      best = player;
    }
  }
  return best;
}

function mostExpensiveOwnedTile(
  state: InternalGameState,
  playerId: string,
): number | string | null {
  const player = getPlayer(state, playerId);
  if (!player) return null;
  let bestPos: number | string | null = null;
  let bestCost = -1;
  for (const pos of player.ownedTilePositions) {
    const tile = getTileByPosition(pos);
    if (
      tile?.cost !== null &&
      tile?.cost !== undefined &&
      tile.cost > bestCost
    ) {
      bestCost = tile.cost;
      bestPos = pos;
    }
  }
  return bestPos;
}

function playerControllingMostTilesInAnySector(state: InternalGameState): {
  playerId: string;
  sectorId: string;
  count: number;
} | null {
  let best: { playerId: string; sectorId: string; count: number } | null = null;
  for (const player of activePlayers(state)) {
    for (const sectorId of SECTOR_IDS) {
      const sectorTiles = getTilesBySector(sectorId);
      const owned = sectorTiles.filter((tile) =>
        player.ownedTilePositions.some(
          (pos) => String(pos) === String(tile.position),
        ),
      ).length;
      if (!best || owned > best.count) {
        best = { playerId: player.playerId, sectorId, count: owned };
      }
    }
  }
  return best && best.count > 0 ? best : null;
}

function pickSeededOwnedTile(
  state: InternalGameState,
  donor: InternalPlayerState,
  cardId: string,
): number | string | null {
  const positions = donor.ownedTilePositions;
  if (positions.length === 0) return null;
  const index =
    hashSeed(`${state.gameId}:${state.round}:${cardId}:tile`) %
    positions.length;
  return positions[index] ?? null;
}

const OPTIONAL_MARKET_EVENT_HANDLERS: Record<
  string,
  (ctx: OptionalMarketEventContext) => boolean
> = {
  optional_leveraged_buyout: ({ state, drawingPlayerId, logs, trigger }) => {
    const target = playerWithFewestTiles(state);
    if (!target) return true;
    const expensive = mostExpensiveOwnedTile(state, target.playerId);
    if (!expensive) return true;
    const auctionState = startDeclineAuction(
      state,
      expensive,
      auctionResumePhaseForTrigger(trigger),
    );
    if (auctionState.pendingAuction) {
      auctionState.pendingAuction.reservePrice = 1;
      auctionState.pendingAuction.tieBreakMinBid = 1;
      auctionState.pendingAuction.sellerId = target.playerId;
      auctionState.pendingAuction.eligiblePlayerIds = state.turnOrder.filter(
        (id) =>
          id !== target.playerId && !state.eliminatedPlayerIds.includes(id),
      );
      state.phase = auctionState.phase;
      state.pendingAuction = auctionState.pendingAuction;
    }
    logs.push({
      playerId: drawingPlayerId,
      actionType: "optional_leveraged_buyout",
      payload: { targetPlayerId: target.playerId, tilePosition: expensive },
    });
    return true;
  },
  optional_corporate_espionage: ({ state, cardId, logs }) => {
    for (const player of activePlayers(state)) {
      const tokens = sumOpponentDevelopmentTokens(state, player.playerId);
      if (tokens > 0) {
        const payment = tokens * 10;
        const delta = adjustCapital(player, -payment);
        logs.push({
          playerId: player.playerId,
          actionType: "market_event_capital_change",
          payload: { cardId, delta, capital: player.capital, tokens },
        });
      }
    }
    return true;
  },
  optional_short_squeeze: ({ state, cardId, logs }) => {
    const leader = playerControllingMostTilesInAnySector(state);
    if (!leader) return true;
    const { playerId: leaderId, sectorId, count } = leader;
    const paymentEach = count * 30;
    for (const player of activePlayers(state)) {
      if (player.playerId === leaderId) continue;
      const delta = adjustCapital(player, -paymentEach);
      const receiver = getPlayer(state, leaderId);
      if (receiver) {
        receiver.capital += -delta;
      }
      logs.push({
        playerId: player.playerId,
        actionType: "market_event_capital_change",
        payload: {
          cardId,
          delta,
          capital: player.capital,
          sectorId,
        },
      });
    }
    return true;
  },
  optional_supply_chain_crisis: ({ state, logs }) => {
    if (!state.marketEventModifiers) state.marketEventModifiers = {};
    state.marketEventModifiers.utilityRentMultiplier = 2;
    state.marketEventModifiers.utilityRentMultiplierUntilRound =
      state.round + 2;
    logs.push({
      playerId: null,
      actionType: "supply_chain_crisis_active",
      payload: {
        untilRound: state.marketEventModifiers.utilityRentMultiplierUntilRound,
      },
    });
    return true;
  },
  optional_sovereign_wealth_fund: ({ state, cardId, logs }) => {
    const players = activePlayers(state);
    const share = players.length > 0 ? Math.floor(200 / players.length) : 0;
    for (const player of players) {
      const delta = adjustCapital(player, share);
      logs.push({
        playerId: player.playerId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta, capital: player.capital },
      });
    }
    return true;
  },
  optional_venture_capital_boom: ({ state, cardId, logs }) => {
    for (const player of activePlayers(state)) {
      if (player.ownedTilePositions.length < 3) {
        const delta = adjustCapital(player, 100);
        logs.push({
          playerId: player.playerId,
          actionType: "market_event_capital_change",
          payload: { cardId, delta, capital: player.capital },
        });
      }
    }
    return true;
  },
  optional_algorithmic_flash_trade: ({ state, cardId, logs }) => {
    for (const player of activePlayers(state)) {
      const roll = seededD6(state, cardId, player.playerId);
      const delta = adjustCapital(player, roll * 10);
      logs.push({
        playerId: player.playerId,
        actionType: "market_event_roll",
        payload: { cardId, roll, delta, capital: player.capital },
      });
    }
    return true;
  },
  optional_regulatory_amnesty: ({ state, cardId, logs }) => {
    for (const player of activePlayers(state)) {
      if (player.inRegulation) {
        player.inRegulation = false;
        logs.push({
          playerId: player.playerId,
          actionType: "regulatory_amnesty",
          payload: { cardId },
        });
      }
    }
    return true;
  },
  optional_dark_pool_transfer: ({ state, cardId, drawingPlayerId, logs }) => {
    const donors = activePlayers(state).filter(
      (player) => player.ownedTilePositions.length > 0,
    );
    if (donors.length === 0) return true;
    const donor =
      donors[
        hashSeed(`${state.gameId}:${state.round}:${cardId}:donor`) %
          donors.length
      ];
    const recipients = activePlayers(state).filter(
      (player) => player.playerId !== donor.playerId,
    );
    if (recipients.length === 0) return true;
    const recipient =
      recipients[
        hashSeed(`${state.gameId}:${state.round}:${cardId}:recipient`) %
          recipients.length
      ];
    const tilePosition = pickSeededOwnedTile(state, donor, cardId);
    if (tilePosition === null) return true;
    const tileState = state.tiles.find(
      (entry) => String(entry.position) === String(tilePosition),
    );
    if (!tileState) return true;
    tileState.ownerId = recipient.playerId;
    donor.ownedTilePositions = donor.ownedTilePositions.filter(
      (pos) => String(pos) !== String(tilePosition),
    );
    recipient.ownedTilePositions.push(tilePosition);
    logs.push({
      playerId: drawingPlayerId,
      actionType: "dark_pool_transfer",
      payload: {
        fromPlayerId: donor.playerId,
        toPlayerId: recipient.playerId,
        tilePosition,
      },
    });
    return true;
  },
  optional_synthetic_cdo: ({ state, logs }) => {
    if (!state.marketEventModifiers) state.marketEventModifiers = {};
    state.marketEventModifiers.syntheticCdoMortgageRound = state.round;
    logs.push({
      playerId: null,
      actionType: "synthetic_cdo_active",
      payload: { round: state.round },
    });
    return true;
  },
  optional_black_swan_event: ({ state, cardId, logs }) => {
    let totalLost = 0;
    let poorest: InternalPlayerState | null = null;
    for (const player of activePlayers(state)) {
      const loss = Math.floor(player.capital * 0.25);
      const delta = adjustCapital(player, -loss);
      totalLost += -delta;
      if (!poorest || player.capital < poorest.capital) {
        poorest = player;
      }
      logs.push({
        playerId: player.playerId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta, capital: player.capital },
      });
    }
    if (poorest) {
      poorest.capital += totalLost;
      logs.push({
        playerId: poorest.playerId,
        actionType: "black_swan_windfall",
        payload: { amount: totalLost, capital: poorest.capital },
      });
    }
    return true;
  },
};

export function resolveOptionalMarketEventEffect(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
  trigger?: MarketEventTrigger,
): boolean {
  const handler = OPTIONAL_MARKET_EVENT_HANDLERS[cardId];
  if (!handler) return false;
  return handler({ state, cardId, drawingPlayerId, logs, trigger });
}
