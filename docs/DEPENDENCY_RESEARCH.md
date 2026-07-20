# Dependency research

Research date: 2026-07-19. Versions below are exact pins provided by the approved build brief, with registry pages used as package provenance.

| Area                   | Package                                 |                      Pin | Evidence                                                                                                                                                                |
| ---------------------- | --------------------------------------- | -----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager        | pnpm                                    |                  11.15.0 | [pnpm package](https://www.npmjs.com/package/pnpm)                                                                                                                      |
| UI                     | React / React DOM                       |                   19.2.7 | [React](https://www.npmjs.com/package/react), [React DOM](https://www.npmjs.com/package/react-dom)                                                                      |
| UI build               | Vite / React plugin                     |            8.1.5 / 6.0.3 | [Vite](https://www.npmjs.com/package/vite), [plugin](https://www.npmjs.com/package/@vitejs/plugin-react)                                                                |
| UI state               | React Router / TanStack Query / Zustand | 8.2.0 / 5.101.2 / 5.0.14 | [Router](https://www.npmjs.com/package/react-router), [Query](https://www.npmjs.com/package/@tanstack/react-query), [Zustand](https://www.npmjs.com/package/zustand)    |
| UI forms               | React Hook Form / Zod                   |           7.82.0 / 4.4.3 | [RHF](https://www.npmjs.com/package/react-hook-form), [Zod](https://www.npmjs.com/package/zod)                                                                          |
| UI visual              | Recharts / Motion                       |          3.9.2 / 12.42.2 | [Recharts](https://www.npmjs.com/package/recharts), [Motion](https://www.npmjs.com/package/motion)                                                                      |
| Documents              | React-PDF / PDF.js                      |         10.4.1 / 5.4.296 | [React-PDF](https://www.npmjs.com/package/react-pdf), [PDF.js](https://www.npmjs.com/package/pdfjs-dist)                                                                |
| API                    | Nest / Mongoose / Nest Mongoose         | 11.1.28 / 9.7.4 / 11.0.4 | [Nest](https://www.npmjs.com/package/@nestjs/core), [Mongoose](https://www.npmjs.com/package/mongoose), [Nest Mongoose](https://www.npmjs.com/package/@nestjs/mongoose) |
| Realtime and AI        | Socket.IO / Google GenAI                |           4.8.3 / 2.12.0 | [Socket.IO](https://www.npmjs.com/package/socket.io), [GenAI](https://www.npmjs.com/package/@google/genai)                                                              |
| Language               | TypeScript                              |                    6.0.3 | [TypeScript](https://www.npmjs.com/package/typescript)                                                                                                                  |
| Node type declarations | @types/node                             |                  22.20.1 | [@types/node](https://www.npmjs.com/package/@types/node)                                                                                                                |

Vitest is selected for unit, integration, and E2E-oriented package harnesses to avoid mixing test runners. Package-level integration/E2E commands use Vitest’s `--passWithNoTests` only until those suites are introduced in later tasks.

### TypeScript compatibility decision

The initial `typescript@7.0.2` pin was attempted. `pnpm peers check` reported that `typescript-eslint@8.49.0` and its packages require `>=4.8.4 <6.0.0`. This is a concrete tooling incompatibility, not a preference. On 2026-07-19, `pnpm view typescript@6 version` returned `6.0.3`; the workspace therefore pins `typescript@6.0.3`. Re-evaluate TypeScript 7 only after the lint toolchain publishes compatible peer ranges.

The latest registry-verified `typescript-eslint@8.64.0` declares TypeScript `>=4.8.4 <6.1.0`, so it is pinned with TypeScript 6.0.3 and removes the peer mismatch while retaining strict typed linting.

`@types/node@22.20.1` is the latest 22.x release returned by `pnpm view @types/node@22 version`. It aligns declaration APIs with the project runtime floor of Node 22.22.0 without exposing Node 26-only types to the API or shared packages.
