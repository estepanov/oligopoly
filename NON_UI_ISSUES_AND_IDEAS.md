# Non-UI Issues and Ideas

This file tracks product, API, engine, and local-development ideas discovered
while improving the first-time player UI. These are intentionally outside the
current UI-only change set.

## Product and Contracts

- Enforce private-by-default lobby creation consistently across docs, API
  defaults, and UI defaults so first-time hosts do not accidentally publish a
  table.
- Add player display names or usernames to lobby responses. The current lobby
  payload exposes `userId`, which forces the web client to either show raw IDs
  or invent temporary labels.
- Implement the documented 8-character invite code path in addition to full
  invite links/tokens.
- Decide whether lobby voice/video from the game rules is in scope for the
  current release; it is documented but not currently exposed in the inspected
  lobby UI.
- Track first-game onboarding state: first login, first lobby created, invite
  copied, second seat joined, all humans ready, game started, and first turn
  completed.

## Local Development and Testing

- Add a deterministic two-player local smoke script that creates two dev-login
  users, creates a lobby, joins player two, marks both players ready, starts the
  game, and verifies both game views can fetch state.
- Align local CORS defaults for alternate Vite ports. A test frontend on
  `127.0.0.1:5176` with a Worker on `8788` could render but dev-login failed
  because the request origin was not accepted by the Worker.
- Fix local browser auth for `127.0.0.1` Vite origins. During this audit,
  direct bearer-auth API calls to Worker `8789` returned valid game summary,
  state, and log data, but the browser route from `127.0.0.1:5191` repeatedly
  fell back to unauthorized game-state/log requests after CORS preflights.
- Add a browser smoke test for the two-player first-game path with isolated
  browser contexts, not shared local storage.
- Add telemetry for first-game dropoff: login started, lobby created, invite
  generated/copied, join attempted, ready toggled, game start attempted, first
  turn action submitted.

## Engine and Gameplay Follow-Ups

- Review whether auction defaults provide enough beginner guardrails at the API
  layer, especially minimum bid and pass behavior for sealed/open/live modes.
- Consider a server-provided "next action summary" field for game state so all
  clients can share consistent turn coaching without duplicating phase copy.
- Explore whether lobby AI seat names should be generated before game start so
  lobby rosters can show stable friendly names instead of generic AI labels.
