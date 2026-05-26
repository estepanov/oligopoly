import { OPTIONAL_MARKET_EVENT_CARDS_REGISTRY } from "../config/marketEventCards.js";
import {
  MARKET_EVENT_DECK,
  MARKET_EVENT_DECK_IDS,
  type MarketEventCard,
} from "../config/marketEventDeck.js";
import { shuffleDeterministic } from "./deckShuffle.js";
import { rollFairD6 } from "./dice.js";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateTypes.js";
import { activePlayers, adjustCapital } from "./marketEventPrimitives.js";
import type { MarketEventTrigger } from "./marketEventTypes.js";
import {
  OPTIONAL_MARKET_EVENT_HANDLERS,
  type OptionalMarketEventContext,
} from "./optionalMarketEventEffects.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { deepClone, getPlayer } from "./stateUtils.js";
import { enterWaitingForRoll } from "./turnPhase.js";

export type { MarketEventTrigger } from "./marketEventTypes.js";

type MarketEventHandler = (ctx: OptionalMarketEventContext) => boolean;

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

const grant150ToDrawingPlayer: MarketEventHandler = ({
  state,
  cardId,
  drawingPlayerId,
  logs,
}) => {
  const player = getPlayer(state, drawingPlayerId);
  if (!player) return true;
  const delta = adjustCapital(player, 150);
  logs.push({
    playerId: drawingPlayerId,
    actionType: "market_event_capital_change",
    payload: { cardId, delta, capital: player.capital },
  });
  return true;
};

const applyTenPercentCapitalLossToAllPlayers: MarketEventHandler = ({
  state,
  cardId,
  logs,
}) => {
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
};

const STANDARD_MARKET_EVENT_HANDLERS: Record<string, MarketEventHandler> = {
  stimulus_package: ({ state, cardId, logs }) => {
    applyToAllPlayers(state, 100, logs, cardId);
    return true;
  },
  tech_boom: ({ state, cardId, logs }) => {
    applyToAllPlayers(state, 75, logs, cardId);
    return true;
  },
  bull_market: ({ state, cardId, logs }) => {
    applyToAllPlayers(state, 75, logs, cardId);
    return true;
  },
  innovation_grant: grant150ToDrawingPlayer,
  ipo_windfall: grant150ToDrawingPlayer,
  market_crash: applyTenPercentCapitalLossToAllPlayers,
  financial_meltdown: applyTenPercentCapitalLossToAllPlayers,
  recession: ({ state, cardId, logs }) => {
    applyToAllPlayers(state, -75, logs, cardId);
    return true;
  },
  windfall_tax: ({ state, cardId, logs }) => {
    const targetId = richestPlayerId(state);
    if (!targetId) return true;
    const player = getPlayer(state, targetId);
    if (!player) return true;
    const delta = adjustCapital(player, -100);
    const payment = Math.max(0, -delta);
    state.freeMarketPool += payment;
    logs.push({
      playerId: targetId,
      actionType: "market_event_capital_change",
      payload: { cardId, delta, capital: player.capital },
    });
    return true;
  },
  whistleblower: ({ state, cardId, drawingPlayerId, logs }) => {
    const player = getPlayer(state, drawingPlayerId);
    if (!player) return true;
    const delta = adjustCapital(player, -50);
    logs.push({
      playerId: drawingPlayerId,
      actionType: "market_event_capital_change",
      payload: { cardId, delta, capital: player.capital },
    });
    return true;
  },
};

const MARKET_EVENT_HANDLERS: Record<string, MarketEventHandler> = {
  ...STANDARD_MARKET_EVENT_HANDLERS,
  ...OPTIONAL_MARKET_EVENT_HANDLERS,
};

function resolveSpecificEffect(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
  trigger?: MarketEventTrigger,
): boolean {
  const handler = MARKET_EVENT_HANDLERS[cardId];
  if (!handler) {
    return false;
  }
  return handler({ state, cardId, drawingPlayerId, logs, trigger });
}

export function shouldOfferInsiderPeek(
  state: InternalGameState,
  drawingPlayerId: string,
  trigger: MarketEventTrigger,
): boolean {
  return (
    trigger === "round_start" &&
    isOptionalRuleEnabled(state.settings, "insider_trading") &&
    drawingPlayerId === state.turnOrder[state.currentPlayerIndex]
  );
}

type ValidatedInsiderPeekContext = {
  newState: InternalGameState;
  peek: NonNullable<InternalGameState["pendingInsiderPeek"]>;
  deck: string[];
};

function withValidatedInsiderPeek(
  state: InternalGameState,
  playerId: string,
): ValidatedInsiderPeekContext {
  if (state.phase !== "waiting_for_insider_peek" || !state.pendingInsiderPeek) {
    throw "game.invalid_phase";
  }
  const peek = state.pendingInsiderPeek;
  if (peek.drawingPlayerId !== playerId) {
    throw "game.not_your_turn";
  }

  const newState = deepClone(state);
  const deck = newState.marketEventDeckRemaining ?? [];
  if (deck.length === 0 || deck[0] !== peek.cardId) {
    throw "game.invalid_action";
  }

  return { newState, peek, deck };
}

export function handleInsiderKeepMarketEvent(
  state: InternalGameState,
  playerId: string,
): ApplyActionResult {
  const { newState, peek, deck } = withValidatedInsiderPeek(state, playerId);

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

  resolveMarketEventCard(newState, cardId, playerId, logs, peek.trigger);
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
  const { newState, peek, deck } = withValidatedInsiderPeek(state, playerId);

  const [discarded, ...remaining] = deck;
  newState.marketEventDeckRemaining = [...remaining, discarded];
  newState.pendingInsiderPeek = null;

  const resolved = drawAndResolveMarketEvent(
    newState,
    playerId,
    peek.trigger,
    peek.tilePosition,
    { skipInsiderPeek: true },
  );

  resolved.logEntries.unshift({
    playerId,
    actionType: "insider_discarded_market_event",
    payload: { cardId: discarded, returnedTo: "deck_bottom" },
  });

  return resolved;
}

const MARKET_EVENT_BLOCKING_PHASES = new Set([
  "waiting_for_auction_bids",
  "waiting_for_auction_settle",
]);
const NON_BLOCKING_PENDING_FIELDS = new Set<string>(["pendingBuyTilePosition"]);

function hasBlockingPendingWork(state: InternalGameState): boolean {
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith("pending")) continue;
    if (NON_BLOCKING_PENDING_FIELDS.has(key)) continue;
    if (value !== null && value !== undefined) return true;
  }
  return false;
}

function hasBlockingWorkAfterMarketEventDraw(
  state: InternalGameState,
): boolean {
  return (
    MARKET_EVENT_BLOCKING_PHASES.has(state.phase) ||
    hasBlockingPendingWork(state)
  );
}

function advanceAfterMarketEventDraw(
  state: InternalGameState,
  drawingPlayerId: string,
  trigger: MarketEventTrigger,
): void {
  if (trigger !== "round_start") return;
  if (hasBlockingWorkAfterMarketEventDraw(state)) return;
  enterWaitingForRoll(state, drawingPlayerId);
}

function finishMarketEventDraw(
  state: InternalGameState,
  drawingPlayerId: string,
  trigger: MarketEventTrigger,
  tilePosition: number | string | undefined,
  logs: LogEntry[],
): void {
  advanceAfterMarketEventDraw(state, drawingPlayerId, trigger);
  logs.push({
    playerId: drawingPlayerId,
    actionType: "market_event_draw_complete",
    payload: { trigger, tilePosition, phase: state.phase },
  });
}

export function resolveMarketEventCard(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
  trigger?: MarketEventTrigger,
): void {
  const card = cardMeta(cardId);
  if (!resolveSpecificEffect(state, cardId, drawingPlayerId, logs, trigger)) {
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
  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  normalizeMarketEventDeck(newState);

  const deck = newState.marketEventDeckRemaining ?? [];
  if (
    !options?.skipInsiderPeek &&
    shouldOfferInsiderPeek(newState, drawingPlayerId, trigger) &&
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
    advanceAfterMarketEventDraw(newState, drawingPlayerId, trigger);
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

  resolveMarketEventCard(newState, cardId, drawingPlayerId, logs, trigger);
  finishMarketEventDraw(newState, drawingPlayerId, trigger, tilePosition, logs);

  return { state: newState, logEntries: logs };
}
