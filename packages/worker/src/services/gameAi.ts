import {
  type AiDecision,
  type ApplyActionResult,
  applyAction,
  applyTimeoutTakeover,
  chooseAiAction,
  closeAuctionBidWindowIfReady,
  expirePendingTradeOffers,
  finalizeAuctionSettleIfReady,
  type InternalGameState,
  isAiControlledActor,
  normalizeGameState,
  replaceKickedPlayerWithAi,
} from "@oligopoly/shared";
import type { AiPersonality } from "@oligopoly/validation";
import { GameErrorKeys } from "@oligopoly/validation";
import { withPathChoiceDie } from "../lib/dice.js";
import { broadcastGameEvent } from "../realtime/notify.js";
import {
  persistGameActionResult,
  prepareGameBroadcastPayload,
} from "./gamePersistence.js";
import {
  chooseOpenRouterAiDecision,
  type OpenRouterAiEnv,
} from "./openRouterAi.js";

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

  const { decision, result } = await chooseAndApplyAiDecision(
    gameState,
    fallbackDecision,
    kv,
    aiEnv,
  );

  await persistGameActionResult(db, gameId, result, {
    gameRoom,
    kv,
    expectedStateJson: row.state_json,
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
  kv?: KVNamespace,
  aiEnv?: OpenRouterAiEnv,
): Promise<number> {
  let steps = 0;
  for (let i = 0; i < maxSteps; i++) {
    let step: StepAiTurnResult;
    try {
      step = await stepGameAiTurn(db, gameId, gameRoom, kv, aiEnv);
    } catch (err) {
      // An optimistic-concurrency conflict means another writer advanced the
      // game between our read and persist. The AI loop is best-effort; stop
      // rather than propagating (the other writer / next tick will continue).
      if (err === GameErrorKeys.STATE_CONFLICT) break;
      throw err;
    }
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
  expectedStateJson?: string | null,
): Promise<void> {
  await persistGameActionResult(
    db,
    gameId,
    { state: nextState, logEntries },
    { gameRoom, actorId: "system", expectedStateJson },
  );
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

  await persistGameActionResult(db, gameId, result, {
    gameRoom,
    actorId: "system",
    expectedStateJson: row.state_json,
  });

  if (
    result.state.phase === "waiting_for_auction_bids" &&
    chooseAiAction(result.state)
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

  const { decision, result } = await chooseAndApplyAiDecision(
    gameState,
    fallbackDecision,
    kv,
    aiEnv,
  );

  await persistGameActionResult(
    db,
    gameId,
    { state: result.state, logEntries: [...logEntries, ...result.logEntries] },
    {
      gameRoom,
      expectedStateJson: row.state_json,
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
  if (!row.state_json) return null;

  const gameState = normalizeGameState(
    JSON.parse(row.state_json) as Record<string, unknown>,
  );
  const nextState = replaceKickedPlayerWithAi(gameState, humanId, {
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
    row.state_json,
  );

  return nextState;
}

export async function notifyGameSchedule(
  gameRoom: DurableObjectNamespace | undefined,
  gameId: string,
  state: Record<string, unknown>,
): Promise<void> {
  // Strip private trade-offer terms from the broadcast state and carry them on a
  // separate field so `GameRoom.broadcast` can re-derive each viewer's own slice
  // without ever putting another player's terms on the wire (see
  // `prepareGameBroadcastPayload` for the full contract).
  const { state: stateWithoutTradeOffers, tradeOffers } =
    prepareGameBroadcastPayload(state);
  await broadcastGameEvent(gameRoom, gameId, {
    type: "game.schedule",
    sentAt: Date.now(),
    gameId,
    state: stateWithoutTradeOffers,
    ...(tradeOffers ? { tradeOffers } : {}),
  });
}
