# Oligopoly - Core Technical Plan

## Table of Contents

1. [Scope and Boundary Rules](#scope-and-boundary-rules)
2. [Repository Architecture](#repository-architecture)
3. [Environment Configuration](#environment-configuration)
4. [Backend Runtime and Route Contracts](#backend-runtime-and-route-contracts)
5. [User Profile API and Visibility Model](#user-profile-api-and-visibility-model)
6. [Negotiation, Trustworthiness, and Charter Engine Spec](#negotiation-trustworthiness-and-charter-engine-spec)
7. [Canonical Gameplay Registries](#canonical-gameplay-registries)
8. [Data Model and Persistence](#data-model-and-persistence)
9. [Testing Strategy](#testing-strategy)
10. [CI and Release Pipeline](#ci-and-release-pipeline)
11. [Docs Acceptance Gates](#docs-acceptance-gates)
12. [Implementation Phases](#implementation-phases)

---

## Scope and Boundary Rules

This document defines the runtime, contracts, and implementation scope of this repository.

Locked rules:

1. This runtime does not include deployment-specific auth, email delivery, or notification delivery implementations.
2. CI in this repository is limited to quality gates and package release.
3. Documentation here may describe extension interfaces, but not deployment secrets or infrastructure procedures.
5. Access control is authoritative on server routes; UI visibility is not security.

Scope matrix:

| Area | Included Here | Out of Scope Here |
|---|---|---|
| Game engine rules, deterministic simulation, board config | Yes | No |
| Validation schemas and protocol contracts | Yes | No |
| Worker runtime contracts and extension points | Yes | No |
| Web runtime contracts and client behavior | Yes | No |
| Deployment-specific auth, transactional email delivery, push/in-app delivery | No | Yes |
| Deployment infrastructure procedures and environment-specific CI workflows | No | Yes |

---

## Repository Architecture

```text
oligopoly/
  packages/
    validation/   # protocol contracts and error keys
    shared/       # engine, config, gameplay types
    worker/       # worker runtime + route contracts
    web/          # web client
  tests/
    unit/
    integration/
    e2e/
```

Package ownership:

| Package | Responsibility |
|---|---|
| `@oligopoly/validation` | Zod schemas for HTTP/WS payloads, shared error key contracts |
| `@oligopoly/shared` | Engine state transitions, config registries, rank/achievement math |
| `@oligopoly/worker` | Route contracts, Durable Object orchestration, persistence adapters |
| `@oligopoly/web` | Game UX and protocol client |

Composition rule:

- Deployment-specific integrations may extend these contracts through adapters and middleware.
- Contracts in this repository must remain stable and semver versioned.

---

## Environment Configuration

`.env.example` contract:

```bash
APP_NAME="Oligopoly Online"
APP_DOMAIN=oligopoly.online
APP_TAGLINE="A game of markets, alliances, and permanent commitment"

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CF_D1_DATABASE_ID_DEV=
CF_D1_DATABASE_ID_STAGING=
CF_D1_DATABASE_ID_PROD=
CF_KV_NAMESPACE_ID_DEV=
CF_KV_NAMESPACE_ID_STAGING=
CF_KV_NAMESPACE_ID_PROD=
CF_R2_BUCKET_DEV=oligopoly-assets-dev
CF_R2_BUCKET_STAGING=oligopoly-assets-staging
CF_R2_BUCKET_PROD=oligopoly-assets
CF_ANALYTICS_DATASET=oligopoly_events
CF_CALLS_APP_ID=
CF_CALLS_APP_SECRET=

ANTHROPIC_API_KEY=
ANTHROPIC_DAILY_BUDGET_ALERT=10.00
ANTHROPIC_MONTHLY_BUDGET_ALERT=200.00

ALLOWED_ORIGINS=http://localhost:5173
CSP_REPORT_URI=

VITE_API_URL=http://localhost:8787
VITE_WS_URL=ws://localhost:8787
VITE_CALLS_APP_ID=
VITE_APP_ENV=development
VITE_APP_NAME="Oligopoly Online"
VITE_APP_DOMAIN=oligopoly.online
```

Note:

- Deployment-specific secret contracts are intentionally excluded from this file.

---

## Backend Runtime and Route Contracts

Framework conventions:

- Hono framework.
- Route modules live in `packages/worker/src/routes/`.
- Durable Object classes live in `packages/worker/src/durable/`.
- Middleware lives in `packages/worker/src/middleware/`.

Global middleware order:

1. CORS allowlist middleware
2. Rate limit middleware
3. Ban cache middleware

Route contract table:

```text
# Auth (passkey / WebAuthn)
POST   /api/auth/register/options     # generate registration challenge
POST   /api/auth/register/verify      # verify registration, create user + session
POST   /api/auth/login/options        # generate authentication challenge
POST   /api/auth/login/verify         # verify authentication, create session
GET    /api/auth/session              # get current session info (Bearer token)
POST   /api/auth/logout               # destroy current session

GET    /api/game-config               # game config

# Lobbies
POST   /api/lobbies
GET    /api/lobbies
GET    /api/lobbies/mine
GET    /api/lobbies/:id
DELETE /api/lobbies/:id/leave
POST   /api/lobbies/:id/join
POST   /api/lobbies/:id/join/:token
POST   /api/lobbies/:id/invite
PUT    /api/lobbies/:id/settings
POST   /api/lobbies/:id/admin/:uid
DELETE /api/lobbies/:id/player/:uid
POST   /api/lobbies/:id/start
GET    /api/lobbies/:id/ws

# Games
GET    /api/games
GET    /api/games/:id
POST   /api/games/:id/action    # authoritative game action (GameAction JSON); uses `applyAction` / `normalizeGameState` in `@oligopoly/shared`
GET    /api/games/:id/state
GET    /api/games/:id/log
GET    /api/games/:id/replay
GET    /api/games/:id/ws
GET    /api/games/:id/spectate

# Users
GET    /api/users/check-username
GET    /api/users/:id
GET    /api/users/:id/viewer
GET    /api/users/me
PUT    /api/users/me
DELETE /api/users/me
GET    /api/users/me/games
GET    /api/users/me/achievements
GET    /api/users/me/rank
GET    /api/users/me/notifications
PUT    /api/users/me/locale
PUT    /api/users/me/theme
PUT    /api/users/me/notifications
PUT    /api/users/me/notifications/:gid
GET    /api/users/:id/presence

# Leaderboard
GET    /api/leaderboard/wins
GET    /api/leaderboard/completions

# Calls
POST   /api/calls/token

# Admin
GET    /api/admin/users
GET    /api/admin/users/:id
POST   /api/admin/users/:id/ban
DELETE /api/admin/users/:id/ban
POST   /api/admin/users/:id/impersonate
POST   /api/admin/users/:id/sessions
GET    /api/admin/games
GET    /api/admin/games/:id
GET    /api/admin/analytics
GET    /api/admin/analytics/costs
GET    /api/admin/audit-log
```

Lobby lifecycle invariants:

- The server enforces a maximum of 2 concurrent waiting-lobby memberships per authenticated user.
- Leaving the final player deletes the lobby immediately.
- If the host leaves a non-empty waiting lobby, host ownership transfers deterministically to the longest-tenured remaining admin; if none remain, the longest-tenured remaining player is promoted and becomes host.
- A lobby may include AI slots in addition to human members. Total human members plus AI slots must stay between 2 and 6 before start.
- A solo-vs-AI game is a normal lobby with exactly one human member and at least one AI slot; the server rejects one-human starts with no AI seats.

Realtime room contracts:

- `GET /api/lobbies/:id/ws` upgrades into the lobby Durable Object and emits `lobby.snapshot`, `lobby.updated`, and `lobby.presence` events.
- `GET /api/games/:id/ws` upgrades into the game Durable Object and emits `game.snapshot`, `game.action_applied`, `game.presence`, `game.timer`, and `game.ai_action` events.
- `GET /api/games/:id/spectate` uses the same game room with spectator-safe snapshots when spectator mode is enabled.
- HTTP routes remain canonical for snapshots and mutations; Durable Objects coordinate fan-out, timers, reconnects, and AI turn automation.
- All realtime events are schema-backed in `@oligopoly/validation`.

AI player protocol:

- AI seats are represented by server-owned player IDs prefixed with `ai:` and are stored in lobby settings, game state, and `games.player_ids_json`.
- Supported personalities are `loyalist`, `opportunist`, and `disruptor`.
- Deterministic rules-based AI is the baseline and must always return a legal action. LLM-assisted decisions are optional, gated by `ANTHROPIC_API_KEY`, daily/monthly budget checks, and deterministic fallback.
- Timeout takeover temporarily maps a human player to an AI runtime entry; kick replacement permanently replaces the human actor for the rest of the game.
- `GameRoom` is the sole AI orchestration owner: it schedules turn-timeout alarms from `settings.turnTimeout`, emits `game.timer`, applies timeout takeover on alarm, and auto-runs AI turns via `runAiTurnLoop` after canonical state writes (`game.schedule` or `game.action_applied`).
- Lobby start and kick replacement persist canonical state and emit `game.schedule` / `game.action_applied`; they do not call `runAiTurnLoop` directly.
- `DELETE /api/lobbies/:id/player/:uid` during `in_game` replaces the kicked human seat with a permanent AI replacement in the active game state via `kickInGamePlayerToAi`.
- `POST /api/games/:id/ai/step` remains available for manual/debug stepping only on `/dev`; the play UI does not expose AI stepping and the client does not auto-step AI turns.
- `GameDetailPage` loads board names from `GET /api/game-config`, shows live board/turn state over WebSocket, and exposes the core turn loop (roll, buy/decline, sealed auction bid/pass, path choice, develop/mortgage/redeem, end turn) for the signed-in participant.
- `GameDetailPage` uses `useGameSession` (HTTP load + `useGameRealtime` for state, log entries, and timers) and renders a perimeter board grid plus player table.
- All lobby JSON responses route through `buildLobbyResponse`, which attaches optional `gameId` when status is `in_game`.
- Lobby start navigates directly to `/games/:id` when a game is created.
- AI cost tracking uses KV keys shaped as `ai_cost:daily:{date}` and feeds admin analytics.

Auth consistency rule:

- Passkey (WebAuthn) is the base authentication mechanism.
- Session tokens are issued after successful registration or login and sent via `Authorization: Bearer <token>` header.
- The legacy `x-subject` header is still supported for backwards compatibility with integration tests.
- Challenges are stored in KV with a 5-minute TTL.
- Sessions are stored in D1 `auth_sessions` table with a 30-day TTL.
- Passkey credentials are stored in D1 `passkey_credentials` table.
- RP ID, RP name, and expected origin are configurable via environment variables (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`).

---

## User Profile API and Visibility Model

### Endpoint policy (final)

1. `GET /api/users/:id`
- No auth required.
- Returns public-safe profile fields filtered by target user's visibility settings.

2. `GET /api/users/:id/viewer`
- Auth required.
- Returns viewer-aware profile payload with fields visible to signed-in viewers and context flags (for example, whether viewer shares a game with target).

3. `GET /api/users/me`
- Auth required.
- Returns owner private profile payload.

### Types

```typescript
export type VisibilitySetting = "public" | "authenticated" | "private";

export interface ProfileVisibility {
  rank: VisibilitySetting;                // default: public
  careerStats: VisibilitySetting;         // default: public
  achievements: VisibilitySetting;        // default: public
  recentGames: VisibilitySetting;         // default: public
  onlineStatus: VisibilitySetting;        // default: authenticated
  lastSeen: VisibilitySetting;            // default: authenticated
  favoriteSector: VisibilitySetting;      // default: public
}

export interface PublicUserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  rankTier?: number;
  rankTitle?: string;
  careerStats?: {
    gamesPlayed: number;
    wins: number;
    winRate: number;
    tradesCompleted: number;
    auctionsWon: number;
    favoriteSector: string | null;
  };
  achievements?: Array<{ id: string; unlockedAt: number }>;
  recentGames?: Array<{ gameId: string; result: "won" | "lost" | "drew" | "kicked"; endedAt: number }>;
  onlineStatus?: "online" | "offline";
  lastSeenAt?: number;
}

export interface ViewerUserProfile extends PublicUserProfile {
  viewerContext: {
    isSelf: boolean;
    sharedActiveGame: boolean;
    sharedSyndicate: boolean;
  };
}

export interface PrivateUserProfile extends ViewerUserProfile {
  email: string;
  fullName: string | null;
  locale: string;
  timezone: string;
  currency: string;
  country: string | null;
  themePreference: string;
  notificationPrefs: NotificationPrefs;
  profileVisibility: ProfileVisibility;
  usernameLastChangedAt: number | null;
}
```

### Visibility precedence

Field inclusion algorithm:

1. If request is owner (`/me`), include owner fields.
2. Else if request is viewer endpoint, include fields where visibility is `public` or `authenticated`.
3. Else public endpoint includes fields where visibility is `public` only.
4. Server applies visibility filtering after DB query and before serialization.
5. `username` and `avatarUrl` are always returned.

### Settings contract

```typescript
export interface UpdateUserSettingsInput {
  username?: string;
  locale?: string;
  timezone?: string;
  currency?: string;
  themePreference?: string;
  notificationPrefs?: NotificationPrefs;
  profileVisibility?: Partial<ProfileVisibility>;
}
```

Validation rules:

- Unknown visibility keys rejected.
- Visibility values outside enum rejected.
- Partial updates merge with existing `profileVisibility` object.

---

## Negotiation, Trustworthiness, and Charter Engine Spec

### State model

```typescript
export interface NegotiationThread {
  id: string;
  gameId: string;
  createdBy: string;
  partyIds: string[];
  status: "open" | "agreed" | "expired" | "cancelled";
  startedRound: number;
  expiresAfterRound: number; // startedRound + 3
  visibility: "private" | "open";
  messages: NegotiationMessage[];
  proposedContract?: BindingContract;
  handshakeRecord?: HandshakeAgreement;
}

export interface TrustworthinessState {
  playerId: string;
  score: number;              // 0..10
  lastUpdatedAt: number;
}

export interface BindingContract {
  id: string;
  gameId: string;
  partyA: string;
  partyB: string;
  terms: BindingContractTerm[];
  status: "active" | "fulfilled" | "expired" | "breached";
  startsRound: number;
  expiresRound: number | null;
  signedAt: number;
  fulfilledAt: number | null;
  breachedAt: number | null;
}

export type BindingContractTerm =
  | { type: "cannot_sell_tile"; tileId: string; boundPlayerId: string }
  | { type: "cannot_bid_auction"; tileId: string; boundPlayerId: string }
  | { type: "must_pay_capital"; amount: number; fromPlayerId: string; toPlayerId: string; dueByRound: number }
  | { type: "revenue_share"; percentage: number; fromPlayerId: string; toPlayerId: string; durationRounds: number };

export interface HandshakeAgreement {
  id: string;
  gameId: string;
  partyIds: string[];
  summary: string;
  signedAt: number;
  settledAt: number | null;
  brokenBy: string | null;
}

export interface SyndicateCharter {
  syndicateId: string;
  governanceModel: "asset_weighted" | "equal_vote";
  deadlockResolution: "public_dice_roll";
  revenueSplit: Array<{ playerId: string; pct: number }>;
  contributionWeights: {
    assetScorePct: number;
    revenueScorePct: number;
    negotiationCreditPct: number;
  };
  dissolutionClause: {
    trustPenaltyPerMember: number;    // default 2
    requiresUnanimousVote: true;
  };
  ratifiedAt: number;
}
```

### Validation rules

Negotiation:

- Negotiation creation costs 1 AP.
- Thread auto-expires at `startedRound + 3` if unresolved.
- On expiry, each participating player gets trustworthiness `-1`.

Binding contract:

- Offerer trustworthiness must be `>= 5`.
- If offerer trustworthiness is `<= 4`, return typed error `negotiation.binding_not_allowed_low_trust`.
- Contract term validation rejects contradictory or duplicate terms.
- Contract cannot reference tiles not owned by a party at signing time.

Handshake:

- Logged but not engine-enforced.
- Manual breach event applies trustworthiness `-2` to breaking player.

Trustworthiness:

- Range clamped to `0..10`.
- Starting value `7`.
- Score bands:
  - `8..10`: no restrictions
  - `5..7`: standard
  - `0..4`: cannot create binding contracts

Founding charter:

- Formation requires each founding member spends 1 AP.
- `revenueSplit` percentages must sum to 100.
- `contributionWeights` percentages must sum to 100.
- Joining a syndicate requires vote according to governance model.
- Dissolution requires unanimous vote and applies trust penalty from charter clause.

### Enforcement paths

1. UI pre-check disables invalid actions from known active contracts.
2. Server authoritative check in game action handler re-evaluates all active contracts.
3. On violation attempt:
- Reject action.
- Emit typed error event.
- Write action log entry with reason.
4. Contract expiry and fulfillment are evaluated at round transition.

### Typed errors (required keys)

```text
negotiation.binding_not_allowed_low_trust
negotiation.contract_invalid_terms
negotiation.contract_tile_not_owned
negotiation.thread_expired
negotiation.action_blocked_by_contract
negotiation.charter_invalid_split
negotiation.charter_invalid_weights
negotiation.syndicate_dissolution_requires_unanimous_vote
```

---

## Canonical Gameplay Registries

Source of truth: `oligopoly_game_rules.md` canonical appendix IDs.

### Optional rules registry

| ID | Name | Required Rank Tier |
|---|---|---|
| `double_rent_district` | Double Rent District | 1 |
| `speed_market` | Speed Market | 1 |
| `no_regulation` | No Regulation | 1 |
| `disruption_blitz` | Disruption Blitz | 1 |
| `auction_everything` | Auction Everything | 1 |
| `open_negotiation` | Open Negotiation | 1 |
| `debt_spiral` | Debt Spiral | 1 |
| `hostile_takeover` | Hostile Takeover | 3 |
| `market_manipulation` | Market Manipulation | 3 |
| `insider_trading` | Insider Trading | 3 |

### Optional market event card registry

| ID | Name | Required Rank Tier |
|---|---|---|
| `optional_leveraged_buyout` | Leveraged Buyout | 1 |
| `optional_corporate_espionage` | Corporate Espionage | 1 |
| `optional_short_squeeze` | Short Squeeze | 1 |
| `optional_supply_chain_crisis` | Supply Chain Crisis | 1 |
| `optional_sovereign_wealth_fund` | Sovereign Wealth Fund | 1 |
| `optional_venture_capital_boom` | Venture Capital Boom | 1 |
| `optional_algorithmic_flash_trade` | Algorithmic Flash Trade | 1 |
| `optional_regulatory_amnesty` | Regulatory Amnesty | 1 |
| `optional_dark_pool_transfer` | Dark Pool Transfer | 2 |
| `optional_synthetic_cdo` | Synthetic CDO | 2 |
| `optional_black_swan_event` | Black Swan Event | 2 |

### Achievement registry

| ID | Name | Rank Points |
|---|---|---|
| `first_steps` | First Steps | 5 |
| `full_house` | Full House | 10 |
| `century_club` | Century Club | 50 |
| `champion` | Champion | 10 |
| `dynasty` | Dynasty | 25 |
| `monopolist` | Monopolist | 30 |
| `deal_maker` | Deal Maker | 10 |
| `auctioneer` | Auctioneer | 15 |
| `sniper` | Sniper | 20 |
| `diagonal_shortcut` | Diagonal Shortcut | 10 |
| `flash_survivor` | Flash Survivor | 25 |
| `kingmaker` | Kingmaker | 15 |
| `loan_shark` | Loan Shark | 15 |
| `oligarchs_gambit` | Oligarch's Gambit | 20 |
| `perfect_attendance` | Perfect Attendance | 15 |

Contract rule:

- These IDs are immutable keys used by API payloads, persistence, telemetry, and localization namespaces.

---

## Data Model and Persistence

D1 tables required for this plan:

- `users`
- `user_settings`
- `user_visibility`
- `user_ranks`
- `achievements`
- `passkey_credentials`
- `auth_sessions`
- `negotiation_threads`
- `negotiation_messages`
- `binding_contracts`
- `binding_contract_terms`
- `handshake_agreements`
- `syndicate_charters`
- `trustworthiness`
- `admin_audit_log`

KV keys:

```text
user:{userId}:presence
game:{gameId}:meta
game:{gameId}:presence
lobbies:public:cursor:{cursor}
leaderboard:wins
leaderboard:completions
ratelimit:auth:{ip}
ratelimit:write:{subject}
ratelimit:read:{subject}
ai_cost:daily:{date}
webauthn:challenge:register:{challenge}
webauthn:challenge:login:{challenge}
```

No deployment-specific delivery or session keys are defined in this plan.

### Game engine and `games.state_json`

- Persisted state is a superset of the public `GameState` contract: it may include **`affinityAssignments`** (server-only map). Per-player responses replace that map with **`myAffinityCardId`** (see `GET /api/games/:id/state`).
- **`applyAction`** in `@oligopoly/shared` (`gameStateMachine`) is the primary transition for **`POST /api/games/:id/action`**. Typed game errors use **`GameErrorKeys`** in `@oligopoly/validation`.
- **`applyGameAction`** (`gameReducer`) is a thin adapter over **`applyAction`** for tests/tools that expect `{ ok, state | errorKey }`; HTTP routes still call **`applyAction`** directly.
- **`roll_dice`** may omit **`result`** on the wire; the worker injects **`pathChoiceDie`** where required by the state machine before applying the action.
- **Declined tile purchase** enters **`waiting_for_auction_bids`** with **`pendingAuction`**. All non-eliminated players in turn order are eligible; **`auction_bid`** / **`auction_pass`** bypass the current-turn check. Auction mode comes from **`settings.auctionType`**: **`sealed_bids`** (default), **`open_bids`**, or **`live_bidding`**. Highest bid wins; sealed ties trigger additional sealed rounds with **`tieBreakMinBid`**, open/live ties resolve by dice roll. All-pass leaves the tile unowned (pass is rejected in live mode). **`resumePhase`** restores **`action`**, **`rolling_doubles`**, or **`waiting_for_roll`** depending on trigger context.
- Sealed bid amounts are redacted in HTTP/WS player views (`toClientGameState`) and stripped from broadcast snapshots (`publicStateForBroadcast`); only the viewer's own **`mySubmission`** is returned until settlement reveals all bids in the action log. Open and live bids remain visible in **`pendingAuction.submissions`** for all viewers.
- Per-player **`auction_bid`** log entries omit bid amounts for sealed auctions until **`auction_settled`** reveals all submissions simultaneously. Open/live **`auction_bid`** logs include amounts immediately.
- **`GameRoom`** AI loop uses **`findNextAiAuctionActor`** / **`chooseAiActionForPlayer`** to submit bids for AI seats without a submission. **`GameRoom.syncAfterStateChange`** runs the AI loop during **`waiting_for_auction_bids`** whenever an AI seat still owes a submission, not only on the current turn actor.
- Sealed auctions honor **`settings.auctionBidWindow`**: **`pendingAuction.bidDeadlineAt`** is set at decline/tie-break start; **`closeAuctionBidWindowIfReady`** auto-passes missing bidders and enters **`waiting_for_auction_settle`** when the bid window closes (or when all eligible players submit). **`settings.auctionSettleDelay`** sets **`pendingAuction.settleDeadlineAt`**; **`finalizeAuctionSettleIfReady`** reveals bids and settles after the delay. Open/live auctions skip the settle phase and settle immediately when the bid window closes. Live auctions extend **`bidDeadlineAt`** by **`settings.auctionExtensionWindow`** whenever a strictly higher bid arrives; rebids are allowed and pass actions are rejected. **`GameRoom`** alarms on bid/settle deadlines via **`syncGameRoomTimer`** (`timerKind`: `auction_bids` | `auction_settle`).
- **Market events:** games start in **`waiting_for_market_event`**. The first player submits **`draw_market_event`** at each round start (including round 1); resolution advances to **`waiting_for_roll`**. Landing on **MARKET EVENT** tiles auto-draws during tile resolution without changing phase. Deck state lives in **`marketEventDeckRemaining`** / **`marketEventDiscard`**; **`buildMarketEventDeck`** shuffles deterministically from **`gameId`**, merges **`settings.optionalMarketEventCardIds`** into the active deck, and accepts both standard and optional IDs in **`settings.marketEventDeckCardIds`**. Card resolution is centralized in **`marketEvents.ts`** (`drawAndResolveMarketEvent`, `resolveMarketEventCard`).
- **Disruption cards:** landing on **DISRUPTION CARD** draws from **`disruptionDeckRemaining`** (shuffled at game start via **`buildDisruptionDeck`**). **`disruption_blitz`** optional rule draws/resolves 2 cards instead of 1 on disruption tiles. **FLASH CRASH** applies percentage losses plus a windfall to the lander. **BLACK MARKET RELAY** draws 2, keeps one deterministically, resolves it, and discards the other unseen; with **`disruption_blitz`**, it draws 4, keeps 2, resolves both, and discards the rest unseen. Resolution lives in **`disruptionEvents.ts`** (`blackMarketRelayParams`). Card effect text is served from **`disruptionDeck.ts`** (`description` per card). Shared deterministic shuffle helpers live in **`deckShuffle.ts`**.
- **Industry Affinity (partial wiring):** **`affinityAssignments`** is server-only at game start. **`affinity.ts`** exposes lookup helpers and effect application. **Lean Manufacturing** discounts development costs in **`develop_tile`**. **PropTech Pioneer** discounts mortgage redemption in **`redeem_tile`**. **Last Mile Logistics** awards **`DIAGONAL_TRAVERSE_BONUS`** (30 Capital) when a player exits the Diagonal Express at the far end during movement. **AI Pioneer** discounts acquisition costs on Emerging Tech / Big Tech tiles. **Quantitative Analyst**, **ESG Fund Manager**, and **Streaming Pioneer** award bank-subsidized rent bonuses. **Spectrum Holder** boosts dual-utility rent. **Crypto Arbitrageur** adds 25% to Free Market pool collection via **`collectFreeMarketPool`**. **Founding Partner** makes **`form_syndicate`** cost 0 AP. **Consumer Insights** uses **`use_affinity`** (0 AP, once per game) to reveal an opponent's capital. **Biotech IP** uses **`use_affinity`** during **`waiting_for_disruption_nullify`** to nullify one harmful disruption card (once per game). Active affinities require **`usedAffinityIds`** on player state.
- **Win detection + post-game completion:** **`winResolution.ts`** centralizes threshold checks via **`applyWinIfThresholdCrossed`**, invoked after tile purchases, auction settlements, and syndicate formation. **`processGameCompletion`** (worker) updates **`user_stats`**, **`user_ranks`**, achievements, and KV leaderboards when **`game_over`** is persisted.
- **Syndicates:** **`form_syndicate`** creates a permanent syndicate (2+ members, 1 AP unless Founding Partner) with optional **Founding Charter** payload (revenue split + contribution weights validated via **`charter.ts`**). **`syndicate.ts`** provides shared ownership helpers. Syndicate wins at 60% market value trigger a **final round** (one last turn per non-winning player/syndicate) before **`game_over`** via **`winResolution.ts`**.
- **Syndicate coordination phase:** After each full player round, the engine enters **`syndicate_coordination`** (Phase 3). **`coordinationPhase.ts`** applies debt-spiral interest, rate-card market-pressure resets, and negotiation thread expiry. Players acknowledge with **`end_coordination`**; syndicate admins may **`set_rate_card`** during this phase. **`rateCards.ts`** applies multipliers in **`rentResolution.ts`** when the syndicate controls a full sector plus hub.
- **Foreclosure / unpaid rent:** **`rentPayment.ts`** settles rent with partial payment when capital is insufficient. Unless **`debt_spiral`** is enabled (principal debt + 10% interest per round at coordination end), **`foreclosure.ts`** auctions mortgaged tiles (`trigger: foreclosure`) and applies proceeds to debt; the bank absorbs any remaining shortfall.
- **Negotiation (in-game):** **`start_negotiation`** (1 AP), **`propose_contract`**, **`sign_contract`**, **`break_handshake`** wired in **`negotiationActions.ts`** with in-state threads and trust penalties on expiry. **`propose_contract`** registers **`activeContracts`** with proposer signature; counterparty signs via **`sign_contract`**. Binding contract enforcement uses **`negotiation.ts`** `isActionBlockedByContracts`.
- **Web client (game detail):** **`GamePlayControls`** exposes coordination (**`end_coordination`**, **`set_rate_card`**), advanced action-phase controls (**`form_syndicate`**, **`start_negotiation`**, **`propose_contract`**, **`sign_contract`**, **`pay_debt`**, **`initiate_auction`**, **`use_affinity`**, disruption nullify) via **`CoordinationControls`** and **`ActionPhaseExtras`**.
- **Player-initiated auctions:** **`initiate_auction`** (1 AP) sells an owned un-mortgaged tile with configurable reserve (default 50% acquisition cost); seller cannot bid; proceeds go to seller (`trigger: player_initiated`).
- **Lobby ready flags:** **`POST/DELETE /api/lobbies/:id/ready`**; game start requires all human lobby members ready (`lobby.not_all_ready` otherwise). Migration **`0008_lobby_player_ready.sql`**.
- **Optional rules:** **`optionalRulesEngine.ts`** exposes **`isOptionalRuleEnabled`**. **`no_regulation`** disables regulation penalties. **`auction_everything`** skips buy windows and starts auctions with reserve 1. **`double_rent_district`** upgrades qualifying sector-control rent to 3× base when the controller also owns the adjacent hub and the visitor does not control that sector. **`debt_spiral`** accrues interest at coordination phase end. **`hostile_takeover`** and **`market_manipulation`** are handled in **`optionalRuleActions.ts`** (`hostile_takeover`, `market_manipulation` game actions). **`insider_trading`** adds **`waiting_for_insider_peek`** on round-start draws only; discard returns the peeked card to the deck bottom (`insider_discard_market_event` / `insider_keep_market_event`). **`open_negotiation`** marks negotiation threads `visibility: open` and exposes all threads in **`toClientGameState`**.
- **Optional market event cards:** optional card handlers resolve in **`optionalMarketEventEffects.ts`** (invoked from `marketEvents.ts`) for leveraged buyout, corporate espionage, short squeeze, supply chain crisis, sovereign wealth fund, venture capital boom, algorithmic flash trade, regulatory amnesty, dark pool transfer, synthetic CDO, and black swan event.
- **Handshakes:** **`handshakeActions.ts`** implements **`propose_handshake`**, **`sign_handshake`**, **`break_handshake`** with in-state **`handshakeAgreements`**.
- **Syndicate votes:** **`syndicateVoteActions.ts`** implements unanimous **`call_vote`** (`voteType: dissolve_syndicate`).
- **User game history:** **`GET /api/users/me/games`** queries the **`games`** table by participant id.

---

## Testing Strategy

Unit tests:

- Engine deterministic outcomes for movement, auctions, mortgages, negotiation enforcement.
- Trustworthiness transitions and clamps.
- Charter validation sums and governance behavior.
- Profile visibility filtering.
- Optional rules/cards/achievement registry integrity.

Integration tests:

- Route schema validation and typed error payloads.
- Dual profile endpoint behavior under public/viewer/owner contexts.
- Contract violation rejection path and action log emission.

E2E tests:

- Profile visibility toggles reflected in public profile endpoint.
- Negotiation flow: open -> contract sign -> blocked violating action.
- Thread expiry penalties after three rounds.

Contract parity tests:

- Registry IDs in technical plan must match IDs in game rules appendix.

---

## CI and Release Pipeline

CI responsibilities:

1. Package build parity checks (`ci:build`)
2. Verify gate (`ci:verify`): typecheck, lint, unit tests with coverage, integration tests
3. Release build and publish for public packages (`@oligopoly/shared`, `@oligopoly/validation`)

Example `ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run ci:local
```

Example `release.yml`:

```yaml
name: Release Packages

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run ci:verify
      - run: pnpm -r --filter "@oligopoly/shared" --filter "@oligopoly/validation" publish --access public --provenance --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Docs Acceptance Gates

### Anchor and link checks

- Internal heading anchors must resolve.
- File links must point to existing files.
- No dead table-of-contents anchors.

### Cross-doc consistency checklist

1. Scope matrix matches developer guide workflow.
2. Route contract table includes final profile endpoint policy.
3. Rule/card/achievement IDs exactly match game rules appendix.
4. No unresolved placeholder markers remain in handoff-critical sections.

---

## Implementation Phases

Phase 1:

- Publish this technical plan.
- Lock registry IDs and endpoint contracts.

Phase 2:

- Implement profile visibility schema and filtering.
- Implement viewer endpoint behavior.
- Add negotiation/trustworthiness/charter persistence and validation.

Phase 3:

- Add contract parity tests and docs checks in CI.
- Final handoff review with rule appendix parity verification.
