import { getTileByPosition, getTilesBySector } from "../config/board.js";
import { OPTIONAL_MARKET_EVENT_CARDS_REGISTRY } from "../config/marketEventCards.js";
import {
  MARKET_EVENT_DECK,
  MARKET_EVENT_DECK_IDS,
  type MarketEventCard,
} from "../config/marketEventDeck.js";
import { startDeclineAuction } from "./auction.js";
import { shuffleDeterministic } from "./deckShuffle.js";
import { rollFairD6 } from "./dice.js";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { ACTION_POINTS_PER_TURN } from "./setup.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export type MarketEventTrigger = "round_start" | "tile";

function isKnownMarketEventCardId(cardId: string): boolean {
  return (
    cardId in MARKET_EVENT_DECK ||
    cardId in OPTIONAL_MARKET_EVENT_CARDS_REGISTRY
  );
}

function optionalCardsFromSettings(
  settings: Record<string, unknown> | undefined,
): string[] {
  const optional = settings?.optionalMarketEventCardIds;
  if (!Array.isArray(optional)) return [];

  return optional.filter(
    (cardId): cardId is string =>
      typeof cardId === "string" &&
      cardId in OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  );
}

export function buildMarketEventDeck(
  settings: Record<string, unknown> | undefined,
  gameId: string,
): string[] {
  const customDeck = settings?.marketEventDeckCardIds;
  const baseDeck =
    Array.isArray(customDeck) && customDeck.length > 0
      ? customDeck.filter(
          (cardId): cardId is string =>
            typeof cardId === "string" && isKnownMarketEventCardId(cardId),
        )
      : [...MARKET_EVENT_DECK_IDS];

  for (const cardId of optionalCardsFromSettings(settings)) {
    if (!baseDeck.includes(cardId)) {
      baseDeck.push(cardId);
    }
  }

  return shuffleDeterministic(baseDeck, gameId);
}

export function normalizeMarketEventDeck(state: InternalGameState): void {
  if (state.marketEventDeckRemaining === undefined) {
    state.marketEventDeckRemaining = buildMarketEventDeck(
      state.settings,
      state.gameId,
    );
  }
  if (!state.marketEventDiscard) {
    state.marketEventDiscard = [];
  }
}

function activePlayers(state: InternalGameState): InternalPlayerState[] {
  return state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
}

function adjustCapital(player: InternalPlayerState, delta: number): number {
  const before = player.capital;
  player.capital = Math.max(0, player.capital + delta);
  return player.capital - before;
}

function richestPlayerId(state: InternalGameState): string | null {
  let best: InternalPlayerState | null = null;
  for (const player of activePlayers(state)) {
    if (!best || player.capital > best.capital) {
      best = player;
    }
  }
  return best?.playerId ?? null;
}

function cardMeta(cardId: string): MarketEventCard {
  const standard = MARKET_EVENT_DECK[cardId];
  if (standard) return standard;

  const optional =
    OPTIONAL_MARKET_EVENT_CARDS_REGISTRY[
      cardId as keyof typeof OPTIONAL_MARKET_EVENT_CARDS_REGISTRY
    ];
  if (optional) {
    return {
      id: optional.id,
      name: optional.name,
      category: "variable",
    };
  }

  return {
    id: cardId,
    name: cardId,
    category: "variable",
  };
}

function applyToAllPlayers(
  state: InternalGameState,
  amount: number,
  logs: LogEntry[],
  cardId: string,
): void {
  for (const player of activePlayers(state)) {
    const delta = adjustCapital(player, amount);
    if (delta !== 0) {
      logs.push({
        playerId: player.playerId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta, capital: player.capital },
      });
    }
  }
}

function resolveCategoryEffect(
  state: InternalGameState,
  card: MarketEventCard,
  drawingPlayerId: string,
  logs: LogEntry[],
): void {
  switch (card.category) {
    case "positive":
      applyToAllPlayers(state, 50, logs, card.id);
      return;
    case "negative":
      applyToAllPlayers(state, -50, logs, card.id);
      return;
    case "variable": {
      const roll = rollFairD6();
      logs.push({
        playerId: drawingPlayerId,
        actionType: "market_event_roll",
        payload: { cardId: card.id, roll },
      });
      applyToAllPlayers(state, roll >= 4 ? 50 : -50, logs, card.id);
      return;
    }
    case "targeted": {
      const player = getPlayer(state, drawingPlayerId);
      if (!player) return;
      const delta = adjustCapital(player, 75);
      logs.push({
        playerId: drawingPlayerId,
        actionType: "market_event_capital_change",
        payload: { cardId: card.id, delta, capital: player.capital },
      });
      return;
    }
  }
}

function resolveSpecificEffect(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
): boolean {
  switch (cardId) {
    case "stimulus_package":
      applyToAllPlayers(state, 100, logs, cardId);
      return true;
    case "tech_boom":
    case "bull_market":
      applyToAllPlayers(state, 75, logs, cardId);
      return true;
    case "innovation_grant":
    case "ipo_windfall": {
      const player = getPlayer(state, drawingPlayerId);
      if (!player) return true;
      const delta = adjustCapital(player, 150);
      logs.push({
        playerId: drawingPlayerId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta, capital: player.capital },
      });
      return true;
    }
    case "market_crash":
    case "financial_meltdown": {
      for (const player of activePlayers(state)) {
        const loss = Math.floor(player.capital * 0.1);
        const delta = adjustCapital(player, -loss);
        logs.push({
          playerId: player.playerId,
          actionType: "market_event_capital_change",
          payload: { cardId, delta, capital: player.capital },
        });
      }
      return true;
    }
    case "recession":
      applyToAllPlayers(state, -75, logs, cardId);
      return true;
    case "windfall_tax": {
      const targetId = richestPlayerId(state);
      if (!targetId) return true;
      const player = getPlayer(state, targetId);
      if (!player) return true;
      const payment = Math.min(player.capital, 100);
      player.capital -= payment;
      state.freeMarketPool += payment;
      logs.push({
        playerId: targetId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta: -payment, capital: player.capital },
      });
      return true;
    }
    case "whistleblower": {
      const player = getPlayer(state, drawingPlayerId);
      if (!player) return true;
      const delta = adjustCapital(player, -50);
      logs.push({
        playerId: drawingPlayerId,
        actionType: "market_event_capital_change",
        payload: { cardId, delta, capital: player.capital },
      });
      return true;
    }
    case "optional_leveraged_buyout": {
      const target = playerWithFewestTiles(state);
      if (!target) return true;
      const expensive = mostExpensiveOwnedTile(state, target.playerId);
      if (!expensive) return true;
      const auctionState = startDeclineAuction(state, expensive, "action");
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
    }
    case "optional_corporate_espionage": {
      for (const player of activePlayers(state)) {
        let tokens = 0;
        for (const other of activePlayers(state)) {
          if (other.playerId === player.playerId) continue;
          for (const pos of other.ownedTilePositions) {
            const tileState = state.tiles.find(
              (entry) => String(entry.position) === String(pos),
            );
            tokens += tileState?.developmentTokens ?? 0;
          }
        }
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
    }
    case "optional_short_squeeze": {
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
    }
    case "optional_supply_chain_crisis": {
      if (!state.marketEventModifiers) state.marketEventModifiers = {};
      state.marketEventModifiers.utilityRentMultiplier = 2;
      state.marketEventModifiers.utilityRentMultiplierUntilRound =
        state.round + 2;
      logs.push({
        playerId: null,
        actionType: "supply_chain_crisis_active",
        payload: {
          untilRound:
            state.marketEventModifiers.utilityRentMultiplierUntilRound,
        },
      });
      return true;
    }
    case "optional_sovereign_wealth_fund": {
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
    }
    case "optional_venture_capital_boom": {
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
    }
    case "optional_algorithmic_flash_trade": {
      for (const player of activePlayers(state)) {
        const roll = rollFairD6();
        const delta = adjustCapital(player, roll * 10);
        logs.push({
          playerId: player.playerId,
          actionType: "market_event_roll",
          payload: { cardId, roll, delta, capital: player.capital },
        });
      }
      return true;
    }
    case "optional_regulatory_amnesty": {
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
    }
    case "optional_dark_pool_transfer": {
      const donors = activePlayers(state).filter(
        (player) => player.ownedTilePositions.length > 0,
      );
      if (donors.length === 0) return true;
      const donor = donors[0];
      const recipient =
        activePlayers(state).find(
          (player) => player.playerId !== donor.playerId,
        ) ?? donors[1];
      if (!recipient) return true;
      const tilePosition = donor.ownedTilePositions[0];
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
    }
    case "optional_synthetic_cdo": {
      if (!state.marketEventModifiers) state.marketEventModifiers = {};
      state.marketEventModifiers.syntheticCdoMortgageRound = state.round;
      logs.push({
        playerId: null,
        actionType: "synthetic_cdo_active",
        payload: { round: state.round },
      });
      return true;
    }
    case "optional_black_swan_event": {
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
    }
    default:
      return false;
  }
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
    for (const sectorId of [
      "emerging_tech",
      "big_tech",
      "finance",
      "healthcare",
      "energy",
      "defense_media",
      "elite_tech",
      "fast_track",
    ] as const) {
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

export function shouldOfferInsiderPeek(
  state: InternalGameState,
  drawingPlayerId: string,
): boolean {
  return (
    isOptionalRuleEnabled(state.settings, "insider_trading") &&
    drawingPlayerId === state.turnOrder[state.currentPlayerIndex]
  );
}

export function handleInsiderKeepMarketEvent(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  if (state.phase !== "waiting_for_insider_peek" || !state.pendingInsiderPeek) {
    throw "game.invalid_phase";
  }
  const peek = state.pendingInsiderPeek;
  if (peek.drawingPlayerId !== playerId) throw "game.not_your_turn";

  const newState = deepClone(state);
  const deck = newState.marketEventDeckRemaining ?? [];
  if (deck.length === 0 || deck[0] !== peek.cardId) {
    throw "game.invalid_action";
  }

  const [cardId, ...remaining] = deck;
  newState.marketEventDeckRemaining = remaining;
  newState.marketEventDiscard = [
    ...(newState.marketEventDiscard ?? []),
    cardId,
  ];
  newState.pendingInsiderPeek = null;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "insider_kept_market_event",
      payload: { cardId },
    },
  ];

  resolveMarketEventCard(newState, cardId, playerId, logs);
  finishMarketEventDraw(
    newState,
    playerId,
    peek.trigger,
    peek.tilePosition,
    logs,
  );

  return { state: newState, logEntries: logs };
}

export function handleInsiderDiscardMarketEvent(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  if (state.phase !== "waiting_for_insider_peek" || !state.pendingInsiderPeek) {
    throw "game.invalid_phase";
  }
  const peek = state.pendingInsiderPeek;
  if (peek.drawingPlayerId !== playerId) throw "game.not_your_turn";

  const newState = deepClone(state);
  const deck = newState.marketEventDeckRemaining ?? [];
  if (deck.length === 0 || deck[0] !== peek.cardId) {
    throw "game.invalid_action";
  }

  const [discarded, ...remaining] = deck;
  newState.marketEventDeckRemaining = remaining;
  newState.marketEventDiscard = [
    ...(newState.marketEventDiscard ?? []),
    discarded,
  ];
  newState.pendingInsiderPeek = null;

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "insider_discarded_market_event",
      payload: { cardId: discarded },
    },
  ];

  return drawAndResolveMarketEvent(
    newState,
    playerId,
    peek.trigger,
    peek.tilePosition,
    { skipInsiderPeek: true },
  );
}

function finishMarketEventDraw(
  state: InternalGameState,
  drawingPlayerId: string,
  trigger: MarketEventTrigger,
  tilePosition: number | string | undefined,
  logs: LogEntry[],
): void {
  if (trigger === "round_start") {
    state.phase = "waiting_for_roll";
    const actor = getPlayer(state, drawingPlayerId);
    if (actor) {
      actor.actionPointsRemaining = actor.inRegulation
        ? 0
        : ACTION_POINTS_PER_TURN;
    }
  }
  logs.push({
    playerId: drawingPlayerId,
    actionType: "market_event_draw_complete",
    payload: { trigger, tilePosition },
  });
}

export function resolveMarketEventCard(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
): void {
  const card = cardMeta(cardId);
  if (!resolveSpecificEffect(state, cardId, drawingPlayerId, logs)) {
    resolveCategoryEffect(state, card, drawingPlayerId, logs);
  }
  logs.push({
    playerId: null,
    actionType: "market_event_resolved",
    payload: {
      cardId,
      name: card.name,
      category: card.category,
    },
  });
}

export function drawAndResolveMarketEvent(
  state: InternalGameState,
  drawingPlayerId: string,
  trigger: MarketEventTrigger,
  tilePosition?: number | string,
  options?: { skipInsiderPeek?: boolean },
): ApplyActionResult {
  normalizeMarketEventDeck(state);

  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  normalizeMarketEventDeck(newState);

  const deck = newState.marketEventDeckRemaining ?? [];
  if (
    !options?.skipInsiderPeek &&
    shouldOfferInsiderPeek(newState, drawingPlayerId) &&
    deck.length > 0
  ) {
    newState.pendingInsiderPeek = {
      cardId: deck[0],
      drawingPlayerId,
      trigger,
      tilePosition,
    };
    newState.phase = "waiting_for_insider_peek";
    logs.push({
      playerId: drawingPlayerId,
      actionType: "insider_peek",
      payload: { cardId: deck[0], trigger, tilePosition },
    });
    return { state: newState, logEntries: logs };
  }
  if (deck.length === 0) {
    logs.push({
      playerId: drawingPlayerId,
      actionType: "market_event_deck_empty",
      payload: { trigger, tilePosition },
    });
    if (trigger === "round_start") {
      newState.phase = "waiting_for_roll";
      const actor = getPlayer(newState, drawingPlayerId);
      if (actor) {
        actor.actionPointsRemaining = actor.inRegulation
          ? 0
          : ACTION_POINTS_PER_TURN;
      }
    }
    return { state: newState, logEntries: logs };
  }

  const [cardId, ...remaining] = deck;
  newState.marketEventDeckRemaining = remaining;
  newState.marketEventDiscard = [
    ...(newState.marketEventDiscard ?? []),
    cardId,
  ];

  const card = cardMeta(cardId);
  logs.push({
    playerId: drawingPlayerId,
    actionType: "market_event_drawn",
    payload: {
      cardId,
      name: card.name,
      category: card.category,
      trigger,
      tilePosition,
      deckRemaining: remaining.length,
    },
  });

  resolveMarketEventCard(newState, cardId, drawingPlayerId, logs);
  finishMarketEventDraw(newState, drawingPlayerId, trigger, tilePosition, logs);

  return { state: newState, logEntries: logs };
}
