# MarxMatrix Capital Arena Screens 11–15 Plan

**Goal:** Replace the static Arena preview with a complete authenticated room→lobby→live game→results→replay flow backed by the durable room/game services.

**Constraints:** TDD first; deterministic engine remains authoritative; REST is the recovery path; Socket.IO transports authenticated state/events only; no `.env` access; no automatic commit/push.

## Contract/API prerequisites

- [ ] Extend the room response with player objects `{ id, displayName, isBot, ready }`; current `playerIds`/`readyPlayerIds` alone cannot render an honest lobby.
- [ ] Add typed frontend Arena API adapters for create/get/join/leave/ready/demo-bot/start and game/get/events/replay/decision.
- [ ] Keep `expectedStateVersion` and decision idempotency keys mandatory in every mutation.
- [ ] Add an authenticated Socket.IO gateway for room/game updates with REST refetch on reconnect or version gaps.

## Screen 11 — Arena Hub (`/arena`)

- [ ] Replace local-only create/join notices and invented open/replay rows with real API states or an honest first-use state.
- [ ] Create room → `/arena/lobby/:code`; join code → same route after successful membership.
- [ ] Cover loading, validation, not-found, full, already-started, and network errors.

## Screen 12 — Lobby (`/arena/lobby/:code`)

- [ ] Render room code/copy action, host, player/ready/bot state, config summary, leave, ready, add demo bot, and start controls.
- [ ] Host-only and readiness rules mirror backend authorization; stale state triggers a refetch with a visible explanation.
- [ ] Start returns a game and navigates to `/arena/games/:gameId`.

## Screen 13 — Live Game (`/arena/games/:gameId`)

- [ ] Render phase/round/deadline, company state, market ledger, crisis banner, and the six decision fields from the shared contract.
- [ ] Submit with `round`, `expectedStateVersion`, and a generated idempotency key; lock controls after acceptance.
- [ ] Consume ordered Socket.IO events; recover via `GET game` + `GET events?after=` after disconnect/version gaps.

## Screen 14 — Round/Game Results

- [ ] For `round_result`, show deterministic deltas and causal event ledger before the next decision phase.
- [ ] For `game_over`, show ranking and learning summary without moralizing or inventing causes not present in events.
- [ ] Link to replay only when the durable game exists.

## Screen 15 — Replay (`/arena/replays/:gameId`)

- [ ] Fetch the replay endpoint and render an ordered, keyboard-navigable event timeline with round filters.
- [ ] Reconstruct company/market views from durable snapshots/events; show a controlled unavailable state for missing sequences.
- [ ] Preserve a clear return route to Arena Hub.

## Verification

- [ ] Controller/service/gateway contract tests cover auth, authorization, stale versions, idempotency, reconnect, and ordering.
- [ ] Frontend tests cover every default/loading/error/empty/live/locked/result state.
- [ ] Responsive and accessibility QA covers lobby tables, decision form, deadline announcements, crisis status, results, and replay timeline.
