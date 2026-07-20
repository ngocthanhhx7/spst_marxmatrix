# PDF Processing Reliability and Visibility

## Problem

Users observe slow document processing and some small PDFs that never become usable. Code tracing shows three independent causes:

1. File byte size does not describe parseability. Image-only PDFs have no text layer and correctly fail as `OCR_UNSUPPORTED`; encrypted, malformed, or truncated PDFs currently collapse into `PDF_PARSE_FAILED`.
2. A failed embedding job leaves the document in `embedding` while the queue is terminally failed, so the UI polls forever.
3. The single worker sleeps after successful work, and a document embeds every chunk at once, creating avoidable queue latency and external-provider bursts.
4. The configured default `gemini-embedding-001` reached its Google shutdown date on 2026-07-14. Its replacement, `gemini-embedding-2`, uses a different embedding space and does not accept the old `taskType` configuration.

## Scope

This change migrates the supported embedding adapter to `gemini-embedding-2`, fixes the confirmed stuck-state invariant, preserves retryability, removes the unnecessary post-job worker sleep, bounds embedding concurrency, and presents actionable Vietnamese failure text in Copilot. It does not add OCR, password decryption, streaming PDF parsing, or multiple worker processes.

## Model lifecycle and compatibility

- `GEMINI_GENERATION_MODEL` and `GEMINI_EMBEDDING_MODEL` remain separate because document indexing does not use the generation model.
- The source-code and `.env.example` defaults become `gemini-embedding-2`; real `.env` files are never read or modified by this change.
- Embedding 2 inputs use Google's documented retrieval prefixes instead of the Embedding 1 `taskType` field: documents use `title: none | text: ...`; queries use `task: search result | query: ...`.
- The existing 64-dimensional index is not valid for Embedding 2 because the supported range starts at 128. This project will use Google's recommended 768 dimensions consistently and recreate/re-embed all vectors.
- Existing vectors from `gemini-embedding-001` must not be compared with Embedding 2 vectors. Operators must re-index or re-upload existing ready documents after deployment.

## State invariant

- Once indexing claims a document, any indexing failure must move the same active parse-token version from `embedding` to `failed` with public-safe `EMBEDDING_FAILED` metadata.
- An automatic queue retry may reclaim only a document that failed specifically with `EMBEDDING_FAILED`; parse failures remain ineligible.
- Public RAG failures from the embedding handler retain the queue's default retryable policy instead of being forced terminal on the first attempt.
- A later successful retry clears the error and moves the document to `ready`.
- Stale/deleted/reparsed documents are fenced by `_id`, course, parse token, deletion state, and expected status.

## Throughput

- The worker sleeps for `pollMs` only after an idle claim or claim outage. After a completed/failed job it immediately attempts the next claim.
- Embedding uses a small fixed concurrency of four, preserving output order and avoiding unbounded `Promise.all` bursts.

## User feedback

Copilot maps safe error codes to Vietnamese guidance:

- `OCR_UNSUPPORTED`: PDF appears to contain scanned images without a searchable text layer; use a text PDF or run OCR first.
- `PDF_PARSE_FAILED`: the PDF may be protected, truncated, or structurally unsupported; export a new unprotected PDF.
- `EMBEDDING_FAILED`: source indexing failed; retry the same file later or contact the operator if repeated.
- Other failures retain a generic safe message.

## Verification

- TDD coverage proves the current model ID and Embedding 2 request shape, failed embedding updates the document, the failed document is retryable, bounded concurrency never exceeds four, worker drains available jobs without polling delay, and the Copilot UI displays code-specific guidance.
- Focused API/web tests, lint, typecheck, builds, and workspace verify must pass.
