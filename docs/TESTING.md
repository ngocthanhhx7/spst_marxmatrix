# Testing

Run agent/test verification with `MARXMATRIX_SKIP_ENV_FILE=true pnpm dlx pnpm@11.15.0 verify`; this prevents test tooling from loading a user `.env`. Normal development remains free to load its runtime environment file.

Identity integration tests use `MONGODB_URI` at `127.0.0.1:27017` and create a process-unique `marxmatrix_identity_*` database. The suite drops only that exact database after completion. It exercises registration, login equivalence, authenticated `/me`, refresh rotation/replay rejection, and logout revocation.

The web unit suite uses Vitest jsdom and React Testing Library. Fetch is injected into the API client to cover refresh single-flight and retry behavior without an MSW dependency.

Session restoration is covered under React StrictMode: one cookie refresh restores a direct protected route, while a failed refresh resolves to login without a retry loop.
