import type { LobbyAiSlot } from "@oligopoly/validation";

export const MAX_TOTAL_PLAYERS = 6;

export function parseAiSlots(raw: string | null | undefined): LobbyAiSlot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as LobbyAiSlot[];
  } catch {
    return [];
  }
}

export function countTotalSeats(
  humanCount: number,
  aiSlots: LobbyAiSlot[],
): number {
  return humanCount + aiSlots.length;
}

export function validateCreateAiSlots(
  maxPlayers: number,
  aiSlotCount: number,
): boolean {
  return 1 + aiSlotCount <= maxPlayers;
}

export function validateSeatCapacity(
  humanCount: number,
  aiSlots: LobbyAiSlot[],
  maxPlayers: number,
): boolean {
  return countTotalSeats(humanCount, aiSlots) <= maxPlayers;
}

export function buildAiPlayersFromSlots(
  lobbyId: string,
  aiSlots: LobbyAiSlot[],
) {
  return aiSlots.map((slot) => ({
    playerId: `ai:${lobbyId}:${slot.id}`,
    name: slot.name,
    personality: slot.personality,
  }));
}

export function mergePlayerIdsWithAi(
  humanIds: string[],
  aiPlayers: ReturnType<typeof buildAiPlayersFromSlots>,
): string[] {
  return [...humanIds, ...aiPlayers.map((ai) => ai.playerId)];
}
