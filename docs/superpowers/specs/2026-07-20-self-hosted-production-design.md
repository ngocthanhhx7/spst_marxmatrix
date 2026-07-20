# Self-hosted production profile

## Context

MarxMatrix is deployed on a single Amazon Linux EC2 instance. Nginx terminates HTTPS, the API and worker run under systemd, and MongoDB 8 runs in Docker bound to `127.0.0.1:27017`. The current environment validator only accepts MongoDB Atlas and Atlas Vector Search when `NODE_ENV=production`, so the deployed API cannot use the existing self-hosted MongoDB while reporting the correct runtime mode.

The user will replace the Gemini API key directly on EC2. Environment files and generated secrets must never be committed or pushed to GitHub.

## Decision

Add an explicit boolean environment variable named `ALLOW_SELF_HOSTED_PRODUCTION`, defaulting to `false`.

When `NODE_ENV=production` and the flag is `false`, all current production rules remain unchanged: local MongoDB and the local vector repository are rejected. When the flag is `true`, only these two infrastructure checks are relaxed:

- `MONGODB_URI` may target loopback MongoDB.
- `RAG_VECTOR_PROVIDER` may be `local`.

All other production protections remain mandatory, including HTTPS cookies, non-demo mode, non-mock AI, a non-empty Gemini key, restricted CORS origins, and long non-placeholder JWT secrets.

This is preferred over running with `NODE_ENV=development`, which would misrepresent the runtime, and over disguising a loopback address with a hostname, which would bypass validation without documenting the operational choice. MongoDB Atlas remains the default and recommended scale-out production configuration.

## Environment handling

Append `ALLOW_SELF_HOSTED_PRODUCTION=false` and its documentation to `apps/api/.env.example`. No real `.env` file is added to Git.

On EC2, replace the API and web environment files directly with permissions `0600` and ownership `ec2-user:ec2-user`. Generate independent JWT secrets with `openssl rand -hex 48` on the instance without printing them. Use production URLs, secure cookies, `DEMO_MODE=false`, `AI_PROVIDER=gemini`, local MongoDB, local vector search, and `ALLOW_SELF_HOSTED_PRODUCTION=true`. Set the Gemini key to a clearly documented temporary placeholder so the API can start; the user replaces it directly on EC2 after activation.

The web production environment points to `https://api.ngocthanhhx7.site` and disables demo mode.

## Runtime flow

1. Zod parses the new boolean flag with a default of `false`.
2. Production validation evaluates the existing security rules.
3. The two Atlas-only checks are skipped only when the explicit self-hosted flag is true.
4. The activation script builds contracts, API, and web; enables and restarts API and worker; then waits for local health.
5. Nginx continues serving the web build and proxying the API through HTTPS.

## Failure handling

- A missing or invalid flag behaves as `false`; Atlas-only production validation remains enforced.
- Weak JWT secrets, insecure cookies, wildcard CORS, mock AI, demo mode, or a missing Gemini key still stop startup.
- If activation fails, inspect systemd status and redacted application logs without printing `.env`.
- Until the user replaces the Gemini placeholder, authentication and non-AI endpoints should work, while Gemini-backed requests may fail with an upstream authentication error.

## Tests and verification

- Add a failing test proving self-hosted production is rejected when the flag is absent or false.
- Add a passing test proving local MongoDB plus local vectors are accepted only when the flag is true and every other production requirement is valid.
- Add a regression test proving unrelated production safeguards still reject unsafe values with the flag enabled.
- Run the focused config tests, then full API tests, typecheck, lint, and build.
- Verify `.env` paths are ignored by Git and the worktree contains no secret file.
- On EC2, verify file mode/ownership by metadata only, service state, bound ports, local and public health endpoints, web HTTP 200, TLS certificate, and browser authentication/upload flows.

## Security boundaries

The flag documents an infrastructure tradeoff; it is not a general production-validation bypass. MongoDB remains loopback-only, API remains behind Nginx, HTTPS cookies remain required, and secrets remain outside Git. The local vector implementation is suitable for the current single-instance deployment but should be migrated to Atlas before horizontal scaling.
