export type BindingContractTerm =
  | { type: "cannot_sell_tile"; tileId: string; boundPlayerId: string }
  | { type: "cannot_bid_auction"; tileId: string; boundPlayerId: string }
  | {
      type: "must_pay_capital";
      amount: number;
      fromPlayerId: string;
      toPlayerId: string;
      dueByRound: number;
    }
  | {
      type: "revenue_share";
      percentage: number;
      fromPlayerId: string;
      toPlayerId: string;
      durationRounds: number;
    };

export interface BindingContract {
  id: string;
  gameId: string;
  partyA: string;
  partyB: string;
  terms: BindingContractTerm[];
  status: "active" | "fulfilled" | "expired" | "breached";
  startsRound: number;
  expiresRound: number | null;
  signedAt: number;
  fulfilledAt: number | null;
  breachedAt: number | null;
  /** Set when a party executes sign_contract; binding once both parties are present. */
  partySignatures?: Partial<Record<string, boolean>>;
}
