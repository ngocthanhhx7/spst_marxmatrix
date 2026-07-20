# PDF Processing Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retired embedding model, prevent documents from remaining in `embedding` after job failure, improve queue/indexing throughput, and explain unsupported PDFs clearly to users.

**Architecture:** Move the Gemini adapter and public configuration to `gemini-embedding-2` with its documented retrieval prefixes, keep document state transitions owner/version fenced in `RagIngestionService`, preserve retryability in the embedding job handler, replace unbounded embedding fan-out with an ordered four-worker pool, make `WorkerRunner` back off only when idle, and map existing safe document error codes to Vietnamese Copilot guidance.

**Tech Stack:** NestJS, Mongoose, TypeScript, React, Vitest, Testing Library.

---

### Task 1: Migrate the embedding adapter

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/rag/deterministic-embedder.ts`
- Modify: `apps/api/src/rag/gemini-rag.provider.spec.ts`
- Modify: `apps/api/src/rag/gemini-rag.provider.ts`

- [ ] Add failing tests for the `gemini-embedding-2` default and its query/document retrieval request shapes.
- [ ] Remove the unsupported Embedding 1 `taskType` request field and apply Google's documented retrieval prefixes.
- [ ] Replace the invalid 64-dimensional live request with Google's recommended 768 dimensions, keep the deterministic adapter consistent, and update affected tests/index documentation.
- [ ] Append the replacement setting and re-index warning at the end of `.env.example`; do not read or modify any real `.env` file.
- [ ] Run the focused configuration/provider tests and confirm GREEN.

### Task 2: Preserve document/job state consistency

**Files:**
- Modify: `apps/api/src/rag/rag-ingestion.service.spec.ts`
- Modify: `apps/api/src/rag/rag-ingestion.service.ts`
- Modify: `apps/api/src/rag/embed-document.handler.spec.ts`
- Modify: `apps/api/src/rag/embed-document.handler.ts`

- [ ] Add a failing test where the embedder rejects and assert an update from `embedding` to `failed` with `EMBEDDING_FAILED` and a safe message.
- [ ] Run `pnpm --filter @marxmatrix/api exec vitest run src/rag/rag-ingestion.service.spec.ts` and confirm RED.
- [ ] Wrap the claimed indexing phase with fenced failure persistence, rethrowing the original failure for queue retry handling.
- [ ] Add a failing test that a `failed` document is reclaimable only when `errorCode` is `EMBEDDING_FAILED`.
- [ ] Extend eligibility and claim filters minimally; run the focused test and confirm GREEN.
- [ ] Add a failing handler test proving `EMBEDDING_FAILED` retains its default retryable policy, remove the forced terminal override, and confirm GREEN.

### Task 3: Drain queue work and bound embedding concurrency

**Files:**
- Modify: `apps/api/src/jobs/worker-runner.spec.ts`
- Modify: `apps/api/src/jobs/worker-runner.ts`
- Modify: `apps/api/src/rag/rag-ingestion.service.spec.ts`
- Modify: `apps/api/src/rag/rag-ingestion.service.ts`

- [ ] Add a fake-timer worker test proving a second available job is claimed before `pollMs`; confirm RED.
- [ ] Change `poll` to sleep only when `runOnce()` reports no work or throws a claim-level error; confirm the worker test GREEN.
- [ ] Add an embedder test with more than four drafts that tracks peak active calls and output order; confirm RED against unbounded `Promise.all`.
- [ ] Implement a small ordered concurrency-four helper and confirm peak concurrency is at most four with the focused test GREEN.

### Task 4: Explain document failures in Copilot

**Files:**
- Modify: `apps/web/src/features/copilot/CopilotPage.spec.tsx`
- Modify: `apps/web/src/features/copilot/CopilotPage.tsx`

- [ ] Add failing UI tests for `OCR_UNSUPPORTED`, `PDF_PARSE_FAILED`, and `EMBEDDING_FAILED` guidance.
- [ ] Implement one pure safe-code-to-Vietnamese-message mapping; do not expose raw provider/parser errors.
- [ ] Run `pnpm --filter @marxmatrix/web exec vitest run src/features/copilot/CopilotPage.spec.tsx` and confirm GREEN.

### Task 5: Verify

**Files:**
- Verify all changed files.

- [ ] Format changed files with Prettier.
- [ ] Run API and web focused tests.
- [ ] Run API/web lint and typecheck.
- [ ] Run `pnpm run verify`; expect all operations tests, lint, typecheck, unit tests, and builds to exit 0.
- [ ] Commit with `fix(documents): keep processing state and queue progress consistent`.
