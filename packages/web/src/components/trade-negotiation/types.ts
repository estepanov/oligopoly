import type { GameAction, GameState } from "@oligopoly/validation";

export type TradeOffer = NonNullable<GameState["tradeOffers"]>[number];

export type TradeDraft = {
  recipientId: string;
  giveCapital: string;
  receiveCapital: string;
  giveTilePositions: string[];
  receiveTilePositions: string[];
  counteringOfferId: string | null;
};

export type TradeableTile = {
  position: string;
  name: string;
  value: number;
};

export type TradeNegotiationPanelProps = {
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export const EMPTY_DRAFT: TradeDraft = {
  recipientId: "",
  giveCapital: "0",
  receiveCapital: "0",
  giveTilePositions: [],
  receiveTilePositions: [],
  counteringOfferId: null,
};
