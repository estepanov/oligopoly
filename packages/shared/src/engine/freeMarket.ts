import type { AffinityEffectContext, AffinityLogEntry } from "./affinity.js";
import { AFFINITY_IDS, hasPlayerAffinity } from "./affinity.js";
import { FREE_MARKET_MINIMUM } from "./setup.js";

export interface FreeMarketCollectionContext extends AffinityEffectContext {
  freeMarketPool: number;
}

export function collectFreeMarketPool(
  state: FreeMarketCollectionContext,
  playerId: string,
  logs: AffinityLogEntry[],
): number {
  const pool = Math.max(state.freeMarketPool, FREE_MARKET_MINIMUM);
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return 0;

  player.capital += pool;
  state.freeMarketPool = 0;

  logs.push({
    playerId,
    actionType: "collected_free_market",
    payload: { amount: pool },
  });

  if (
    hasPlayerAffinity(state, playerId, AFFINITY_IDS.crypto_arbitrageur) &&
    pool > 0
  ) {
    const bonus = Math.floor(pool * 0.25);
    if (bonus > 0) {
      player.capital += bonus;
      logs.push({
        playerId,
        actionType: "affinity_bonus",
        payload: {
          affinityId: AFFINITY_IDS.crypto_arbitrageur,
          amount: bonus,
          reason: "free_market_pool",
        },
      });
    }
  }

  return pool;
}
