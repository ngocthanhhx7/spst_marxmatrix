# MarxMatrix Screens 05–10: Scanner + Copilot Plan

**Goal:** Complete the analysis and grounded-research journeys as separate, traceable pages with explicit review states and source-context preservation.

**Constraints:** TDD first; preserve current routes and APIs unless a tested contract gap requires extension; never read/load `.env`; no automatic commit/push; isolated CSS to avoid concurrent conflicts.

## Screen 05 — Scanner History (`/scanner`)

- [ ] RED: heading, manual/PDF creation links, loading/error/empty states, accessible ledger, exact analysis continuation route.
- [ ] GREEN: show only fields the list API actually supplies; never invent coverage, pending counts, or frozen status.

## Screen 06 — Manual Analysis (`/scanner/new`)

- [ ] RED: visible context/input/assumption steps, history/PDF alternatives, pending submit state, exact detail redirect.
- [ ] GREEN: separate creation from detail visually while retaining validation, idempotency, calculation, and routing behavior.

## Screen 07 — Analysis Detail (`/scanner/:analysisId`)

- [ ] RED: pending-review count, explicit approve/reclassify/reject actions, PATCH payload, recalculation, immutable finalized state, finalize action readiness.
- [ ] GREEN: replace auto-commit classification selects with deliberate review controls and evidence timeline. Do not fabricate source links before document linkage is available.

## Screen 08 — PDF Evidence (`/scanner/extract`)

- [ ] RED: upload→parse→extract→review progress, queue POST target, status polling stop conditions, honest AI/simulated status, exact review-queue CTA after candidates load.
- [ ] GREEN: candidates enter the selected analysis as `pending_review`; success links to `/scanner/:analysisId?focus=pending`; remove any wording that implies automatic approval/application.

## Screen 09 — Copilot (`/copilot`)

- [ ] RED: citation links include source/chunk/session context, claims map to citations, back navigation restores question/selection/answer, retry reuses the exact request, no-source warnings have no false citations.
- [ ] GREEN: add a small in-memory navigation-session store and an evidence answer rail; retain current RAG request/response behavior.

## Screen 10 — Source Reader (`/documents/:documentId/pages/:pageNumber`)

- [ ] RED: course endpoint remains unchanged, source-aware back target, exact quote mark/fallback note, invalid page state, context query preservation.
- [ ] GREEN: highlight only exact normalized source text; if alignment fails, show the cited quote and an explicit alignment warning—never invent a highlight.

## Contract follow-ups after UI slices

- [ ] Expose analysis-to-document linkage needed for Scanner source links.
- [ ] Include `sourceChunkId` in extraction envelopes.
- [ ] Decide whether history summary metadata belongs in the list DTO; until then, keep the UI honest.
- [ ] Verify server-side finalize readiness and idempotency before enabling the final action.

## Verification

- [ ] Focused suites pass for each screen with `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test`.
- [ ] Full web tests, typecheck, and production build pass with Vite environment loading disabled.
- [ ] Desktop/mobile QA covers empty, loading, error, populated, pending-review, warning, and source-return states.
