export type DeclineAuctionType = "sealed_bids" | "open_bids" | "live_bidding";

export function resolveDeclineAuctionType(
  settings: Record<string, unknown> | undefined,
): DeclineAuctionType {
  const auctionType = settings?.auctionType;
  if (auctionType === "open_bids" || auctionType === "live_bidding") {
    return auctionType;
  }
  return "sealed_bids";
}

export function isSealedAuction(auction: {
  auctionType: DeclineAuctionType;
}): boolean {
  return auction.auctionType === "sealed_bids";
}

export function isVisibleAuction(auction: {
  auctionType: DeclineAuctionType;
}): boolean {
  return (
    auction.auctionType === "open_bids" ||
    auction.auctionType === "live_bidding"
  );
}

export function isLiveAuction(auction: {
  auctionType: DeclineAuctionType;
}): boolean {
  return auction.auctionType === "live_bidding";
}

export function closesWhenAllPlayersSubmit(auction: {
  auctionType: DeclineAuctionType;
}): boolean {
  return auction.auctionType !== "live_bidding";
}

export function settlesImmediatelyAfterBidWindow(auction: {
  auctionType: DeclineAuctionType;
}): boolean {
  return isVisibleAuction(auction);
}
