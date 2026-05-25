import {
  applyAction,
  applyTimeoutTakeover,
  chooseAiAction,
  isAiControlledActor,
  normalizeGameState,
  replaceKickedPlayerWithAi,
  rollPathChoiceDie,
  type ApplyActionResult,
  type InternalGameState,
} from "@oligopoly/shared";
import type { AiPersonality } from "@oligopoly/validation";
import { persistGameActionResult } from "./gamePersistence.js";
import { broadcastGameEvent } from "../realtime/notify.js";

type ActiveGameRow = {
  id: string;
  status: string;
  state_json: string | null;
};

export type StepAiTurnResult = {
  applied: boolean;
  decision?: ReturnType<typeof chooseAiAction>;
  result?: ApplyActionResult;
};

async function loadActiveGame(
  db: D1Database,
  gameId: string,
): Promise<ActiveGameRow | null> {
  return db
    .prepare("SELECT id, status, state_json FROM games WHERE id = ?")
    .bind(gameId)
    .first<ActiveGameRow>()
    .then((row) => {
      if (!row || row.status !== "active" || !row.state_json) return null;
      return row;
    });
}

function buildEngineInput(
  action: NonNullable<ReturnType<typeof chooseAiAction>>["action"],
) {
  return {
    ...action,
    ...(action.type === "roll_dice"
      ? { pathChoiceDie: rollPathChoiceDie() }
      : {}),
  };
}

export async function stepGameAiTurn(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<StepAiTurnResult> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return { applied: false };

  const gameState = normalizeGameState(
    JSON.parse(row.state_json!) as Record<string, unknown>,
  );
  const decision = chooseAiAction(gameState);
  if (!decision) return { applied: false };

  const result = applyAction(
    gameState,
    decision.actorId,
    buildEngineInput(decision.action),
  );

  await persistGameActionResult(db, gameId, result, {
    gameRoom,
    aiMeta: {
      aiPlayerId: decision.actorId,
      personality: decision.personality,
      action: decision.action as Record<string, unknown>,
    },
  });

  return { applied: true, decision, result };
}

export async function runAiTurnLoop(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
  maxSteps = 16,
): Promise<number> {
  let steps = 0;
  for (let i = 0; i < maxSteps; i++) {
    const step = await stepGameAiTurn(db, gameId, gameRoom);
    if (!step.applied) break;
    steps += 1;
    if (step.result?.state.phase === "game_over") break;
  }
  return steps;
}

export async function persistStateMutation(
  db: D1Database,
  gameId: string,
  nextState: InternalGameState,
  logEntries: ApplyActionResult["logEntries"],
  gameRoom?: DurableObjectNamespace,
): Promise<void> {
  await persistGameActionResult(
    db,
    gameId,
    { state: nextState, logEntries },
    { gameRoom, actorId: "system" },
  );
}

export async function applyTimeoutTakeoverAndStep(
  db: D1Database,
  gameId: string,
  humanId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<StepAiTurnResult> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return { applied: false };

  const gameState = normalizeGameState(
    JSON.parse(row.state_json!) as Record<string, unknown>,
  );
  if (!isAiControlledActor(gameState, humanId)) {
    const withTakeover = applyTimeoutTakeover(gameState, humanId);
    await persistStateMutation(
      db,
      gameId,
      withTakeover,
      [
        {
          playerId: humanId,
          actionType: "timeout_takeover",
          payload: { humanId },
        },
      ],
      gameRoom,
    );
  }

  return stepGameAiTurn(db, gameId, gameRoom);
}

export async function kickPlayerToAiReplacement(
  db: D1Database,
  gameId: string,
  humanId: string,
  gameRoom?: DurableObjectNamespace,
  personality: AiPersonality = "opportunist",
): Promise<InternalGameState | null> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return null;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json!) as Record<string, unknown>,
  );
  const nextState = replaceKickedPlayerWithAi(gameState, humanId, {
    displayName: "AI replacement",
    personality,
  });

  await persistStateMutation(
    db,
    gameId,
    nextState,
    [
      {
        playerId: humanId,
        actionType: "player_kicked",
        payload: { humanId, replacedByAi: true },
      },
    ],
    gameRoom,
  );

  await runAiTurnLoop(db, gameId, gameRoom);
  return nextState;
}

export async function notifyGameSchedule(
  gameRoom: DurableObjectNamespace | undefined,
  gameId: string,
  state: Record<string, unknown>,
): Promise<void> {
  await broadcastGameEvent(gameRoom, gameId, {
    type: "game.schedule",
    sentAt: Date.now(),
    gameId,
    state,
  });
}
