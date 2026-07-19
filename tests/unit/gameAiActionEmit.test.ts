import { normalizeGameState } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";
import {
  applyTimeoutTakeoverAndStep,
  runAiTurnLoop,
  stepGameAiTurn,
} from "../../packages/worker/src/services/gameAi.js";
import { createWorkerD1Stub } from "../helpers/workerD1Stub.js";

/** Capture events POSTed to the Durable Object by `broadcastGameEvent`. */
function captureBroadcastRoom() {
  const events: Record<string, unknown>[] = [];
  const room = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (request: Request) => {
        events.push(
          JSON.parse(await request.text()) as Record<string, unknown>,
        );
        return new Response("ok");
      },
    }),
  } as unknown as DurableObjectNamespace;
  return { room, events };
}

/** AI's turn is waiting on a buy/decline decision for tile 1 (cost 60). */
function buyDecisionState() {
  return normalizeGameState({
    gameId: "game-1",
    round: 1,
    phase: "waiting_for_buy",
    currentPlayerIndex: 1,
    turnOrder: ["human-a", "ai:bot"],
    freeMarketPool: 0,
    affinityAssignments: {},
    // Empty deck makes the unconditional turn-start market-event draw (fired
    // by every `end_turn`) a pure phase-advance no-op, so `end_turn` beats in
    // these tests are deterministic instead of depending on a shuffled card.
    marketEventDeckRemaining: [],
    marketEventDiscard: [],
    aiPlayers: [
      { playerId: "ai:bot", name: "Nova Blake", personality: "opportunist" },
    ],
    players: [
      {
        playerId: "human-a",
        kind: "human",
        position: 0,
        capital: 1500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "ai:bot",
        kind: "ai",
        aiPersonality: "opportunist",
        position: 1,
        capital: 1500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: [
      { position: 1, ownerId: null, developmentLevel: 0, mortgaged: false },
    ],
    pendingBuyTilePosition: 1,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  });
}

/** AI's turn is in the plain `action` phase, so `chooseAiAction` ends the turn. */
function endTurnState() {
  const state = buyDecisionState();
  return {
    ...state,
    phase: "action" as const,
    pendingBuyTilePosition: null,
  };
}

/** AI owes a bid in a sealed auction — a private submission the broadcast must not leak. */
function sealedAuctionBidState() {
  return normalizeGameState({
    ...buyDecisionState(),
    phase: "waiting_for_auction_bids",
    pendingBuyTilePosition: null,
    pendingAuction: {
      tilePosition: 1,
      trigger: "player_initiated",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["human-a", "ai:bot"],
      resumePhase: "action",
    },
  });
}

function pushGameRow(
  db: ReturnType<typeof createWorkerD1Stub>,
  gameId: string,
  state: unknown,
) {
  db._tables.games.push({
    id: gameId,
    status: "active",
    state_json: JSON.stringify(state),
  });
}

describe("stepGameAiTurn game.ai_action emission", () => {
  it("emits a material game.ai_action when the AI buys a tile", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    pushGameRow(db, "game-1", buyDecisionState());

    const step = await stepGameAiTurn(db, "game-1", room);

    expect(step.applied).toBe(true);
    if (!step.applied) throw new Error("expected step to apply");
    expect(step.decision.action.type).toBe("buy_tile");
    expect(step.presentationBeat.material).toBe(true);

    const aiActionEvents = events.filter((e) => e.type === "game.ai_action");
    expect(aiActionEvents).toHaveLength(1);
    const event = aiActionEvents[0] as Record<string, unknown>;
    expect(event.aiPlayerId).toBe("ai:bot");
    expect(event.personality).toBe("opportunist");
    expect(event.material).toBe(true);
    expect(event.reason).toBe("ownership_change");
    expect(typeof event.stateVersion).toBe("number");
    expect(event.stateVersion).toBe(1);
    expect(event.displayName).toBe("Nova Blake");

    const actionAppliedEvents = events.filter(
      (e) => e.type === "game.action_applied",
    );
    expect(actionAppliedEvents).toHaveLength(1);
  });

  it("emits a soft-turn-end game.ai_action when end_turn has no material beat", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    pushGameRow(db, "game-1", endTurnState());

    const step = await stepGameAiTurn(
      db,
      "game-1",
      room,
      undefined,
      undefined,
      {
        turnHadMaterial: false,
      },
    );

    expect(step.applied).toBe(true);
    if (!step.applied) throw new Error("expected step to apply");
    expect(step.decision.action.type).toBe("end_turn");
    expect(step.presentationBeat.softTurnEnd).toBe(true);

    const aiActionEvents = events.filter((e) => e.type === "game.ai_action");
    expect(aiActionEvents).toHaveLength(1);
    const event = aiActionEvents[0] as Record<string, unknown>;
    expect(event.material).toBe(false);
    expect(event.softTurnEnd).toBe(true);
  });

  it("does not mark soft turn-end when turnHadMaterial context is true", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    pushGameRow(db, "game-1", endTurnState());

    await stepGameAiTurn(db, "game-1", room, undefined, undefined, {
      turnHadMaterial: true,
    });

    const event = events.find((e) => e.type === "game.ai_action") as Record<
      string,
      unknown
    >;
    expect(event.softTurnEnd).toBe(false);
  });

  it("redacts the bid amount from a sealed auction_bid before broadcast", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    pushGameRow(db, "game-1", sealedAuctionBidState());

    const step = await stepGameAiTurn(db, "game-1", room);

    expect(step.applied).toBe(true);
    if (!step.applied) throw new Error("expected step to apply");
    expect(step.decision.action.type).toBe("auction_bid");
    if (step.decision.action.type !== "auction_bid") {
      throw new Error("expected an auction_bid decision");
    }
    // The engine's real decision carries a private bid amount...
    expect(step.decision.action.amount).toBeGreaterThan(0);

    const aiActionEvents = events.filter((e) => e.type === "game.ai_action");
    expect(aiActionEvents).toHaveLength(1);
    const event = aiActionEvents[0] as Record<string, unknown>;
    // ...but the broadcast event must never carry it.
    expect(event.action).toEqual({
      type: "auction_bid",
      tilePosition: 1,
    });
    expect(event.action).not.toHaveProperty("amount");
  });

  it("does not emit game.ai_action for timeout takeovers (not a presentation AI seat)", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    // Timeout takeover acts on behalf of the human seat; `kind` stays "human",
    // so `isAiSeatForPresentation` must exclude it from the broadcast.
    pushGameRow(db, "game-1", {
      ...buyDecisionState(),
      currentPlayerIndex: 0,
    });

    const step = await applyTimeoutTakeoverAndStep(
      db,
      "game-1",
      "human-a",
      room,
    );

    expect(step.applied).toBe(true);
    const aiActionEvents = events.filter((e) => e.type === "game.ai_action");
    expect(aiActionEvents).toHaveLength(0);
    const actionAppliedEvents = events.filter(
      (e) => e.type === "game.action_applied",
    );
    expect(actionAppliedEvents).toHaveLength(1);
  });
});

describe("runAiTurnLoop turnHadMaterial threading", () => {
  it("passes pre-step turnHadMaterial across steps within the same actor's turn", async () => {
    const db = createWorkerD1Stub();
    const { room, events } = captureBroadcastRoom();
    pushGameRow(db, "game-1", buyDecisionState());

    const steps = await runAiTurnLoop(db, "game-1", room, 4);

    // Step 1: buy_tile (material). Step 2: end_turn — since the turn already
    // had a material beat, softTurnEnd must be false, not true.
    expect(steps).toBe(2);
    const aiActionEvents = events.filter(
      (e) => e.type === "game.ai_action",
    ) as Record<string, unknown>[];
    expect(aiActionEvents).toHaveLength(2);
    expect(aiActionEvents[0]?.material).toBe(true);
    expect(aiActionEvents[1]?.material).toBe(false);
    expect(aiActionEvents[1]?.softTurnEnd).toBe(false);
  });
});
