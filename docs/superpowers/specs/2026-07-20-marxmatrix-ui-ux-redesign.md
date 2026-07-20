# MarxMatrix UI/UX Redesign — Editorial Evidence Workspace

**Date:** 2026-07-20  
**Status:** Approved direction — the user asked Codex to choose the strongest option and proceed screen by screen  
**Scope:** Complete public and authenticated experience, brand system, navigation, feature flows and responsive states  
**Evidence:** Live audit at `http://localhost:5173`, route/source inventory, Lighthouse desktop/mobile, and three independent route/UX/visual reviews

## 1. Product experience target

MarxMatrix must feel like a serious Vietnamese academic instrument for investigating political economy, not a generic SaaS dashboard. The visual idea is an **editorial archive joined to an evidence workstation**:

- public pages communicate a thesis with strong editorial typography and one clear action;
- application pages expose evidence, assumptions, versions and system state without burying them in decorative cards;
- every feature has its own route and preserves user context when moving to a source, result, lobby or replay;
- the global shell always answers: what product is this, where am I, what can I do next, and is my work saved/synchronized?

The redesign preserves the proven dark direction, focus visibility, reduced-motion support and evidence-first language. It replaces the thin app shell, browser-default page hierarchy, hidden features and card-heavy layouts.

## 2. Chosen direction and rejected alternatives

### Chosen — Editorial Evidence Workspace

Dark archival canvas, literary serif display type, neutral grotesk body type and mono data labels. Cyan means verified source/evidence; amber means assumption, pending review or primary action; red means conflict/error. Thin rules, numbered sections, document panes and evidence rows replace rounded card grids.

### Rejected — Conventional learning dashboard

Familiar and fast to build, but it would reduce Scanner, Copilot and Arena to interchangeable cards and erase the project's intellectual identity.

### Rejected — Full editorial site everywhere

Strong for marketing, but too low-density and slow for evidence review, calculations, source navigation and multiplayer decisions.

## 3. Global information architecture

Existing URLs stay valid. New feature routes fill missing product flows without forcing an `/app` migration.

```text
PUBLIC
/
/login
/register

AUTHENTICATED WORKSPACE
/dashboard
/scanner
/scanner/new
/scanner/extract
/scanner/:analysisId
/copilot
/documents/:documentId/pages/:pageNumber
/arena
/arena/lobby/:roomCode
/arena/game/:gameId
/arena/game/:gameId/results
/arena/game/:gameId/replay
/settings

ADMIN
/admin/documents

SYSTEM
/*
```

Primary workspace navigation: **Tổng quan · Scanner · Copilot · Capital Arena**. Admin users also see **Học liệu**. Account actions live in a user menu, not beside primary features.

## 4. Global shell

### Public shell

- 64–72px header with mark + wordmark, quiet section links, `Đăng nhập`, and amber `Bắt đầu` action.
- Landing uses a full-width composition inside a 12-column, 1440px-max grid.
- Public footer has Method, Limits and System columns plus data-provenance and accessibility statements.

### Authenticated app shell

- Top utility strip: current course/context, connection/save state and help.
- Desktop left rail: brand, primary features, contextual recent item and account footer.
- Content header: breadcrumb, page title, concise description and one primary action.
- Optional right evidence rail for source, assumptions, calculation version or round context.
- Bottom status footer: version, system status, privacy/help/feedback. It is utility, not marketing.
- Mobile: 56px top bar plus bottom navigation for four primary features; contextual actions move into a labelled overflow or sticky action bar.

### Navigation rules

- Current route is visible through weight, label and a 2px amber marker, never color alone.
- Breadcrumbs preserve domain context:
  - `Scanner / Lịch sử / [Tên phân tích]`
  - `Scanner / PDF evidence / [Tên PDF] / Review`
  - `Copilot / [Tên học liệu] / Trang N`
  - `Arena / Lobby / Ván đấu / Kết quả / Replay`
  - `Admin / Học liệu / [Tài liệu]`
- Feature-to-feature promotion lives on Dashboard and purposeful completion states, not in unrelated forms.

## 5. Design system

### Color

| Token | Value | Meaning |
|---|---:|---|
| `canvas` | `#0C1014` | page background |
| `surface-1` | `#121920` | primary work surface |
| `surface-2` | `#19242C` | raised/selected surface |
| `rule` | `#35454F` | boundaries and grid lines |
| `text` | `#F0EBDD` | primary text |
| `text-muted` | `#AEBCC0` | secondary information |
| `verified` | `#79D6D8` | sourced/verified evidence |
| `assumption` | `#E8B75A` | assumptions, pending review, primary CTA |
| `conflict` | `#E36B62` | error, contradiction, destructive action |

Color is semantic. It is not used as general decoration.

### Typography

- Display: high-contrast serif; local/system fallback must retain academic character. Target `Source Serif 4` or `Fraunces` when bundled safely.
- Body/UI: neutral grotesk; target `IBM Plex Sans`.
- Data/source: `IBM Plex Mono` for values, citations, versions, timers and identifiers.
- Body minimum 16/26px. Page title 40/44px desktop, 32/36px mobile. Marketing hero 72–96px desktop, 46–58px mobile.

### Spacing and geometry

- Scale: 4, 8, 12, 16, 24, 32, 48, 72, 112px.
- Radius: 0, 2 or 4px. No rounded-card mosaic and no default shadows.
- Workspace max width 1440px; reading measure 720px.
- Minimum touch target 44px; sticky controls respect safe-area insets.

### Core primitives

`BrandMark`, `PublicHeader`, `AppRail`, `MobileNav`, `AppFooter`, `PageFrame`, `PageHeader`, `Breadcrumbs`, `ActionBar`, `Button`, `Field`, `StatusBadge`, `EvidenceRow`, `SourceCitation`, `MetricFigure`, `AssumptionCallout`, `DataTable`, `EmptyState`, `ErrorState`, `Skeleton`, `ConnectionBanner`.

## 6. Complete screen register

| # | Route | Screen | Primary job | Required states |
|---:|---|---|---|---|
| 01 | `/` | Landing | Understand the thesis and choose a first task | default, mobile nav, reduced motion |
| 02 | `/login` | Sign in | Resume an existing workspace | validation, submitting, auth/network error |
| 03 | `/register` | Create account | Start and choose first workflow | validation, password guidance, submitting, duplicate/network error |
| 04 | `/dashboard` | Workspace overview | Continue recent work or start Scanner/Copilot/Arena | first-use empty, recent work, job status, partial error |
| 05 | `/scanner` | Scanner history | Find, filter and start analyses | loading, empty, error, populated, search-no-result |
| 06 | `/scanner/new` | Manual analysis | Enter a coherent financial case | draft, invalid, calculating, recoverable error |
| 07 | `/scanner/:analysisId` | Analysis sheet | Review metrics, evidence, assumptions and versions | loading, partial evidence, finalized, recalculating, conflict |
| 08 | `/scanner/extract` | PDF evidence pipeline | Upload, process, review and apply extracted facts | upload, parsing, extraction, review queue, apply success, failed job |
| 09 | `/copilot` | Grounded Copilot | Ask/outline/compare/critique using selected sources | source empty, composing, retrieving, answer, insufficient evidence, error |
| 10 | `/documents/:id/pages/:page` | Source viewer | Verify the exact cited passage without losing Copilot context | loading, highlighted citation, invalid page, access error |
| 11 | `/arena` | Arena hub | Create/join a room and browse recent matches | empty, open rooms, join error, reconnect offer |
| 12 | `/arena/lobby/:roomCode` | Arena lobby | Configure, ready up and start | waiting, ready, host controls, full room, reconnect, expired |
| 13 | `/arena/game/:gameId` | Live game | Understand market state and submit one decision on time | countdown, decision open/locked, resolution, crisis, bankrupt, reconnect |
| 14 | `/arena/game/:gameId/results` | Match results | Understand outcome and learning points | winner, personal result, bankrupt, rematch offer |
| 15 | `/arena/game/:gameId/replay` | Replay | Inspect round-by-round causal history | loading, timeline, event detail, missing event gap |
| 16 | `/admin/documents` | Admin ingestion | Upload, monitor, retry and verify course documents | empty, upload, queued, progress, ready, failed, reindex confirmation |
| 17 | `/settings` | Account/settings | Manage profile and accessibility preferences | saved, unsaved, error, sign-out |
| 18 | `/*` | Not found/error | Recover to the right product context | signed-out, signed-in, forbidden, service unavailable |

## 7. Screen 01 — Landing, detailed specification

### User outcome

Within five seconds a visitor understands that MarxMatrix connects technology-business data to political-economy concepts using traceable evidence. The first action is to start; the second is to inspect a real synthetic analysis.

### Desktop composition (1440px)

1. **Utility line** — left `MARXMATRIX / QUAN SÁT KINH TẾ CHÍNH TRỊ SỐ`; right `MLN112 · EVIDENCE-LED LEARNING`.
2. **Public header** — mark + MarxMatrix wordmark, links `Phương pháp`, `Scanner`, `Capital Arena`, `Copilot`; `Đăng nhập`; amber `Bắt đầu`.
3. **Hero poster** — 12-column composition, not a card.
   - left 7 columns: `01 / LUẬN ĐỀ`, headline `Nội soi tư bản công nghệ`, a two-line thesis, primary CTA `Bắt đầu học cùng MarxMatrix`, secondary CTA `Xem một phân tích`;
   - right 5 columns: tall evidence sheet `CLOUD PLATFORM / 2025` with c 400, v 200, m 400, source/page references and `4 nguồn · 1 giả định · review required`.
4. **Method index** — `Document → Extraction → Review → Calculation` as four numbered ruled rows.
5. **Three feature narratives**, each with one job:
   - Scanner: metric plus evidence ledger and CTA to its dedicated route;
   - Copilot: one answer/claim/citation specimen and CTA;
   - Arena: round timeline + market state specimen and CTA.
6. **Trust/limits band** — deterministic calculation, human review, citations, privacy; concise statements, no icon circles.
7. **Learning outcome + final CTA** — what the learner can do after one session.
8. **Full footer** — Method, Limits, System; version/status/provenance/accessibility.

### Content hierarchy

- First eye target: headline.
- Second: evidence sheet values and verification markers.
- Third: amber `Bắt đầu` action.
- One H1; sections use descriptive H2s, not generic labels such as “Tính năng”.
- Vietnamese is primary. Necessary technical terms receive short contextual labels rather than mixed-language filler.

### Interaction and motion

- Hero enters with opacity/translate only; evidence rows reveal in order over 240–360ms.
- Feature specimens react to one meaningful control each, never auto-playing carousels.
- Reduced motion shows the final state immediately.
- Anchor navigation updates focus and does not hide headings beneath the header.

### Mobile (375px)

- 24px outer padding; body stays at least 16px.
- Brand + `Bắt đầu` + labelled menu button in the top bar.
- Headline first, evidence sheet immediately after; no horizontal data overflow.
- Primary action full width, secondary action below.
- Method steps remain rows, not a four-column squeeze.
- Sticky CTA is allowed only after the hero CTA scrolls out of view and must not cover content.

### Acceptance checks

- complete header and footer are visible;
- no generic feature-card grid, decorative blobs, purple gradients or stock imagery;
- all interactive targets are at least 44px;
- verified/assumption/error meanings never rely on color alone;
- heading-only scan communicates the whole story;
- Lighthouse accessibility target ≥98 and SEO target ≥95;
- no console errors; no horizontal scroll at 375, 768, 1280 and 1440px;
- all CTA destinations are real routes or use the safe return-path flow.

### Stitch prompt

Create a 1440px desktop landing page for “MarxMatrix”, a serious Vietnamese academic research tool for examining the political economy of technology. Use a dark editorial archive joined to a technical evidence workspace, never a generic SaaS template. Canvas #0C1014, off-white text #F0EBDD, cyan #79D6D8 only for verified evidence, amber #E8B75A only for assumptions and actions, red #E36B62 only for conflict/error, with thin slate rules #35454F. Use a high-contrast literary serif headline, neutral grotesk body and monospaced data labels. No gradients, rounded card grid, icon circles, blobs, stock imagery or decorative charts.

The first viewport is one poster-like 12-column composition. Add a thin utility line, then a complete header with a distinctive matrix/M brand mark, MarxMatrix wordmark, quiet navigation, login and one amber “Bắt đầu” action. Hero left spans seven columns: eyebrow “01 / LUẬN ĐỀ”, huge headline “Nội soi tư bản công nghệ”, one concise Vietnamese statement connecting revenue to production, labor and surplus value, then amber “Bắt đầu học cùng MarxMatrix” and underlined “Xem một phân tích”. Hero right spans five columns: a tall ruled evidence sheet titled “CLOUD PLATFORM / 2025” with large mono c 400, v 200, m 400 values, exact source/page markers and “4 nguồn · 1 giả định · review required”. Below the fold show the four-step archival index Document → Extraction → Review → Calculation, then dedicated Scanner, Copilot and Capital Arena narrative sections with real UI specimens, a trust/limits band, final CTA and full Method/Limits/System footer. Mobile becomes one column with the evidence sheet directly after the headline, a labelled menu and 44px targets.

## 8. Implementation waves

1. Foundation: semantic tokens, brand assets, primitives, public/app shell, active navigation and footer.
2. Screen 01 plus auth and Dashboard so first-use flow is coherent.
3. Scanner history/manual/detail/extraction review flow.
4. Copilot/source viewer with state-preserving citation navigation.
5. Arena hub/lobby/game/results/replay coordinated with durable room/game APIs and Socket.IO.
6. Admin/settings/system screens.
7. Responsive, accessibility, visual regression, Lighthouse and end-to-end flow gates.

Independent feature groups may run in parallel only after Wave 1 contracts are stable. Agents must not edit shared tokens/shell concurrently.

## 9. Audit findings carried into implementation

- Landing baseline: Accessibility 96, Best Practices 96, SEO 82, Agentic Browsing 67 on desktop and mobile Lighthouse.
- Auth registration currently collapses backend/connectivity failure into `Không thể đăng ký. Vui lòng thử lại.`; error copy must name the recoverable next step without leaking security details.
- Scanner is absent from the authenticated global navigation; Arena has no product route.
- Dashboard is only a greeting and does not route users into a first task.
- PDF extraction stops before approve/reject/reclassify/apply and asks users to refresh manually.
- Copilot source navigation does not preserve answer context or highlight the cited passage.
- Application pages have no complete footer, breadcrumbs, active route state or responsive navigation.
- Primary button contrast and unstyled input surfaces must be corrected before visual polish.

## 10. Privacy and repository rules

- No `.env` file is read, searched, parsed, printed, copied, modified or uploaded.
- Stitch receives only this synthetic design brief; no source code, credentials, user data or environment content is transmitted.
- Any new configuration variable is appended to the relevant `.env.example` only when implementation truly requires it.
- No automatic commit or push.
