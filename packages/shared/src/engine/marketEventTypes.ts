import type { InternalGameState, LogEntry } from "./gameStateTypes.js";

export type MarketEventTrigger = "round_start" | "turn_start" | "tile";

export type MarketEventHandlerContext = {
  state: InternalGameState;
  cardId: string;
  drawingPlayerId: string;
  logs: LogEntry[];
  trigger?: MarketEventTrigger;
};

export type MarketEventHandler = (ctx: MarketEventHandlerContext) => boolean;
