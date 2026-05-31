import {
  type AiDecision,
  currentAuctionHighBid,
  getActiveEligibleBidders,
  getTileByPosition,
  hasAuctionSubmission,
  type InternalGameState,
  isLiveAuction,
  isVisibleAuction,
  suggestAiAuctionBid,
} from "@oligopoly/shared";
import { type GameAction, GameActionSchema } from "@oligopoly/validation";
import { z } from "zod";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_COMPLETION_TOKENS = 80;

export type OpenRouterAiEnv = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_DAILY_BUDGET_ALERT?: string;
  OPENROUTER_MONTHLY_BUDGET_ALERT?: string;
  OPENROUTER_APP_REFERER?: string;
  OPENROUTER_APP_TITLE?: string;
  OPENROUTER_TIMEOUT_MS?: string;
};

export type OpenRouterAiContext = {
  env?: OpenRouterAiEnv;
  kv?: KVNamespace;
  fetchFn?: typeof fetch;
  now?: Date;
};

type AiActionCandidate = {
  action: GameAction;
  description: string;
};

const OpenRouterChoiceSchema = z.object({
  actionIndex: z.number().int().min(0),
  reason: z.string().max(240).optional(),
});

type OpenRouterChoice = z.infer<typeof OpenRouterChoiceSchema>;

type OpenRouterChatResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: Record<string, unknown>;
  total_cost?: unknown;
};

function budgetNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function timeoutMs(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

async function numberFromKv(kv: KVNamespace | undefined, key: string) {
  if (!kv) return 0;
  const raw = await kv.get(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function budgetAllowsRequest(
  kv: KVNamespace | undefined,
  env: OpenRouterAiEnv,
  now: Date,
): Promise<boolean> {
  const dailyBudget = budgetNumber(env.OPENROUTER_DAILY_BUDGET_ALERT);
  const monthlyBudget = budgetNumber(env.OPENROUTER_MONTHLY_BUDGET_ALERT);
  if (!dailyBudget && !monthlyBudget) return true;

  const [dailySpend, monthlySpend] = await Promise.all([
    dailyBudget
      ? numberFromKv(kv, `ai_cost:daily:${utcDay(now)}`)
      : Promise.resolve(0),
    monthlyBudget
      ? numberFromKv(kv, `ai_cost:monthly:${utcMonth(now)}`)
      : Promise.resolve(0),
  ]);

  if (dailyBudget && dailySpend >= dailyBudget) return false;
  if (monthlyBudget && monthlySpend >= monthlyBudget) return false;
  return true;
}

function extractCostUsd(response: OpenRouterChatResponse): number | null {
  const candidates = [
    response.total_cost,
    response.usage?.cost,
    response.usage?.total_cost,
    response.usage?.usage,
  ];
  for (const value of candidates) {
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

async function recordCost(
  kv: KVNamespace | undefined,
  cost: number | null,
  now: Date,
) {
  if (!kv || cost === null) return;

  const keys = [
    `ai_cost:daily:${utcDay(now)}`,
    `ai_cost:monthly:${utcMonth(now)}`,
  ];
  for (const key of keys) {
    const current = await numberFromKv(kv, key);
    await kv.put(key, (current + cost).toFixed(6));
  }
}

function pushUniqueCandidate(
  candidates: AiActionCandidate[],
  action: GameAction,
  description: string,
) {
  const parsed = GameActionSchema.safeParse(action);
  if (!parsed.success) return;
  const key = JSON.stringify(parsed.data);
  if (
    candidates.some((candidate) => JSON.stringify(candidate.action) === key)
  ) {
    return;
  }
  candidates.push({ action: parsed.data, description });
}

export function buildAiActionCandidates(
  state: InternalGameState,
  fallback: AiDecision,
): AiActionCandidate[] {
  const candidates: AiActionCandidate[] = [];
  pushUniqueCandidate(candidates, fallback.action, "deterministic baseline");

  if (
    state.phase === "waiting_for_buy" &&
    state.pendingBuyTilePosition !== null
  ) {
    const player = state.players.find((p) => p.playerId === fallback.actorId);
    const tile = getTileByPosition(state.pendingBuyTilePosition);
    if (player && tile?.cost && player.capital >= tile.cost) {
      pushUniqueCandidate(
        candidates,
        { type: "buy_tile", tilePosition: state.pendingBuyTilePosition },
        "buy the pending tile",
      );
    }
    pushUniqueCandidate(
      candidates,
      { type: "decline_tile", tilePosition: state.pendingBuyTilePosition },
      "decline and send the tile to auction",
    );
  }

  if (state.phase === "waiting_for_path_choice") {
    pushUniqueCandidate(
      candidates,
      { type: "path_choice", choice: "perimeter" },
      "take the perimeter path",
    );
    pushUniqueCandidate(
      candidates,
      { type: "path_choice", choice: "diagonal" },
      "take the diagonal express path",
    );
  }

  if (state.phase === "waiting_for_insider_peek" && state.pendingInsiderPeek) {
    pushUniqueCandidate(
      candidates,
      { type: "insider_keep_market_event" },
      "keep the peeked market event",
    );
    pushUniqueCandidate(
      candidates,
      { type: "insider_discard_market_event" },
      "discard the peeked market event",
    );
  }

  if (state.phase === "waiting_for_auction_bids" && state.pendingAuction) {
    const auction = state.pendingAuction;
    if (getActiveEligibleBidders(state).includes(fallback.actorId)) {
      const suggestedBid = suggestAiAuctionBid(state, fallback.actorId);
      if (typeof suggestedBid === "number") {
        pushUniqueCandidate(
          candidates,
          {
            type: "auction_bid",
            tilePosition: auction.tilePosition,
            amount: suggestedBid,
          },
          "submit the deterministic auction bid",
        );
      }
      if (
        !isLiveAuction(auction) &&
        !hasAuctionSubmission(auction, fallback.actorId)
      ) {
        pushUniqueCandidate(
          candidates,
          { type: "auction_pass", tilePosition: auction.tilePosition },
          "pass on the auction",
        );
      }
    }
  }

  return candidates;
}

function playerSummary(state: InternalGameState) {
  return state.players.map((player) => ({
    playerId: player.playerId,
    kind: player.kind ?? "human",
    position: player.position,
    capital: player.capital,
    ownedTilePositions: player.ownedTilePositions,
    mortgagedTilePositions: player.mortgagedTilePositions,
    trustworthiness: player.trustworthiness,
    actionPointsRemaining: player.actionPointsRemaining,
    inRegulation: player.inRegulation,
    syndicateId: player.syndicateId ?? null,
    outstandingDebt: player.outstandingDebt ?? 0,
  }));
}

function tileSummary(state: InternalGameState) {
  return state.tiles.map((tile) => ({
    position: tile.position,
    ownerId: tile.ownerId,
    mortgaged: tile.mortgaged,
    developmentTokens: tile.developmentTokens,
  }));
}

function auctionSummary(state: InternalGameState, actorId: string) {
  const auction = state.pendingAuction;
  if (!auction) return null;
  return {
    tilePosition: auction.tilePosition,
    eligiblePlayerIds: auction.eligiblePlayerIds,
    actorSubmitted: hasAuctionSubmission(auction, actorId),
    visibleHighBid: isVisibleAuction(auction)
      ? currentAuctionHighBid(auction)
      : undefined,
    tieBreakMinBid: auction.tieBreakMinBid,
    tieBreakRound: auction.tieBreakRound,
  };
}

function buildPromptPayload(
  state: InternalGameState,
  fallback: AiDecision,
  candidates: AiActionCandidate[],
) {
  return {
    gameId: state.gameId,
    round: state.round,
    phase: state.phase,
    actorId: fallback.actorId,
    personality: fallback.personality,
    currentPlayerIndex: state.currentPlayerIndex,
    turnOrder: state.turnOrder,
    players: playerSummary(state),
    tiles: tileSummary(state),
    pendingBuyTilePosition: state.pendingBuyTilePosition,
    pendingAuction: auctionSummary(state, fallback.actorId),
    pendingInsiderPeek: state.pendingInsiderPeek
      ? {
          drawingPlayerId: state.pendingInsiderPeek.drawingPlayerId,
          trigger: state.pendingInsiderPeek.trigger,
          tilePosition: state.pendingInsiderPeek.tilePosition,
        }
      : null,
    candidates: candidates.map((candidate, actionIndex) => ({
      actionIndex,
      action: candidate.action,
      description: candidate.description,
    })),
  };
}

export function buildOpenRouterChatRequest(
  state: InternalGameState,
  fallback: AiDecision,
  candidates: AiActionCandidate[],
  env: OpenRouterAiEnv,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
  if (env.OPENROUTER_APP_REFERER) {
    headers["HTTP-Referer"] = env.OPENROUTER_APP_REFERER;
  }
  if (env.OPENROUTER_APP_TITLE) {
    headers["X-OpenRouter-Title"] = env.OPENROUTER_APP_TITLE;
  }

  return {
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You choose one legal Oligopoly AI action. Return only JSON matching the schema. Pick an actionIndex from the provided candidates. Do not invent actions.",
          },
          {
            role: "user",
            content: JSON.stringify(
              buildPromptPayload(state, fallback, candidates),
            ),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "oligopoly_ai_decision",
            strict: true,
            schema: {
              type: "object",
              properties: {
                actionIndex: { type: "integer", minimum: 0 },
                reason: { type: "string", maxLength: 240 },
              },
              required: ["actionIndex"],
              additionalProperties: false,
            },
          },
        },
        provider: {
          require_parameters: true,
          data_collection: "deny",
          zdr: true,
        },
        temperature: 0.2,
        max_completion_tokens: DEFAULT_MAX_COMPLETION_TOKENS,
        stream: false,
        session_id: `game:${state.gameId}`,
        user: fallback.actorId,
        metadata: {
          feature: "ai-player",
          gameId: state.gameId,
          actorId: fallback.actorId,
        },
      }),
    } satisfies RequestInit,
  };
}

function parseChoiceContent(content: unknown): OpenRouterChoice | null {
  const raw =
    typeof content === "string"
      ? JSON.parse(content)
      : typeof content === "object" && content !== null
        ? content
        : null;
  const parsed = OpenRouterChoiceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function chooseOpenRouterAiDecision(
  state: InternalGameState,
  fallback: AiDecision,
  context: OpenRouterAiContext,
): Promise<AiDecision | null> {
  const env = context.env;
  if (!env?.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL) return null;

  const candidates = buildAiActionCandidates(state, fallback);
  if (candidates.length < 2) return null;

  const now = context.now ?? new Date();
  if (!(await budgetAllowsRequest(context.kv, env, now))) return null;

  const { url, init } = buildOpenRouterChatRequest(
    state,
    fallback,
    candidates,
    env,
  );
  const requestInit = {
    ...init,
    signal: AbortSignal.timeout(timeoutMs(env.OPENROUTER_TIMEOUT_MS)),
  };

  try {
    const response = await (context.fetchFn ?? fetch)(url, requestInit);
    if (!response.ok) return null;

    const body = (await response.json()) as OpenRouterChatResponse;
    await recordCost(context.kv, extractCostUsd(body), now);

    const content = body.choices?.[0]?.message?.content;
    const choice = parseChoiceContent(content);
    if (!choice) return null;

    const selected = candidates[choice.actionIndex];
    if (!selected) return null;

    return {
      actorId: fallback.actorId,
      personality: fallback.personality,
      action: selected.action,
    };
  } catch {
    return null;
  }
}
