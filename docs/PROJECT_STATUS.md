# Project status

## Current phase

Tasks 1–5 — workspace/platform, identity/session shell, Landing, manual Scanner,
secure documents, GridFS, PDF parsing, and leased Mongo jobs — are verified.

Task 6 — AI provider and financial extraction — is verified.
Task 7 — page-aware RAG, citation firewall, admin học liệu and Copilot — is verified;
Task 8 — deterministic Capital Arena engine — is verified;
Task 9 — durable rooms/games and authenticated Socket.IO — is next.

## Evidence log

## Task 6 evidence

Task 6 is complete: backend-only AI provider adapters, bounded structured extraction,
owner-scoped extraction enqueue/envelope APIs, deterministic failed-job requeue,
stale-document parse-token fencing, redacted usage/latency logging, and Scanner UI
trigger/metadata states are implemented. No live Gemini credentials are used by tests.

| Timestamp (Asia/Saigon) | Command                                                             | Result                                                                                                |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm verify`           | Passed: contracts 26 tests; API 122 tests; web 46 tests; lint, typecheck and production builds green. |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:integration` | Passed: API integration 14 tests; other packages had no integration files.                            |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:e2e`         | Passed harness; no E2E files currently defined.                                                       |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm format`           | Passed Prettier check across the workspace.                                                           |

## Task 7 evidence

Task 7 is complete: page-bounded chunking and checksum-fenced ingestion, owner/course/current-token
retrieval, explicit Atlas/local repositories, production Gemini RAG with fail-closed unavailable mode,
citation firewall with the mandated Vietnamese insufficiency warning, admin textbook upload/reindex/retry,
and Copilot/source-page UI are implemented. Reviewer re-check: APPROVED with no Critical or Important
findings. The only non-blocking note is that a live Mongo/API integration spec dedicated specifically to
RAG/admin remains future coverage; focused regression suites cover the repaired risk paths. No `.env` file
was read, modified or exposed.

| Timestamp (Asia/Saigon) | Command                                                             | Result                                                                                                |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm verify`           | Passed: contracts 27 tests; API 153 tests; web 53 tests; lint, typecheck and production builds green. |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:integration` | Passed: API integration 14 tests; other packages had no integration files.                            |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:e2e`         | Passed harness; no E2E files currently defined.                                                       |
| 2026-07-19              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm format`           | Passed Prettier check across the workspace.                                                           |
| 2026-07-19              | Reviewer re-check                                                   | APPROVED; focused API RAG/admin 44 tests, web Copilot/admin 7 tests and workspace typecheck passed.   |

## Task 8 evidence

Task 8 is complete: the pure server-authoritative engine implements a seeded RNG, runtime-immutable
snapshots, the full lobby-to-game-over lifecycle, server-owned ISO deadlines, bounded decisions and
neutral defaults, deterministic economic resolution for cash/capital/workers/wages/automation/productivity/
reputation/market share/inventory/debt and `c/v/m`, all six configured crises, bankruptcy, deterministic
acquisition and finite-number rejection. Shared contracts use the same lifecycle, decision core and snapshot
shape. Independent review: APPROVED after acquisition, immutability, finite guards and transport alignment
were repaired. No `.env` file was read, modified or exposed.

| Timestamp (Asia/Saigon) | Command                                                             | Result                                                                                                |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-20              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm verify`           | Passed: contracts 27 tests; API 187 tests; web 53 tests; lint, typecheck and production builds green. |
| 2026-07-20              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:integration` | Passed: API integration 14 tests; other packages had no integration files.                            |
| 2026-07-20              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm test:e2e`         | Passed harness; no E2E files currently defined.                                                       |
| 2026-07-20              | `MARXMATRIX_SKIP_ENV_FILE=true NODE_ENV=test pnpm format`           | Passed Prettier check across the workspace.                                                           |
| 2026-07-20              | Reviewer re-check                                                   | APPROVED; engine-focused 34 tests and full API unit suite passed.                                     |

## Task 3 evidence

| Timestamp (Asia/Saigon) | Command                                                           | Result                                                                                    |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/api test:unit` (RED)  | Failed as intended before the identity service existed.                                   |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/web test:unit` (RED)  | Failed as intended before the API client existed.                                         |
| 2026-07-19              | API and web focused unit suites (GREEN)                           | API: 18 tests passed; web: 3 tests passed.                                                |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/api test:integration` | Passed against an isolated, unique local Mongo database; the suite dropped that database. |

| Timestamp (Asia/Saigon) | Command                                                                  | Result                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-19              | `node --version`                                                         | Exit 0; `v25.8.1`.                                                                                                                                               |
| 2026-07-19              | `pnpm --version`                                                         | Exit 0; `10.7.0` was present before workspace install.                                                                                                           |
| 2026-07-19              | `corepack pnpm --version`                                                | The `corepack` command was not available in this Node installation.                                                                                              |
| 2026-07-19              | `pnpm view eslint version`                                               | Exit 0; registry returned `9.39.1`.                                                                                                                              |
| 2026-07-19              | `pnpm view typescript-eslint version`                                    | Exit 0; registry returned `8.64.0`.                                                                                                                              |
| 2026-07-19              | `pnpm view prettier version`                                             | Exit 0; registry returned `3.9.5`.                                                                                                                               |
| 2026-07-19              | `pnpm view vitest version`                                               | Exit 0; registry returned `4.1.10`.                                                                                                                              |
| 2026-07-19              | `pnpm view @types/node version`                                          | Exit 0; registry returned `26.1.1`.                                                                                                                              |
| 2026-07-19              | `pnpm view @nestjs/cli version`                                          | Exit 0; registry returned `11.0.24`.                                                                                                                             |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --version`                                        | Exit 0; `11.15.0`. The previously installed `pnpm` binary reported `11.9.0`.                                                                                     |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 install`                                          | Exit 1 after resolving 605 packages because build scripts for `@google/genai` and `protobufjs` awaited approval.                                                 |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 peers check`                                      | Exit 1; `typescript-eslint@8.49.0` required TypeScript `<6.0.0`, while `7.0.2` was installed.                                                                    |
| 2026-07-19              | `pnpm view typescript@6 version`                                         | Exit 0; registry returned `6.0.3`.                                                                                                                               |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 approve-builds @google/genai protobufjs`          | Exit 0; approved/ran the pending package build scripts.                                                                                                          |
| 2026-07-19              | `pnpm view typescript-eslint@8.64.0 peerDependencies --json`             | Exit 0; registry returned TypeScript `>=4.8.4 <6.1.0`.                                                                                                           |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 install`                                          | Exit 0 after pinning TypeScript 6.0.3 and TypeScript-ESLint 8.64.0; no peer dependency issues remained.                                                          |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/contracts test:unit` (RED)   | Exit 1 as intended: `apiErrorSchema` was `undefined` before the export existed.                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/contracts test:unit` (GREEN) | Exit 0; 1 test passed after adding the minimal Zod smoke schema.                                                                                                 |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 lint`                                             | Exit 0; all 4 package lint scripts passed.                                                                                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 typecheck`                                        | Exit 0; all 4 package strict typechecks passed.                                                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:unit`                                        | Exit 0; contracts ran 1 passing real test; empty later-phase suites used `--passWithNoTests`.                                                                    |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 build`                                            | Exit 0; Nest, Vite, and both shared packages built. An earlier build failed on TypeScript 6’s deprecated API `baseUrl`; removing that unused option resolved it. |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:integration`                                 | Exit 0; no integration tests exist in this phase and each package’s Vitest harness reported no test files.                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:e2e`                                         | Exit 0; no E2E tests exist in this phase and each package’s Vitest harness reported no test files.                                                               |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 verify`                                           | Exit 0; lint, strict typecheck, unit tests, and builds all passed.                                                                                               |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 1; six project-owned files required Prettier normalization. `gsap-skills/` was excluded by `.prettierignore`.                                               |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 0 after formatting those files; all matched project-owned files use Prettier style.                                                                         |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 lint`                                             | Exit 0; all 4 package lint scripts passed after the template/formatting update.                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 typecheck`                                        | Exit 0; all 4 package strict typechecks passed after the template/formatting update.                                                                             |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:unit`                                        | Exit 0; contracts ran 1 passing real test after the template/formatting update.                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 build`                                            | Exit 0; Nest, Vite, and both shared packages built after the template/formatting update.                                                                         |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 0; final project-owned formatting check passed with `gsap-skills/` and preserved planning/source documents excluded.                                        |
| 2026-07-19              | `pnpm view @types/node@22 version`                                       | Exit 0; registry returned `22.20.1`, the latest 22.x Node declaration release.                                                                                   |
| 2026-07-19              | `docker --version`                                                       | Exit 1; Docker is not installed, so the local Mongo Compose smoke test is unverified.                                                                            |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 install`                                          | Exit 0; lockfile updated from `@types/node` 26.1.1 to 22.20.1.                                                                                                   |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 1; only edited `docs/DEPENDENCY_RESEARCH.md` and regenerated `pnpm-lock.yaml` required mechanical Prettier normalization.                                   |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 lint`                                             | Exit 0; all 4 package lint scripts passed with workspace-specific globals.                                                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 typecheck`                                        | Exit 0; all 4 strict typechecks passed with API build-only output settings.                                                                                      |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:unit`                                        | Exit 0; contracts ran 1 passing real test.                                                                                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 build`                                            | Exit 0; Nest, Vite, and both shared packages built.                                                                                                              |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 verify`                                           | Exit 0; lint, strict typecheck, unit tests, and builds passed.                                                                                                   |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 peers check`                                      | Exit 0; no peer dependency issues found.                                                                                                                         |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 0; final project-owned formatting check passed after the Node type and Compose updates.                                                                     |

## Current verification (2026-07-20)

- `pnpm run format`: passed after workspace-wide Prettier normalization.
- `pnpm run verify`: passed — contracts 28 tests, API 220 tests, web 106 tests, lint, strict typecheck and production builds.
- `pnpm run test:integration`: passed — API 6 files / 15 tests; other packages have no integration files.
- `pnpm run test:e2e`: passed harness; no separate E2E files are currently defined.
- Browser smoke: registration/login, Scanner flow, Copilot MLN112 demo corpus with citations/source page, and Capital Arena realtime flow verified against the local servers.
- Startup hardening: API waits for Mongo indexes before serving requests; Windows dev runner serializes rebuild restarts and terminates child trees safely.
- Docker is optional for local development; the current machine uses MongoDB on `127.0.0.1:27017`.
- No `.env` file was read, modified or exposed.

Verification entries are added only after the corresponding command has run.

## Task 2 evidence

| Timestamp (Asia/Saigon) | Command                                                                  | Result                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/contracts test:unit` (RED)   | Exit 1 as intended: representative contract tests failed because Task 2 exports did not exist.                                                                                                                   |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/contracts test:unit` (GREEN) | Exit 0; 4 contract schema tests passed after implementing the shared DTO schemas.                                                                                                                                |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/api test:unit` (RED)         | Exit 1 as intended: API platform test import failed because `DomainError` and related platform modules did not exist.                                                                                            |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 --filter @marxmatrix/api test:unit` (GREEN)       | Exit 0; 4 API tests passed for environment validation, safe errors, redaction configuration, health/readiness, and request IDs.                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 approve-builds @scarf/scarf`                      | The transitive Scarf postinstall was transiently approved and ran once during dependency installation before review. It is now explicitly blocked project-locally with `allowBuilds: { '@scarf/scarf': false }`. |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 install`                                          | Exit 0 after blocking `@scarf/scarf`; no Scarf build script ran.                                                                                                                                                 |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 format`                                           | Exit 0; matched project files use Prettier style.                                                                                                                                                                |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 lint`                                             | Exit 0; all workspace lint scripts passed.                                                                                                                                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 typecheck`                                        | Exit 0; all workspace strict TypeScript checks passed.                                                                                                                                                           |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 test:unit`                                        | Exit 0; contracts and API each ran four real Task 2 tests.                                                                                                                                                       |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 build`                                            | Exit 0; all workspace production builds passed.                                                                                                                                                                  |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 verify`                                           | Exit 0; lint, typecheck, unit tests, and builds passed together.                                                                                                                                                 |
| 2026-07-19              | `pnpm dlx pnpm@11.15.0 peers check`                                      | Exit 0; no peer dependency issues found.                                                                                                                                                                         |
| 2026-07-19              | Task 2 review remediation                                                | Added production-only unsafe-environment rejection, global throttler/Zod wiring, citation bounds, exact socket error/maps, configured Pino redaction, and real AppModule HTTP coverage.                          |
| 2026-07-19              | Task 2 review RED/GREEN                                                  | RED: RAG citation index, exact server errors, production environment, logger and guard gaps failed as intended. GREEN: contracts passed 14 tests and API passed 10 tests including real AppModule HTTP coverage. |
| 2026-07-19              | Final review gates                                                       | `install`, `format`, `lint`, `typecheck`, `test:unit`, `build`, `verify`, and `peers check` all exited 0; `@scarf/scarf` remains project-locally blocked.                                                        |
| 2026-07-19              | Final Task 2 gap RED/GREEN                                               | RED: global DTO parsing and bracketed IPv6 production Mongo rejection were absent. GREEN: API passed 11 tests and contracts passed 15 tests after real global Zod DTO validation and added guards.               |

## Task 3 final hardening evidence

| Timestamp (Asia/Saigon) | Evidence                            | Result                                                                                                                                                                           |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-19              | Refresh rotation Mongo integration  | Concurrent refresh yields one success and one rejection; exactly one active replacement session remains.                                                                         |
| 2026-07-19              | Session restoration StrictMode test | Startup refresh is single-flight, restores a direct protected route, and a failed refresh resolves to login.                                                                     |
| 2026-07-19              | Origin and duration tests           | Development missing-origin auth POST is rejected; allowed and mismatched origins are exercised; supported JWT durations are accepted and malformed/zero/negative forms rejected. |

## Task 3 refresh hardening evidence

| Timestamp (Asia/Saigon) | Command                  | Result                                                                                                                                                                         |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-19              | Task 3 refresh RED/GREEN | RED: concurrent refresh requests both succeeded. GREEN: conditional Mongo rotation permits exactly one success; the isolated test database has one active replacement session. |
| 2026-07-19              | Task 3 auth UX RED/GREEN | Vietnamese shared validation messages, accessible inline errors, student AdminRoute rejection, and refresh-failure session clearing are covered by web tests.                  |

# MarxMatrix — trạng thái triển khai

## Task 4 — Landing và Scanner thủ công

- Đã thêm domain Scanner quyết định (c, v, m, m′, c/v, p′, độ phủ bằng chứng 0–100%), với lỗi miền cho dữ liệu không hữu hạn, mẫu số bằng 0 và dữ kiện khác tiền tệ/kỳ báo cáo/quy mô.
- Đã thêm lát cắt Analyses được bảo vệ theo chủ sở hữu: tạo, danh sách, chi tiết, cập nhật dữ kiện/giả định, tính, hoàn tất và lịch sử phiên bản có `_id` ổn định.
- Đã thêm fixture tổng hợp `fixtures/scanner/cloud-platform-2025.json`; không có dữ liệu doanh nghiệp thực.
- Đã thêm landing tiếng Việt nguyên bản và Scanner UI, gồm trạng thái tải/rỗng/lỗi, độ nhạy, lịch sử, độ phủ chứng cứ, biểu đồ tải lười và câu từ chối trách nhiệm bắt buộc.
- Xác minh cuối Task 4 ngày 2026-07-19 (mọi lệnh dùng `MARXMATRIX_SKIP_ENV_FILE=true`, `NODE_ENV=test`): contracts 21/21; API unit 65/65; web unit 41/41; integration 5/5 (gồm Scanner/Mongo với database tên duy nhất và chỉ xoá database đó). `pnpm format`, `pnpm verify`, integration và E2E harness đều exit 0; reviewer độc lập kết luận không còn finding Critical/Important.
- API Scanner dùng cập nhật hẹp, có ID ổn định: chỉ `PATCH /analyses/:id/facts/:factId` và `PATCH /analyses/:id/assumptions` được hỗ trợ; không có endpoint thay thế cả mảng facts. Luồng UI có retry đúng mutation, không tạo analysis trùng khi calculate lỗi, reclassification PATCH → calculate tạo phiên bản mới, lịch sử/chi tiết protected route, bằng chứng mỗi fact và so sánh phiên bản.
- Landing dùng font native có fallback (`Iowan Old Style`/`Palatino` cho display, `Aptos`/`Segoe UI` cho body), không tải font bên thứ ba; CTA điều hướng tới route hoặc preview thật, và chuyển động tôn trọng reduced motion.
- Build web tách tải Landing, xác thực, Scanner và biểu đồ; bundle khởi đầu 390.25 kB minified, không có cảnh báo vượt ngưỡng chunk.

## Task 5 — Documents, GridFS, PDF parser và durable jobs

- Xác minh cuối Task 5 ngày 2026-07-19 (mọi lệnh dùng `MARXMATRIX_SKIP_ENV_FILE=true`, `NODE_ENV=test`): contracts 24/24; API unit 108/108; web unit 41/41; Mongo integration 14/14; E2E harness và format đều exit 0; `dist/worker.js` được build thực tế.
- Upload được kiểm tra với giới hạn cấu hình, MIME/extension/signature, filename sanitization, owner boundary, Content-Disposition an toàn, checksum dedupe và compensation GridFS dưới race 3 request; partial delete giữ record ẩn và retryable.
- PDF.js thật được kiểm tra với fixture PDF hợp lệ; parser giữ thứ tự trang, phát hiện `OCR_UNSUPPORTED`, token-fenced stale A/B race, ObjectId BSON thật, orphan cleanup sau crash/CAS acknowledgement loss và page/delete smoke qua Mongo cô lập.
- Queue dùng payload allow-list, idempotency conflict, atomic claim, lease token theo từng lần claim, heartbeat/renew, globally unique worker identity, retry/backoff/terminal state, stale completion fencing và graceful shutdown; lỗi parser được map thành mã an toàn, không ghi chi tiết nhạy cảm.
- Reviewer độc lập kết luận `APPROVED`, không còn finding Critical/Important/Minor; database review tạm đã được drop, không commit/push.
