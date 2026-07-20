# MarxMatrix Screens 16–17: Admin Documents + Settings Plan

**Goal:** Finish operational document ingestion and give every signed-in user a dedicated, honest account/settings page.

## Screen 16 — Admin Documents (`/admin/documents`)

- [ ] Preserve role guard, upload validation, reindex, failed-job retry, and existing API contracts.
- [ ] Add editorial operations header, upload progress/state, status ledger, controlled empty/error states, and automatic polling while any document is `uploaded|parsing|parsed|embedding`.
- [ ] Stop polling at `ready|failed`; expose the latest server error and next valid action per row.
- [ ] Add row details only for fields the API returns; do not invent model/usage/job timing.
- [ ] TDD loading, upload, validation, polling stop conditions, reindex, retry, and partial mutation errors.

## Screen 17 — Settings (`/settings`)

- [ ] Add protected route and global navigation/account entry.
- [ ] Show current display name, email, role, session/security explanation, UI motion preference, and logout.
- [ ] Treat identity fields as read-only until a real update endpoint exists; do not render fake save controls.
- [ ] Store only non-sensitive UI preferences locally; never persist tokens or private prompts/documents.
- [ ] TDD authentication guard, current account rendering, preference control semantics, logout cleanup, and mobile layout.

## Verification

- [ ] Focused tests, full web tests, typecheck, and build pass with environment-file loading disabled.
- [ ] Admin polling produces no runaway requests and cancels on unmount.
- [ ] Keyboard/focus and screen-reader status announcements work for uploads, jobs, errors, preferences, and logout.
