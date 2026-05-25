// ---------------------------------------------------------------------------
// Board Configuration Registry
// Canonical board definition for Oligopoly Online.
// All tile data, rent tables, and sector definitions are defined here.
// ---------------------------------------------------------------------------

export type TileType =
  | "sector_tile"
  | "corner"
  | "special"
  | "utility"
  | "sector_hub";

export type SectorId =
  | "emerging_tech"
  | "big_tech"
  | "finance"
  | "healthcare"
  | "energy"
  | "defense_media"
  | "elite_tech"
  | "fast_track";

export interface Sector {
  readonly id: SectorId;
  readonly name: string;
  readonly color: string;
}

export interface BoardTile {
  readonly position: number | string; // number for perimeter (0–39), string for diagonal ("D1"–"D5")
  readonly name: string;
  readonly type: TileType;
  readonly sectorId: SectorId | null;
  readonly cost: number | null;
  readonly baseRent: number | null;
}

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export const SECTOR_IDS = [
  "emerging_tech",
  "big_tech",
  "finance",
  "healthcare",
  "energy",
  "defense_media",
  "elite_tech",
  "fast_track",
] as const satisfies readonly SectorId[];

export const SECTORS: Record<SectorId, Sector> = {
  emerging_tech: {
    id: "emerging_tech",
    name: "Emerging Tech",
    color: "Light Blue",
  },
  big_tech: { id: "big_tech", name: "Big Tech", color: "Pink" },
  finance: { id: "finance", name: "Finance", color: "Orange" },
  healthcare: { id: "healthcare", name: "Healthcare", color: "Red" },
  energy: { id: "energy", name: "Energy", color: "Yellow" },
  defense_media: {
    id: "defense_media",
    name: "Defense & Media",
    color: "Green",
  },
  elite_tech: { id: "elite_tech", name: "Elite Tech", color: "Dark Blue" },
  fast_track: { id: "fast_track", name: "Fast Track", color: "Purple/Gold" },
} as const;

// ---------------------------------------------------------------------------
// Perimeter Track (40 Tiles — positions 0–39)
// ---------------------------------------------------------------------------

export const PERIMETER_TILES: readonly BoardTile[] = [
  {
    position: 0,
    name: "START",
    type: "corner",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 1,
    name: "Digital Content Co.",
    type: "sector_tile",
    sectorId: "emerging_tech",
    cost: 60,
    baseRent: 2,
  },
  {
    position: 2,
    name: "MARKET EVENT",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 3,
    name: "Mobile Gaming Inc.",
    type: "sector_tile",
    sectorId: "emerging_tech",
    cost: 80,
    baseRent: 4,
  },
  {
    position: 4,
    name: "CORPORATE TAX I",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 5,
    name: "Silicon Valley Hub",
    type: "sector_hub",
    sectorId: null,
    cost: 200,
    baseRent: null,
  },
  {
    position: 6,
    name: "Search Engine Corp.",
    type: "sector_tile",
    sectorId: "big_tech",
    cost: 140,
    baseRent: 10,
  },
  {
    position: 7,
    name: "DISRUPTION CARD",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 8,
    name: "Social Media Platform",
    type: "sector_tile",
    sectorId: "big_tech",
    cost: 160,
    baseRent: 12,
  },
  {
    position: 9,
    name: "Cloud Infrastructure",
    type: "sector_tile",
    sectorId: "big_tech",
    cost: 180,
    baseRent: 14,
  },
  {
    position: 10,
    name: "REGULATION ZONE",
    type: "corner",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 11,
    name: "AI Startup Collective",
    type: "sector_tile",
    sectorId: "emerging_tech",
    cost: 100,
    baseRent: 6,
  },
  {
    position: 12,
    name: "OIL PIPELINE",
    type: "utility",
    sectorId: null,
    cost: 150,
    baseRent: null,
  },
  {
    position: 13,
    name: "Crypto Exchange",
    type: "sector_tile",
    sectorId: "finance",
    cost: 200,
    baseRent: 16,
  },
  {
    position: 14,
    name: "Investment Bank",
    type: "sector_tile",
    sectorId: "finance",
    cost: 220,
    baseRent: 18,
  },
  {
    position: 15,
    name: "Wall Street Hub",
    type: "sector_hub",
    sectorId: null,
    cost: 200,
    baseRent: null,
  },
  {
    position: 16,
    name: "Central Bank Reserve",
    type: "sector_tile",
    sectorId: "finance",
    cost: 240,
    baseRent: 20,
  },
  {
    position: 17,
    name: "MARKET EVENT",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 18,
    name: "Pharmaceutical Giant",
    type: "sector_tile",
    sectorId: "healthcare",
    cost: 240,
    baseRent: 20,
  },
  {
    position: 19,
    name: "Hospital Network",
    type: "sector_tile",
    sectorId: "healthcare",
    cost: 260,
    baseRent: 22,
  },
  {
    position: 20,
    name: "FREE MARKET",
    type: "corner",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 21,
    name: "Biotech Research Corp.",
    type: "sector_tile",
    sectorId: "healthcare",
    cost: 280,
    baseRent: 24,
  },
  {
    position: 22,
    name: "DISRUPTION CARD",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 23,
    name: "Coal Terminal",
    type: "sector_tile",
    sectorId: "energy",
    cost: 300,
    baseRent: 26,
  },
  {
    position: 24,
    name: "Wind Farm Array",
    type: "sector_tile",
    sectorId: "energy",
    cost: 320,
    baseRent: 28,
  },
  {
    position: 25,
    name: "Industrial Hub",
    type: "sector_hub",
    sectorId: null,
    cost: 200,
    baseRent: null,
  },
  {
    position: 26,
    name: "MARKET EVENT",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 27,
    name: "Solar Grid Network",
    type: "sector_tile",
    sectorId: "energy",
    cost: 340,
    baseRent: 30,
  },
  {
    position: 28,
    name: "CLEAN WATER AUTHORITY",
    type: "utility",
    sectorId: null,
    cost: 150,
    baseRent: null,
  },
  {
    position: 29,
    name: "Broadcast Network",
    type: "sector_tile",
    sectorId: "defense_media",
    cost: 360,
    baseRent: 32,
  },
  {
    position: 30,
    name: "GO TO REGULATION",
    type: "corner",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 31,
    name: "Aerospace Contractor",
    type: "sector_tile",
    sectorId: "defense_media",
    cost: 380,
    baseRent: 34,
  },
  {
    position: 32,
    name: "Defense Systems Corp.",
    type: "sector_tile",
    sectorId: "defense_media",
    cost: 400,
    baseRent: 36,
  },
  {
    position: 33,
    name: "DISRUPTION CARD",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 34,
    name: "GOVERNMENT GRANT",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 35,
    name: "Media City Hub",
    type: "sector_hub",
    sectorId: null,
    cost: 200,
    baseRent: null,
  },
  {
    position: 36,
    name: "MARKET EVENT",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 37,
    name: "CORPORATE TAX II",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: 38,
    name: "Quantum Computing Corp.",
    type: "sector_tile",
    sectorId: "elite_tech",
    cost: 380,
    baseRent: 34,
  },
  {
    position: 39,
    name: "AI Singularity Labs",
    type: "sector_tile",
    sectorId: "elite_tech",
    cost: 400,
    baseRent: 36,
  },
] as const;

// ---------------------------------------------------------------------------
// Diagonal Express Path (5 Tiles — D1–D5)
// ---------------------------------------------------------------------------

export const DIAGONAL_TILES: readonly BoardTile[] = [
  {
    position: "D1",
    name: "Offshore Capital Corp.",
    type: "sector_tile",
    sectorId: "fast_track",
    cost: 320,
    baseRent: 28,
  },
  {
    position: "D2",
    name: "FLASH CRASH",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: "D3",
    name: "Dark Pool Exchange",
    type: "sector_tile",
    sectorId: "fast_track",
    cost: 340,
    baseRent: 30,
  },
  {
    position: "D4",
    name: "BLACK MARKET RELAY",
    type: "special",
    sectorId: null,
    cost: null,
    baseRent: null,
  },
  {
    position: "D5",
    name: "Algorithmic Trading Co.",
    type: "sector_tile",
    sectorId: "fast_track",
    cost: 360,
    baseRent: 32,
  },
] as const;

// ---------------------------------------------------------------------------
// Combined reference
// ---------------------------------------------------------------------------

export const ALL_TILES: readonly BoardTile[] = [
  ...PERIMETER_TILES,
  ...DIAGONAL_TILES,
];

// ---------------------------------------------------------------------------
// Special position constants
// ---------------------------------------------------------------------------

/** Sector Hub positions on the perimeter track */
export const SECTOR_HUB_POSITIONS = {
  silicon_valley: 5,
  wall_street: 15,
  industrial: 25,
  media_city: 35,
} as const;

/** Sectors whose rent qualifies for a hub-adjacent double-rent-district bonus */
export const HUB_ADJACENT_SECTORS: Record<
  keyof typeof SECTOR_HUB_POSITIONS,
  SectorId
> = {
  silicon_valley: "emerging_tech",
  wall_street: "finance",
  industrial: "energy",
  media_city: "defense_media",
} as const;

/** Utility tile positions on the perimeter track */
export const UTILITY_POSITIONS = [12, 28] as const;

/** Corner positions */
export const CORNER_POSITIONS = {
  START: 0,
  REGULATION_ZONE: 10,
  FREE_MARKET: 20,
  GO_TO_REGULATION: 30,
} as const;

/** Market event tile positions */
export const MARKET_EVENT_POSITIONS = [2, 17, 26, 36] as const;

/** Disruption card tile positions */
export const DISRUPTION_CARD_POSITIONS = [7, 22, 33] as const;

/** Perimeter track size */
export const PERIMETER_SIZE = 40;

/** Diagonal path size */
export const DIAGONAL_SIZE = 5;

// ---------------------------------------------------------------------------
// Computed constants
// ---------------------------------------------------------------------------

/** Total market value: sum of all tile acquisition costs (used for win conditions) */
export const TOTAL_BOARD_MARKET_VALUE: number = ALL_TILES.reduce(
  (sum, tile) => sum + (tile.cost ?? 0),
  0,
);

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const perimeterByPosition = new Map<number, BoardTile>(
  PERIMETER_TILES.map((t) => [t.position as number, t]),
);

const diagonalByPosition = new Map<string, BoardTile>(
  DIAGONAL_TILES.map((t) => [t.position as string, t]),
);

/** Get a perimeter tile by position (0–39) */
export function getPerimeterTile(position: number): BoardTile | undefined {
  return perimeterByPosition.get(position);
}

/** Get a diagonal tile by position ("D1"–"D5") */
export function getDiagonalTile(position: string): BoardTile | undefined {
  return diagonalByPosition.get(position);
}

/** Get any tile by position (number or string) */
export function getTileByPosition(
  position: number | string,
): BoardTile | undefined {
  if (typeof position === "number") {
    return perimeterByPosition.get(position);
  }
  return diagonalByPosition.get(position);
}

/** Get all tiles belonging to a sector */
export function getTilesBySector(sectorId: SectorId): BoardTile[] {
  return ALL_TILES.filter((t) => t.sectorId === sectorId);
}
