# Self-Hosted Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run MarxMatrix with `NODE_ENV=production` on the existing single EC2 instance using loopback MongoDB and the persistent local vector repository, without weakening unrelated production safeguards or committing any environment secret.

**Architecture:** Add one opt-in boolean to the Zod environment schema. The flag defaults to false and only exempts the two Atlas-specific checks; every other production validation remains mandatory. Generate runtime files and JWT secrets directly on EC2, deploy the tested main branch, then verify the public web/API and authenticated document path.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, NestJS 11, pnpm 11, Amazon Linux 2023, systemd, Docker MongoDB 8, Nginx, Cloudflare, Let's Encrypt.

---

## File map

- Modify `apps/api/src/config/env.schema.ts`: parse the opt-in flag and scope the two self-hosted exemptions.
- Modify `apps/api/src/platform.spec.ts`: prove default rejection, explicit acceptance, and preservation of other production rules.
- Modify `apps/api/.env.example`: document the new non-secret option at the end of the file.
- Use `deploy/ec2/activate.sh`: build and activate the already-installed systemd deployment.
- Use `deploy/ec2/ENVIRONMENT.md`: retain user-facing instructions for replacing the Gemini key without exposing it.

### Task 1: Lock the production validation contract with failing tests

**Files:**

- Modify: `apps/api/src/platform.spec.ts`
- Test: `apps/api/src/platform.spec.ts`

- [ ] **Step 1: Add a valid production fixture and three focused assertions**

Add this fixture after `demoEnvironment`:

```ts
const selfHostedProductionEnvironment = {
  ...demoEnvironment,
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://ngocthanhhx7.site',
  CORS_ORIGINS: 'https://ngocthanhhx7.site,https://www.ngocthanhhx7.site',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_ACCESS_SECRET: 'a-production-access-secret-with-more-than-thirty-two-characters',
  JWT_REFRESH_SECRET: 'a-production-refresh-secret-with-more-than-thirty-two-characters',
  COOKIE_SECURE: 'true',
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'gemini-production-key',
  RAG_VECTOR_PROVIDER: 'local',
  DEMO_MODE: 'false'
};
```

Add these tests inside `describe('API platform')`:

```ts
it('rejects self-hosted production unless it is explicitly enabled', () => {
  expect(() => parseEnvironment(selfHostedProductionEnvironment)).toThrow(
    /MONGODB_URI|RAG_VECTOR_PROVIDER/
  );
});

it('accepts self-hosted production only with the explicit opt-in', () => {
  expect(
    parseEnvironment({
      ...selfHostedProductionEnvironment,
      ALLOW_SELF_HOSTED_PRODUCTION: 'true'
    })
  ).toMatchObject({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    RAG_VECTOR_PROVIDER: 'local',
    ALLOW_SELF_HOSTED_PRODUCTION: true
  });
});

it('keeps unrelated production safeguards enabled for self-hosted deployments', () => {
  expect(() =>
    parseEnvironment({
      ...selfHostedProductionEnvironment,
      ALLOW_SELF_HOSTED_PRODUCTION: 'true',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: '*'
    })
  ).toThrow(/COOKIE_SECURE|CORS_ORIGINS/);
});
```

- [ ] **Step 2: Run the focused test and confirm the new opt-in test fails**

Run:

```powershell
pnpm --filter @marxmatrix/api exec vitest run src/platform.spec.ts
```

Expected: the explicit opt-in case fails because `ALLOW_SELF_HOSTED_PRODUCTION` is not yet part of the parsed environment and the Atlas-only issues remain.

### Task 2: Implement the narrow opt-in and document it

**Files:**

- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/.env.example`
- Test: `apps/api/src/platform.spec.ts`

- [ ] **Step 1: Parse the flag with a secure default**

Add this field to `baseEnvironmentSchema` after `NODE_ENV`:

```ts
ALLOW_SELF_HOSTED_PRODUCTION: booleanFromString.default(false),
```

- [ ] **Step 2: Scope only the two Atlas-specific checks**

Replace the two unconditional Atlas checks inside the production block with:

```ts
if (
  !environment.ALLOW_SELF_HOSTED_PRODUCTION &&
  environment.RAG_VECTOR_PROVIDER !== 'atlas'
)
  context.addIssue({
    code: 'custom',
    path: ['RAG_VECTOR_PROVIDER'],
    message: 'RAG_VECTOR_PROVIDER must be atlas in production.'
  });
if (!environment.ALLOW_SELF_HOSTED_PRODUCTION && isLocalMongoUri(environment.MONGODB_URI))
  context.addIssue({
    code: 'custom',
    path: ['MONGODB_URI'],
    message: 'MONGODB_URI must not target localhost in production.'
  });
```

Do not place any other production check behind the flag.

- [ ] **Step 3: Append the public configuration example**

Append exactly this block to `apps/api/.env.example`:

```dotenv
# Optional; secret: no; source: explicit single-instance deployment choice; valid default: false. Set true only when production intentionally uses loopback MongoDB and the local vector repository.
ALLOW_SELF_HOSTED_PRODUCTION=false
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
pnpm --filter @marxmatrix/api exec vitest run src/platform.spec.ts
```

Expected: all `platform.spec.ts` tests pass.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
pnpm run verify
```

Expected: lint, typecheck, unit tests, and all builds pass. Existing Mongoose deprecation warnings are allowed; failures are not.

- [ ] **Step 6: Verify secret files remain ignored and commit only intentional files**

Run:

```powershell
git check-ignore -v apps/api/.env apps/web/.env apps/web/.env.production
git status --short --untracked-files=all
git add -- apps/api/src/config/env.schema.ts apps/api/src/platform.spec.ts apps/api/.env.example docs/superpowers/plans/2026-07-20-self-hosted-production.md
git diff --cached --check
git commit -m "feat(ops): support explicit self-hosted production"
```

Expected: Git reports the real env paths as ignored, and the commit contains no `.env` file.

### Task 3: Publish and configure EC2 without exposing secrets

**Files:**

- Remote-only: `/opt/marxmatrix/apps/api/.env`
- Remote-only: `/opt/marxmatrix/apps/web/.env.production`

- [ ] **Step 1: Push the tested main branch and fast-forward EC2**

Run locally:

```powershell
git push origin main
```

Then use the existing SSH key to run:

```bash
git -C /opt/marxmatrix fetch origin main
git -C /opt/marxmatrix merge --ff-only origin/main
```

Expected: local, `origin/main`, and `/opt/marxmatrix` resolve to the same commit.

- [ ] **Step 2: Create the API environment atomically on EC2**

Run this as a single remote shell. It generates secrets in variables, writes them directly to a temporary file, installs the file with mode `0600`, and prints no secret:

```bash
set -euo pipefail
umask 077
access_secret="$(openssl rand -hex 48)"
refresh_secret="$(openssl rand -hex 48)"
tmp_env="$(mktemp /tmp/marxmatrix-api-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT
cat >"$tmp_env" <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://ngocthanhhx7.site
CORS_ORIGINS=https://ngocthanhhx7.site,https://www.ngocthanhhx7.site
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=marxmatrix
GRIDFS_BUCKET_NAME=uploads
JWT_ACCESS_SECRET=$access_secret
JWT_REFRESH_SECRET=$refresh_secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
AUTH_COOKIE_NAME=marxmatrix_refresh
COOKIE_SECURE=true
AI_PROVIDER=gemini
GEMINI_API_KEY=replace-with-your-gemini-api-key
GEMINI_GENERATION_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
AI_REQUEST_TIMEOUT_MS=15000
AI_MAX_RETRIES=2
DOCUMENT_MAX_SIZE_MB=20
DOCUMENT_ALLOWED_MIME_TYPES=application/pdf
RATE_LIMIT_TTL_MS=60000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
DEMO_MODE=false
AUTH_COOKIE_SAME_SITE=lax
JWT_REFRESH_MAX_AGE_MS=604800000
RAG_VECTOR_PROVIDER=local
ALLOW_SELF_HOSTED_PRODUCTION=true
EOF
install -o ec2-user -g ec2-user -m 600 "$tmp_env" /opt/marxmatrix/apps/api/.env
```

Expected: no file contents are printed. `stat` reports `600 ec2-user ec2-user`.

- [ ] **Step 3: Create the web production environment atomically**

Run on EC2:

```bash
set -euo pipefail
umask 077
tmp_env="$(mktemp /tmp/marxmatrix-web-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT
cat >"$tmp_env" <<'EOF'
VITE_API_BASE_URL=https://api.ngocthanhhx7.site/api/v1
VITE_SOCKET_URL=https://api.ngocthanhhx7.site
VITE_APP_NAME=MarxMatrix
VITE_ENABLE_DEMO_MODE=false
EOF
install -o ec2-user -g ec2-user -m 600 "$tmp_env" /opt/marxmatrix/apps/web/.env.production
```

Expected: no file contents are printed. `stat` reports `600 ec2-user ec2-user`.

- [ ] **Step 4: Confirm metadata and Git exclusions without reading either file**

Run on EC2:

```bash
stat -c '%n %a %U %G %s %Y' /opt/marxmatrix/apps/api/.env /opt/marxmatrix/apps/web/.env.production
git -C /opt/marxmatrix status --short --ignored | grep -E 'apps/(api/\.env|web/\.env\.production)'
```

Expected: both files have mode `600`, owner/group `ec2-user`, and are ignored.

### Task 4: Activate and prove the production deployment

**Files:**

- Use: `deploy/ec2/activate.sh`
- Use: `/etc/systemd/system/marxmatrix-api.service`
- Use: `/etc/systemd/system/marxmatrix-worker.service`

- [ ] **Step 1: Activate the deployment**

Run on EC2:

```bash
sudo /opt/marxmatrix/deploy/ec2/activate.sh
```

Expected: `MarxMatrix API and worker are active.`

- [ ] **Step 2: Verify services, loopback storage, and public endpoints**

Run on EC2:

```bash
systemctl is-active marxmatrix-api marxmatrix-worker nginx docker certbot-renew.timer
sudo docker inspect -f '{{.State.Status}}' marxmatrix-mongo
curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null
sudo ss -lntp
```

Run locally:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://ngocthanhhx7.site
curl.exe -sS -o NUL -w "%{http_code}" https://api.ngocthanhhx7.site/api/v1/health
```

Expected: all services are active, MongoDB is running and bound only to loopback, both public endpoints return `200`, and port 3000 is not exposed publicly.

- [ ] **Step 3: Verify TLS and renewal**

Run on EC2:

```bash
sudo nginx -t
sudo openssl x509 -checkend 2592000 -noout -in /etc/letsencrypt/live/ngocthanhhx7.site/fullchain.pem
systemctl is-enabled certbot-renew.timer
```

Expected: Nginx configuration succeeds, the certificate is valid for more than 30 days, and renewal is enabled.

- [ ] **Step 4: Exercise authenticated production behavior**

Register a uniquely named QA account through the public API, persist its refresh cookie in a temporary cookie jar, verify login/session refresh, and upload a small valid PDF through the Copilot document endpoint. Use random credentials that are never committed. Delete the temporary local cookie/PDF files after the checks. If the product has no supported API for deleting the QA account/document, report the exact retained QA records rather than deleting production data directly.

Expected: registration, login/session refresh, route authorization, document upload, and job creation return their documented success statuses. Gemini-backed generation is expected to remain unavailable until the user replaces the placeholder key.

- [ ] **Step 5: Hand off the Gemini key replacement without reading it**

Tell the user to run:

```bash
nano /opt/marxmatrix/apps/api/.env
sudo systemctl restart marxmatrix-api marxmatrix-worker
curl -fsS https://api.ngocthanhhx7.site/api/v1/health
```

Expected: the user replaces only `GEMINI_API_KEY`, services restart, and health remains successful. Do not ask the user to paste the key into chat.
