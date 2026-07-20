# MarxMatrix

MarxMatrix is an evidence-first workspace for document scanning, source-bounded Copilot answers, and the Capital Arena simulation.

## Local development

Requirements: Node.js 22+, pnpm 11.15+, and MongoDB reachable at the URI configured in your local environment.

1. Install dependencies:

   ```powershell
   pnpm install
   ```

2. Start the web app and API together:

   ```powershell
   pnpm run dev
   ```

   The web app is served at `http://localhost:5173` and the API at `http://localhost:3000`.

Docker is optional. If Docker Desktop is installed, MongoDB can be started with:

```powershell
docker compose up -d mongo
```

If `docker` is not recognized, do not run that command: start MongoDB as a local Windows service instead, then run `pnpm run dev`. A MongoDB process already listening on port `27017` is sufficient.

Useful smoke checks:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
Invoke-WebRequest http://localhost:5173 -UseBasicParsing
```

## Main routes

- `/` — public evidence-first landing page
- `/register`, `/login` — account creation and sign-in
- `/dashboard` — authenticated workspace overview
- `/scanner` — document upload, extraction, and calculation history
- `/copilot` — course-scoped, citation-bounded RAG workspace
- `/arena` — lobby, live game, replay, and results
- `/settings` — account and session controls

## Quality gates

Run the full local checks without loading a developer `.env` file into the test process:

```powershell
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm run verify
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm run test:integration
$env:MARXMATRIX_SKIP_ENV_FILE='true'; $env:NODE_ENV='test'; pnpm run test:e2e
pnpm run format
```

The integration suite uses isolated MongoDB databases and cleans them up after each run. E2E is currently a Vitest harness with no separate browser files.

## Environment safety

Keep local secrets in `apps/api/.env` and `apps/web/.env`; never commit or paste those files. Use the corresponding `.env.example` files for documented, non-secret configuration names only. If a new setting is required, append it to the end of the relevant example file.
