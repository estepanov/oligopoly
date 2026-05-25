const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

export function auctionBidWindowToMs(window: string | undefined): number {
  switch (window) {
    case "30s":
      return 30 * SECOND_MS;
    case "1min":
      return MINUTE_MS;
    case "5min":
      return 5 * MINUTE_MS;
    case "10min":
      return 10 * MINUTE_MS;
    case "30min":
      return 30 * MINUTE_MS;
    default:
      return MINUTE_MS;
  }
}

export function computeAuctionBidDeadline(
  nowMs: number,
  settings: Record<string, unknown> | undefined,
): number {
  const window = settings?.auctionBidWindow;
  return (
    nowMs +
    auctionBidWindowToMs(typeof window === "string" ? window : undefined)
  );
}

export function isAuctionBidWindowOpen(
  bidDeadlineAt: number | undefined,
  nowMs: number,
): boolean {
  if (bidDeadlineAt === undefined) return true;
  return nowMs < bidDeadlineAt;
}
