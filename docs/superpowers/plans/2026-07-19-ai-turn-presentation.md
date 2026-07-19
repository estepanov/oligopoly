# AI Turn Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In games with AI seats, pace client presentation of material AI beats (and soft turn-ends) so humans see meaningful opponent progress, with local Skip to the latest canonical interactive state—without slowing the server AI loop.

**Architecture:** Shared classifier tags each AI apply; worker emits extended `game.ai_action` alongside existing `game.action_applied`; web keeps `canonicalState` for legality and a presentation queue for the board/HUD. Durable Object AI loop stays tight (no watchability sleeps).

**Tech Stack:** Zod (`@oligopoly/validation`), Vitest, Hono worker, React 19 hooks in `@oligopoly/web`, existing GameRoom broadcast via `broadcastGameEvent`.

## Global Constraints

- Presentation fidelity: material-change beats + soft turn-end when an AI seat’s turn had no material events.
- Scope: any game that includes AI seats (solo or mixed).
- Emit beats only for presentation AI seats: `player.kind === "ai"` (dedicated + kick replacements). **Exclude** timeout takeovers.
- Canonical AI loop speed unchanged — no DO alarms/sleeps for pacing.
- Material classification is pure/deterministic in `@oligopoly/shared` (no LLM/I/O).
- Capital material threshold: `50`.
- Client pacing defaults: material ~1200ms, soft turn-end ~600ms, non-material coalesce ~0–200ms.
- Skip and auto-catch-up are **local only** (no server call).
- Queue cap `50` or lag `>8000ms` behind canonical → auto-Skip.
- WS down → jump-to-latest (playable); no fine-grained beats required.
- While `watching`, disable primary play actions; never submit from stale presentation state.
- Update `oligopoly_technical_plan.md` and `oligopoly_game_rules.md` in the docs task.
- YAGNI: no token animation, no cross-client sync, no speed prefs, no timeout-takeover pacing.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/engine/aiPresentation.ts` | `AI_PRESENTATION_CAPITAL_THRESHOLD`, `isAiSeatForPresentation`, `classifyAiPresentationBeat`, summary helper |
| `packages/shared/src/index.ts` | Re-export presentation helpers/types |
| `packages/shared/src/engine/gameStateTypes.ts` | Optional `stateVersion?: number` on `InternalGameState` |
| `packages/shared/src/engine/gameStateMachine.ts` | `normalizeGameState` defaults `stateVersion` to `0` |
| `packages/validation/src/gameSchemas.ts` | Optional `stateVersion` on `GameStateSchema` |
| `packages/validation/src/index.ts` | Extend `game.ai_action` + `AiPresentationReasonSchema` |
| `packages/worker/src/services/gamePersistence.ts` | Bump `stateVersion` on persist; emit `game.ai_action` when `aiMeta` + presentation seat |
| `packages/worker/src/services/gameAi.ts` | Track `turnHadMaterial` across loop steps; pass into persist/`aiMeta` |
| `packages/web/src/lib/aiPresentationQueue.ts` | Pure queue reducer (enqueue, skip, tick, catch-up rules) |
| `packages/web/src/hooks/useAiPresentation.ts` | Timers + React state over the reducer |
| `packages/web/src/hooks/useGameRealtime.ts` | Handle `game.ai_action` |
| `packages/web/src/hooks/useGameSession.ts` | Wire presentation; expose watching/skip/presentationState |
| `packages/web/src/lib/gameUi.ts` | `viewerNeedsInteraction` helper |
| `packages/web/src/pages/GameDetailPage.tsx` | Board/HUD use presentation state; Watching + Skip chrome; gate controls |
| `tests/unit/aiPresentation.test.ts` | Classifier + seat filter |
| `packages/web/src/lib/aiPresentationQueue.test.ts` | Queue unit tests |
| `tests/integration/games.test.ts` (or new) | AI step triggers `game.ai_action` broadcast fields |
| `oligopoly_technical_plan.md` / `oligopoly_game_rules.md` | Contract + UX notes |

---

### Task 1: Shared classifier + presentation seat filter

**Files:**
- Create: `packages/shared/src/engine/aiPresentation.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `tests/unit/aiPresentation.test.ts`

**Interfaces:**
- Consumes: `InternalGameState`, `GameActionInput` / action type from engine; `isAiControlledActor` patterns from `aiControl.ts`
- Produces:
  - `AI_PRESENTATION_CAPITAL_THRESHOLD = 50`
  - `AiPresentationReason` union (see code)
  - `isAiSeatForPresentation(state, actorId): boolean`
  - `classifyAiPresentationBeat(prev, next, action, context?: { turnHadMaterial: boolean }): { material: boolean; reason: AiPresentationReason | null; softTurnEnd: boolean; summary: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/aiPresentation.test.ts` using the same `normalizeGameState` fixture style as `tests/unit/aiControl.test.ts`:

```ts
import {
  applyTimeoutTakeover,
  classifyAiPresentationBeat,
  isAiSeatForPresentation,
  normalizeGameState,
  replaceKickedPlayerWithAi,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function baseState() {
  return normalizeGameState({
    gameId: "g1",
    round: 1,
    phase: "action",
    currentPlayerIndex: 1,
    turnOrder: ["human-a", "ai:bot"],
    freeMarketPool: 0,
    affinityAssignments: {},
    aiPlayers: [
      { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
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
        position: 5,
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
        developmentLevel: 0,
        mortgaged: false,
      },
    ],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  });
}

describe("isAiSeatForPresentation", () => {
  it("includes dedicated AI seats and kick replacements", () => {
    const state = baseState();
    expect(isAiSeatForPresentation(state, "ai:bot")).toBe(true);
    const kicked = replaceKickedPlayerWithAi(state, "human-a");
    expect(isAiSeatForPresentation(kicked, "human-a")).toBe(true);
  });

  it("excludes timeout takeovers and plain humans", () => {
    const state = applyTimeoutTakeover(baseState(), "human-a");
    expect(isAiSeatForPresentation(state, "human-a")).toBe(false);
    expect(isAiSeatForPresentation(baseState(), "human-a")).toBe(false);
  });
});

describe("classifyAiPresentationBeat", () => {
  it("marks ownership change as material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.tiles[0] = { ...next.tiles[0], ownerId: "ai:bot" };
    next.players[1] = {
      ...next.players[1],
      ownedTilePositions: [1],
      capital: 1400,
    };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "buy_tile",
    });
    expect(beat.material).toBe(true);
    expect(beat.reason).toBe("ownership_change");
    expect(beat.softTurnEnd).toBe(false);
  });

  it("marks soft turn-end when end_turn and turn had no material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.currentPlayerIndex = 0;
    next.phase = "waiting_for_roll";
    const beat = classifyAiPresentationBeat(
      prev,
      next,
      { type: "end_turn" },
      { turnHadMaterial: false },
    );
    expect(beat.material).toBe(false);
    expect(beat.softTurnEnd).toBe(true);
  });

  it("does not soft-end when turn already had material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.currentPlayerIndex = 0;
    const beat = classifyAiPresentationBeat(
      prev,
      next,
      { type: "end_turn" },
      { turnHadMaterial: true },
    );
    expect(beat.softTurnEnd).toBe(false);
  });

  it("ignores sub-threshold capital-only churn without ownership/auction", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.players[1] = { ...next.players[1], capital: 1480 };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "roll_dice",
      result: [1, 2],
    });
    expect(beat.material).toBe(false);
    expect(beat.softTurnEnd).toBe(false);
  });

  it("marks capital transfer at threshold", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.players[0] = { ...next.players[0], capital: 1550 };
    next.players[1] = { ...next.players[1], capital: 1450 };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "roll_dice",
      result: [3, 4],
    });
    expect(beat.material).toBe(true);
    expect(beat.reason).toBe("capital_transfer");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/aiPresentation.test.ts`

Expected: FAIL — module/`classifyAiPresentationBeat` not exported.

- [ ] **Step 3: Implement `aiPresentation.ts` and exports**

Create `packages/shared/src/engine/aiPresentation.ts`:

```ts
import type { GameAction } from "@oligopoly/validation";
import type { InternalGameState } from "./gameStateTypes.js";

export const AI_PRESENTATION_CAPITAL_THRESHOLD = 50;

export type AiPresentationReason =
  | "ownership_change"
  | "auction_opened"
  | "auction_settled"
  | "capital_transfer"
  | "bankruptcy"
  | "syndicate_form"
  | "syndicate_break"
  | "win_threshold"
  | "disruption_window";

export type AiPresentationBeat = {
  material: boolean;
  reason: AiPresentationReason | null;
  softTurnEnd: boolean;
  summary: string;
};

export type AiPresentationContext = {
  turnHadMaterial: boolean;
};

/** Dedicated AI seats + permanent kick replacements. Not timeout takeovers. */
export function isAiSeatForPresentation(
  state: InternalGameState,
  actorId: string,
): boolean {
  const player = state.players.find((p) => p.playerId === actorId);
  return player?.kind === "ai";
}

function ownershipChanged(
  prev: InternalGameState,
  next: InternalGameState,
): boolean {
  const prevOwners = new Map(
    prev.tiles.map((t) => [String(t.position), t.ownerId ?? null]),
  );
  for (const tile of next.tiles) {
    if ((prevOwners.get(String(tile.position)) ?? null) !== (tile.ownerId ?? null)) {
      return true;
    }
  }
  return false;
}

function maxAbsCapitalDelta(
  prev: InternalGameState,
  next: InternalGameState,
): number {
  const prevCap = new Map(prev.players.map((p) => [p.playerId, p.capital]));
  let max = 0;
  for (const player of next.players) {
    const before = prevCap.get(player.playerId) ?? player.capital;
    max = Math.max(max, Math.abs(player.capital - before));
  }
  return max;
}

function summaryFor(
  reason: AiPresentationReason | null,
  softTurnEnd: boolean,
  action: Pick<GameAction, "type">,
): string {
  if (softTurnEnd) return "ended turn";
  switch (reason) {
    case "ownership_change":
      return "changed tile ownership";
    case "auction_opened":
      return "opened an auction";
    case "auction_settled":
      return "settled an auction";
    case "capital_transfer":
      return "moved Capital";
    case "bankruptcy":
      return "went bankrupt";
    case "syndicate_form":
      return "formed a syndicate";
    case "syndicate_break":
      return "broke a syndicate";
    case "win_threshold":
      return "crossed a win threshold";
    case "disruption_window":
      return "triggered a disruption window";
    case null:
      return action.type.replaceAll("_", " ");
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function classifyAiPresentationBeat(
  prev: InternalGameState,
  next: InternalGameState,
  action: Pick<GameAction, "type">,
  context: AiPresentationContext = { turnHadMaterial: false },
): AiPresentationBeat {
  let reason: AiPresentationReason | null = null;

  if (ownershipChanged(prev, next)) reason = "ownership_change";
  else if (!prev.pendingAuction && next.pendingAuction)
    reason = "auction_opened";
  else if (prev.pendingAuction && !next.pendingAuction)
    reason = "auction_settled";
  else if (
    (next.eliminatedPlayerIds?.length ?? 0) >
    (prev.eliminatedPlayerIds?.length ?? 0)
  )
    reason = "bankruptcy";
  else if (
    Object.keys(next.syndicates ?? {}).length >
    Object.keys(prev.syndicates ?? {}).length
  )
    reason = "syndicate_form";
  else if (
    Object.keys(next.syndicates ?? {}).length <
    Object.keys(prev.syndicates ?? {}).length
  )
    reason = "syndicate_break";
  else if (Boolean(next.winnerId) && !prev.winnerId)
    reason = "win_threshold";
  else if (Boolean(next.finalRound) && !prev.finalRound)
    reason = "disruption_window";
  else if (
    maxAbsCapitalDelta(prev, next) >= AI_PRESENTATION_CAPITAL_THRESHOLD
  )
    reason = "capital_transfer";

  const material = reason !== null;
  const softTurnEnd =
    action.type === "end_turn" && !material && !context.turnHadMaterial;

  return {
    material,
    reason,
    softTurnEnd,
    summary: summaryFor(reason, softTurnEnd, action),
  };
}
```

Export from `packages/shared/src/index.ts` next to other AI exports:

```ts
export {
  AI_PRESENTATION_CAPITAL_THRESHOLD,
  classifyAiPresentationBeat,
  isAiSeatForPresentation,
} from "./engine/aiPresentation.js";
export type {
  AiPresentationBeat,
  AiPresentationContext,
  AiPresentationReason,
} from "./engine/aiPresentation.js";
```

Adjust tile fixture fields if `normalizeGameState` / `InternalTileState` requires more fields—mirror a working tile from an existing unit test if Step 2 fails on shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/aiPresentation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/engine/aiPresentation.ts packages/shared/src/index.ts tests/unit/aiPresentation.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): classify material AI presentation beats

Add deterministic seat filter and beat classifier for client-paced
AI turn presentation without slowing the server loop.
EOF
)"
```

---

### Task 2: `stateVersion` on game state

**Files:**
- Modify: `packages/shared/src/engine/gameStateTypes.ts`
- Modify: `packages/shared/src/engine/gameStateMachine.ts` (`normalizeGameState`)
- Modify: `packages/validation/src/gameSchemas.ts`
- Modify: `packages/worker/src/services/gamePersistence.ts` (bump on persist)

**Interfaces:**
- Consumes: existing persist path + `normalizeGameState`
- Produces: monotonic `stateVersion: number` on every successfully persisted apply (starts at `0` when absent)

- [ ] **Step 1: Write a failing unit assertion**

Add to `tests/unit/aiPresentation.test.ts` (or a tiny new case in an existing normalize test if one exists):

```ts
import { normalizeGameState } from "@oligopoly/shared";

it("defaults stateVersion to 0", () => {
  const state = normalizeGameState({
    gameId: "g-version",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["a"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [],
    tiles: [],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  });
  expect(state.stateVersion).toBe(0);
});
```

- [ ] **Step 2: Run to verify fail/missing field**

Run: `pnpm exec vitest run tests/unit/aiPresentation.test.ts -t stateVersion`

Expected: FAIL until field exists / defaults.

- [ ] **Step 3: Add field + normalize default + persist bump**

1. On `InternalGameState` add `stateVersion?: number`.
2. In `normalizeGameState`, after building the object, set `stateVersion: typeof raw.stateVersion === "number" ? raw.stateVersion : 0` (match local normalize style).
3. In `GameStateSchema` add `stateVersion: z.number().int().nonnegative().optional()`.
4. Near the start of `persistGameActionResult`, after loading/parsing the previous state JSON (use `options.expectedStateJson` when present), compute:

```ts
const previousVersion =
  options.expectedStateJson != null
    ? (normalizeGameState(
        JSON.parse(options.expectedStateJson) as Record<string, unknown>,
      ).stateVersion ?? 0)
    : (result.state.stateVersion ?? 0);
result = {
  ...result,
  state: {
    ...result.state,
    stateVersion: previousVersion + 1,
  },
};
```

Keep this as the **single** bump site so HTTP + AI + system persists share one counter.

- [ ] **Step 4: Run unit test**

Run: `pnpm exec vitest run tests/unit/aiPresentation.test.ts -t stateVersion`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/engine/gameStateTypes.ts packages/shared/src/engine/gameStateMachine.ts packages/validation/src/gameSchemas.ts packages/worker/src/services/gamePersistence.ts tests/unit/aiPresentation.test.ts
git commit -m "$(cat <<'EOF'
feat: add monotonic game stateVersion for presentation ordering

Bump on persist so AI action events can correlate with canonical snapshots.
EOF
)"
```

---

### Task 3: Extend `game.ai_action` schema

**Files:**
- Modify: `packages/validation/src/index.ts` (the `game.ai_action` object in `GameRealtimeEventSchema`)

**Interfaces:**
- Consumes: existing `game.ai_action` fields (`aiPlayerId`, `personality`, `action`)
- Produces: extended event type with presentation fields below

- [ ] **Step 1: Write a failing schema parse test**

Add `tests/unit/gameAiActionEvent.test.ts`:

```ts
import { GameRealtimeEventSchema } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

describe("game.ai_action event", () => {
  it("accepts presentation fields", () => {
    const parsed = GameRealtimeEventSchema.parse({
      type: "game.ai_action",
      sentAt: 1,
      gameId: "g1",
      aiPlayerId: "ai:bot",
      personality: "opportunist",
      action: { type: "end_turn" },
      material: false,
      reason: null,
      softTurnEnd: true,
      stateVersion: 3,
      logCursor: 12,
      summary: "ended turn",
      displayName: "Nova Blake",
    });
    expect(parsed.type).toBe("game.ai_action");
    if (parsed.type === "game.ai_action") {
      expect(parsed.softTurnEnd).toBe(true);
      expect(parsed.stateVersion).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run tests/unit/gameAiActionEvent.test.ts`

Expected: FAIL — unrecognized keys / missing schema fields (Zod strip or reject depending on config; fix schema so parse succeeds with these fields present).

- [ ] **Step 3: Extend schema**

Replace the `game.ai_action` object with:

```ts
z.object({
  type: z.literal("game.ai_action"),
  sentAt: z.number(),
  gameId: z.string(),
  aiPlayerId: z.string(),
  personality: AiPersonalitySchema,
  action: GameActionSchema,
  material: z.boolean(),
  reason: z
    .enum([
      "ownership_change",
      "auction_opened",
      "auction_settled",
      "capital_transfer",
      "bankruptcy",
      "syndicate_form",
      "syndicate_break",
      "win_threshold",
      "disruption_window",
    ])
    .nullable(),
  softTurnEnd: z.boolean().optional(),
  stateVersion: z.number().int().nonnegative(),
  logCursor: z.number().int().nonnegative().optional(),
  summary: z.string().optional(),
  displayName: z.string().optional(),
}),
```

Keep reason enum literals identical to `AiPresentationReason` in shared.

- [ ] **Step 4: Run test**

Run: `pnpm exec vitest run tests/unit/gameAiActionEvent.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/index.ts tests/unit/gameAiActionEvent.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): extend game.ai_action for presentation beats

Add material/reason/stateVersion fields so clients can pace AI turns.
EOF
)"
```

---

### Task 4: Emit `game.ai_action` from AI persist path

**Files:**
- Modify: `packages/worker/src/services/gamePersistence.ts`
- Modify: `packages/worker/src/services/gameAi.ts`
- Modify: `tests/integration/games.test.ts` (extend AI step describe) **or** add `tests/unit/gameAiActionEmit.test.ts` with a mocked `broadcastGameEvent`

**Interfaces:**
- Consumes: `classifyAiPresentationBeat`, `isAiSeatForPresentation`, extended `aiMeta`
- Produces: after `game.action_applied`, optional second broadcast `game.ai_action` for presentation seats

- [ ] **Step 1: Write failing emit test**

Prefer a unit test that mocks `broadcastGameEvent` if integration DO notify is awkward. Example shape:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const broadcastGameEvent = vi.fn(async () => undefined);
vi.mock("../packages/worker/src/realtime/notify.js", () => ({
  broadcastGameEvent,
}));
```

If package path mocks are painful in this repo, extend the existing AI step integration test by injecting a GameRoom stub that records POSTed JSON bodies (follow patterns in other notify tests if present). The assertion to lock:

- After one AI `end_turn` or `roll_dice` step for `ai:bot`, recorded events include one with `type: "game.ai_action"`, `aiPlayerId: "ai:bot"`, `stateVersion` number, and `material` boolean.

- [ ] **Step 2: Run test — expect fail (event not emitted)**

- [ ] **Step 3: Extend `aiMeta` + classify + emit**

In `PersistOptions.aiMeta` extend:

```ts
aiMeta?: {
  aiPlayerId: string;
  personality: AiPersonality;
  action: GameAction;
  prevState: InternalGameState;
  turnHadMaterial: boolean;
};
```

In `stepGameAiTurn`, pass `prevState: gameState` into `aiMeta`.

In `runAiTurnLoop`, track:

```ts
let turnActorId: string | null = null;
let turnHadMaterial = false;
// inside loop after successful step:
const actorId = step.decision.actorId;
if (actorId !== turnActorId) {
  turnActorId = actorId;
  turnHadMaterial = false;
}
const beat = classifyAiPresentationBeat(
  /* prev from step — thread prev through StepAiTurnResult */,
  step.result.state,
  step.decision.action,
  { turnHadMaterial },
);
if (beat.material) turnHadMaterial = true;
if (step.decision.action.type === "end_turn") {
  turnHadMaterial = false;
  turnActorId = null;
}
```

Simplest wiring: compute the beat inside `stepGameAiTurn` (has prev + next), return it on `StepAiTurnResult`, and let `runAiTurnLoop` update `turnHadMaterial` **before** the next step by passing context into `stepGameAiTurn`:

```ts
export async function stepGameAiTurn(
  ...,
  presentationContext: { turnHadMaterial: boolean } = { turnHadMaterial: false },
): Promise<StepAiTurnResult>
```

Pass `presentationContext` into `aiMeta` / classify at notify time.

In `notifyGameActionResult`, after broadcasting `game.action_applied`:

```ts
if (options.aiMeta) {
  const { aiPlayerId, personality, action, prevState, turnHadMaterial } =
    options.aiMeta;
  if (isAiSeatForPresentation(result.state, aiPlayerId)) {
    const beat = classifyAiPresentationBeat(
      prevState,
      result.state,
      action,
      { turnHadMaterial },
    );
    const displayName =
      result.state.players.find((p) => p.playerId === aiPlayerId)
        ?.displayName ??
      result.state.aiPlayers?.find((p) => p.playerId === aiPlayerId)?.name;
    await broadcastGameEvent(options.gameRoom, gameId, {
      type: "game.ai_action",
      sentAt,
      gameId,
      aiPlayerId,
      personality,
      action,
      material: beat.material,
      reason: beat.reason,
      softTurnEnd: beat.softTurnEnd,
      stateVersion: result.state.stateVersion ?? 0,
      logCursor: persistedLogEntries.length
        ? undefined /* or cumulative if available */
        : undefined,
      summary: beat.summary,
      displayName,
    });
  }
}
```

`runAiTurnLoop` must pass the **pre-step** `turnHadMaterial` into each `stepGameAiTurn`, then update the flag from the returned beat:

```ts
let turnHadMaterial = false;
let turnActorId: string | null = null;
for (...) {
  const step = await stepGameAiTurn(..., { turnHadMaterial });
  if (!step.applied) break;
  if (step.decision.actorId !== turnActorId) {
    turnActorId = step.decision.actorId;
    turnHadMaterial = false;
  }
  if (step.presentationBeat?.material) turnHadMaterial = true;
  if (step.decision.action.type === "end_turn") {
    turnActorId = null;
    turnHadMaterial = false;
  }
}
```

Note: classify for soft turn-end needs the flag **before** the end_turn apply’s own material. Passing pre-step `turnHadMaterial` into classify is correct; do not set the flag from the end_turn beat’s material before classify.

- [ ] **Step 4: Run emit test — PASS**

Also run: `pnpm exec vitest run tests/unit/aiPresentation.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/services/gamePersistence.ts packages/worker/src/services/gameAi.ts tests/
git commit -m "$(cat <<'EOF'
feat(worker): emit game.ai_action for AI seat applies

Classify each AI step and broadcast presentation metadata without
adding delays to runAiTurnLoop.
EOF
)"
```

---

### Task 5: Client presentation queue (pure)

**Files:**
- Create: `packages/web/src/lib/aiPresentationQueue.ts`
- Create: `packages/web/src/lib/aiPresentationQueue.test.ts`

**Interfaces:**
- Consumes: `GameState`, `game.ai_action` fields, `viewerNeedsInteraction` (Task 6 can land the helper first if preferred—define a pure `shouldCatchUp(canonical, viewerId)` in this file temporarily or import from `gameUi`)
- Produces:

```ts
export type PresentationMode = "watching" | "caught_up";

export type AiPresentationBeatEvent = {
  stateVersion: number;
  state: GameState;
  aiPlayerId: string;
  displayName?: string;
  material: boolean;
  softTurnEnd: boolean;
  summary: string;
  sentAt: number;
};

export type AiPresentationQueueState = {
  mode: PresentationMode;
  presentationState: GameState | null;
  queue: AiPresentationBeatEvent[];
  currentBeat: AiPresentationBeatEvent | null;
  lastAppliedVersion: number;
};

export const MATERIAL_PAUSE_MS = 1200;
export const SOFT_TURN_END_PAUSE_MS = 600;
export const NON_MATERIAL_PAUSE_MS = 200;
export const QUEUE_CAP = 50;
export const LAG_BUDGET_MS = 8000;

export function createPresentationQueue(
  canonical: GameState | null,
): AiPresentationQueueState;

export function pauseMsFor(beat: AiPresentationBeatEvent): number;

export function enqueueCanonical(
  q: AiPresentationQueueState,
  canonical: GameState,
  viewerId: string | null,
  needsInteraction: boolean,
): AiPresentationQueueState;

export function enqueueAiBeat(
  q: AiPresentationQueueState,
  beat: AiPresentationBeatEvent,
  canonical: GameState,
  needsInteraction: boolean,
): AiPresentationQueueState;

export function skipPresentation(
  q: AiPresentationQueueState,
  canonical: GameState,
): AiPresentationQueueState;

export function advancePresentation(
  q: AiPresentationQueueState,
  canonical: GameState,
  nowMs: number,
): AiPresentationQueueState;
```

- [ ] **Step 1: Write failing queue tests**

```ts
import { describe, expect, it } from "vitest";
import {
  advancePresentation,
  createPresentationQueue,
  enqueueAiBeat,
  enqueueCanonical,
  skipPresentation,
  type AiPresentationBeatEvent,
} from "./aiPresentationQueue";
import type { GameState } from "@oligopoly/validation";

function state(version: number, phase: GameState["phase"] = "action"): GameState {
  return {
    gameId: "g1",
    round: 1,
    phase,
    stateVersion: version,
    currentPlayerIndex: 0,
    turnOrder: ["ai:bot", "human"],
    players: [],
  } as GameState;
}

function beat(
  version: number,
  overrides: Partial<AiPresentationBeatEvent> = {},
): AiPresentationBeatEvent {
  return {
    stateVersion: version,
    state: state(version),
    aiPlayerId: "ai:bot",
    displayName: "Bot",
    material: true,
    softTurnEnd: false,
    summary: "changed tile ownership",
    sentAt: version * 1000,
    ...overrides,
  };
}

describe("aiPresentationQueue", () => {
  it("enters watching on material beat and skip catches up", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(1), "human", false);
    q = enqueueAiBeat(q, beat(2), state(2), false);
    expect(q.mode).toBe("watching");
    expect(q.presentationState?.stateVersion).toBe(2);
    q = skipPresentation(q, state(2));
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("auto catch-up when viewer needs interaction", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), true);
    expect(q.mode).toBe("caught_up");
  });

  it("drops older versions and catch-up on gap", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), false);
    q = enqueueCanonical(q, state(5), "human", false); // gap
    expect(q.mode).toBe("caught_up");
    expect(q.presentationState?.stateVersion).toBe(5);
  });
});
```

Implement gap rule: if `canonical.stateVersion > lastAppliedVersion + 1 + queue.length` (or simply `canonical.stateVersion - lastAppliedVersion > queue.length + 1`), call `skipPresentation`.

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @oligopoly/web exec vitest run src/lib/aiPresentationQueue.test.ts`

- [ ] **Step 3: Implement reducer**

Core rules:

1. `enqueueCanonical` always remembered as latest canonical reference for skip targets; if `needsInteraction` or gap/lag/cap → `skipPresentation`.
2. `enqueueAiBeat`: ignore if `stateVersion <= lastAppliedVersion`; else push; if no `currentBeat`, set `currentBeat` + `presentationState` to beat.state and `mode: watching` (unless needsInteraction).
3. `advancePresentation`: when pause elapsed (caller tracks deadline; reducer can just pop current and promote next, or accept `forceAdvance: true` from the hook). Keep the pure module free of `setTimeout`—hook owns timers.
4. Non-material beats: still enqueue but `pauseMsFor` returns `NON_MATERIAL_PAUSE_MS` (or `0`).
5. Soft turn-end: `SOFT_TURN_END_PAUSE_MS`.
6. Material: `MATERIAL_PAUSE_MS`.

Provide `pauseMsFor(beat)` as specified.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/aiPresentationQueue.ts packages/web/src/lib/aiPresentationQueue.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add pure AI presentation queue reducer

Pace material and soft-turn AI beats locally with skip and catch-up rules.
EOF
)"
```

---

### Task 6: `viewerNeedsInteraction` + realtime/session wiring + hook

**Files:**
- Modify: `packages/web/src/lib/gameUi.ts`
- Modify: `packages/web/src/hooks/useGameRealtime.ts`
- Create: `packages/web/src/hooks/useAiPresentation.ts`
- Modify: `packages/web/src/hooks/useGameSession.ts`

**Interfaces:**
- Consumes: queue helpers; `GameRealtimeEvent` `game.ai_action`; session canonical state
- Produces from `useGameSession`:
  - `canonicalState` (existing `state` remains canonical)
  - `presentationState`
  - `presentationMode`
  - `currentPresentationBeat`
  - `skipPresentation()`
  - `actionsLocked` (= `presentationMode === "watching"`)

- [ ] **Step 1: Failing tests for `viewerNeedsInteraction`**

Add cases in `packages/web/src/lib/gameUi.test.ts` (create if missing):

```ts
it("viewerNeedsInteraction is true on my turn wait-for-roll", () => {
  expect(
    viewerNeedsInteraction(
      {
        gameId: "g",
        round: 1,
        phase: "waiting_for_roll",
        currentPlayerIndex: 0,
        turnOrder: ["me", "ai:bot"],
        players: [],
      } as GameState,
      "me",
    ),
  ).toBe(true);
});

it("viewerNeedsInteraction is false when another player acts", () => {
  expect(
    viewerNeedsInteraction(
      {
        gameId: "g",
        round: 1,
        phase: "waiting_for_roll",
        currentPlayerIndex: 1,
        turnOrder: ["me", "ai:bot"],
        players: [],
      } as GameState,
      "me",
    ),
  ).toBe(false);
});
```

Also true when: auction bidding phase and viewer still owes a bid (reuse existing auction helpers—e.g. not yet in `pendingAuction.submissions`), or viewer has an actionable inbound trade offer if such a helper already exists; if trade helper is heavy, v1 minimum is **my turn in any non-`game_over` phase where `isMyTurn`** plus **auction bid owed**. Document the trade inbox catch-up as: if `state.tradeOffers` contains an offer with `recipientId === viewer` and status pending, return true—match actual trade offer field names from `GameState`.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement helper + hook + wiring**

`viewerNeedsInteraction(state, viewerId)` in `gameUi.ts`.

`useGameRealtime`: extend `GameSessionUpdate` (or parallel callback) to pass AI beats:

```ts
export type GameAiActionUpdate = {
  source: "ai_action";
  aiPlayerId: string;
  displayName?: string;
  material: boolean;
  softTurnEnd?: boolean;
  summary?: string;
  stateVersion: number;
  action: GameAction;
  sentAt: number;
};
```

On `message.type === "game.ai_action"`, call `options.onAiAction?.(message)`.

`useAiPresentation(canonical, viewerId, needsInteraction)`:

- Holds queue state
- On canonical change → `enqueueCanonical`
- Exposes `pushAiAction(update, stateForVersion)` — session must pair AI action with the canonical state that has the same `stateVersion` (buffer AI actions until the matching `action_applied` state arrives, then `enqueueAiBeat`)
- `useEffect` timer: when `currentBeat` set, `setTimeout(pauseMsFor(currentBeat), …)` then `advancePresentation`
- Exposes `skip`

`useGameSession`:

- Keep updating canonical `state` as today from snapshots/`action_applied`
- If WS disconnect path / poll refresh: call presentation `skip` (jump-to-latest)
- When HTTP action returns: update canonical only; do **not** force presentation catch-up from possibly pre-AI HTTP body—wait for WS versions ≥ response
- Pass `actionsLocked` / presentation fields out
- `runAction` early-return if `actionsLocked`

Pairing strategy (implement explicitly):

```ts
const pendingAi = useRef<Map<number, GameAiActionUpdate>>(new Map());
// on ai_action: pendingAi.set(stateVersion, update)
// on canonical state with version V: if pendingAi has V, enqueueAiBeat({...pending, state: canonical}); else enqueueCanonical only
```

- [ ] **Step 4: Run web unit tests for gameUi + queue**

Run:

```bash
pnpm --filter @oligopoly/web exec vitest run src/lib/aiPresentationQueue.test.ts src/lib/gameUi.test.ts
```

Expected: PASS (create `gameUi.test.ts` if it did not exist).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/gameUi.ts packages/web/src/lib/gameUi.test.ts packages/web/src/hooks/useAiPresentation.ts packages/web/src/hooks/useGameRealtime.ts packages/web/src/hooks/useGameSession.ts
git commit -m "$(cat <<'EOF'
feat(web): wire AI presentation queue into game session

Buffer game.ai_action against canonical stateVersion and lock actions while watching.
EOF
)"
```

---

### Task 7: Game page Watching / Skip UI

**Files:**
- Modify: `packages/web/src/pages/GameDetailPage.tsx`
- Modify: `packages/web/src/components/GameStatusHeader.tsx` (only if turn chrome lives there—prefer minimal banner in Play card)
- Modify: CSS module/page styles already used by game page (e.g. `packages/web/src/styles/pages/app-pages.css`) for a simple status row—no new card chrome beyond existing patterns

**Interfaces:**
- Consumes: `presentationState`, `presentationMode`, `currentPresentationBeat`, `skipPresentation`, `actionsLocked` from session
- Produces: board/log/player panels render `presentationState ?? state`; controls use canonical gating with `busy={busyAction || actionsLocked}`

- [ ] **Step 1: Write a focused component test if there is an existing GameDetailPage test harness; otherwise a shallow test of a tiny presentational banner**

Prefer extracting:

```tsx
// packages/web/src/components/AiWatchingBanner.tsx
export function AiWatchingBanner(props: {
  open: boolean;
  name: string;
  summary?: string;
  onSkip: () => void;
}) { ... }
```

Test:

```tsx
it("renders Skip while watching", () => {
  render(
    <AiWatchingBanner
      open
      name="Nova Blake"
      summary="changed tile ownership"
      onSkip={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(/watching/i);
  expect(screen.getByRole("button", { name: /skip/i })).toBeEnabled();
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/AiWatchingBanner.test.tsx`

- [ ] **Step 3: Implement banner + wire page**

Banner copy: `Watching · {name}` and muted summary; button `Skip`.

In `GameDetailPage`:

- `const viewState = presentationState ?? state`
- Pass `viewState` into `BoardGrid` / `PlayerSummaryPanel` / deferred values
- Keep `GamePlayControls` on canonical `state` but `busy={busyAction || actionsLocked}`
- Show banner when `presentationMode === "watching"`
- Highlight active beat seat in `PlayerSummaryPanel` if an existing “current actor” style exists—reuse `currentActorId(viewState)` rather than inventing new visuals

- [ ] **Step 4: Run banner test — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/AiWatchingBanner.tsx packages/web/src/components/AiWatchingBanner.test.tsx packages/web/src/pages/GameDetailPage.tsx packages/web/src/styles/pages/app-pages.css
git commit -m "$(cat <<'EOF'
feat(web): show Watching chrome and Skip during AI presentation

Render paced presentation state on the board while locking play controls.
EOF
)"
```

---

### Task 8: Docs alignment

**Files:**
- Modify: `oligopoly_technical_plan.md` (AI player protocol / realtime events section ~234–245 and WS event list)
- Modify: `oligopoly_game_rules.md` (after Solo vs AI paragraph ~78–84)

**Interfaces:**
- Consumes: this plan + design spec
- Produces: documented contract matching implementation

- [ ] **Step 1: Edit technical plan**

Add bullets:

- `game.ai_action` is emitted after each persisted AI-seat apply with `material`, `reason`, `softTurnEnd`, `stateVersion`, optional `summary` / `displayName`.
- Clients may pace presentation locally; `GameRoom` does **not** insert watchability delays into `runAiTurnLoop`.
- Timeout takeovers do not emit presentation beats in v1.
- `stateVersion` increments on each successful game state persist.

- [ ] **Step 2: Edit game rules**

After the Solo vs AI paragraph, add:

> **Watching AI seats:** In games that include AI seats, the client briefly highlights meaningful AI outcomes (and uneventful AI turn endings) so the table does not jump straight back to your input. You may **Skip** to jump to the next moment you can act. This is presentation-only and does not change rules, timing, or legality on the server.

- [ ] **Step 3: Commit**

```bash
git add oligopoly_technical_plan.md oligopoly_game_rules.md
git commit -m "$(cat <<'EOF'
docs: document AI turn presentation contract

Describe game.ai_action pacing, stateVersion, and Skip UX for AI seats.
EOF
)"
```

---

### Task 9: Verification sweep

**Files:** none new

- [ ] **Step 1: Run focused automated suite**

```bash
pnpm exec vitest run tests/unit/aiPresentation.test.ts tests/unit/gameAiActionEvent.test.ts
pnpm --filter @oligopoly/web exec vitest run src/lib/aiPresentationQueue.test.ts src/components/AiWatchingBanner.test.tsx
pnpm exec vitest run tests/integration/games.test.ts -t "ai/step"
```

Expected: PASS (adjust -t pattern if the emit test lives elsewhere).

- [ ] **Step 2: Run local CI gate**

```bash
pnpm run ci:local
```

Expected: clean pass.

- [ ] **Step 3: Manual smoke (documented in commit message / PR)**

1. Solo vs 3 AI: end turn → see Watching beats for material/soft ends → control returns.
2. Press Skip mid-sequence → actions enable on your interactive phase.
3. Mixed 2H+2AI: when other human’s turn, UI does not claim “your turn.”

- [ ] **Step 4: Final commit only if verification fixed anything; otherwise done**

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Material taxonomy + soft turn-end | Task 1, 4 |
| AI seats only (not timeout) | Task 1, 4 |
| Hybrid emit `game.ai_action` | Task 3, 4 |
| Client presentation queue + pauses | Task 5, 6 |
| Skip local | Task 5, 6, 7 |
| Auto-catch-up on viewer interaction | Task 5, 6 |
| Queue cap / lag auto-Skip | Task 5 |
| WS degrade jump-to-latest | Task 6 |
| Disable actions while watching | Task 6, 7 |
| No DO pacing | Task 4 (explicit non-change) |
| Docs technical + rules | Task 8 |
| Unit/integration/manual tests | Tasks 1–7, 9 |
| `stateVersion` ordering | Task 2, 4, 6 |

## Placeholder / consistency check

- Reason enum strings identical in shared + validation.
- `turnHadMaterial` is pre-step context for `end_turn` soft beats.
- `presentationState` for board; canonical `state` for legality/controls.
- No server Skip protocol in v1.
