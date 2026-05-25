import type { DeclineAuctionType } from "./auctionMode.js";

export type AuctionTrigger = "decline" | "foreclosure" | "player_initiated";

export type AuctionResumePhase = "action" | "rolling_doubles";

export type PendingAuctionState = {
  tilePosition: number | string;
  trigger: AuctionTrigger;
  sellerId?: string;
  reservePrice?: number;
  auctionType: DeclineAuctionType;
  submissions: Record<string, number | "pass">;
  eligiblePlayerIds: string[];
  tieBreakMinBid?: number;
  tieBreakRound: number;
  resumePhase: AuctionResumePhase;
  bidDeadlineAt: number;
  settleDeadlineAt?: number;
};
