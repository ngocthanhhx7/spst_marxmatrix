# Auth Session Guard and Copilot Private Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated route access deterministic across reloads and add secure owner-scoped PDF upload/query support to Copilot.

**Architecture:** Keep the existing httpOnly refresh-cookie flow and guest route guard, adding a restoration gate and integration coverage for direct URLs. Add a private Copilot document scope that reuses GridFS, PDF parsing, and embedding jobs while extending vector retrieval with an explicit scope discriminator; the server derives ownership from `AuthGuard` and never trusts client owner/course identifiers for private sources.

**Tech Stack:** React, React Router, Zustand, TanStack Query, NestJS, Mongoose, MongoDB GridFS, Zod contracts, Vitest, Testing Library.

---

### Task 1: Lock the session-restoration behavior with failing tests

**Files:**
- Modify: `apps/web/src/app/session-restoration.spec.tsx`
- Modify: `apps/web/src/app/router.auth.spec.tsx`
- Create: `apps/web/src/app/session-gate.spec.tsx`

- [ ] **Step 1: Write the failing direct-route restoration test**

Add a test that starts the Zustand store at `unknown`, renders `Providers` and `AppRouter` at `/register`, stubs `POST /auth/refresh` with a valid session, then asserts the URL becomes `/dashboard` and the register form never appears after the refresh resolves.

```tsx
it('redirects a direct register URL after a successful cookie restoration', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(validSession), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  useSessionStore.setState({ status: 'unknown', accessToken: undefined, user: undefined });
  window.history.replaceState({}, '', '/register');
  render(<Providers><AppRouter /></Providers>);
  expect(screen.queryByRole('form', { name: 'Tạo tài khoản' })).not.toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: /Bảng điều khiển/i })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard');
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing app-level gate**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/app/session-gate.spec.tsx src/app/session-restoration.spec.tsx`

Expected: FAIL because the app does not yet expose a restoration barrier around the router.

- [ ] **Step 3: Add the guest-control regression**

Add a test where refresh returns `401`, wait for the session to become unauthenticated, and assert `/register` renders the registration form. This prevents the fix from blocking real guests.

- [ ] **Step 4: Run the focused tests again**

Run the same command. Expected: both the success and failure cases still fail only on the missing implementation, not on test setup errors.

### Task 2: Implement the session restoration gate

**Files:**
- Create: `apps/web/src/app/SessionRestorationGate.tsx`
- Modify: `apps/web/src/app/Application.tsx`
- Modify: `apps/web/src/features/auth/GuestOnlyRoute.tsx`
- Modify: `apps/web/src/app/session-restoration.spec.tsx`
- Modify: `apps/web/src/app/session-gate.spec.tsx`

- [ ] **Step 1: Implement the minimal gate**

The gate reads `useSessionStore`; while `status === 'unknown'` it renders `PageState` and otherwise renders children. `Application` wraps `AppRouter` with the gate. `GuestOnlyRoute` retains the redirect for already-authenticated in-memory sessions.

```tsx
export function SessionRestorationGate({ children }: { children: React.ReactNode }) {
  const status = useSessionStore((state) => state.status);
  if (status === 'unknown') return <PageState>Đang kiểm tra phiên đăng nhập…</PageState>;
  return <>{children}</>;
}
```

- [ ] **Step 2: Run the focused tests to verify green**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/app/session-gate.spec.tsx src/app/session-restoration.spec.tsx src/app/router.auth.spec.tsx`

Expected: PASS; successful refresh redirects to `/dashboard`, failed refresh renders guest forms, and in-memory auth remains protected.

- [ ] **Step 3: Refactor duplicate pending copy only after green**

Use one shared `PageState` message and keep all tests green.

### Task 3: Add private document scope contracts and persistence boundary

**Files:**
- Modify: `packages/contracts/src/rag.ts`
- Modify: `apps/api/src/documents/documents.service.ts`
- Create: `apps/api/src/rag/private-copilot-scope.resolver.ts`
- Test: `packages/contracts/src/rag.test.ts`
- Test: `apps/api/src/rag/private-copilot-scope.resolver.spec.ts`

- [ ] **Step 1: Write contract and persistence tests first**

Define the private query contract as `{ documentIds, mode, question }`; the browser cannot provide `ownerId` or a private corpus key. Keep document metadata free of internal GridFS identifiers.

- [ ] **Step 2: Run the contract/service tests and verify red**

Run: `pnpm --filter @marxmatrix/contracts exec vitest run src/copilot.test.ts; pnpm --filter @marxmatrix/api exec vitest run src/documents/documents.service.spec.ts`

Expected: FAIL because the new schema and private scope are absent.

- [ ] **Step 3: Implement the minimal scope fields and upload option**

Use the existing document model and upload pipeline with a server-owned `COPILOT01` course key. The private resolver always adds the authenticated `ownerId`, `type: 'textbook'`, and ready/non-deleted filters, so the shared key cannot expose another user's records.

- [ ] **Step 4: Run tests and verify green**

Run the commands from Step 2. Expected: PASS with existing document tests unchanged.

### Task 4: Implement owner-scoped private Copilot document API

**Files:**
- Create: `apps/api/src/rag/copilot-documents.controller.ts`
- Create: `apps/api/src/rag/copilot-documents.controller.spec.ts`
- Modify: `apps/api/src/rag/rag.module.ts`
- Modify: `apps/api/src/documents/documents.service.ts`
- Modify: `apps/api/src/documents/documents.controller.ts` to reuse the owner-scoped delete/status service methods without changing its public `/documents` contract
- Test: `apps/api/src/copilot/copilot-documents.controller.spec.ts`
- Test: `apps/api/src/copilot/copilot-documents.service.spec.ts`

- [ ] **Step 1: Write failing API tests**

Cover:

```ts
it('uploads one private PDF for the authenticated owner and queues parsing', async () => { /* owner from CurrentUser; body cannot set owner/course */ });
it('lists only ready private documents owned by the requester', async () => { /* second owner is excluded */ });
it('returns a safe not-found result for another owner document', async () => { /* no cross-account disclosure */ });
```

Use a mocked `DocumentsService`/`RagIngestionService` only at the controller boundary; test real ownership filters in the service with deterministic IDs.

- [ ] **Step 2: Run focused API tests and verify red**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/copilot`

Expected: FAIL because the module, controller, and service do not exist.

- [ ] **Step 3: Implement the controller and service**

Expose authenticated routes:

- `POST /api/v1/copilot/documents` — multipart field `file`, optional `title`; derive owner and private scope server-side; call the existing PDF upload/parse queue.
- `GET /api/v1/copilot/documents` — return owned private metadata, sorted newest first.
- `GET /api/v1/copilot/documents/:id` — return owned metadata/status.
- `DELETE /api/v1/copilot/documents/:id` — delete owned GridFS bytes and pages through the existing idempotent delete path.

Reject non-PDF files using the existing `validatePdfUpload` behavior and never accept `ownerId`, `courseId`, or corpus scope from the request body.

- [ ] **Step 4: Run focused API tests and verify green**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/copilot`

Expected: PASS, including cross-owner denial and validation errors.

### Task 5: Add private RAG ingestion and query boundaries

**Files:**
- Modify: `apps/api/src/rag/private-copilot-scope.resolver.ts`
- Modify: `apps/api/src/rag/rag.service.ts`
- Modify: `apps/api/src/rag/copilot-documents.controller.ts` to add the private `POST /copilot/query` route
- Modify: `packages/contracts/src/rag.ts`
- Test: `apps/api/src/copilot/private-corpus-scope.resolver.spec.ts`
- Test: `apps/api/src/copilot/private-rag.service.spec.ts`
- Test: `apps/api/src/rag/rag-ingestion.service.spec.ts`

- [ ] **Step 1: Write failing scope/query tests**

Define private query input with only `{ documentIds, mode, question }`; assert the resolver requires every ID to be ready and owned by the requester under `COPILOT01`. Assert retrieval includes the owner and server-controlled key in its filter.

- [ ] **Step 2: Run focused tests and verify red**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/copilot/private-corpus-scope.resolver.spec.ts src/copilot/private-rag.service.spec.ts`

Expected: FAIL because private scope is not implemented.

- [ ] **Step 3: Implement private ingestion/query**

Keep course RAG behavior unchanged. Generalize ingestion to accept a scope descriptor, then write chunks with the same owner/document/parse-token protections plus `corpusScope`. Add `POST /api/v1/copilot/query` that derives the requester owner, resolves private documents, retrieves only private chunks, and passes the existing citation firewall.

The private response keeps the existing `RagResponse` shape so the web citation workspace remains compatible. Course endpoints continue requiring `courseId` and published textbook records.

- [ ] **Step 4: Run focused tests and verify green**

Run the commands from Step 2 plus the existing RAG suite: `pnpm --filter @marxmatrix/api exec vitest run src/rag`

Expected: PASS with no course-corpus regression.

### Task 6: Add Copilot upload UI and client API

**Files:**
- Modify: `apps/web/src/features/copilot/copilot.api.ts`
- Modify: `apps/web/src/features/copilot/copilot.types.ts`
- Modify: `apps/web/src/features/copilot/CopilotPage.tsx`
- Modify: `apps/web/src/features/copilot/CopilotPage.css`
- Modify: `apps/web/src/features/copilot/CopilotPage.spec.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests for a labelled PDF picker, FormData upload, default title from filename, processing status text, ready document selection, retry/delete actions, and a disabled “Gửi câu hỏi” button while the selected document is processing.

- [ ] **Step 2: Run the Copilot tests and verify red**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/copilot/CopilotPage.spec.tsx`

Expected: FAIL because no upload control or private API methods exist.

- [ ] **Step 3: Implement client API and UI**

Add `copilotApi.privateDocuments`, `copilotApi.uploadDocument`, `copilotApi.deleteDocument`, and `copilotApi.askPrivate`. The upload form uses `FormData` with `file` and optional `title`; it never sends owner/course scope. Use TanStack Query invalidation/polling while status is `uploaded`, `parsing`, or `embedding`.

Render the upload control at the top of the Sources rail, show per-file state, retain only `ready` documents as selectable sources, and submit the private query shape without `courseId` when private sources are selected.

- [ ] **Step 4: Run UI tests and verify green**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/copilot/CopilotPage.spec.tsx`

Expected: PASS with accessible labels and no regression to course-source selection.

### Task 7: Full verification and browser QA

**Files:**
- Modify: `.env.example` only if a genuinely new non-secret configuration key is required; append it at the end of the relevant example file.
- No `.env` file may be read, printed, or modified.

- [ ] **Step 1: Run formatter and all tests**

Run: `pnpm run format` and `pnpm -r test:unit`.

- [ ] **Step 2: Run typecheck, lint, and production build**

Run: `pnpm --filter @marxmatrix/web typecheck; pnpm --filter @marxmatrix/web lint; pnpm --filter @marxmatrix/web build; pnpm --filter @marxmatrix/api typecheck; pnpm --filter @marxmatrix/api lint`.

- [ ] **Step 3: Browser-test auth behavior**

With a synthetic local account, verify login → reload → direct `/register` and `/login`; assert both settle at `/dashboard`. Verify a real guest still sees `/register` after refresh returns `401`. Record only URL, visible headings, and refresh HTTP status.

- [ ] **Step 4: Browser-test Copilot upload**

Upload a valid fixture PDF, observe processing → ready, select it, ask a question, open a citation, then verify another synthetic account cannot list/query/download it.

- [ ] **Step 5: Review diff and report progress**

Run `git diff --check` and `git status --short`; summarize changed files, test counts, storage behavior, and any remaining image/OCR scope. Do not commit `.env` files or expose secrets.
