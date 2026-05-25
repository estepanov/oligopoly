import { CORNER_POSITIONS, getTileByPosition } from "../config/board.js";
import {
  DISRUPTION_DECK,
  DISRUPTION_DECK_IDS,
} from "../config/disruptionDeck.js";
import { shuffleDeterministic } from "./deckShuffle.js";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateMachine.js";
import { FLASH_CRASH_LOSS_PCT, FLASH_CRASH_WINDFALL_PCT } from "./setup.js";

export type DisruptionTrigger =
  | "tile"
  | "black_market_relay"
  | "disruption_blitz";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function buildDisruptionDeck(gameId: string): string[] {
  return shuffleDeterministic([...DISRUPTION_DECK_IDS], gameId);
}

export function normalizeDisruptionDeck(state: InternalGameState): void {
  if (state.disruptionDeckRemaining === undefined) {
    state.disruptionDeckRemaining = buildDisruptionDeck(state.gameId);
  }
  if (!state.disruptionDiscard) {
    state.disruptionDiscard = [];
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
  const before = player.capital;
  player.capital = Math.max(0, player.capital + delta);
  return player.capital - before;
}

function logCapitalChange(
  logs: LogEntry[],
  playerId: string,
  cardId: string,
  delta: number,
  capital: number,
): void {
  if (delta === 0) return;
  logs.push({
    playerId,
    actionType: "disruption_capital_change",
    payload: { cardId, delta, capital },
  });
}

function richestOpponentId(
  state: InternalGameState,
  drawingPlayerId: string,
): string | null {
  let best: InternalPlayerState | null = null;
  for (const player of activePlayers(state)) {
    if (player.playerId === drawingPlayerId) continue;
    if (!best || player.capital > best.capital) {
      best = player;
    }
  }
  return best?.playerId ?? null;
}

function sendPlayerToRegulation(
  state: InternalGameState,
  playerId: string,
  logs: LogEntry[],
  reason: string,
  cardId?: string,
): void {
  const player = getPlayer(state, playerId);
  if (!player) return;
  player.position = CORNER_POSITIONS.REGULATION_ZONE;
  player.inRegulation = true;
  player.isOnDiagonal = false;
  logs.push({
    playerId,
    actionType: "sent_to_regulation",
    payload: { reason, cardId },
  });
}

function opponentDevelopmentTokenCount(
  state: InternalGameState,
  playerId: string,
): number {
  let total = 0;
  for (const player of activePlayers(state)) {
    if (player.playerId === playerId) continue;
    for (const position of player.ownedTilePositions) {
      total += player.developmentTokens[String(position)] ?? 0;
    }
  }
  return total;
}

function bestSectorTileCount(
  state: InternalGameState,
  playerId: string,
): number {
  const player = getPlayer(state, playerId);
  if (!player) return 0;

  const counts = new Map<string, number>();
  for (const position of player.ownedTilePositions) {
    const tile = getTileByPosition(position);
    if (!tile?.sectorId) continue;
    counts.set(tile.sectorId, (counts.get(tile.sectorId) ?? 0) + 1);
  }

  let best = 0;
  for (const count of counts.values()) {
    if (count > best) best = count;
  }
  return best;
}

function cardName(cardId: string): string {
  return DISRUPTION_DECK[cardId]?.name ?? cardId;
}

export function disruptionDrawCount(
  settings: Record<string, unknown> | undefined,
): number {
  const optionalRuleIds = settings?.optionalRuleIds;
  if (
    Array.isArray(optionalRuleIds) &&
    optionalRuleIds.includes("disruption_blitz")
  ) {
    return 2;
  }
  return 1;
}

function blackMarketRelayParams(
  settings: Record<string, unknown> | undefined,
): { drawTotal: number; keepTotal: number } {
  if (disruptionDrawCount(settings) === 2) {
    return { drawTotal: 4, keepTotal: 2 };
  }
  return { drawTotal: 2, keepTotal: 1 };
}

function takeFromDisruptionDeck(
  state: InternalGameState,
  count: number,
): string[] {
  const deck = state.disruptionDeckRemaining ?? [];
  const taken = deck.slice(0, count);
  state.disruptionDeckRemaining = deck.slice(count);
  return taken;
}

function resolveSpecificEffect(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
): void {
  const drawer = getPlayer(state, drawingPlayerId);

  switch (cardId) {
    case "disruption_patent_troll": {
      if (!drawer) return;
      const delta = adjustCapital(drawer, -50);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_golden_parachute": {
      if (!drawer) return;
      const delta = adjustCapital(drawer, 75);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_insider_trading": {
      const targetId = richestOpponentId(state, drawingPlayerId);
      if (!targetId || !drawer) return;
      const target = getPlayer(state, targetId);
      if (!target) return;
      const payment = Math.min(target.capital, 50);
      target.capital -= payment;
      drawer.capital += payment;
      logCapitalChange(logs, targetId, cardId, -payment, target.capital);
      logCapitalChange(logs, drawingPlayerId, cardId, payment, drawer.capital);
      return;
    }
    case "disruption_leveraged_buyout": {
      if (!drawer) return;
      const delta = adjustCapital(drawer, -75);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_bankruptcy_protection": {
      if (!drawer) return;
      const delta = adjustCapital(drawer, drawer.capital <= 200 ? 150 : 50);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_angel_investor": {
      if (!drawer) return;
      const delta = adjustCapital(
        drawer,
        drawer.ownedTilePositions.length < 3 ? 100 : 50,
      );
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_antitrust_exemption": {
      if (!drawer) return;
      if (drawer.inRegulation) {
        drawer.inRegulation = false;
        logs.push({
          playerId: drawingPlayerId,
          actionType: "regulation_released",
          payload: { cardId, reason: "antitrust_exemption" },
        });
        return;
      }
      const delta = adjustCapital(drawer, 50);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_market_manipulation": {
      if (!drawer) return;
      let collected = 0;
      for (const player of activePlayers(state)) {
        if (player.playerId === drawingPlayerId) continue;
        const loss = Math.floor(player.capital * 0.1);
        const delta = adjustCapital(player, -loss);
        collected += -delta;
        logCapitalChange(logs, player.playerId, cardId, delta, player.capital);
      }
      const gain = adjustCapital(drawer, collected);
      logCapitalChange(logs, drawingPlayerId, cardId, gain, drawer.capital);
      return;
    }
    case "disruption_whistleblower_payoff": {
      if (!drawer) return;
      const payment = Math.min(drawer.capital, 75);
      drawer.capital -= payment;
      state.freeMarketPool += payment;
      logCapitalChange(logs, drawingPlayerId, cardId, -payment, drawer.capital);
      return;
    }
    case "disruption_bridge_loan": {
      if (!drawer) return;
      const delta = adjustCapital(drawer, 100);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_corporate_espionage": {
      for (const player of activePlayers(state)) {
        const payment =
          opponentDevelopmentTokenCount(state, player.playerId) * 10;
        const delta = adjustCapital(player, -payment);
        logCapitalChange(logs, player.playerId, cardId, delta, player.capital);
      }
      return;
    }
    case "disruption_regulatory_capture": {
      if (!drawer) return;
      if (drawer.inRegulation) {
        drawer.inRegulation = false;
        logs.push({
          playerId: drawingPlayerId,
          actionType: "regulation_released",
          payload: { cardId, reason: "regulatory_capture" },
        });
        return;
      }
      const targetId = richestOpponentId(state, drawingPlayerId);
      if (!targetId) return;
      sendPlayerToRegulation(
        state,
        targetId,
        logs,
        "regulatory_capture",
        cardId,
      );
      return;
    }
    case "disruption_lobbying_win": {
      if (!drawer) return;
      const regulatedCount = activePlayers(state).filter(
        (player) => player.inRegulation,
      ).length;
      const delta = adjustCapital(drawer, 75 + regulatedCount * 25);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_short_squeeze": {
      if (!drawer) return;
      const sectorTiles = bestSectorTileCount(state, drawingPlayerId);
      if (sectorTiles >= 2) {
        const payout = sectorTiles * 30;
        let collected = 0;
        for (const player of activePlayers(state)) {
          if (player.playerId === drawingPlayerId) continue;
          const payment = Math.min(player.capital, payout);
          player.capital -= payment;
          collected += payment;
          logCapitalChange(
            logs,
            player.playerId,
            cardId,
            -payment,
            player.capital,
          );
        }
        const gain = adjustCapital(drawer, collected);
        logCapitalChange(logs, drawingPlayerId, cardId, gain, drawer.capital);
        return;
      }
      const delta = adjustCapital(drawer, 30);
      logCapitalChange(logs, drawingPlayerId, cardId, delta, drawer.capital);
      return;
    }
    case "disruption_go_to_regulation": {
      sendPlayerToRegulation(
        state,
        drawingPlayerId,
        logs,
        "disruption_card",
        cardId,
      );
      return;
    }
    default:
      logs.push({
        playerId: drawingPlayerId,
        actionType: "disruption_unresolved",
        payload: { cardId },
      });
  }
}

export function resolveDisruptionCard(
  state: InternalGameState,
  cardId: string,
  drawingPlayerId: string,
  logs: LogEntry[],
): void {
  resolveSpecificEffect(state, cardId, drawingPlayerId, logs);
  logs.push({
    playerId: null,
    actionType: "disruption_resolved",
    payload: {
      cardId,
      name: cardName(cardId),
    },
  });
}

export function drawAndResolveDisruptionCards(
  state: InternalGameState,
  drawingPlayerId: string,
  count: number,
  trigger: DisruptionTrigger,
  tilePosition?: number | string,
): ApplyActionResult {
  normalizeDisruptionDeck(state);

  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  normalizeDisruptionDeck(newState);

  const deck = newState.disruptionDeckRemaining ?? [];
  if (deck.length === 0) {
    logs.push({
      playerId: drawingPlayerId,
      actionType: "disruption_deck_empty",
      payload: { trigger, tilePosition },
    });
    return { state: newState, logEntries: logs };
  }

  const drawCount = Math.min(count, deck.length);
  for (let index = 0; index < drawCount; index += 1) {
    const remaining = newState.disruptionDeckRemaining ?? [];
    if (remaining.length === 0) break;

    const [cardId, ...rest] = remaining;
    newState.disruptionDeckRemaining = rest;
    newState.disruptionDiscard = [
      ...(newState.disruptionDiscard ?? []),
      cardId,
    ];

    logs.push({
      playerId: drawingPlayerId,
      actionType: "disruption_drawn",
      payload: {
        cardId,
        name: cardName(cardId),
        trigger,
        tilePosition,
        deckRemaining: rest.length,
      },
    });
    resolveDisruptionCard(newState, cardId, drawingPlayerId, logs);
  }

  return { state: newState, logEntries: logs };
}

export function resolveBlackMarketRelay(
  state: InternalGameState,
  drawingPlayerId: string,
  tilePosition?: number | string,
): ApplyActionResult {
  normalizeDisruptionDeck(state);

  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  normalizeDisruptionDeck(newState);

  const deck = newState.disruptionDeckRemaining ?? [];
  if (deck.length === 0) {
    logs.push({
      playerId: drawingPlayerId,
      actionType: "disruption_deck_empty",
      payload: { trigger: "black_market_relay", tilePosition },
    });
    return { state: newState, logEntries: logs };
  }

  const { drawTotal, keepTotal } = blackMarketRelayParams(newState.settings);
  const drawn = takeFromDisruptionDeck(
    newState,
    Math.min(drawTotal, deck.length),
  );
  const sorted = [...drawn].sort();
  const keepIds = sorted.slice(0, Math.min(keepTotal, sorted.length));
  const discardIds = sorted.slice(keepIds.length);

  if (discardIds.length > 0) {
    newState.disruptionDiscard = [
      ...(newState.disruptionDiscard ?? []),
      ...discardIds,
    ];
    logs.push({
      playerId: drawingPlayerId,
      actionType: "disruption_discarded_hidden",
      payload: {
        trigger: "black_market_relay",
        count: discardIds.length,
      },
    });
  }

  logs.push({
    playerId: drawingPlayerId,
    actionType: "black_market_relay_drawn",
    payload: {
      trigger: "black_market_relay",
      tilePosition,
      keptCardIds: keepIds,
      discardedCount: discardIds.length,
      blitz: keepTotal > 1,
    },
  });

  for (const keepId of keepIds) {
    newState.disruptionDiscard = [
      ...(newState.disruptionDiscard ?? []),
      keepId,
    ];

    logs.push({
      playerId: drawingPlayerId,
      actionType: "disruption_drawn",
      payload: {
        cardId: keepId,
        name: cardName(keepId),
        trigger: "black_market_relay",
        tilePosition,
        deckRemaining: newState.disruptionDeckRemaining?.length ?? 0,
      },
    });

    resolveDisruptionCard(newState, keepId, drawingPlayerId, logs);
  }

  return { state: newState, logEntries: logs };
}

export function resolveFlashCrash(
  state: InternalGameState,
  drawingPlayerId: string,
  tilePosition?: number | string,
): ApplyActionResult {
  const logs: LogEntry[] = [];
  const newState = deepClone(state);
  let totalLosses = 0;

  for (const player of activePlayers(newState)) {
    const loss = Math.floor(player.capital * FLASH_CRASH_LOSS_PCT);
    const delta = adjustCapital(player, -loss);
    totalLosses += -delta;
    logCapitalChange(
      logs,
      player.playerId,
      "flash_crash",
      delta,
      player.capital,
    );
  }

  const drawer = getPlayer(newState, drawingPlayerId);
  const windfall = Math.floor(totalLosses * FLASH_CRASH_WINDFALL_PCT);
  if (drawer && windfall > 0) {
    const delta = adjustCapital(drawer, windfall);
    logCapitalChange(
      logs,
      drawingPlayerId,
      "flash_crash",
      delta,
      drawer.capital,
    );
  }

  logs.push({
    playerId: drawingPlayerId,
    actionType: "flash_crash_resolved",
    payload: {
      tilePosition,
      totalLosses,
      windfall,
    },
  });

  return { state: newState, logEntries: logs };
}
