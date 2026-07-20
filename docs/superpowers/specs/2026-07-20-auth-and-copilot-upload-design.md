# Auth Session Guard and Copilot Private Upload Design

## Goal

Prevent authenticated users from reaching `/login` or `/register`, including after a full-page refresh or direct URL navigation, and let each authenticated user upload private PDF sources directly from Copilot without exposing documents across accounts.

## Current findings

- The web router already wraps `/login` and `/register` in `GuestOnlyRoute`.
- The Zustand session store starts in `unknown` after a page reload. `Providers` calls `restoreSession()`, which uses the refresh-cookie endpoint.
- If refresh fails, the client correctly becomes `unauthenticated`; however, this makes a stale/failed cookie look identical to a genuine guest unless the pending state is kept visible and the runtime refresh response is diagnosed.
- User document upload already exists at `POST /documents`. The API validates PDF signature, MIME type, extension, size, ownership, and checksum, stores bytes in MongoDB GridFS, and stores metadata in `DocumentRecord`.
- Copilot currently consumes only the published course corpus through `/rag/documents?courseId=MLN112`. A normal user upload is not course-published and therefore cannot become a Copilot source through that route.
- No image upload is required for this feature. The supported source format remains PDF until a separate image/OCR design is approved.

## Options considered

### Auth

1. **Router-only guard** — already implemented, but it cannot distinguish a pending refresh from a real guest at the application boundary.
2. **Application session gate plus route guard (recommended)** — keep the existing route guard, add an explicit restoration barrier, and test both successful and failed refresh. This prevents a registration form from appearing while session state is unresolved without blocking real guests.
3. **Persist access token in browser storage** — avoids some refresh races but increases token exposure and duplicates the existing httpOnly refresh-cookie design; rejected.

### Copilot sources

1. **Reuse the published course corpus** — quick UI work but would mix private uploads with admin-published content and risks cross-user access; rejected.
2. **Private owner-scoped Copilot corpus (recommended)** — reuse GridFS, PDF validation, parsing, and embedding jobs while adding an owner-scoped source/query boundary. The server derives owner and corpus scope from the authenticated user; the client cannot submit either value.
3. **New external object-storage pipeline** — useful at scale but unnecessary while MongoDB GridFS is already implemented and tested; deferred.

## Architecture

### Session restoration

1. `Providers` starts one deduplicated restoration request when state is `unknown`.
2. A session gate renders a neutral pending state until restoration resolves.
3. A successful refresh calls `setSession`; direct `/login` and `/register` then redirect to `/dashboard`.
4. A definitive `401` clears the session and renders the guest form.
5. Browser QA records only endpoint and HTTP status, never cookie values, access tokens, or response secrets.

### Private Copilot documents

1. Add an authenticated Copilot-document endpoint that accepts one PDF and derives `ownerId` from `AuthGuard`.
2. Reuse `DocumentsService.upload` and the existing parse/embedding job flow, but assign a server-controlled private corpus scope rather than a client-provided course ID.
3. Add owner-scoped list/status/delete operations for Copilot sources. Metadata responses never expose GridFS IDs.
4. Add a Copilot query boundary that validates selected document IDs belong to the current owner and are ready before retrieval. The client no longer controls a course corpus identifier for private queries.
5. The Copilot UI adds a file picker/drop zone, default title from filename, upload/processing/ready/failed states, retry/delete actions, and a source checkbox list that only includes ready owned documents. Questions remain disabled while a selected source is processing.

## Error and security rules

- Accept PDF only: extension, declared MIME type, magic signature, maximum byte size, and checksum validation remain mandatory.
- Never accept `ownerId`, private corpus ID, or unrestricted `courseId` from the browser for private Copilot operations.
- A document not owned by the requester returns the existing not-found/authorization-safe response; do not reveal whether another account owns it.
- Failed parsing or embedding remains visible as a retryable source state; failed files are not queryable.
- Refresh failures are treated as unauthenticated only after the request has completed; pending restoration must not render guest forms.

## Testing strategy

- Web route tests: authenticated in-memory state redirects from both guest routes; `unknown` plus successful refresh redirects after restoration; `401` refresh leaves the guest form available.
- API tests: upload validation, owner scoping, private list/query selection, cross-account denial, processing status, retry/delete behavior, and no internal GridFS identifiers in DTOs.
- Copilot UI tests: FormData submission, title defaulting, progress/error states, ready-source selection, and disabled query while processing.
- Final verification: formatter, web/API unit tests, typecheck, lint, production build, and browser QA for login → reload → `/register` plus Copilot upload/query.

## Scope boundary

This change covers private PDF sources for Copilot. Image uploads, OCR, external object storage, and publishing private documents into the admin course corpus remain separate follow-up features.
