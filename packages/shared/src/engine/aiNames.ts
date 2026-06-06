const AI_NAME_ADJECTIVES = [
  "Amber",
  "Bright",
  "Clever",
  "Copper",
  "Daring",
  "Golden",
  "Harbor",
  "Lucky",
  "Nova",
  "Sage",
  "Sunny",
  "Velvet",
] as const;

const AI_NAME_NOUNS = [
  "Atlas",
  "Broker",
  "Captain",
  "Comet",
  "Maven",
  "Pilot",
  "Ranger",
  "Scout",
  "Spark",
  "Trader",
  "Voyager",
  "Warden",
] as const;

const AI_NAME_POOL = AI_NAME_ADJECTIVES.flatMap((adjective) =>
  AI_NAME_NOUNS.map((noun) => `${adjective} ${noun}`),
);

function stableNameIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % modulo;
}

export function generateFriendlyAiName(
  seed: string,
  reservedNames: Iterable<string> = [],
): string {
  const reserved = new Set(reservedNames);
  const start = stableNameIndex(seed, AI_NAME_POOL.length);
  for (let offset = 0; offset < AI_NAME_POOL.length; offset++) {
    const candidate = AI_NAME_POOL[(start + offset) % AI_NAME_POOL.length];
    if (!reserved.has(candidate)) {
      return candidate;
    }
  }

  let suffix = 2;
  while (reserved.has(`${AI_NAME_POOL[start]} ${suffix}`)) {
    suffix++;
  }
  return `${AI_NAME_POOL[start]} ${suffix}`;
}
