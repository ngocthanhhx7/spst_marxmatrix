# MarxMatrix Screens 02–04: Auth + Dashboard Plan

**Goal:** Turn login, registration, and dashboard into complete editorial evidence-workspace screens without changing authentication contracts or inventing user activity.

**Constraints:** TDD first; preserve safe return paths and existing API/session behavior; use isolated component CSS; never read or load `.env`; do not commit or push.

## Screen 02 — Login

**Files:** `LoginPage.tsx`, `auth-pages.spec.tsx`, shared `AuthFrame` files.

- [ ] RED: assert public brand/home link, editorial heading, trust context, register route-state round trip, accessible busy state, and announced API errors.
- [ ] GREEN: render a 7/5 desktop evidence frame and one-column mobile form; retain React Hook Form, Zod, autocomplete, disabled submit, and safe redirect behavior.
- [ ] Do not expose a forgot-password action until a supported route/service exists.

## Screen 03 — Register

**Files:** `RegisterPage.tsx`, `auth-pages.spec.tsx`, shared `AuthFrame` files.

- [ ] RED: assert the Scanner → Copilot → Arena expectation sequence, name/email/password semantics, password help association, busy state, duplicate-account error, and login route-state round trip.
- [ ] GREEN: use the shared evidence frame; retain successful session creation and replace navigation; do not claim email verification that the backend does not implement.

## Screen 04 — Dashboard

**Files:** `DashboardPage.tsx`, `DashboardPage.spec.tsx`, isolated dashboard CSS/view-model if required.

- [ ] RED: assert breadcrumb/title/user greeting, `/scanner/new` primary CTA, next actions to Scanner/Copilot/Arena, honest first-use state, and stable system/learning rail.
- [ ] GREEN: create an editorial workspace hub using ruled rows rather than metric cards; do not fetch undefined endpoints or fabricate personal metrics/activity.
- [ ] Keep primary actions usable if future noncritical dashboard data fails.

## Verification

- [ ] Focused auth and dashboard suites pass with `MARXMATRIX_SKIP_ENV_FILE=true` and `NODE_ENV=test`.
- [ ] Existing route-state, protected-route, shell, and application tests remain green.
- [ ] Typecheck and production build pass with Vite `envDir: false` activated by the skip flag.
- [ ] Desktop/mobile browser QA confirms no horizontal overflow, minimum 44px controls, visible focus, correct landmark order, and no duplicated app shell.
