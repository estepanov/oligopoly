import type { AiPersonality } from "@oligopoly/validation";
import { generateFriendlyAiName } from "./aiNames.js";
import type {
  InternalAiPlayerState,
  InternalGameState,
} from "./gameStateTypes.js";

const defaultKickPersonality: AiPersonality = "opportunist";

function aiRuntimeForActor(
  state: InternalGameState,
  actorId: string,
): InternalAiPlayerState | undefined {
  return state.aiPlayers?.find(
    (ai) => ai.playerId === actorId || ai.takeoverForPlayerId === actorId,
  );
}

function reservedAiNames(state: InternalGameState): string[] {
  return [
    ...(state.aiPlayers ?? []).map((ai) => ai.name),
    ...state.players
      .map((player) => player.displayName)
      .filter((name): name is string => Boolean(name)),
  ];
}

export function isAiControlledActor(
  state: InternalGameState,
  actorId: string,
): boolean {
  const player = state.players.find((p) => p.playerId === actorId);
  if (player?.kind === "ai") return true;
  return aiRuntimeForActor(state, actorId) !== undefined;
}

export function applyTimeoutTakeover(
  state: InternalGameState,
  humanId: string,
  personality: AiPersonality = "opportunist",
): InternalGameState {
  const next = structuredClone(state);
  const runtimeId = `ai:timeout:${humanId}`;
  const aiPlayers = next.aiPlayers ?? [];

  if (
    aiPlayers.some(
      (ai) =>
        ai.takeoverForPlayerId === humanId &&
        ai.playerId.startsWith("ai:timeout:"),
    )
  ) {
    return next;
  }

  next.aiPlayers = [
    ...aiPlayers,
    {
      playerId: runtimeId,
      name: generateFriendlyAiName(
        `${state.gameId}:${runtimeId}`,
        reservedAiNames(state),
      ),
      personality,
      takeoverForPlayerId: humanId,
    },
  ];

  return next;
}

export function replaceKickedPlayerWithAi(
  state: InternalGameState,
  humanId: string,
  options?: { displayName?: string; personality?: AiPersonality },
): InternalGameState {
  const next = structuredClone(state);
  const player = next.players.find((p) => p.playerId === humanId);
  if (!player) return next;

  const personality = options?.personality ?? defaultKickPersonality;
  const displayName =
    options?.displayName ??
    generateFriendlyAiName(
      `${state.gameId}:replacement:${humanId}`,
      reservedAiNames(state),
    );
  player.kind = "ai";
  player.displayName = displayName;
  player.aiPersonality = personality;

  const aiPlayers = (next.aiPlayers ?? []).filter(
    (ai) => ai.takeoverForPlayerId !== humanId,
  );
  if (!aiPlayers.some((ai) => ai.playerId === humanId)) {
    aiPlayers.push({
      playerId: humanId,
      name: displayName,
      personality,
    });
  } else {
    for (const ai of aiPlayers) {
      if (ai.playerId === humanId) {
        ai.name = displayName;
        ai.personality = personality;
      }
    }
  }
  next.aiPlayers = aiPlayers;

  next.kickedPlayerIds = [...(next.kickedPlayerIds ?? [])];
  if (!next.kickedPlayerIds.includes(humanId)) {
    next.kickedPlayerIds.push(humanId);
  }

  return next;
}

export function clearTimeoutTakeoversForPlayer(
  state: InternalGameState,
  humanId: string,
): InternalGameState {
  if (!state.aiPlayers?.some((ai) => ai.takeoverForPlayerId === humanId)) {
    return state;
  }

  const next = structuredClone(state);
  next.aiPlayers = (next.aiPlayers ?? []).filter(
    (ai) => ai.takeoverForPlayerId !== humanId,
  );
  return next;
}

export function resolveAiPersonality(
  state: InternalGameState,
  actorId: string,
): AiPersonality {
  const runtime = aiRuntimeForActor(state, actorId);
  if (runtime?.personality) return runtime.personality;

  const player = state.players.find((p) => p.playerId === actorId);
  return player?.aiPersonality ?? defaultKickPersonality;
}
