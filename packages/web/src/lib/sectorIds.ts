/** Canonical sector ids (matches @oligopoly/shared board config). */
export const SECTOR_IDS = [
  "emerging_tech",
  "big_tech",
  "finance",
  "healthcare",
  "energy",
  "defense_media",
  "elite_tech",
  "fast_track",
] as const;

export type SectorId = (typeof SECTOR_IDS)[number];
