# Education and Finance AI Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a private multimodal chatbot that persists conversations, understands uploaded images, and answers only within academic education and finance.

**Architecture:** Add a bounded `ChatModule` beside RAG in the NestJS modular monolith, with separate Mongoose records, a private GridFS image bucket, a Gemini multimodal adapter, and a fail-closed input/output scope policy. Add a protected React `/chat` workspace using React Query and an authenticated NDJSON transport that streams progress events but releases only a fully validated final answer.

**Tech Stack:** TypeScript 6, Zod, NestJS 11, Mongoose/MongoDB GridFS, `@google/genai`, React 19, React Query 5, React Router 8, Vitest, React Testing Library, `react-markdown`, nginx, systemd, AWS EC2.

---

## Scope and execution rules

- Implement tasks in order with the red-green-refactor cycle shown in every task.
- Run each stated failing test before adding its production implementation.
- Keep Copilot/RAG behavior unchanged; chat must not import RAG schemas or claim PDF citations.
- Never print or commit runtime `.env` files. During the authorized production deploy, modify only the named non-secret chat keys and leave the existing Gemini key untouched.
- Every database query carrying a conversation, message, attachment, or run identifier must also include `ownerId`.
- Commit after each task. Push and deploy only after Task 12 passes.

## File map

### Shared contracts

- Create `packages/contracts/src/chat.ts`: chat transport schemas, stream event schema, and inferred browser-safe types.
- Create `packages/contracts/src/chat.test.ts`: schema boundaries and public-data tests.
- Modify `packages/contracts/src/index.ts`: export chat contracts.

### API configuration and module

- Modify `apps/api/src/config/env.schema.ts` and `env.schema.spec.ts`: validated chat enablement, model, timeout, retries, context, run age, and rate limit.
- Modify `apps/api/.env.example` and `deploy/ec2/ENVIRONMENT.md`: tracked configuration documentation only.
- Create `apps/api/src/chat/chat.module.ts`; modify `apps/api/src/app.module.ts`: register the bounded module.

### API persistence and images

- Create `apps/api/src/chat/schemas/chat-conversation.schema.ts`: owner-scoped conversation plus active-run fence.
- Create `apps/api/src/chat/schemas/chat-message.schema.ts`: ordered messages and attempt state.
- Create `apps/api/src/chat/schemas/chat-attachment.schema.ts`: private image metadata; hide GridFS identifiers.
- Create `apps/api/src/chat/chat-image-validation.ts` and `.spec.ts`: extension, MIME, magic bytes, count, and size checks.
- Create `apps/api/src/chat/chat-image-storage.service.ts` and `.spec.ts`: separate `${GRIDFS_BUCKET_NAME}_chat` bucket.

### API model boundary and orchestration

- Create `apps/api/src/chat/chat-provider.ts`: provider-neutral inputs, output types, and DI token.
- Create `apps/api/src/chat/gemini-chat.provider.ts` and `.spec.ts`: structured classification/generation, images, timeout, cancellation, quota-aware retry, and redacted usage logging.
- Create `apps/api/src/chat/chat-scope-policy.ts` and `.spec.ts`: fixed clarification/refusal and output gate.
- Create `apps/api/src/chat/chat-run-registry.ts` and `.spec.ts`: one live `AbortController` per persisted run.
- Create `apps/api/src/chat/chat-rate-limiter.ts` and `.spec.ts`: configurable per-user fixed-window limiter for the current single API instance.
- Create `apps/api/src/chat/chat.service.ts` and `.spec.ts`: CRUD, cursor pagination, ownership, context selection, attachment compensation, run fencing, cancellation, retry, and regeneration.
- Create `apps/api/src/chat/chat.controller.ts` and `.spec.ts`: authenticated REST/multipart endpoints and NDJSON terminal guarantees.
- Create `apps/api/test/integration/chat.integration.spec.ts`: real Mongo/GridFS HTTP ownership and cleanup coverage.

### Web transport and UI

- Modify `apps/web/src/shared/api/client.ts` and `client.spec.ts`: add authenticated raw-response requests with the existing single-flight refresh behavior.
- Create `apps/web/src/features/chat/chat.api.ts`, `chat.api.spec.ts`, and `chat.types.ts`: FormData creation, NDJSON parsing, cancellation, and contract parsing.
- Create `apps/web/src/features/chat/ConversationSidebar.tsx`, `MessageThread.tsx`, `SafeMarkdown.tsx`, `ChatComposer.tsx`, and focused specs.
- Create `apps/web/src/features/chat/ChatPage.tsx`, `ChatPage.spec.tsx`, and `ChatPage.css`: React Query orchestration and responsive workspace.
- Modify `apps/web/src/app/router.tsx`, `apps/web/src/shared/ui/AppShell.tsx`, and `AppShell.spec.tsx`: protected lazy route and navigation.
- Modify `apps/web/package.json` and `pnpm-lock.yaml`: add `react-markdown` with the package manager.

### Deployment

- Modify `deploy/ec2/nginx-marxmatrix-tls.conf` and the matching nginx template in `deploy/ec2/update.sh`: disable buffering only for chat message/regeneration streams.
- Modify `deploy/ec2/update.test.sh`: assert the chat streaming location survives updater rendering.

---

### Task 1: Define browser-safe chat contracts

**Files:**

- Create: `packages/contracts/src/chat.ts`
- Create: `packages/contracts/src/chat.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_IMAGES,
  chatConversationDetailSchema,
  chatMessageInputSchema,
  chatStreamEventSchema
} from './chat.js';

describe('chat contracts', () => {
  it('accepts textless image messages but rejects completely empty messages', () => {
    expect(chatMessageInputSchema.parse({ text: '', imageCount: 1 })).toEqual({
      text: '',
      imageCount: 1
    });
    expect(() => chatMessageInputSchema.parse({ text: ' ', imageCount: 0 })).toThrow();
    expect(() =>
      chatMessageInputSchema.parse({ text: 'question', imageCount: CHAT_MAX_IMAGES + 1 })
    ).toThrow();
  });

  it('accepts only one typed terminal NDJSON event', () => {
    expect(
      chatStreamEventSchema.parse({
        type: 'final',
        runId: '550e8400-e29b-41d4-a716-446655440000',
        message: {
          id: '507f1f77bcf86cd799439011',
          conversationId: '507f1f77bcf86cd799439012',
          role: 'assistant',
          text: 'Lãi kép là...',
          attachments: [],
          status: 'completed',
          scope: 'finance',
          reasonCode: null,
          replyToMessageId: '507f1f77bcf86cd799439013',
          createdAt: '2026-07-21T00:00:00.000Z'
        }
      }).type
    ).toBe('final');
  });

  it('never exposes owner or GridFS identifiers', () => {
    const parsed = chatConversationDetailSchema.parse({
      id: '507f1f77bcf86cd799439012',
      title: 'Finance lesson',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
      messages: [],
      nextCursor: null
    });
    expect(parsed).not.toHaveProperty('ownerId');
    expect(JSON.stringify(parsed)).not.toContain('gridFsFileId');
  });
});
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `pnpm --filter @marxmatrix/contracts exec vitest run src/chat.test.ts`

Expected: FAIL because `./chat.js` does not exist.

- [ ] **Step 3: Implement the contract module and export it**

Create schemas with these exact public names and limits:

```ts
import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema, uuidSchema } from './common.js';

export const CHAT_MAX_IMAGES = 4;
export const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_MULTIPART_BYTES = 20 * 1024 * 1024;
export const chatScopeSchema = z.enum([
  'education',
  'finance',
  'mixed',
  'ambiguous',
  'out_of_scope'
]);
export const chatMessageStatusSchema = z.enum([
  'pending',
  'completed',
  'refused',
  'failed',
  'cancelled'
]);
export const chatReasonCodeSchema = z.enum(['scope_ambiguous', 'out_of_scope']).nullable();
export const chatMessageInputSchema = z
  .object({
    text: z.string().trim().max(8_000).default(''),
    imageCount: z.number().int().min(0).max(CHAT_MAX_IMAGES)
  })
  .refine(({ text, imageCount }) => text.length > 0 || imageCount > 0, {
    message: 'A message requires text or at least one image.'
  });
export const chatAttachmentSchema = z.object({
  id: objectIdSchema,
  originalFileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive().max(CHAT_MAX_IMAGE_BYTES)
});
export const chatMessageSchema = z.object({
  id: objectIdSchema,
  conversationId: objectIdSchema,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  attachments: z.array(chatAttachmentSchema).max(CHAT_MAX_IMAGES),
  status: chatMessageStatusSchema,
  scope: chatScopeSchema.nullable(),
  reasonCode: chatReasonCodeSchema,
  replyToMessageId: objectIdSchema.nullable(),
  createdAt: isoDateTimeSchema
});
export const chatConversationSummarySchema = z.object({
  id: objectIdSchema,
  title: z.string().min(1).max(80),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export const chatConversationDetailSchema = chatConversationSummarySchema.extend({
  messages: z.array(chatMessageSchema),
  nextCursor: z.string().min(1).max(256).nullable()
});
export const chatConversationListSchema = z.object({
  conversations: z.array(chatConversationSummarySchema),
  nextCursor: z.string().min(1).max(256).nullable()
});
export const chatCursorQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
const progress = z.object({
  type: z.enum(['checking_scope', 'reading_images', 'generating']),
  runId: uuidSchema
});
const terminal = z.discriminatedUnion('type', [
  z.object({ type: z.literal('final'), runId: uuidSchema, message: chatMessageSchema }),
  z.object({ type: z.literal('refusal'), runId: uuidSchema, message: chatMessageSchema }),
  z.object({
    type: z.literal('error'),
    runId: uuidSchema,
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000)
  })
]);
export const chatStreamEventSchema = z.union([progress, terminal]);

export type ChatScope = z.infer<typeof chatScopeSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatConversationSummary = z.infer<typeof chatConversationSummarySchema>;
export type ChatConversationDetail = z.infer<typeof chatConversationDetailSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
```

Add `export * from './chat.js';` to `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run contracts tests and typecheck**

Run: `pnpm --filter @marxmatrix/contracts exec vitest run src/chat.test.ts && pnpm --filter @marxmatrix/contracts typecheck`

Expected: PASS with 3 chat tests and zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/chat.ts packages/contracts/src/chat.test.ts packages/contracts/src/index.ts
git commit -m "feat(chat): define conversation contracts"
```

### Task 2: Add validated chat runtime configuration

**Files:**

- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write failing environment tests**

```ts
it('requires a multimodal model when chat is enabled', () => {
  expect(() => parseEnvironment({ ...validEnvironment, CHAT_ENABLED: 'true' })).toThrow();
  expect(
    parseEnvironment({
      ...validEnvironment,
      CHAT_ENABLED: 'true',
      GEMINI_CHAT_MODEL: 'gemini-test'
    }).GEMINI_CHAT_MODEL
  ).toBe('gemini-test');
});

it('bounds chat safety and resource settings', () => {
  expect(() =>
    parseEnvironment({ ...validEnvironment, CHAT_RATE_LIMIT_PER_MINUTE: '0' })
  ).toThrow();
  expect(() => parseEnvironment({ ...validEnvironment, CHAT_MAX_CONTEXT_MESSAGES: '101' })).toThrow();
});
```

Extend `validEnvironment` with explicit safe test values so later integration suites inherit one stable shape.

- [ ] **Step 2: Run the config spec and confirm it fails**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/config/env.schema.spec.ts`

Expected: FAIL because chat environment keys are not parsed.

- [ ] **Step 3: Add bounded environment fields and the enablement refinement**

```ts
CHAT_ENABLED: booleanFromString.default(false),
GEMINI_CHAT_MODEL: z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
),
CHAT_AI_TIMEOUT_MS: numericString.max(120_000).default(60_000),
CHAT_AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
CHAT_MAX_CONTEXT_MESSAGES: numericString.max(100).default(20),
CHAT_MAX_CONTEXT_BYTES: numericString.max(500_000).default(100_000),
CHAT_MAX_RUN_AGE_MS: numericString.min(30_000).max(600_000).default(180_000),
CHAT_RATE_LIMIT_PER_MINUTE: numericString.max(100).default(10)
```

Inside `superRefine`, add:

```ts
if (environment.CHAT_ENABLED && !environment.GEMINI_CHAT_MODEL)
  context.addIssue({
    code: 'custom',
    path: ['GEMINI_CHAT_MODEL'],
    message: 'GEMINI_CHAT_MODEL is required when CHAT_ENABLED=true.'
  });
```

Document every field in `apps/api/.env.example` without placing a real key in the file.

- [ ] **Step 4: Run config tests, lint, and typecheck**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/config/env.schema.spec.ts && pnpm --filter @marxmatrix/api lint && pnpm --filter @marxmatrix/api typecheck`

Expected: PASS with no lint or type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts apps/api/.env.example
git commit -m "feat(chat): validate runtime configuration"
```

### Task 3: Persist conversations, messages, and private images

**Files:**

- Create: `apps/api/src/chat/schemas/chat-conversation.schema.ts`
- Create: `apps/api/src/chat/schemas/chat-message.schema.ts`
- Create: `apps/api/src/chat/schemas/chat-attachment.schema.ts`
- Create: `apps/api/src/chat/chat-image-validation.ts`
- Create: `apps/api/src/chat/chat-image-validation.spec.ts`
- Create: `apps/api/src/chat/chat-image-storage.service.ts`
- Create: `apps/api/src/chat/chat-image-storage.service.spec.ts`

- [ ] **Step 1: Write failing image validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateChatImages } from './chat-image-validation.js';

const png = {
  originalname: 'chart.png',
  mimetype: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
};

describe('validateChatImages', () => {
  it('accepts matching PNG bytes and canonicalizes metadata', () => {
    expect(validateChatImages([png])).toEqual([
      expect.objectContaining({ originalFileName: 'chart.png', mimeType: 'image/png' })
    ]);
  });

  it('rejects mismatched signatures and a fifth image', () => {
    expect(() => validateChatImages([{ ...png, mimetype: 'image/jpeg' }])).toThrowError(
      expect.objectContaining({ code: 'CHAT_IMAGE_INVALID' })
    );
    expect(() => validateChatImages(Array.from({ length: 5 }, () => png))).toThrowError(
      expect.objectContaining({ code: 'CHAT_IMAGE_INVALID' })
    );
  });
});
```

- [ ] **Step 2: Run the image tests and confirm the red state**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat-image-validation.spec.ts`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement signatures and Mongoose records**

Implement `validateChatImages(files)` with these exact detection rules:

```ts
const signatures = {
  'image/jpeg': (value: Buffer) =>
    value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff,
  'image/png': (value: Buffer) =>
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).equals(value.subarray(0, 8)),
  'image/webp': (value: Buffer) =>
    value.subarray(0, 4).toString('ascii') === 'RIFF' &&
    value.subarray(8, 12).toString('ascii') === 'WEBP'
} as const;
```

Return `{ buffer, originalFileName, mimeType, byteSize, checksum }`; sanitize filename with `basename`, enforce the matching extension, `CHAT_MAX_IMAGES`, `CHAT_MAX_IMAGE_BYTES`, and `CHAT_MAX_MULTIPART_BYTES`, and throw stable `DomainError` codes.

Create focused schemas following the existing `DocumentRecord` decorator pattern. Required fields are:

```ts
// ChatConversationRecord
ownerId: Types.ObjectId;
title: string;
activeRunId: string | null;
activeRunStartedAt: Date | null;
deletionState: 'active' | 'deleted';
deletedAt: Date | null;
createdAt: Date;
updatedAt: Date;

// ChatMessageRecord
ownerId: Types.ObjectId;
conversationId: Types.ObjectId;
role: 'user' | 'assistant';
text: string;
attachmentIds: Types.ObjectId[];
status: 'pending' | 'completed' | 'refused' | 'failed' | 'cancelled';
scope: ChatScope | null;
reasonCode: 'scope_ambiguous' | 'out_of_scope' | null;
replyToMessageId: Types.ObjectId | null;
providerModel: string | null;
promptVersion: string | null;
usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
createdAt: Date;
updatedAt: Date;

// ChatAttachmentRecord
ownerId: Types.ObjectId;
conversationId: Types.ObjectId;
messageId: Types.ObjectId;
gridFsFileId: Types.ObjectId; // select: false
originalFileName: string;
mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
byteSize: number;
checksum: string;
createdAt: Date;
updatedAt: Date;
```

Add indexes from the approved design, including `{ ownerId: 1, updatedAt: -1, _id: -1 }`, `{ ownerId: 1, conversationId: 1, createdAt: 1, _id: 1 }`, and `{ ownerId: 1, conversationId: 1 }`.

- [ ] **Step 4: Write a failing GridFS storage test**

```ts
it('uses a separate private chat bucket and records only redacted metadata', async () => {
  let bucketName: string | undefined;
  let uploadOptions: { metadata?: unknown } = {};
  installGridFsMock({
    onConstruct: (options) => {
      bucketName = options.bucketName;
    },
    onUpload: (options) => {
      uploadOptions = options;
    }
  });
  const service = new ChatImageStorageService(connection, config);
  const stored = await service.store({
    ownerId: '507f1f77bcf86cd799439011',
    checksum: 'a'.repeat(64),
    originalFileName: 'chart.png',
    mimeType: 'image/png',
    buffer: Buffer.from('bytes')
  });
  expect(stored.id).toBeDefined();
  expect(bucketName).toBe('uploads_chat');
  expect(uploadOptions.metadata).toEqual({
    ownerId: '507f1f77bcf86cd799439011',
    checksum: 'a'.repeat(64),
    contentType: 'image/png'
  });
});
```

- [ ] **Step 5: Implement private GridFS storage and cleanup**

Use `new GridFSBucket(connection.db, { bucketName: `${GRIDFS_BUCKET_NAME}_chat` })` and expose only:

```ts
store(input: ChatImageStoreInput): Promise<{ id: ObjectId }>;
read(id: ObjectId): Promise<Buffer>;
remove(id: ObjectId): Promise<void>;
```

Do not deduplicate across messages: retry must reference existing attachment records rather than silently sharing bytes. Convert duplicate delete/not-found errors into idempotent success only in the deletion path.

- [ ] **Step 6: Run focused API tests**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat-image-validation.spec.ts src/chat/chat-image-storage.service.spec.ts`

Expected: PASS with no unhandled streams.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/chat/schemas apps/api/src/chat/chat-image-validation.ts apps/api/src/chat/chat-image-validation.spec.ts apps/api/src/chat/chat-image-storage.service.ts apps/api/src/chat/chat-image-storage.service.spec.ts
git commit -m "feat(chat): persist private image conversations"
```

### Task 4: Implement the Gemini multimodal boundary and scope policy

**Files:**

- Create: `apps/api/src/chat/chat-provider.ts`
- Create: `apps/api/src/chat/gemini-chat.provider.ts`
- Create: `apps/api/src/chat/gemini-chat.provider.spec.ts`
- Create: `apps/api/src/chat/chat-scope-policy.ts`
- Create: `apps/api/src/chat/chat-scope-policy.spec.ts`

- [ ] **Step 1: Write failing provider tests for images, structured output, and redaction**

```ts
it('sends ordered text and inline images without logging private content', async () => {
  const logs: Record<string, unknown>[] = [];
  const generateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify({ answer: 'Đây là biểu đồ lãi kép.', scope: 'finance' }),
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5, totalTokenCount: 9 }
  });
  const result = await provider(client({ generateContent }), logs).generate({
    text: 'Đọc biểu đồ',
    history: [],
    images: [{ mimeType: 'image/png', bytes: Buffer.from('private-image') }]
  });
  expect(result).toMatchObject({ answer: 'Đây là biểu đồ lãi kép.', scope: 'finance' });
  expect(generateContent.mock.calls[0]?.[0].contents[0].parts).toEqual([
    { text: 'Đọc biểu đồ' },
    { inlineData: { mimeType: 'image/png', data: Buffer.from('private-image').toString('base64') } }
  ]);
  expect(JSON.stringify(logs)).not.toContain('Đọc biểu đồ');
  expect(JSON.stringify(logs)).not.toContain('private-image');
});

it('honors Gemini quota retry delay and propagates cancellation', async () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const generateContent = vi
    .fn()
    .mockRejectedValueOnce({ status: 429, message: 'Please retry in 1.5s.' })
    .mockResolvedValueOnce({ text: JSON.stringify({ domain: 'finance', confidence: 1 }) });
  await provider(client({ generateContent }), [], { sleep, maxRetries: 1 }).classify({
    text: 'Lãi kép là gì?',
    history: [],
    images: []
  });
  expect(sleep).toHaveBeenCalledWith(1_750);
});
```

- [ ] **Step 2: Run provider tests and confirm they fail**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/gemini-chat.provider.spec.ts`

Expected: FAIL because the chat provider files do not exist.

- [ ] **Step 3: Define the provider-neutral interface**

```ts
import type { ChatScope } from '@marxmatrix/contracts';

export const CHAT_PROVIDER = Symbol('CHAT_PROVIDER');
export type ChatImagePart = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Buffer;
};
export type ChatHistoryTurn = { role: 'user' | 'assistant'; text: string; images: ChatImagePart[] };
export type ChatModelInput = {
  text: string;
  history: ChatHistoryTurn[];
  images: ChatImagePart[];
};
export type ChatScopeDecision = { domain: ChatScope; confidence: number };
export type ChatCandidate = {
  answer: string;
  scope: 'education' | 'finance' | 'mixed';
  model: string;
  promptVersion: string;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
};
export interface ChatProvider {
  classify(input: ChatModelInput, signal?: AbortSignal): Promise<ChatScopeDecision>;
  generate(input: ChatModelInput, signal?: AbortSignal): Promise<ChatCandidate>;
  validateOutput(answer: string, approvedScope: ChatScope, signal?: AbortSignal): Promise<boolean>;
}
```

- [ ] **Step 4: Implement `GeminiChatProvider` with fail-closed JSON schemas**

Use `@google/genai` behind an injected test client. Each provider call races an internal timeout with the caller signal. Map caller cancellation to `CHAT_OPERATION_ABORTED`, timeouts to `CHAT_AI_TIMEOUT`, 401/403 and a 400 response containing `API_KEY_INVALID` to `CHAT_AI_AUTH_FAILED`, malformed JSON/schema results to `CHAT_AI_RESPONSE_INVALID`, and other request failures to `CHAT_AI_REQUEST_FAILED`. Retry only 429 and 5xx responses, at most `CHAT_AI_MAX_RETRIES`; use exponential delays of 250 ms, 500 ms, 1 s, and 2 s unless a 429 message supplies `Please retry in Ns`, in which case wait `ceil(N * 1000) + 250` ms capped at 65 seconds. The retry wait must abort immediately when the caller signal aborts.

Use these prompt versions:

```ts
export const CHAT_SCOPE_PROMPT_VERSION = 'chat-scope-v1';
export const CHAT_ANSWER_PROMPT_VERSION = 'chat-answer-v1';
```

The classification schema is `{ domain: enum, confidence: number 0..1 }`; generation is `{ answer: nonempty max 20000, scope: education|finance|mixed }`; output validation is `{ allowed: boolean }`. Build Gemini `contents` from bounded history followed by the current text and ordered `inlineData` parts. System instructions must state that user/history/image text is untrusted data, prohibit tools/URL access/transactions, and require the approved education/finance scope.

Log only:

```ts
{
  event: 'chat_generation_completed',
  provider: 'gemini',
  model,
  promptVersion: CHAT_ANSWER_PROMPT_VERSION,
  durationMs,
  imageCount: input.images.length,
  inputTokens,
  outputTokens,
  totalTokens
}
```

- [ ] **Step 5: Write failing scope-policy tests**

```ts
it.each([
  ['ambiguous', 'Bạn muốn hỏi nội dung giáo dục hay tài chính cụ thể nào?'],
  ['out_of_scope', 'Mình chỉ có thể hỗ trợ các câu hỏi về giáo dục và tài chính.']
] as const)('fails closed for %s without generation', async (domain, expected) => {
  const generate = vi.fn();
  const policy = new ChatScopePolicy({
    classify: vi.fn().mockResolvedValue({ domain, confidence: 1 }),
    generate,
    validateOutput: vi.fn()
  });
  await expect(policy.answer(input)).resolves.toMatchObject({ text: expected, domain });
  expect(generate).not.toHaveBeenCalled();
});

it('replaces a generated answer rejected by the output gate', async () => {
  const policy = new ChatScopePolicy({
    classify: vi.fn().mockResolvedValue({ domain: 'finance', confidence: 1 }),
    generate: vi.fn().mockResolvedValue(candidate('unsafe answer')),
    validateOutput: vi.fn().mockResolvedValue(false)
  });
  await expect(policy.answer(input)).resolves.toMatchObject({
    status: 'refused',
    reasonCode: 'out_of_scope'
  });
});
```

- [ ] **Step 6: Implement `ChatScopePolicy.answer`**

Return one of these provider-independent results:

```ts
type ChatPolicyResult =
  | { status: 'completed'; text: string; scope: 'education' | 'finance' | 'mixed'; candidate: ChatCandidate }
  | { status: 'refused'; text: string; scope: 'ambiguous'; reasonCode: 'scope_ambiguous' }
  | { status: 'refused'; text: string; scope: 'out_of_scope'; reasonCode: 'out_of_scope' };
```

Classify first, skip generation for ambiguous/out-of-scope, generate only approved scopes, then call `validateOutput` before returning any candidate text.

- [ ] **Step 7: Run provider/policy tests, lint, and typecheck**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/gemini-chat.provider.spec.ts src/chat/chat-scope-policy.spec.ts && pnpm --filter @marxmatrix/api lint && pnpm --filter @marxmatrix/api typecheck`

Expected: PASS; logs contain no prompt, answer, filename, bytes, or key.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/chat/chat-provider.ts apps/api/src/chat/gemini-chat.provider.ts apps/api/src/chat/gemini-chat.provider.spec.ts apps/api/src/chat/chat-scope-policy.ts apps/api/src/chat/chat-scope-policy.spec.ts
git commit -m "feat(chat): add scoped multimodal Gemini provider"
```

### Task 5: Implement owner-scoped conversation CRUD and context selection

**Files:**

- Create: `apps/api/src/chat/chat.service.ts`
- Create: `apps/api/src/chat/chat.service.spec.ts`
- Create: `apps/api/src/chat/chat-cursor.ts`
- Create: `apps/api/src/chat/chat-cursor.spec.ts`

- [ ] **Step 1: Write failing CRUD and isolation tests**

```ts
it('lists and opens only conversations owned by the requester', async () => {
  const service = serviceWithFixtures();
  await service.create(ownerId);
  await expect(service.list(ownerId, { limit: 20 })).resolves.toMatchObject({
    conversations: [expect.objectContaining({ title: 'Cuộc trò chuyện mới' })]
  });
  await expect(service.get(otherOwnerId, conversationId, { limit: 20 })).rejects.toMatchObject({
    code: 'CHAT_CONVERSATION_NOT_FOUND'
  });
});

it('selects newest complete turns within message, byte, and four-image limits', async () => {
  const context = await serviceWithFixtures({ maxMessages: 3, maxBytes: 1_000 }).context(
    ownerId,
    conversationId,
    currentMessageId
  );
  expect(context.turns).toHaveLength(3);
  expect(context.turns.flatMap((turn) => turn.images)).toHaveLength(4);
  expect(context.turns.map((turn) => turn.text)).not.toContain('cancelled attempt');
});
```

- [ ] **Step 2: Run the service spec and confirm it fails**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat-service.spec.ts src/chat/chat-cursor.spec.ts`

Expected: FAIL because service and cursor codec do not exist.

- [ ] **Step 3: Implement an opaque cursor codec**

```ts
export type ChatCursorValue = { timestamp: string; id: string };

export function encodeChatCursor(value: ChatCursorValue): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeChatCursor(value: string): ChatCursorValue {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    return chatCursorValueSchema.parse(parsed);
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Chat cursor is invalid.', 400);
  }
}
```

Use `(updatedAt, _id)` for conversation pagination and `(createdAt, _id)` for message pagination so equal timestamps remain stable.

- [ ] **Step 4: Implement CRUD, public mapping, and context selection**

Expose these methods with all identifiers owner-filtered:

```ts
create(ownerId: string): Promise<ChatConversationSummary>;
list(ownerId: string, query: ChatCursorQuery): Promise<ChatConversationList>;
get(ownerId: string, conversationId: string, query: ChatCursorQuery): Promise<ChatConversationDetail>;
delete(ownerId: string, conversationId: string): Promise<void>;
context(ownerId: string, conversationId: string, currentMessageId: string): Promise<ChatModelInput>;
```

Derive the first title using:

```ts
function titleFrom(text: string, hasImages: boolean): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized.slice(0, 80) : hasImages ? 'Cuộc trò chuyện có hình ảnh' : 'Cuộc trò chuyện mới';
}
```

Deletion must atomically change an owned active conversation to `deletionState: 'deleted'`, cancel any live run, remove owned attachment bytes, then delete attachment/message records while retaining the owner-scoped tombstone. List/get ignore tombstones. A repeat delete by the same owner returns 204 from the tombstone; a cross-owner identifier returns `CHAT_CONVERSATION_NOT_FOUND`.

- [ ] **Step 5: Run CRUD/context tests**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat.service.spec.ts src/chat/chat-cursor.spec.ts`

Expected: PASS with owner isolation and stable cursors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/chat/chat.service.ts apps/api/src/chat/chat.service.spec.ts apps/api/src/chat/chat-cursor.ts apps/api/src/chat/chat-cursor.spec.ts
git commit -m "feat(chat): add private conversation persistence"
```

### Task 6: Add run fencing, cancellation, rate limiting, and answer orchestration

**Files:**

- Create: `apps/api/src/chat/chat-run-registry.ts`
- Create: `apps/api/src/chat/chat-run-registry.spec.ts`
- Create: `apps/api/src/chat/chat-rate-limiter.ts`
- Create: `apps/api/src/chat/chat-rate-limiter.spec.ts`
- Modify: `apps/api/src/chat/chat.service.ts`
- Modify: `apps/api/src/chat/chat.service.spec.ts`

- [ ] **Step 1: Write failing registry and limiter tests**

```ts
it('cancels only the matching owner run and removes settled controllers', () => {
  const registry = new ChatRunRegistry();
  const controller = registry.register(ownerId, runId);
  expect(registry.cancel(otherOwnerId, runId)).toBe(false);
  expect(registry.cancel(ownerId, runId)).toBe(true);
  expect(controller.signal.aborted).toBe(true);
  registry.release(ownerId, runId);
  expect(registry.cancel(ownerId, runId)).toBe(false);
});

it('limits the eleventh request in one minute and resets next window', () => {
  const limiter = new ChatRateLimiter(configWith({ limit: 10 }), () => now);
  for (let index = 0; index < 10; index += 1) limiter.consume(ownerId);
  expect(() => limiter.consume(ownerId)).toThrowError(expect.objectContaining({ statusCode: 429 }));
  now = new Date(now.getTime() + 60_001);
  expect(() => limiter.consume(ownerId)).not.toThrow();
});
```

- [ ] **Step 2: Run registry/limiter tests and confirm they fail**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat-run-registry.spec.ts src/chat/chat-rate-limiter.spec.ts`

Expected: FAIL because both classes do not exist.

- [ ] **Step 3: Implement the small isolated services**

`ChatRunRegistry` uses `Map<ownerId:runId, AbortController>` and exposes `register`, `cancel`, and `release`. `ChatRateLimiter` uses a per-owner fixed window, reads `CHAT_RATE_LIMIT_PER_MINUTE`, prunes expired entries during consumption, and throws `DomainError('CHAT_RATE_LIMITED', ..., 429)`.

- [ ] **Step 4: Write failing orchestration tests**

```ts
it('persists a user message, emits progress, validates the answer, and clears the run fence', async () => {
  const events: string[] = [];
  const result = await service.send(ownerId, conversationId, {
    text: 'Giải thích lãi kép',
    files: []
  }, (event) => events.push(event.type));
  expect(events).toEqual(['checking_scope', 'generating', 'final']);
  expect(result.message).toMatchObject({ status: 'completed', scope: 'finance' });
  expect(conversation.activeRunId).toBeNull();
});

it('retains durable images for retry and marks the attempt failed when generation rejects', async () => {
  policy.answer.mockRejectedValue(new Error('provider detail'));
  const input = { text: 'Đọc biểu đồ', files: [pngUpload] };
  await expect(service.send(ownerId, conversationId, input, vi.fn())).rejects.toThrow();
  expect(imageStorage.remove).not.toHaveBeenCalled();
  expect(messageUpdates.at(-1)).toMatchObject({ status: 'failed' });
});

it('reclaims only a stale run and aborts a live run through cancel', async () => {
  await expect(service.send(ownerId, liveConversationId, input, vi.fn())).rejects.toMatchObject({
    code: 'CHAT_RUN_ACTIVE'
  });
  await expect(service.send(ownerId, staleConversationId, input, vi.fn())).resolves.toBeDefined();
  await expect(service.cancel(ownerId, conversationId, runId)).resolves.toBeUndefined();
});
```

- [ ] **Step 5: Implement send, regenerate, and cancel**

Add these service methods:

```ts
send(
  ownerId: string,
  conversationId: string,
  input: { text: string; files: UploadedChatImage[] },
  emit: (event: ChatStreamEvent) => void
): Promise<{ runId: string; message: ChatMessage }>;
regenerate(
  ownerId: string,
  conversationId: string,
  userMessageId: string,
  emit: (event: ChatStreamEvent) => void
): Promise<{ runId: string; message: ChatMessage }>;
cancel(ownerId: string, conversationId: string, runId: string): Promise<void>;
```

Use one atomic `findOneAndUpdate` to claim `activeRunId` when it is null or `activeRunStartedAt <= staleBefore`. Persist user/attachment metadata before generation and remove newly stored bytes only if that persistence fails before the user message becomes durable. Emit `reading_images` only when at least one current or historical image is loaded, persist exactly one assistant attempt, and clear the run fence with the same run id in success, refusal, failure, and cancellation paths. Provider failure retains the durable user message and attachments so regeneration can reuse owned attachment records without writing duplicate GridFS bytes.

In the same owner-scoped transaction boundary, replace `Cuộc trò chuyện mới` with `titleFrom(userText, files.length > 0)` only for the first durable user message. Later messages never rename the conversation.

- [ ] **Step 6: Run orchestration tests**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat-run-registry.spec.ts src/chat/chat-rate-limiter.spec.ts src/chat/chat.service.spec.ts`

Expected: PASS; active-run and attachment cleanup assertions are green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/chat/chat-run-registry.ts apps/api/src/chat/chat-run-registry.spec.ts apps/api/src/chat/chat-rate-limiter.ts apps/api/src/chat/chat-rate-limiter.spec.ts apps/api/src/chat/chat.service.ts apps/api/src/chat/chat.service.spec.ts
git commit -m "feat(chat): orchestrate cancellable scoped answers"
```

### Task 7: Expose authenticated NDJSON endpoints and wire `ChatModule`

**Files:**

- Create: `apps/api/src/chat/chat.controller.ts`
- Create: `apps/api/src/chat/chat.controller.spec.ts`
- Create: `apps/api/src/chat/chat.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing controller tests**

```ts
it('writes newline-delimited progress and exactly one terminal event', async () => {
  service.send.mockImplementation(async (_owner, _id, _input, emit) => {
    emit({ type: 'checking_scope', runId });
    emit({ type: 'generating', runId });
    emit({ type: 'final', runId, message: assistantMessage });
    return { runId, message: assistantMessage };
  });
  await controller.send(user, conversationId, { text: 'Lãi kép' }, [], response, request);
  expect(response.type).toHaveBeenCalledWith('application/x-ndjson');
  expect(writes.map((line) => JSON.parse(line))).toHaveLength(3);
  expect(response.end).toHaveBeenCalledOnce();
});

it('rejects unauthenticated access and forwards cancellation idempotently', async () => {
  await controller.cancel(user, conversationId, runId);
  expect(service.cancel).toHaveBeenCalledWith(user.id, conversationId, runId);
});
```

- [ ] **Step 2: Run controller tests and confirm they fail**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat.controller.spec.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement controller transport**

Use `@Controller('chat')`, `@UseGuards(AuthGuard)`, `FilesInterceptor('images', CHAT_MAX_IMAGES, { limits: { files: 4, fileSize: CHAT_MAX_IMAGE_BYTES } })`, and the global Zod DTO pattern. Before streaming, set:

```ts
response.status(200);
response.type('application/x-ndjson');
response.setHeader('Cache-Control', 'no-cache, no-transform');
response.setHeader('X-Accel-Buffering', 'no');
```

Serialize each parsed `chatStreamEventSchema` value as `${JSON.stringify(event)}\n`. If an error occurs after headers are sent, write one redacted `error` terminal event and end. Attach request `close` to the run registry signal, but do not let a normal response finish overwrite a completed status as cancelled.

Implement all approved routes and call `ChatRateLimiter.consume(user.id)` only for send/regenerate.

- [ ] **Step 4: Wire providers and unavailable behavior in `ChatModule`**

Register all three schemas with `MongooseModule.forFeature`, a feature-local Multer module, controller/services, and a `CHAT_PROVIDER` factory:

```ts
useFactory: (config: ConfigService, logger: Logger): ChatProvider => {
  if (!config.getOrThrow<boolean>('CHAT_ENABLED')) return new UnavailableChatProvider();
  return new GeminiChatProvider({
    apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
    model: config.getOrThrow<string>('GEMINI_CHAT_MODEL'),
    timeoutMs: config.getOrThrow<number>('CHAT_AI_TIMEOUT_MS'),
    maxRetries: config.getOrThrow<number>('CHAT_AI_MAX_RETRIES'),
    log: (record) => logger.log(record)
  });
}
```

Import `ChatModule` in `AppModule`. Missing optional chat configuration must leave `/ready` healthy while chat requests return `CHAT_AI_UNAVAILABLE`.

- [ ] **Step 5: Run controller, module, and platform tests**

Run: `pnpm --filter @marxmatrix/api exec vitest run src/chat/chat.controller.spec.ts src/platform.spec.ts`

Expected: PASS and Nest route mapping includes `/api/v1/chat`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/chat/chat.controller.ts apps/api/src/chat/chat.controller.spec.ts apps/api/src/chat/chat.module.ts apps/api/src/app.module.ts
git commit -m "feat(chat): expose authenticated chat endpoints"
```

### Task 8: Prove HTTP ownership, multipart limits, scope refusal, and GridFS cleanup

**Files:**

- Create: `apps/api/test/integration/chat.integration.spec.ts`
- Modify: `apps/api/src/chat/chat.module.ts` (export the provider token only if the Nest test override requires it)

- [ ] **Step 1: Write the failing integration test with a deterministic fake provider**

```ts
const fakeProvider: ChatProvider = {
  classify: async ({ text }) => ({
    domain: text.includes('thời tiết') ? 'out_of_scope' : 'education',
    confidence: 1
  }),
  generate: async () => ({
    answer: 'Hai cộng hai bằng bốn.',
    scope: 'education',
    model: 'integration-chat',
    promptVersion: 'chat-answer-v1',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
  }),
  validateOutput: async () => true
};

it('keeps conversations and image bytes private and deletes both', async () => {
  const owner = await register('chat-owner');
  const other = await register('chat-other');
  const created = await request(server)
    .post('/api/v1/chat/conversations')
    .set(auth(owner))
    .expect(201);
  const id = created.body.id as string;
  const response = await request(server)
    .post(`/api/v1/chat/conversations/${id}/messages`)
    .set(auth(owner))
    .field('text', 'Giải thích phép cộng trong ảnh')
    .attach('images', PNG_FIXTURE, { filename: 'math.png', contentType: 'image/png' })
    .buffer(true)
    .parse(ndjsonParser)
    .expect(200);
  expect(parseEvents(response.body)).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'final' })])
  );
  await request(server).get(`/api/v1/chat/conversations/${id}`).set(auth(other)).expect(404);
  await request(server).delete(`/api/v1/chat/conversations/${id}`).set(auth(owner)).expect(204);
  await expect(connection.db.collection('uploads_chat.files').countDocuments()).resolves.toBe(0);
});

it('refuses out-of-scope input and rejects a fifth image', async () => {
  const owner = await register('chat-scope-owner');
  const authorization = auth(owner);
  const created = await request(server)
    .post('/api/v1/chat/conversations')
    .set(authorization)
    .expect(201);
  const id = created.body.id as string;
  const refusal = await request(server)
    .post(`/api/v1/chat/conversations/${id}/messages`)
    .set(authorization)
    .field('text', 'Thời tiết hôm nay thế nào?')
    .buffer(true)
    .parse(ndjsonParser)
    .expect(200);
  expect(parseEvents(refusal.body).at(-1)).toMatchObject({ type: 'refusal' });

  let oversized = request(server)
    .post(`/api/v1/chat/conversations/${id}/messages`)
    .set(authorization)
    .field('text', 'Bài toán trong ảnh');
  for (let index = 0; index < 5; index += 1)
    oversized = oversized.attach('images', PNG_FIXTURE, {
      filename: `math-${index}.png`,
      contentType: 'image/png'
    });
  await oversized
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('CHAT_IMAGE_INVALID'));
});
```

Implement `PNG_FIXTURE` as a minimal valid signature plus bytes, `ndjsonParser` as a Supertest response parser that buffers UTF-8 text, and `parseEvents` with `chatStreamEventSchema`.

- [ ] **Step 2: Run integration test and confirm the red state**

Run: `pnpm --filter @marxmatrix/api exec vitest run --dir test/integration test/integration/chat.integration.spec.ts`

Expected: FAIL until the module, HTTP streaming, real Mongo records, and GridFS cleanup work together.

- [ ] **Step 3: Complete only integration-discovered wiring defects**

Permitted changes are narrow and must retain earlier unit contracts. Typical fixes are:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CHAT_PROVIDER)
  .useValue(fakeProvider)
  .compile();
```

Add no production bypass for authentication, scope checks, owner filters, or image validation.

- [ ] **Step 4: Run chat integration and all API unit tests**

Run: `pnpm --filter @marxmatrix/api exec vitest run --dir test/integration test/integration/chat.integration.spec.ts && pnpm --filter @marxmatrix/api test:unit`

Expected: chat integration PASS; all existing API unit suites remain green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/integration/chat.integration.spec.ts apps/api/src/chat/chat.module.ts
git commit -m "test(chat): verify private multimodal HTTP flow"
```

### Task 9: Add an authenticated raw-response API client for NDJSON

**Files:**

- Modify: `apps/web/src/shared/api/client.ts`
- Modify: `apps/web/src/shared/api/client.spec.ts`
- Modify: `apps/web/src/shared/api/runtime.ts`

- [ ] **Step 1: Write failing raw-response refresh and abort tests**

```ts
it('returns a readable response after the same single-flight 401 refresh', async () => {
  const client = createApiClient({ baseUrl: 'http://api.test', fetcher, getAccessToken });
  const response = await client.response('/chat/conversations/id/messages', {
    method: 'POST',
    body: new FormData()
  });
  expect(await response.text()).toBe('{"type":"checking_scope"}\n');
  expect(refreshCalls).toBe(1);
  expect(requestHeaders.at(-1)?.get('authorization')).toBe('Bearer new-token');
});

it('passes the caller AbortSignal to the streaming request', async () => {
  const controller = new AbortController();
  const request = client.response('/chat/test', { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
});
```

- [ ] **Step 2: Run the client spec and confirm it fails**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/shared/api/client.spec.ts`

Expected: FAIL because `ApiClient.response` does not exist.

- [ ] **Step 3: Refactor one authenticated response path shared by JSON and streams**

Change the public interface to:

```ts
export interface ApiClient {
  request: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  response: (path: string, init?: RequestInit) => Promise<Response>;
}
```

Implement one internal `fetchAuthenticated(path, init, retried)` that adds `credentials: 'include'`, attaches the current bearer token, performs at most one single-flight refresh on 401, preserves `init.signal`, and converts non-OK JSON envelopes to `ApiError`. `request<T>` must call `response()` then keep the existing 204/JSON behavior. Export the same configured instance from `runtime.ts`; do not create a second refresh state for chat.

- [ ] **Step 4: Run web client tests and typecheck**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/shared/api/client.spec.ts && pnpm --filter @marxmatrix/web typecheck`

Expected: existing refresh tests plus new raw-response tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/api/client.ts apps/web/src/shared/api/client.spec.ts apps/web/src/shared/api/runtime.ts
git commit -m "feat(web): support authenticated response streams"
```

### Task 10: Build and test the typed chat API/NDJSON client

**Files:**

- Create: `apps/web/src/features/chat/chat.types.ts`
- Create: `apps/web/src/features/chat/chat.api.ts`
- Create: `apps/web/src/features/chat/chat.api.spec.ts`

- [ ] **Step 1: Write failing parser and FormData tests**

```ts
it('parses records split across arbitrary response chunks', async () => {
  const response = chunkedResponse([
    '{"type":"checking_scope","runId":"550e8400-e29b-41d4-a716-446655440000"}\n{"type":',
    '"error","runId":"550e8400-e29b-41d4-a716-446655440000","code":"X","message":"Y"}\n'
  ]);
  const events: ChatStreamEvent[] = [];
  await consumeChatStream(response, (event) => events.push(event));
  expect(events.map(({ type }) => type)).toEqual(['checking_scope', 'error']);
});

it('builds an image-only multipart message in original image order', async () => {
  await chatApi.sendMessage(
    conversationId,
    { text: '', images: [first, second] },
    vi.fn(),
    new AbortController().signal
  );
  const body = responseMock.mock.calls[0]?.[1]?.body as FormData;
  expect(body.get('text')).toBe('');
  expect(body.getAll('images')).toEqual([first, second]);
});
```

- [ ] **Step 2: Run chat API tests and confirm they fail**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/chat/chat.api.spec.ts`

Expected: FAIL because chat transport files do not exist.

- [ ] **Step 3: Implement typed endpoints and a strict streaming parser**

Expose:

```ts
export const chatApi = {
  createConversation(): Promise<ChatConversationSummary>,
  listConversations(cursor?: string): Promise<ChatConversationList>,
  getConversation(id: string, cursor?: string): Promise<ChatConversationDetail>,
  deleteConversation(id: string): Promise<void>,
  sendMessage(
    id: string,
    input: { text: string; images: File[] },
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void>,
  regenerate(
    id: string,
    userMessageId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void>,
  cancel(id: string, runId: string): Promise<void>
};
```

`consumeChatStream` must use `TextDecoder`, preserve incomplete trailing text between reads, parse every complete nonempty line with `chatStreamEventSchema`, require exactly one terminal event, reject bytes after a terminal event, and throw `CHAT_AI_RESPONSE_INVALID` for malformed or truncated streams.

- [ ] **Step 4: Run chat API tests, lint, and typecheck**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/chat/chat.api.spec.ts && pnpm --filter @marxmatrix/web lint && pnpm --filter @marxmatrix/web typecheck`

Expected: PASS; split records, malformed records, missing terminal event, abort, and FormData ordering are covered.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/chat/chat.types.ts apps/web/src/features/chat/chat.api.ts apps/web/src/features/chat/chat.api.spec.ts
git commit -m "feat(chat): add typed browser transport"
```

### Task 11: Build the accessible responsive chat workspace

**Files:**

- Create: `apps/web/src/features/chat/ConversationSidebar.tsx`
- Create: `apps/web/src/features/chat/ConversationSidebar.spec.tsx`
- Create: `apps/web/src/features/chat/MessageThread.tsx`
- Create: `apps/web/src/features/chat/MessageThread.spec.tsx`
- Create: `apps/web/src/features/chat/ChatComposer.tsx`
- Create: `apps/web/src/features/chat/ChatComposer.spec.tsx`
- Create: `apps/web/src/features/chat/SafeMarkdown.tsx`
- Create: `apps/web/src/features/chat/SafeMarkdown.spec.tsx`
- Create: `apps/web/src/features/chat/ChatPage.tsx`
- Create: `apps/web/src/features/chat/ChatPage.spec.tsx`
- Create: `apps/web/src/features/chat/ChatPage.css`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/shared/ui/AppShell.tsx`
- Modify: `apps/web/src/shared/ui/AppShell.spec.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add the Markdown dependency through pnpm**

Run: `pnpm --filter @marxmatrix/web add react-markdown`

Expected: `apps/web/package.json` and `pnpm-lock.yaml` change; no install scripts outside the workspace allowlist run.

- [ ] **Step 2: Write failing component tests**

```tsx
it('accepts an image-only message in original file order', async () => {
  render(<ChatComposer busy={false} onSend={onSend} onStop={vi.fn()} />);
  await user.upload(screen.getByLabelText('Đính kèm hình ảnh'), [one, two]);
  await user.click(screen.getByRole('button', { name: 'Gửi' }));
  expect(onSend).toHaveBeenCalledWith({ text: '', images: [one, two] });
});

it('revokes previews on removal/unmount and rejects a fifth file', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const view = render(<ChatComposer busy={false} onSend={onSend} onStop={vi.fn()} />);
  await user.upload(screen.getByLabelText('Đính kèm hình ảnh'), [one, two]);
  await user.click(screen.getByRole('button', { name: `Xóa ${one.name}` }));
  expect(revoke).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(revoke).toHaveBeenCalledTimes(2);

  render(<ChatComposer busy={false} onSend={onSend} onStop={vi.fn()} />);
  await user.upload(screen.getByLabelText('Đính kèm hình ảnh'), [one, two, three, four, five]);
  expect(screen.getByRole('alert')).toHaveTextContent('Tối đa 4 hình ảnh');
  expect(onSend).not.toHaveBeenCalled();
});

it('shows progress, final safe Markdown, retry, regenerate, copy, and stop controls', async () => {
  render(<ChatPage />);
  await user.type(screen.getByLabelText('Tin nhắn'), 'Giải thích lãi kép');
  await user.click(screen.getByRole('button', { name: 'Gửi' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Đang kiểm tra phạm vi');
  expect(await screen.findByText('Lãi kép')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sao chép' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Tạo lại câu trả lời' })).toBeEnabled();
});

it('does not execute raw HTML in assistant Markdown', () => {
  render(<SafeMarkdown text={'<script>alert(1)</script> [Nguồn](https://example.com)'} />);
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'Nguồn' })).toHaveAttribute('rel', 'noreferrer noopener');
});
```

- [ ] **Step 3: Run the new component tests and confirm the red state**

Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/chat/*.spec.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement focused presentational components**

Use these component contracts:

```ts
type ConversationSidebarProps = {
  conversations: ChatConversationSummary[];
  activeId?: string;
  loading: boolean;
  onNew(): void;
  onSelect(id: string): void;
  onDelete(id: string): void;
};

type ChatComposerProps = {
  busy: boolean;
  onSend(input: { text: string; images: File[] }): void;
  onStop(): void;
};

type MessageThreadProps = {
  messages: ChatMessage[];
  progress?: ChatStreamEvent['type'];
  onRetry(userMessageId: string): void;
  onRegenerate(userMessageId: string): void;
};
```

`SafeMarkdown` renders `ReactMarkdown` without `rehype-raw`, overrides anchors with `target="_blank" rel="noreferrer noopener"`, and never uses `dangerouslySetInnerHTML`. `ChatComposer` validates MIME/count/5 MiB locally, uses `URL.createObjectURL`, revokes URLs on removal/unmount, supports `Ctrl/Cmd+Enter`, and keeps plain Enter as newline.

- [ ] **Step 5: Implement `ChatPage` React Query orchestration**

Use query keys `['chat-conversations', userId]` and `['chat-conversation', userId, conversationId]`. Keep the current `AbortController` and `runId` in refs; create a conversation automatically on first send if none is selected; update progress for NDJSON events; on terminal event invalidate both list/detail; on stop call `chatApi.cancel` when `runId` is known and then abort the stream. Preserve draft text/files after retryable errors.

- [ ] **Step 6: Add route/navigation and responsive CSS**

Add lazy `ChatPage` under `ProtectedRoute`, `{ to: '/chat', label: 'AI Chat' }` to `primaryNavigation`, and assertions in `AppShell.spec.tsx`. `ChatPage.css` must provide desktop sidebar/thread, a mobile drawer below 980px, sticky composer, visible focus states, reduced-motion compliance, and no horizontal overflow at 320px.

- [ ] **Step 7: Run all web tests, lint, typecheck, and build**

Run: `pnpm --filter @marxmatrix/web test:unit && pnpm --filter @marxmatrix/web lint && pnpm --filter @marxmatrix/web typecheck && pnpm --filter @marxmatrix/web build`

Expected: all web tests PASS and Vite emits a lazy chat chunk.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/chat apps/web/src/app/router.tsx apps/web/src/shared/ui/AppShell.tsx apps/web/src/shared/ui/AppShell.spec.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(chat): add multimodal conversation workspace"
```

### Task 12: Configure streaming deployment, verify, push, deploy, and canary

**Files:**

- Modify: `deploy/ec2/nginx-marxmatrix-tls.conf`
- Modify: `deploy/ec2/update.sh`
- Modify: `deploy/ec2/update.test.sh`
- Modify: `deploy/ec2/ENVIRONMENT.md`

- [ ] **Step 1: Write the failing updater regression assertion**

Add an assertion that both the tracked TLS template and generated updater nginx block contain a more-specific chat stream location:

```nginx
location ~ ^/api/v1/chat/conversations/[^/]+/(messages|messages/[^/]+/regenerate)$ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 180s;
  proxy_send_timeout 180s;
}
```

- [ ] **Step 2: Run the ops test and confirm it fails**

Run: `pnpm run test:ops`

Expected: FAIL because the chat-specific nginx location is missing.

- [ ] **Step 3: Add matching nginx configuration and deployment documentation**

Place the specific location before the API server's general `location /` in both nginx sources. Document the non-secret production values:

```dotenv
CHAT_ENABLED=true
GEMINI_CHAT_MODEL=<same validated multimodal model selected for chat>
CHAT_AI_TIMEOUT_MS=60000
CHAT_AI_MAX_RETRIES=2
CHAT_MAX_CONTEXT_MESSAGES=20
CHAT_MAX_CONTEXT_BYTES=100000
CHAT_MAX_RUN_AGE_MS=180000
CHAT_RATE_LIMIT_PER_MINUTE=10
```

State explicitly that operators retain the existing `GEMINI_API_KEY` and must not paste it into chat, tickets, logs, or shell history.

- [ ] **Step 4: Run fresh full repository verification**

Run: `pnpm run verify`

Expected: ops, lint, typecheck, all unit tests, and every production build PASS. Then run the real-Mongo chat integration separately:

Run: `pnpm --filter @marxmatrix/api exec vitest run --dir test/integration test/integration/chat.integration.spec.ts`

Expected: PASS with MongoDB available; if MongoDB is unavailable, start the existing project Docker Mongo service and rerun rather than marking the task complete.

- [ ] **Step 5: Review the complete diff and commit deployment changes**

Run: `git diff --check && git status --short && git log --oneline -12`

Expected: no whitespace errors, only planned files, and one focused commit per task.

```bash
git add deploy/ec2/nginx-marxmatrix-tls.conf deploy/ec2/update.sh deploy/ec2/update.test.sh deploy/ec2/ENVIRONMENT.md
git commit -m "ops(chat): support validated response streams"
```

- [ ] **Step 6: Fast-forward with remote main and push**

```bash
git fetch origin main
git rebase origin/main
git push origin main
```

Expected: push succeeds without force; local `main` and `origin/main` resolve to the same commit.

- [ ] **Step 7: Set only non-secret chat keys and deploy the exact commit**

On EC2, update or append only the eight tracked chat variables shown above in `/opt/marxmatrix/apps/api/.env`. Set `GEMINI_CHAT_MODEL` to the already configured generation model only after confirming that model accepts image input and structured output. Do not display the environment file or key. Then run:

```bash
sudo /opt/marxmatrix/deploy/ec2/update.sh
cd /opt/marxmatrix && git rev-parse HEAD
systemctl is-active marxmatrix-api marxmatrix-worker nginx
curl -fsS https://api.ngocthanhhx7.site/api/v1/ready
```

Expected: EC2 commit equals `origin/main`, all three services are `active`, and readiness reports API/config/Mongo `ok`.

- [ ] **Step 8: Run an authenticated production smoke test and clean exact QA data**

Use a uniquely generated QA email and password, register through the public API, and retain identifiers only in process memory. Verify:

1. Create a conversation.
2. Send an education text question and observe progress plus one final event.
3. Send a finance question with a tiny valid PNG and observe an image-aware final response.
4. Send an image-only request.
5. Send an ambiguous request and observe fixed clarification.
6. Send an out-of-scope request and observe fixed refusal.
7. Reload conversation history.
8. Start and cancel a run.
9. Register a second QA user and prove the first conversation returns 404.

After the smoke test, delete the exact QA conversations through the API, then remove only the two QA users and their exact refresh-session records by captured ObjectIds from MongoDB. Resolve and print only counts/IDs, never tokens, passwords, prompts, answers, images, or environment secrets.

- [ ] **Step 9: Final canary and repository status**

Run:

```bash
curl -fsS https://api.ngocthanhhx7.site/api/v1/health
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Expected: public health is OK, working tree is clean, and both Git hashes match the deployed EC2 hash.
