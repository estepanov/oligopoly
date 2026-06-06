import { generateFriendlyAiName } from "@oligopoly/shared";
import type { LobbyAiSlot, LobbyAiSlotInput } from "@oligopoly/validation";

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
  aiSlots: readonly LobbyAiSlotInput[],
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
  aiSlots: readonly LobbyAiSlotInput[],
  maxPlayers: number,
): boolean {
  return countTotalSeats(humanCount, aiSlots) <= maxPlayers;
}

export function assignAiSlotNames(
  lobbyId: string,
  aiSlots: readonly LobbyAiSlotInput[],
): LobbyAiSlot[] {
  const usedNames = new Set<string>();
  return aiSlots.map((slot) => {
    const name = generateFriendlyAiName(
      `${lobbyId}:${slot.id}:${slot.personality}`,
      usedNames,
    );
    usedNames.add(name);
    return {
      id: slot.id,
      name,
      personality: slot.personality,
    };
  });
}

export function buildAiPlayersFromSlots(
  lobbyId: string,
  aiSlots: LobbyAiSlot[],
) {
  const usedNames = new Set<string>();
  return aiSlots.map((slot, index) => {
    const playerId = `ai:${lobbyId}:${slot.id}`;
    const name =
      slot.name ||
      generateFriendlyAiName(
        `${playerId}:${slot.personality}:${index}`,
        usedNames,
      );
    usedNames.add(name);
    return {
      playerId,
      name,
      personality: slot.personality,
    };
  });
}

export function mergePlayerIdsWithAi(
  humanIds: string[],
  aiPlayers: ReturnType<typeof buildAiPlayersFromSlots>,
): string[] {
  return [...humanIds, ...aiPlayers.map((ai) => ai.playerId)];
}
