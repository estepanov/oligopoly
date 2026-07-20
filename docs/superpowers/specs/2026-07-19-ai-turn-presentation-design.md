# AI turn presentation — design

## Goal

In games that include AI seats (solo-vs-AI and mixed human + AI), humans should see **meaningful AI progress** on the board turn-by-turn instead of the board snapping straight back to their interactive moment. Canonical game time stays fast; only **client presentation** is paced. Players can **Skip** to the next moment they can act.

## Current behavior

- `runAiTurnLoop` (`packages/worker/src/services/gameAi.ts`) applies up to 16 AI steps with no delay after human actions and from `GameRoom.syncAfterStateChange`.
- Each step persists and broadcasts full state (`game.action_applied` / schedule/snapshot paths).
- The play UI always renders the latest snapshot (`useGameSession` / `useGameRealtime`); board uses `useDeferredValue(state)`.
- `game.ai_action` exists in `GameRealtimeEventSchema` (`aiPlayerId`, `personality`, `action`) but is **never emitted** and unused by the client.
- `POST /api/games/:id/ai/step` is localhost/debug only; the play UI does not step AI.
- Result: especially in solo-vs-AI, intermediate AI seats are effectively invisible.

## Decisions

| Topic | Choice |
| --- | --- |
| Presentation fidelity | Material-change beats (not full micro-step theater, not summary-only) |
| Scope | Any game that includes AI seats (solo or mixed) |
| Who generates beats | Dedicated AI seats / permanent AI replacements (`ai:` actors), not timeout takeovers (v1) |
| Pacing owner | Client presentation queue |
| Canonical speed | Unchanged — DO/Worker AI loop stays tight (no watchability sleeps) |
| Material classification | Server/shared, deterministic from `(prev, next, action)` |
| Player control | Default paced + **Skip** to latest canonical interactive snapshot |
| Cross-client sync | Not required — each client paces independently |
| WS down | Degrade to jump-to-latest (playable); no fine-grained beats |

## Rejected alternatives

1. **Client-only material heuristics** — faster to ship, but clients can disagree on what was “worth watching”; harder to test and document.
2. **Server-paced AI loop (DO alarms)** — shared live timeline, but fights Workers (wall-clock delays, slower games for everyone, Skip becomes a server protocol).
3. **Summary-only recap** — cheap, close to timeout-takeover language, but does not deliver board “turn by turn” visibility.
4. **Full step playback + token animation** — desirable later; current board is occupancy-from-state with no move animation, so full micro-playback adds large scope for little v1 gain.

## Architecture

```
Human action / schedule
  → applyAction (engine)
  → runAiTurnLoop (fast, unchanged)
       → each AI apply:
            persist + broadcast game.action_applied
            classifyAiPresentationBeat(prev, next, action)
            if AI seat actor → broadcast game.ai_action (+ material fields)
  → GameRoom fan-out only (no pacing alarms)

Client
  canonicalState  ← snapshots / action_applied (legality, submissions)
  presentationState ← AiPresentationController queue over game.ai_action
  Board/HUD ← presentationState while watching
  Action panel ← enabled only when caught_up ∧ legal for viewer
```

### Invariants

1. Server remains sole authority; presentation never delays legality or other humans’ server-side ability to act.
2. While `watching`, the client must not submit primary turn actions from a stale view.
3. **Urgent** interactive moments for the viewer (auction bid still owed, pending inbound trade — `viewerHasUrgentObligation`) interrupt pacing immediately (same effect as Skip). Canonical “your turn” alone does **not** auto-Skip: a fast-finishing AI loop often advances canonical to the human’s turn before queued AI beats have drained, and force-catching up on `isMyTurn` would erase the presentation this feature exists to show. The queue drains into your turn naturally; controls unlock when presentation catches up.
4. Pacing failure must degrade to today’s behavior, never block play.

## Components

### Shared — `classifyAiPresentationBeat`

Pure helper: `(prev, next, action) → { material, reason, softTurnEnd? }`.

**Material (`material: true`) when any of:**

- Tile ownership change (buy, auction settle, trade, takeover, etc.)
- Auction opened or settled
- Capital transfer ≥ shared threshold (rent/tax/pool/card); v1 constant e.g. `50`
- Bankruptcy / elimination
- Syndicate form or break
- Win threshold crossed or disruption window triggered

**Soft turn-end:** AI seat ends its turn with no material events in that turn → one short “{name} ended turn” beat so seats do not vanish.

**Non-material:** roll-only, path choice, sub-threshold market fluff, uneventful declines — soft-advance (immediate or ~200ms coalesce).

### Worker — emit `game.ai_action`

Emit a presentation-only envelope (not a second copy of the applied `GameAction`):

- `type`, `gameId`, `aiPlayerId`, `personality`
- `material: boolean`
- `reason: MaterialReason | null` (canonical `AiPresentationReasonSchema`)
- `softTurnEnd: boolean` (always present)
- `stateVersion: number` (ordering against canonical updates)
- optional `logCursor` / `summary` / `displayName`

Do **not** include `action` on this event — clients pace from `material` / `reason` / `summary` / paired `game.action_applied` state. Private bid/trade terms must never ride this fan-out. Emit only when the applied actor is an AI seat (dedicated / permanent replacement), alongside existing persistence broadcasts from the AI step path.

### Web — `AiPresentationController`

Hook/module owned by the game session layer:

| Output | Meaning |
| --- | --- |
| `presentationState` | State the board/HUD render while pacing |
| `mode: watching \| caught_up` | Gates chrome and actions |
| `currentBeat` | Actor + summary for “Watching · {name}” |
| `skip()` | Drain queue; `presentationState := canonicalState` |

**Queue rules**

- Enqueue `game.ai_action` only in games that have AI seats, for AI seat actors.
- Material → ~1–1.5s pause + seat highlight + summary.
- Soft turn-end → ~0.6s pause.
- Non-material → apply immediately / coalesce.
- Skip and auto-catch-up are local-only (no server call in v1).
- Queue cap (e.g. 50) or lag budget (e.g. >8s behind canonical) → auto-Skip.

**UI chrome**

- “Watching · {name}” + **Skip** while `watching`.
- Active-player emphasis on the beat’s seat.
- Board/HUD bind to `presentationState`; actions require `caught_up`.

## Data flow

### Happy path

1. Viewer ends turn (or otherwise advances into AI work).
2. Server AI loop completes quickly; emits `game.ai_action` per AI seat apply.
3. Client updates `canonicalState` from authoritative events.
4. Controller enqueues beats; board walks material/soft beats on `presentationState`.
5. Queue empty **or** an urgent obligation (`viewerHasUrgentObligation`) → `caught_up`. Canonical “your turn” alone does not force this step.

### Skip

Clears queue, aligns presentation to canonical, enables actions if legal. Other clients unaffected.

### Mixed human + AI

- Each client paces independently while AI seats act.
- When the next actor is another human, do not imply “your turn.”
- If this viewer owes a bid/trade/response, interrupt pacing immediately.

### Edge cases

| Case | Behavior |
| --- | --- |
| WS gap / reorder | Order by `stateVersion`; drop older beats; on gap, catch up to canonical snapshot |
| Poll fallback (no WS) | Jump to latest snapshot; optional cheap log-delta summary later |
| HTTP action response pre-AI | Do not treat as presentation catch-up target; prefer canonical version ≥ live WS |
| Auction needs your bid | Material on open; auto-Skip into auction UI |
| Game over during AI | Material beat + catch up to game-over UI |
| Spectator | Same queue; existing spectator action restrictions |
| Multiple tabs | Independent queues (acceptable v1) |
| Invalid `game.ai_action` | Drop beat; continue on `action_applied` / snapshot |

## Error handling

- Classifier is pure and deterministic — no LLM, no I/O.
- Presentation bugs must not block submissions once caught up.
- Stale submit while watching: UI disabled; server rejects as today; client force catch-up.

## Testing

| Layer | Coverage |
| --- | --- |
| Unit (shared) | Classifier: buy; uneventful turn → soft end; rent above/below threshold; auction open/settle; non-AI actor → no emit path |
| Integration (worker) | AI step emits `game.ai_action` with expected `material` / `reason` |
| Unit (web) | Queue order; material vs soft; Skip; auto-catch-up on urgent obligation only (not bare my-turn); version gap → catch-up |
| Manual | Solo vs 3 AI: material seats visible, Skip returns control; mixed 2H+2AI: other human’s turn not mistaken for yours |

## Docs impact (implementation change set)

- `oligopoly_technical_plan.md` — document wired `game.ai_action`, material taxonomy, client presentation queue; explicit note that `GameRoom` does **not** pace for watchability.
- `oligopoly_game_rules.md` — short UX note under Solo/AI: meaningful opponent actions are shown briefly; Skip jumps to the next moment you can act.
- No live replay-API changes in v1.

## Success criteria

1. In a game with AI seats, after a human ends a turn they can tell which AI seats did something meaningful before control returns.
2. Skip reaches a legal interactive presentation for the viewer in lockstep with canonical state.
3. Mixed tables do not slow other humans’ server-side ability to act.
4. With WS disconnected, the game remains playable (jump-to-latest acceptable).

## Out of scope (v1)

- Token / path move animation
- Timeout-takeover pacing for human seats
- Synchronized watch clocks across clients
- Per-user speed preferences (Normal/Fast)
- Replay scrubber / post-hoc turn theater
- Slowing `runAiTurnLoop` with sleeps or DO alarms for watchability

## Implementation touchpoints (expected)

- `packages/shared` — `classifyAiPresentationBeat` + threshold constant
- `packages/validation` — extend `game.ai_action` schema (`material`, `reason`, `stateVersion`, …)
- `packages/worker/src/services/gameAi.ts` (+ persistence/notify path) — emit events
- `packages/web` — `AiPresentationController`, game session/realtime wiring, Watching/Skip chrome on game page
- `oligopoly_technical_plan.md`, `oligopoly_game_rules.md` — as above

## Informed by

- `oligopoly_technical_plan.md` — AI player protocol, `GameRoom` / `runAiTurnLoop`, unused `game.ai_action`
- `oligopoly_game_rules.md` — Solo vs AI, AI seats, action log / timeout summary language
- Current play path: tight AI loop + latest-snapshot client (root cause of the jump)
