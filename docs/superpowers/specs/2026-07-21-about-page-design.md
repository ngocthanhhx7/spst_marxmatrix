# MarxMatrix About Page — Editorial Origin Dossier

## Purpose

Add a public `/about` page that explains why MarxMatrix exists, what problem it solves, how its three product modules support evidence-led learning, and who builds it. The supplied Stitch desktop composition is the visual reference. The supplied mobile composition is a layout reference only because it contains fictional people, dates, metrics, and claims that must not enter the product.

## Narrative

The page follows one story: MarxMatrix did not begin as another AI product; it began with the gap between abstract political-economy concepts and the fragmented evidence needed to examine modern technology businesses. The answer is an evidence workflow where sources, extracted facts, assumptions, calculations, citations, and human review remain visible.

The recurring line is: **“Không có bằng chứng, không có kết luận.”** MarxMatrix is described as infrastructure for constructing a defensible argument, never as a machine that produces truth.

## Visual system

- Reuse the existing MarxMatrix editorial tokens: canvas `#0C1014`, off-white `#F0EBDD`, evidence cyan `#79D6D8`, action/assumption amber `#E8B75A`, conflict red `#E36B62`, and thin slate rules `#35454F`.
- Use the existing display, body, and data font stacks; do not load Stitch's Tailwind or Material Symbols dependencies.
- Preserve the desktop reference's 12-column poster layout, ruled dossiers, numbered sections, mono annotations, compact member registry, and full footer.
- Use CSS-generated marks and text initials. Do not add stock photos, fake portraits, gradients, glass effects, fake metrics, or unsupported achievements.

## Page structure

1. Public utility line and complete header with active “Về chúng tôi” route.
2. Hero with the two-part thesis and a project-origin dossier.
3. Origin history: theory/practice gap, evidence matrix, and Capital Arena.
4. Before/after evidence audit and five-step source-to-argument pipeline.
5. Human-led manifesto with traceable, explicit, and human-review principles.
6. Scanner, Copilot, and Capital Arena feature specimens linking to real routes.
7. Qualitative impact ledger; no fabricated counts or accuracy percentages.
8. Team registry containing only user-supplied names and student IDs, with Nguyễn Ngọc Thành marked as leader.
9. Five-step research protocol.
10. Clearly labelled future directions that are not current features.
11. Final CTA and full product/resource/legal footer.

## Team data

- Nguyễn Ngọc Thành — HE186491 — Trưởng nhóm
- Vương Giang Trường — HE186135
- Vũ Kim Kỳ — HE182094
- Dương Tuấn Anh — HE180437
- Nguyễn Xuân Dương — HE190405
- Trần Đức Minh — HE190690
- Phạm Hải Trung — HE190486
- Nguyễn Khắc Tráng — HE186034
- Các thành viên và cộng tác viên khác

No other role, biography, portrait, social profile, or credential may be invented.

## Routing and navigation

- `/about` is public and lazy loaded under the existing session-restoration shell.
- Landing header and Resources footer link to `/about`.
- About header links back to `/#method`, `/#tools`, `/#resources`, `/arena`, `/login`, and the session-aware workspace/analysis CTA.
- Authenticated visitors see their display name and workspace action instead of login/start actions.

## Responsive behavior

- Desktop: disciplined 12-column layouts with a maximum content width aligned to the landing page.
- Tablet: split sections collapse without changing narrative order.
- Mobile: one column, the origin dossier follows the headline, member entries become full-width registry rows, and complex specimens never overflow horizontally.
- All interactive targets are at least 44px. Focus styles and reduced-motion behavior are explicit.

## Accessibility and truthfulness

- One `h1`, ordered section headings, semantic lists/tables where appropriate, and labelled navigation.
- Active navigation uses `aria-current="page"`.
- Status is not communicated by color alone.
- Decorative monograms and marks are hidden from assistive technology when their text equivalent exists.
- No false claims such as “millions of reports,” accuracy percentages, global deployment, named fictional staff, or completed roadmap capabilities.

## Verification

- Component tests cover narrative, team roster, real feature links, authenticated/public header states, route registration, active nav, and truthful future labels.
- CSS contract tests cover 12-column desktop layout, 44px targets, mobile breakpoint, and reduced motion.
- Run web tests, lint, typecheck, production build, then the workspace `verify` command.

