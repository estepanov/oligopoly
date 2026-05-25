import {
  type ApplyActionResult,
  applyAction,
  applyTimeoutTakeover,
  chooseAiAction,
  closeAuctionBidWindowIfReady,
  finalizeAuctionSettleIfReady,
  type InternalGameState,
  isAiControlledActor,
  normalizeGameState,
  replaceKickedPlayerWithAi,
  rollPathChoiceDie,
} from "@oligopoly/shared";
import type { AiPersonality, GameAction } from "@oligopoly/validation";
import { broadcastGameEvent } from "../realtime/notify.js";
import { persistGameActionResult } from "./gamePersistence.js";

type ActiveGameRow = {
  id: string;
  status: string;
  state_json: string | null;
};

export type StepAiTurnFailureReason = "not_found" | "completed" | "not_ai_turn";

export type StepAiTurnResult =
  | {
      applied: true;
      decision: NonNullable<ReturnType<typeof chooseAiAction>>;
      result: ApplyActionResult;
    }
  | {
      applied: false;
      reason: StepAiTurnFailureReason;
    };

async function loadGameRow(
  db: D1Database,
  gameId: string,
): Promise<ActiveGameRow | null> {
  return db
    .prepare("SELECT id, status, state_json FROM games WHERE id = ?")
    .bind(gameId)
    .first<ActiveGameRow>();
}

async function loadActiveGame(
  db: D1Database,
  gameId: string,
): Promise<ActiveGameRow | null> {
  const row = await loadGameRow(db, gameId);
  if (!row || row.status !== "active" || !row.state_json) return null;
  return row;
}

function buildEngineInput(action: GameAction) {
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
  const row = await loadGameRow(db, gameId);
  if (!row) return { applied: false, reason: "not_found" };
  if (row.status === "completed") {
    return { applied: false, reason: "completed" };
  }
  if (row.status !== "active" || !row.state_json) {
    return { applied: false, reason: "not_found" };
  }

  const gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
  );
  const decision = chooseAiAction(gameState);
  if (!decision) return { applied: false, reason: "not_ai_turn" };

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
      action: decision.action,
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
    if (step.result.state.phase === "game_over") break;
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

async function applyAuctionPhaseTransition(
  db: D1Database,
  gameId: string,
  gameRoom: DurableObjectNamespace | undefined,
  transition: (state: InternalGameState) => ApplyActionResult | null,
): Promise<boolean> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return false;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json!) as Record<string, unknown>,
  );
  const result = transition(gameState);
  if (!result) return false;

  await persistGameActionResult(db, gameId, result, {
    gameRoom,
    actorId: "system",
  });

  if (
    result.state.phase === "waiting_for_auction_bids" &&
    chooseAiAction(result.state)
  ) {
    await runAiTurnLoop(db, gameId, gameRoom);
  }

  return true;
}

export async function applyAuctionBidWindowExpiry(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<boolean> {
  return applyAuctionPhaseTransition(db, gameId, gameRoom, (state) =>
    closeAuctionBidWindowIfReady(state, Date.now()),
  );
}

export async function applyAuctionSettleExpiry(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<boolean> {
  return applyAuctionPhaseTransition(db, gameId, gameRoom, (state) =>
    finalizeAuctionSettleIfReady(state, Date.now()),
  );
}

export async function applyTimeoutTakeoverAndStep(
  db: D1Database,
  gameId: string,
  humanId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<StepAiTurnResult> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return { applied: false, reason: "not_found" };

  let gameState = normalizeGameState(
    JSON.parse(row.state_json!) as Record<string, unknown>,
  );
  const logEntries: ApplyActionResult["logEntries"] = [];

  if (!isAiControlledActor(gameState, humanId)) {
    gameState = applyTimeoutTakeover(gameState, humanId);
    logEntries.push({
      playerId: humanId,
      actionType: "timeout_takeover",
      payload: { humanId },
    });
  }

  const decision = chooseAiAction(gameState);
  if (!decision) {
    if (logEntries.length > 0) {
      await persistStateMutation(db, gameId, gameState, logEntries, gameRoom);
    }
    return { applied: false, reason: "not_ai_turn" };
  }

  const result = applyAction(
    gameState,
    decision.actorId,
    buildEngineInput(decision.action),
  );

  await persistGameActionResult(
    db,
    gameId,
    { state: result.state, logEntries: [...logEntries, ...result.logEntries] },
    {
      gameRoom,
      aiMeta: {
        aiPlayerId: decision.actorId,
        personality: decision.personality,
        action: decision.action,
      },
    },
  );

  return { applied: true, decision, result };
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
