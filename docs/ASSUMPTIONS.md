# Assumptions

- The approved design and implementation plan authorize the delivery sequence without intermediate approval pauses.
- Local development uses web port 5173, API port 3000, and MongoDB port 27017.
- MongoDB transactions are not a prerequisite for MVP correctness; atomic updates, unique indexes, idempotency keys, and compensating cleanup are the intended model.
- Searchable PDFs are in scope. OCR is explicitly unsupported.
- Gemini and Atlas are optional locally. Their production adapters must fail safely when configuration is absent.
- The environment’s Node version is checked before install; pnpm 11.15.0 is the project package-manager pin. The API uses Node 22 declaration types while retaining a runtime floor of Node 22.22.0.
- `docker-compose.yml` defines only local MongoDB storage. Docker is unavailable in this environment, so its compose smoke test is not locally verified.
- `gsap-skills/` was pre-existing, untracked user content at task start. It is not product code or a dependency.
