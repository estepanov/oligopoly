import type { AiDecision } from "@oligopoly/shared";
import { chooseAiAction, normalizeGameState } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";
import {
  buildAiActionCandidates,
  buildOpenRouterChatRequest,
  chooseOpenRouterAiDecision,
} from "../../packages/worker/src/services/openRouterAi";

type KvMap = Record<string, string>;

function createKv(initial: KvMap = {}) {
  const store: KvMap = { ...initial };
  return {
    store,
    kv: {
      get: async (key: string) => store[key] ?? null,
      put: async (key: string, value: string) => {
        store[key] = value;
      },
    } as unknown as KVNamespace,
  };
}

function buyState() {
  return normalizeGameState({
    gameId: "g-openrouter",
    round: 2,
    phase: "waiting_for_buy",
    currentPlayerIndex: 0,
    turnOrder: ["ai:bot", "human-b"],
    freeMarketPool: 0,
    affinityAssignments: {},
    aiPlayers: [
      { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
    ],
    players: [
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
      {
        playerId: "human-b",
        kind: "human",
        position: 0,
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
      {
        position: 1,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
    ],
    pendingBuyTilePosition: 1,
    lastDiceRoll: [1, 1],
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  });
}

function requireAiDecision(decision: AiDecision | null): AiDecision {
  expect(decision).not.toBeNull();
  if (!decision) {
    throw new Error("expected AI decision");
  }
  return decision;
}

describe("OpenRouter AI adapter", () => {
  it("builds an enterprise-safe chat completion request", () => {
    const state = buyState();
    const fallback = requireAiDecision(chooseAiAction(state));
    const candidates = buildAiActionCandidates(state, fallback);

    const request = buildOpenRouterChatRequest(state, fallback, candidates, {
      OPENROUTER_API_KEY: "sk-test",
      OPENROUTER_MODEL: "openai/gpt-5.2",
      OPENROUTER_APP_REFERER: "https://oligopoly.online",
      OPENROUTER_APP_TITLE: "Oligopoly Online",
    });
    const body = JSON.parse(request.init.body as string) as {
      model: string;
      provider: Record<string, unknown>;
      response_format: Record<string, unknown>;
    };

    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.init.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      "HTTP-Referer": "https://oligopoly.online",
      "X-OpenRouter-Title": "Oligopoly Online",
      "Content-Type": "application/json",
    });
    expect(body.model).toBe("openai/gpt-5.2");
    expect(body.provider).toMatchObject({
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    });
    expect(body.response_format).toMatchObject({
      type: "json_schema",
    });
  });

  it("uses a valid OpenRouter candidate and records returned cost", async () => {
    const state = buyState();
    const fallback = requireAiDecision(chooseAiAction(state));
    const { kv, store } = createKv();

    const fetchFn = async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ actionIndex: 1 }) } },
          ],
          usage: { cost: 0.00125 },
        }),
        { status: 200 },
      );

    const decision = await chooseOpenRouterAiDecision(state, fallback, {
      env: {
        OPENROUTER_API_KEY: "sk-test",
        OPENROUTER_MODEL: "openai/gpt-5.2",
        OPENROUTER_DAILY_BUDGET_ALERT: "10",
        OPENROUTER_MONTHLY_BUDGET_ALERT: "200",
      },
      kv,
      fetchFn: fetchFn as typeof fetch,
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    expect(decision?.action).toEqual({
      type: "decline_tile",
      tilePosition: 1,
    });
    expect(store["ai_cost:daily:2026-05-30"]).toBe("0.001250");
    expect(store["ai_cost:monthly:2026-05"]).toBe("0.001250");
  });

  it("falls back when budget is exhausted or the response is invalid", async () => {
    const state = buyState();
    const fallback = requireAiDecision(chooseAiAction(state));
    const exhausted = createKv({ "ai_cost:daily:2026-05-30": "10.000000" });

    const skipped = await chooseOpenRouterAiDecision(state, fallback, {
      env: {
        OPENROUTER_API_KEY: "sk-test",
        OPENROUTER_MODEL: "openai/gpt-5.2",
        OPENROUTER_DAILY_BUDGET_ALERT: "10",
      },
      kv: exhausted.kv,
      fetchFn: (async () => {
        throw new Error("should not call provider");
      }) as typeof fetch,
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    expect(skipped).toBeNull();

    const invalid = await chooseOpenRouterAiDecision(state, fallback, {
      env: {
        OPENROUTER_API_KEY: "sk-test",
        OPENROUTER_MODEL: "openai/gpt-5.2",
      },
      fetchFn: (async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ actionIndex: 99 }) } },
            ],
          }),
          { status: 200 },
        )) as typeof fetch,
    });
    expect(invalid).toBeNull();
  });
});
