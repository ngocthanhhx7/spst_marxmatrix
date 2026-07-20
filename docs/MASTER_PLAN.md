# MarxMatrix master plan

## Goal

Deliver a Vietnamese learning platform for Marxist political economy with a React SPA, NestJS API/worker, MongoDB persistence, shared Zod contracts, deterministic Scanner calculations, source-grounded Copilot, and server-authoritative Capital Arena.

## Delivery order

1. Workspace and research baseline (this task).
2. Shared contracts and API platform.
3. Identity and web shell.
4. Landing and manual Scanner.
5. Documents and leased jobs.
6. AI extraction.
7. Page-aware RAG and Copilot.
8. Deterministic Arena engine.
9. Rooms, games, and Socket.IO.
10. Arena browser experience.
11. Security, operations, and E2E.
12. Final evidence and reconciliation.

## Guardrails

- Node is targeted at 22.22.0 or newer; pnpm is pinned to 11.15.0.
- Shared transport schemas live in `packages/contracts`; Mongoose documents never cross the transport boundary.
- Live Gemini and Atlas are optional adapters. Tests and demo flows must not call them.
- Scanner and Arena calculations remain deterministic and reject non-finite values.
- Only `.env.example` files are committed. The user-owned untracked `gsap-skills/` directory is outside product scope and is preserved.

The approved source design and detailed task checklist remain in `docs/superpowers/specs/2026-07-19-marxmatrix-design.md` and `docs/superpowers/plans/2026-07-19-marxmatrix-implementation.md`.
