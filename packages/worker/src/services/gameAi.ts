import {
  type AiDecision,
  type AiPresentationBeat,
  type ApplyActionResult,
  applyAction,
  applyTimeoutTakeover,
  chooseAiAction,
  classifyAiPresentationBeat,
  closeAuctionBidWindowIfReady,
  expirePendingTradeOffers,
  finalizeAuctionSettleIfReady,
  type InternalGameState,
  isAiControlledActor,
  isAiSeatForPresentation,
  normalizeGameState,
  replaceKickedPlayerWithAi,
} from "@oligopoly/shared";
import type { AiPersonality } from "@oligopoly/validation";
import { GameErrorKeys } from "@oligopoly/validation";
import { withPathChoiceDie } from "../lib/dice.js";
import { broadcastGameEvent } from "../realtime/notify.js";
import { buildGameScheduleEvent } from "./gameBroadcastVisibility.js";
import { persistGameActionResult } from "./gamePersistence.js";
import {
  chooseOpenRouterAiDecision,
  type OpenRouterAiEnv,
} from "./openRouterAi.js";

// Re-exported so existing emit-path importers keep one entry point; the canonical
// implementation lives in `gameBroadcastVisibility.ts`.
export { buildGameScheduleEvent } from "./gameBroadcastVisibility.js";

export const AI_LOOP_MAX_STEPS = 16;

type ActiveGameRow = {
  id: string;
  status: string;
  state_json: string | null;
};

export type StepAiTurnFailureReason = "not_found" | "completed" | "not_ai_turn";

export type StepAiTurnResult =
  | {
      applied: true;
      decision: AiDecision;
      result: ApplyActionResult;
      /** Only classified when the actor `isAiSeatForPresentation` — a timeout
       * takeover never presents, so it's never classified there either. */
      presentationBeat?: AiPresentationBeat;
    }
  | {
      applied: false;
      reason: StepAiTurnFailureReason;
    };

export type AiPresentationStepContext = {
  turnHadMaterial: boolean;
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

function applyAiDecision(
  gameState: InternalGameState,
  decision: AiDecision,
): ApplyActionResult {
  // AI supplies its own dice result; only the path-choice die is server-injected.
  return applyAction(
    gameState,
    decision.actorId,
    withPathChoiceDie(decision.action),
  );
}

async function chooseAndApplyAiDecision(
  gameState: InternalGameState,
  fallbackDecision: AiDecision,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<{ decision: AiDecision; result: ApplyActionResult }> {
  const openRouterDecision = await chooseOpenRouterAiDecision(
    gameState,
    fallbackDecision,
    { env: aiEnv, kv },
  );

  if (openRouterDecision) {
    try {
      return {
        decision: openRouterDecision,
        result: applyAiDecision(gameState, openRouterDecision),
      };
    } catch {
      // The engine remains authoritative; any invalid provider proposal falls
      // back to the deterministic baseline for this exact state.
    }
  }

  return {
    decision: fallbackDecision,
    result: applyAiDecision(gameState, fallbackDecision),
  };
}

export async function stepGameAiTurn(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
  presentationContext: AiPresentationStepContext = { turnHadMaterial: false },
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
  const fallbackDecision = chooseAiAction(gameState);
  if (!fallbackDecision) return { applied: false, reason: "not_ai_turn" };

  const { decision, result: engineResult } = await chooseAndApplyAiDecision(
    gameState,
    fallbackDecision,
    kv,
    aiEnv,
  );

  const isPresentationSeat = isAiSeatForPresentation(
    engineResult.state,
    decision.actorId,
  );
  const presentationBeat = isPresentationSeat
    ? classifyAiPresentationBeat(
        gameState,
        engineResult.state,
        decision.action,
        presentationContext,
      )
    : undefined;

  const { result } = await persistGameActionResult(db, gameId, engineResult, {
    gameRoom,
    kv,
    expectedStateJson: row.state_json,
    ...(isPresentationSeat && presentationBeat
      ? {
          aiMeta: {
            aiPlayerId: decision.actorId,
            personality: decision.personality,
            presentationBeat,
          },
        }
      : {}),
  });

  return { applied: true, decision, result, presentationBeat };
}

export async function runAiTurnLoop(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
  maxSteps = 16,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<number> {
  let steps = 0;
  let turnActorId: string | null = null;
  let turnHadMaterial = false;
  for (let i = 0; i < maxSteps; i++) {
    let step: StepAiTurnResult;
    try {
      step = await stepGameAiTurn(db, gameId, gameRoom, kv, aiEnv, {
        turnHadMaterial,
      });
    } catch (err) {
      // An optimistic-concurrency conflict means another writer advanced the
      // game between our read and persist. The AI loop is best-effort; stop
      // rather than propagating (the other writer / next tick will continue).
      if (err === GameErrorKeys.STATE_CONFLICT) break;
      throw err;
    }
    if (!step.applied) break;
    steps += 1;
    if (step.decision.actorId !== turnActorId) {
      turnActorId = step.decision.actorId;
      turnHadMaterial = false;
    }
    if (step.presentationBeat?.material) turnHadMaterial = true;
    if (step.decision.action.type === "end_turn") {
      turnActorId = null;
      turnHadMaterial = false;
    }
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
  expectedStateJson?: string | null,
): Promise<InternalGameState> {
  const { result } = await persistGameActionResult(
    db,
    gameId,
    { state: nextState, logEntries },
    { gameRoom, actorId: "system", expectedStateJson },
  );
  return result.state;
}

async function applyAuctionPhaseTransition(
  db: D1Database,
  gameId: string,
  gameRoom: DurableObjectNamespace | undefined,
  kv: KVNamespace | undefined,
  aiEnv: OpenRouterAiEnv | undefined,
  transition: (state: InternalGameState) => ApplyActionResult | null,
): Promise<boolean> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return false;
  if (!row.state_json) return false;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
  );
  const result = transition(gameState);
  if (!result) return false;

  const { result: persistedResult } = await persistGameActionResult(
    db,
    gameId,
    result,
    {
      gameRoom,
      actorId: "system",
      expectedStateJson: row.state_json,
    },
  );

  if (
    persistedResult.state.phase === "waiting_for_auction_bids" &&
    chooseAiAction(persistedResult.state)
  ) {
    await runAiTurnLoop(db, gameId, gameRoom, AI_LOOP_MAX_STEPS, kv, aiEnv);
  }

  return true;
}

export async function applyAuctionBidWindowExpiry(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<boolean> {
  return applyAuctionPhaseTransition(db, gameId, gameRoom, kv, aiEnv, (state) =>
    closeAuctionBidWindowIfReady(state, Date.now()),
  );
}

export async function applyAuctionSettleExpiry(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<boolean> {
  return applyAuctionPhaseTransition(db, gameId, gameRoom, kv, aiEnv, (state) =>
    finalizeAuctionSettleIfReady(state, Date.now()),
  );
}

export async function applyTradeOfferExpiry(
  db: D1Database,
  gameId: string,
  gameRoom?: DurableObjectNamespace,
): Promise<boolean> {
  const row = await loadActiveGame(db, gameId);
  if (!row?.state_json) return false;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
  );
  const result = expirePendingTradeOffers(gameState, Date.now());
  if (!result) return false;

  await persistGameActionResult(db, gameId, result, {
    gameRoom,
    actorId: "system",
    expectedStateJson: row.state_json,
  });
  return true;
}

export async function applyTimeoutTakeoverAndStep(
  db: D1Database,
  gameId: string,
  humanId: string,
  gameRoom?: DurableObjectNamespace,
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<StepAiTurnResult> {
  const row = await loadActiveGame(db, gameId);
  if (!row) return { applied: false, reason: "not_found" };
  if (!row.state_json) return { applied: false, reason: "not_found" };

  let gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
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

  const fallbackDecision = chooseAiAction(gameState);
  if (!fallbackDecision) {
    if (logEntries.length > 0) {
      await persistStateMutation(
        db,
        gameId,
        gameState,
        logEntries,
        gameRoom,
        row.state_json,
      );
    }
    return { applied: false, reason: "not_ai_turn" };
  }

  const { decision, result: engineResult } = await chooseAndApplyAiDecision(
    gameState,
    fallbackDecision,
    kv,
    aiEnv,
  );

  // Timeout takeovers act on behalf of the human seat (`kind` stays "human"),
  // so `isAiSeatForPresentation` always excludes them — never classify a
  // presentation beat or emit `game.ai_action`/`aiMeta` for this path.
  const { result } = await persistGameActionResult(
    db,
    gameId,
    {
      state: engineResult.state,
      logEntries: [...logEntries, ...engineResult.logEntries],
    },
    {
      gameRoom,
      expectedStateJson: row.state_json,
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
  if (!row.state_json) return null;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
  );
  const nextState = replaceKickedPlayerWithAi(gameState, humanId, {
    personality,
  });

  const persistedState = await persistStateMutation(
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
    row.state_json,
  );

  return persistedState;
}

export async function notifyGameSchedule(
  gameRoom: DurableObjectNamespace | undefined,
  gameId: string,
  state: Record<string, unknown>,
): Promise<void> {
  await broadcastGameEvent(
    gameRoom,
    gameId,
    buildGameScheduleEvent(gameId, state),
  );
}
