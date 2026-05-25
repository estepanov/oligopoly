import {
  MARKET_EVENT_DECK,
  MARKET_EVENT_DECK_IDS,
  type MarketEventCard,
} from "../config/marketEventDeck.js";
import { rollFairD6 } from "./dice.js";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateMachine.js";

export type MarketEventTrigger = "round_start" | "tile";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (const ch of input) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash || 1;
}

function shuffleDeterministic(deck: string[], seed: string): string[] {
  const shuffled = [...deck];
  let state = hashSeed(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
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
            typeof cardId === "string" && cardId in MARKET_EVENT_DECK,
        )
      : [...MARKET_EVENT_DECK_IDS];

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

function getPlayer(
  state: InternalGameState,
  playerId: string,
): InternalPlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

function activePlayers(state: InternalGameState): InternalPlayerState[] {
  return state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
}

function adjustCapital(player: InternalPlayerState, delta: number): number {
  player.capital = Math.max(0, player.capital + delta);
  return delta;
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
  return (
    MARKET_EVENT_DECK[cardId] ?? {
      id: cardId,
      name: cardId,
      category: "variable",
    }
  );
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
    default:
      return false;
  }
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
): ApplyActionResult {
  normalizeMarketEventDeck(state);

  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  normalizeMarketEventDeck(newState);

  const deck = newState.marketEventDeckRemaining ?? [];
  if (deck.length === 0) {
    logs.push({
      playerId: drawingPlayerId,
      actionType: "market_event_deck_empty",
      payload: { trigger, tilePosition },
    });
    if (trigger === "round_start") {
      newState.phase = "waiting_for_roll";
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

  if (trigger === "round_start") {
    newState.phase = "waiting_for_roll";
  }

  return { state: newState, logEntries: logs };
}
