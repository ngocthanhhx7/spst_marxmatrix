# Unified Site Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Use `test-driven-development` for each behavior change and `verification-before-completion` before claiming success.

**Goal:** Replace the three divergent headers with one shared, responsive header whose product navigation is complete and consistent on Home, About, and workspace routes.

**Architecture:** Add one immutable product-navigation model and one `SiteHeader` under `shared/ui`. `AppShell` becomes the sole header owner on content/workspace routes; Login and Register remain standalone. Landing and About keep their content and footers but remove their local headers. Existing `ProtectedRoute` and safe return-path handling remain the authorization boundary, allowing guests to see product links while preserving the requested protected destination through Login.

**Tech Stack:** React 18, TypeScript, React Router, Zustand, Vitest, Testing Library, CSS, Vite.

**Approved design:** `docs/superpowers/specs/2026-07-21-unified-site-header-design.md`

---

## Task 1: Create the navigation model and shared header

**Files:**

- Create: `apps/web/src/shared/ui/site-navigation.ts`
- Create: `apps/web/src/shared/ui/SiteHeader.tsx`
- Create: `apps/web/src/shared/ui/SiteHeader.spec.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] **Write failing component tests for the shared contract.**

Use `MemoryRouter`, `within`, and the session-store reset pattern from `AppShell.spec.tsx`. Test that both desktop and mobile navigation contain, in order:

```ts
const expectedNavigation = [
  ['Bảng điều khiển', '/dashboard'],
  ['Scanner', '/scanner'],
  ['Copilot', '/copilot'],
  ['Capital Arena', '/arena'],
  ['AI Chat', '/chat'],
] as const;
```

Also require that guests see `Đăng nhập` and `Đăng ký`; signed-in users instead see `Tư liệu`, settings/account, and `Đăng xuất`; admins see `Học liệu`; `/scanner/history` marks Scanner active in both navigation surfaces; and BrandMark links to `/`.

- [ ] **Run the new test and confirm RED.**

From `apps/web`:

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/shared/ui/SiteHeader.spec.tsx
```

Expected: FAIL because the shared files do not exist.

- [ ] **Create the single navigation source.**

```ts
export const primaryNavigation = [
  { to: '/dashboard', label: 'Bảng điều khiển' },
  { to: '/scanner', label: 'Scanner' },
  { to: '/copilot', label: 'Copilot' },
  { to: '/arena', label: 'Capital Arena' },
  { to: '/chat', label: 'AI Chat' },
] as const;
```

Do not duplicate this array in `SiteHeader`, Landing, About, or `AppShell`.

- [ ] **Implement the minimum `SiteHeader`.**

Move the existing workspace header behavior from `AppShell` into the component. Render `primaryNavigation` with `NavLink` in the desktop and existing bottom-mobile navigation. Always show product links, regardless of session. Add `/admin/documents` only for admins. For guests render exact actions `Đăng nhập` and `Đăng ký`; for signed-in users preserve the current resource link, ready indicator, settings link/name, and logout behavior. Reuse `BrandMark` and existing global header class names.

- [ ] **Adjust only required responsive CSS.**

Preserve established workspace styling. Ensure guest actions do not overlap product navigation and mobile bottom navigation remains usable at 320 px. Do not introduce a second hamburger menu: mobile continues using the existing bottom navigation pattern.

- [ ] **Run GREEN test.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/shared/ui/SiteHeader.spec.tsx
```

Expected: PASS.

- [ ] **Commit.**

```powershell
git add apps/web/src/shared/ui/site-navigation.ts apps/web/src/shared/ui/SiteHeader.tsx apps/web/src/shared/ui/SiteHeader.spec.tsx apps/web/src/styles/global.css
git commit -m "feat(web): add shared site header"
```

## Task 2: Make AppShell the only header owner

**Files:**

- Modify: `apps/web/src/shared/ui/AppShell.tsx`
- Modify: `apps/web/src/shared/ui/AppShell.spec.tsx`

- [ ] **Add failing route-ownership tests.**

Test that `/`, `/about`, and `/dashboard` render the shared banner; `/login` and `/register` do not. Test that Home and About own their `<main>` landmark while workspace routes receive the shell `<main>`. Require no duplicate banner/navigation landmarks.

- [ ] **Confirm RED.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/shared/ui/AppShell.spec.tsx
```

Expected: FAIL because the shell currently suppresses its header on Home/About.

- [ ] **Integrate `SiteHeader` and simplify route flags.**

Use explicit route sets:

```ts
const authenticationRoutes = new Set(['/login', '/register']);
const pageOwnedMainRoutes = new Set(['/', '/about']);
const pageOwnedFooterRoutes = new Set(['/', '/about', '/login', '/register']);
```

Render `SiteHeader` unless on an authentication route. Delete the local navigation array and all header/account markup now owned by `SiteHeader`. Preserve `SkipLink` and outlet behavior. Render the shell `main` only when the page does not own it. Preserve current footer ownership: Landing/About keep their page footer, auth remains standalone, workspace keeps `AppFooter`.

- [ ] **Run focused regression tests.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/shared/ui/AppShell.spec.tsx src/shared/ui/SiteHeader.spec.tsx
```

Expected: PASS.

- [ ] **Commit.**

```powershell
git add apps/web/src/shared/ui/AppShell.tsx apps/web/src/shared/ui/AppShell.spec.tsx
git commit -m "refactor(web): centralize header ownership in app shell"
```

## Task 3: Migrate Home to the shared header

**Files:**

- Modify: `apps/web/src/features/landing/LandingPage.tsx`
- Modify: `apps/web/src/features/landing/LandingPage.spec.tsx`
- Modify: `apps/web/src/features/landing/LandingPage.css`

- [ ] **Write the new ownership tests first.**

Rendered through the route/shell, Home must have exactly one banner, one BrandMark, and the complete five-link product navigation. Rendered directly, `LandingPage` must not create a banner. Keep all current hero, CTA, method, content, and footer assertions.

- [ ] **Confirm RED.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/features/landing/LandingPage.spec.tsx
```

Expected: FAIL because Landing still owns `landing__header`.

- [ ] **Remove only Landing's header.**

Delete local menu state, menu button, header/navigation markup, and imports used only by them. Preserve `<main className="landing">`, all sections/anchor IDs/CTA links, and Landing footer. From CSS remove only `.landing__header`, `.landing__nav`, `.landing__menu-button`, and related mobile-open rules. Preserve shared button/content rules.

- [ ] **Run regression tests.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/features/landing/LandingPage.spec.tsx src/shared/ui/AppShell.spec.tsx src/shared/ui/SiteHeader.spec.tsx
```

Expected: PASS.

- [ ] **Commit.**

```powershell
git add apps/web/src/features/landing/LandingPage.tsx apps/web/src/features/landing/LandingPage.spec.tsx apps/web/src/features/landing/LandingPage.css
git commit -m "refactor(web): use shared header on home"
```

## Task 4: Migrate About to the shared header

**Files:**

- Modify: `apps/web/src/features/about/AboutPage.tsx`
- Modify: `apps/web/src/features/about/AboutPage.spec.tsx`
- Modify: `apps/web/src/features/about/AboutPage.css`

- [ ] **Write the new ownership tests first.**

Mirror Home: through the shell About has exactly one shared banner and all five product links; directly rendered `AboutPage` has no banner. Preserve all editorial-section and footer assertions.

- [ ] **Confirm RED.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/features/about/AboutPage.spec.tsx
```

Expected: FAIL because About still owns `about__header`.

- [ ] **Remove only About's header.**

Delete local menu state, menu button, header/navigation markup, and imports used only by them. Preserve About root/main, sections, anchors, CTA links, and footer. Remove only `.about__header`, `.about__nav`, `.about__menu-button`, and related mobile-open rules. Preserve `.about__button` and content-layout CSS.

- [ ] **Run regression tests.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/features/about/AboutPage.spec.tsx src/shared/ui/AppShell.spec.tsx src/shared/ui/SiteHeader.spec.tsx
```

Expected: PASS.

- [ ] **Commit.**

```powershell
git add apps/web/src/features/about/AboutPage.tsx apps/web/src/features/about/AboutPage.spec.tsx apps/web/src/features/about/AboutPage.css
git commit -m "refactor(web): use shared header on about page"
```

## Task 5: Lock guest routing and safe return paths

**Files:**

- Modify: `apps/web/src/app/router.auth.spec.tsx`
- Verify/modify only if failing: `apps/web/src/features/auth/ProtectedRoute.tsx`
- Verify/modify only if failing: `apps/web/src/features/auth/return-path.ts`

- [ ] **Add parameterized integration coverage.**

For `/dashboard`, `/scanner`, `/copilot`, `/arena`, and `/chat`, start unauthenticated, navigate to the destination, assert Login renders, and assert router state preserves `{ from: destination }`. Use existing public router-test helpers, not React Router private internals.

- [ ] **Run the routing test.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/app/router.auth.spec.tsx
```

Expected: PASS if current `ProtectedRoute` satisfies the contract. If it fails, make the smallest correction so `state.from` is the requested internal pathname. Keep authorization out of `SiteHeader`.

- [ ] **Run existing Login/Register safety tests.**

```powershell
cmd /c node_modules\.bin\vitest.CMD run src/features/auth/auth-pages.spec.tsx src/app/router.auth.spec.tsx
```

Expected: PASS, including safe internal redirects and unsafe external-path rejection.

- [ ] **Commit regression coverage.**

```powershell
git add apps/web/src/app/router.auth.spec.tsx
git add apps/web/src/features/auth/ProtectedRoute.tsx apps/web/src/features/auth/return-path.ts
git commit -m "test(web): cover guest product return paths"
```

Only stage production auth files if they changed.

## Task 6: Full verification, push, EC2 deployment, and canary

**Files:** Verify all changed files; modify only if a test or visual check finds a regression.

- [ ] **Run the complete web validation suite.**

From `apps/web`, separately:

```powershell
cmd /c node_modules\.bin\vitest.CMD run src --passWithNoTests
cmd /c ..\..\node_modules\.bin\tsc.CMD --noEmit -p tsconfig.json
cmd /c ..\..\node_modules\.bin\eslint.CMD src vite.config.ts
cmd /c node_modules\.bin\vite.CMD build
```

Expected: tests pass; TypeScript, ESLint, and Vite exit 0.

- [ ] **Perform local browser QA at 320 px, 768 px, and desktop.**

Inspect `/`, `/about`, `/dashboard`, `/scanner`, `/copilot`, `/arena`, `/chat`, `/login`, and `/register`. Verify exactly one header where intended; five identical product destinations/active states; no header on auth; guest clicks redirect to Login and preserve destination; authenticated/admin controls remain; mobile bottom nav does not cover content; no horizontal overflow/overlap; no new console errors or accessibility warnings.

- [ ] **Review diff and workspace cleanliness.**

```powershell
git diff --check
git status --short
git diff origin/main...HEAD -- apps/web docs/superpowers
```

Expected: no whitespace errors and only intentional changes. Preserve the existing untracked `.pnpm-store/v11/projects/`.

- [ ] **If QA required edits, rerun affected tests and commit only those fixes.**

```powershell
git add -u apps/web/src
git commit -m "fix(web): polish unified header responsiveness"
```

Skip when no QA fixes were needed.

- [ ] **Push verified `main` without force.**

```powershell
git push origin main
```

Expected: remote `main` advances to the verified local commit.

- [ ] **Deploy through the repository's documented EC2 workflow.**

Discover and follow checked-in deployment docs/scripts. Record the current deployed revision first, pull new `main`, rebuild/restart only documented services, and keep the prior revision for rollback.

- [ ] **Run production canary checks.**

Verify `https://ngocthanhhx7.site/`, `/about`, product routes, `/login`, and `/register` as guest and authenticated user where available. Confirm local acceptance criteria, HTTP success, clean console, and healthy API/web services. If verification fails, roll back to the recorded revision and report the failing check.

---

## Definition of Done

- One `SiteHeader` owns branding, navigation, account controls, admin extension, and mobile navigation.
- Home, About, and workspace expose the exact same five product destinations.
- Login/Register remain standalone.
- Guests see protected product links and preserve their intended destination through Login.
- Landing/About content and footers remain unchanged; nested `main` landmarks are eliminated.
- Focused/full tests, typecheck, lint, build, responsive QA, GitHub push, EC2 deployment, and production canary all succeed.
