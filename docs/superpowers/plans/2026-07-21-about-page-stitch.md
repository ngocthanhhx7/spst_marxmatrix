# MarxMatrix About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready public `/about` page from the approved Stitch editorial dossier while preserving MarxMatrix truthfulness, responsive behavior, and existing navigation conventions.

**Architecture:** Add a self-contained lazy-loaded About feature with its own scoped CSS and component tests. Register it as a public route and add route links from the existing landing header/footer; reuse `BrandMark` and session state without refactoring the stable landing page.

**Tech Stack:** React 19, React Router, TypeScript, scoped CSS, Vitest, Testing Library.

---

### Task 1: Define the About page contract

**Files:**
- Create: `apps/web/src/features/about/AboutPage.spec.tsx`

- [ ] **Step 1: Write failing tests for narrative and team truthfulness**

  Render `AboutPage` in `MemoryRouter` and assert the hero thesis, “Không có bằng chứng, không có kết luận”, the three feature headings, all eight supplied names/IDs, the leader label only for Nguyễn Ngọc Thành, and “ĐỊNH HƯỚNG / KHÔNG PHẢI TÍNH NĂNG HIỆN CÓ”.

- [ ] **Step 2: Write failing tests for navigation and session states**

  Assert `/about` active navigation, real Scanner/Copilot/Arena routes, `/login` for guests, and `/settings` plus `/dashboard` for an authenticated user.

- [ ] **Step 3: Write a failing CSS contract test**

  Read `AboutPage.css` and assert `repeat(12, minmax(0, 1fr))`, `min-height: 44px`, a `max-width: 48rem` mobile breakpoint, and `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Run the focused test and confirm RED**

  Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/about/AboutPage.spec.tsx`

  Expected: FAIL because `AboutPage` and its CSS do not exist.

### Task 2: Implement the editorial About page

**Files:**
- Create: `apps/web/src/features/about/AboutPage.tsx`
- Create: `apps/web/src/features/about/AboutPage.css`
- Test: `apps/web/src/features/about/AboutPage.spec.tsx`

- [ ] **Step 1: Add typed static content**

  Define readonly arrays for history entries, before/after audit rows, workflow steps, product features, qualitative outcomes, team members, and research protocol. Keep the team data exactly aligned with the approved spec and never add unsupported roles or metrics.

- [ ] **Step 2: Implement header, hero, and origin dossier**

  Reuse `BrandMark`, `Link`, and `useSessionStore`; add a labelled mobile menu, active About link, session-aware account actions, one `h1`, and the project-origin dossier.

- [ ] **Step 3: Implement all narrative sections**

  Render the origin timeline, before/after audit, five-step workflow, manifesto, three feature bands, impact ledger, team directory, protocol, future directions, CTA, and footer with semantic HTML.

- [ ] **Step 4: Implement scoped responsive CSS**

  Translate the Stitch composition into native CSS using existing tokens. Use 12-column desktop grids, no Tailwind runtime, no external icons, one-column mobile layouts, visible focus, 44px targets, and reduced-motion overrides.

- [ ] **Step 5: Run focused tests and confirm GREEN**

  Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/about/AboutPage.spec.tsx`

  Expected: all About tests pass.

### Task 3: Register the public route and navigation

**Files:**
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/features/landing/LandingPage.tsx`
- Modify: `apps/web/src/features/landing/LandingPage.spec.tsx`
- Test: `apps/web/src/app/App.spec.tsx`

- [ ] **Step 1: Add a failing landing navigation assertion**

  Assert the public header exposes `Về chúng tôi` with `href="/about"` and the Resources footer exposes the same real route.

- [ ] **Step 2: Add lazy About route registration**

  Import `AboutPage` lazily in `router.tsx` and add `path="about"` outside guest/protected guards but inside session restoration and the shared shell.

- [ ] **Step 3: Replace placeholder About anchors**

  Add the `/about` link to the landing public nav and footer while preserving existing anchor-focus behavior for in-page links.

- [ ] **Step 4: Run route and landing tests**

  Run: `pnpm --filter @marxmatrix/web exec vitest run src/features/landing/LandingPage.spec.tsx src/app/App.spec.tsx src/features/about/AboutPage.spec.tsx`

  Expected: all selected tests pass.

### Task 4: Verify and review the integrated page

**Files:**
- Verify only; modify implementation files only for defects found.

- [ ] **Step 1: Format changed files**

  Run: `pnpm exec prettier --write apps/web/src/features/about apps/web/src/app/router.tsx apps/web/src/features/landing/LandingPage.tsx apps/web/src/features/landing/LandingPage.spec.tsx docs/superpowers/specs/2026-07-21-about-page-design.md docs/superpowers/plans/2026-07-21-about-page-stitch.md`

- [ ] **Step 2: Run web quality gates**

  Run: `pnpm --filter @marxmatrix/web run lint && pnpm --filter @marxmatrix/web run typecheck && pnpm --filter @marxmatrix/web run test:unit && pnpm --filter @marxmatrix/web run build`

  Expected: all commands exit 0.

- [ ] **Step 3: Run workspace verification**

  Run: `pnpm run verify`

  Expected: operations tests, lint, typecheck, all unit tests, and production builds exit 0.

- [ ] **Step 4: Review desktop and mobile behavior**

  Inspect `/about` at 1440px and 390px. Confirm no horizontal overflow, fictional Stitch content, fake metrics, inaccessible menu state, or broken product links.

- [ ] **Step 5: Commit the feature**

  Stage only About, router, landing navigation, spec, and plan files. Commit with: `feat(web): add editorial about page`.

