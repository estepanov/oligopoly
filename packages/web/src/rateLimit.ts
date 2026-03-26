export const RATE_LIMIT_WINDOW_MS = 10_000;
export const RATE_LIMIT_MAX_REQUESTS = 5;

export type RateLimiter = {
  checkAndTrack: () => boolean;
};

type CreateRateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
  now?: () => number;
};

export const createRateLimiter = ({
  windowMs,
  maxRequests,
  now = () => Date.now(),
}: CreateRateLimiterOptions): RateLimiter => {
  let requestTimestamps: number[] = [];

  const pruneExpired = () => {
    const current = now();
    requestTimestamps = requestTimestamps.filter(
      (timestamp) => current - timestamp <= windowMs,
    );
  };

  return {
    checkAndTrack: () => {
      pruneExpired();
      if (requestTimestamps.length >= maxRequests) {
        return true;
      }
      requestTimestamps.push(now());
      return false;
    },
  };
};
