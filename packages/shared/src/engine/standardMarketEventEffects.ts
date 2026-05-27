import { activePlayers, adjustCapital } from "./marketEventPrimitives.js";
import { richestPlayerId } from "./marketEventSelectors.js";
import type { MarketEventHandler } from "./marketEventTypes.js";
import { getPlayer } from "./stateUtils.js";

function applyToAllPlayers(
  state: Parameters<MarketEventHandler>[0]["state"],
  amount: number,
  logs: Parameters<MarketEventHandler>[0]["logs"],
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

export const STANDARD_MARKET_EVENT_HANDLERS: Record<
  string,
  MarketEventHandler
> = {
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
