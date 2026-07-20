# MarxMatrix UI Foundation + Screen 01 Implementation Plan

> **Scope:** Wave 1 only. Establish the reusable visual foundation, complete the authenticated application shell, and rebuild Landing Screen 01 before the remaining product screens are split into parallel workstreams.

**Goal:** Replace the current generic page treatment with the approved Editorial Evidence Workspace system while preserving existing behavior, routes, accessibility, and Vietnamese product language.

**Architecture:** Keep the existing React Router feature boundaries. Add a small brand primitive and a reusable footer, centralize semantic tokens in `tokens.css`, and let `AppShell` own authenticated navigation/state. The public landing page keeps its own editorial header/footer so application chrome is not duplicated.

**Design source:** `docs/superpowers/specs/2026-07-20-marxmatrix-ui-ux-redesign.md`, Screen 01.

**Constraints:** Never read, search, print, parse, or modify any `.env` file. If a new configuration key becomes necessary, append only its documented name/default to the relevant `.env.example`. Do not commit or push automatically.

---

## Task 1: Lock the brand primitive and browser metadata with tests

**Files:**

- Create: `apps/web/src/shared/ui/BrandMark.spec.tsx`
- Create: `apps/web/src/shared/ui/BrandMark.tsx`
- Create: `apps/web/public/brand/marxmatrix-mark.svg`
- Create: `apps/web/public/brand/marxmatrix-logo.svg`
- Create: `apps/web/public/brand/favicon.svg`
- Modify: `apps/web/index.html`

- [ ] Add a failing `BrandMark` test asserting an interactive mark is a home link with the accessible name `MarxMatrix`, visible wordmark text, and a decorative SVG hidden from assistive technology.
- [ ] Run only `BrandMark.spec.tsx` and record the expected RED result because the component does not exist.
- [ ] Implement the smallest semantic `BrandMark` API needed by the shell and landing header.
- [ ] Add the geometric matrix/axis SVG assets in verified cyan and assumption amber; use no raster image, shadow, or generic gradient.
- [ ] Update `index.html` with the SVG favicon, product title, description, theme color, and Open Graph basics. Do not add environment-dependent values.
- [ ] Re-run the focused test and record GREEN.

## Task 2: Define semantic tokens before styling components

**Files:**

- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/global.css`

- [ ] Add semantic color tokens for canvas, surface, rule, primary text, muted text, verified evidence, assumption/CTA, conflict/error, and focus.
- [ ] Add the approved spacing scale `4, 8, 12, 16, 24, 32, 48, 72, 112`, sharp radius scale, typography roles, content widths, and motion durations.
- [ ] Map existing token names to the new semantic tokens temporarily so current screens remain functional while later waves migrate.
- [ ] Add base focus-visible, selection, reduced-motion, typography, and document-background rules without feature-specific layout.
- [ ] Run the current landing and shell tests to ensure the token migration introduces no behavioral regression.

## Task 3: Complete the application shell with navigation state and footer

**Files:**

- Modify: `apps/web/src/shared/ui/AppShell.spec.tsx`
- Modify: `apps/web/src/shared/ui/AppShell.tsx`
- Create: `apps/web/src/shared/ui/AppFooter.tsx`
- Create: `apps/web/src/shared/ui/AppFooter.spec.tsx`

- [ ] Add failing shell tests asserting signed-in learners see Dashboard, Scanner, Copilot, and Capital Arena; only admins see Documents Admin.
- [ ] Add a failing route-state test asserting the current navigation item exposes `aria-current="page"`.
- [ ] Add failing structure tests for the first-focus skip link, `#main-content`, persistent method/status footer, and no duplicated app chrome on `/`.
- [ ] Run the focused AppShell tests and record RED.
- [ ] Implement a utility strip, desktop left rail, compact mobile top bar/bottom navigation, active route state, account/status region, and reusable footer.
- [ ] Keep every current protected/admin route and authorization rule unchanged.
- [ ] Re-run AppShell and AppFooter tests and record GREEN.

## Task 4: Rebuild Landing Screen 01 as an editorial evidence page

**Files:**

- Modify: `apps/web/src/features/landing/LandingPage.spec.tsx`
- Modify: `apps/web/src/features/landing/LandingPage.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] Extend the landing test with failing assertions for the `CLOUD PLATFORM / 2025` evidence sheet, structured `c / v / m` values, `/register` primary CTA, `/scanner/new` secondary CTA, full product/method/legal footer navigation, and Screen 01 stable hooks.
- [ ] Preserve the existing tests for Vietnamese narrative, mobile menu state, reduced motion, sensitivity preview, Arena lobby preview, Copilot grounded outline, and fixture provenance.
- [ ] Run only `LandingPage.spec.tsx` and record RED.
- [ ] Implement the public poster header, 12-column hero, evidence sheet, thesis/problem sections, Scanner/Arena/Copilot previews, method index, trust statement, learning outcomes, closing CTA, and full footer.
- [ ] Make mobile layout linear and readable with a controllable `aria-expanded` menu; preserve 44px minimum interactive targets and visible focus.
- [ ] Re-run the focused landing test and record GREEN.

## Task 5: Verify Wave 1 in code and in the browser

**Files:**

- Verify only; change the smallest relevant file if a defect is found and add a regression test first.

- [ ] Run the three focused suites together with `MARXMATRIX_SKIP_ENV_FILE=true` and `NODE_ENV=test`.
- [ ] Run the full web test suite.
- [ ] Run web typecheck and production build.
- [ ] Verify `/` at desktop `1440px`, tablet `768px`, and mobile `390px`; capture visual evidence.
- [ ] Verify keyboard navigation, skip link, active navigation state, menu state, focus visibility, landmark order, and reduced motion.
- [ ] Retry `http://localhost:3000/api/v1/health`; if the server is still unavailable, report it separately because Landing Wave 1 does not depend on backend availability.
- [ ] Record remaining issues as inputs for the next independent plans: Auth/Dashboard, Scanner/Copilot, Arena, and Admin/Settings.

## Required commands

Run from the repository root without loading any environment file:

```powershell
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm --filter @marxmatrix/web exec vitest run src/shared/ui/BrandMark.spec.tsx src/shared/ui/AppShell.spec.tsx src/shared/ui/AppFooter.spec.tsx src/features/landing/LandingPage.spec.tsx
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm --filter @marxmatrix/web test
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm --filter @marxmatrix/web run typecheck
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm --filter @marxmatrix/web run build
```

## Exit criteria

- Screen 01 has a complete responsive header, main narrative, feature previews, evidence sheet, and footer.
- Authenticated shell exposes every primary product area with a visible current-route state.
- Brand, favicon, metadata, tokens, focus behavior, and reduced-motion behavior are reusable by subsequent screens.
- Focused tests, full web tests, typecheck, and build all pass from a command that explicitly skips `.env` loading.
- No `.env` file was read or modified; no commit or push was created.
