# MarxMatrix EC2 environment guide

The deployment keeps secrets only in two untracked files on the EC2 instance:

- `/opt/marxmatrix/apps/api/.env`
- `/opt/marxmatrix/apps/web/.env.production`

SSH into the instance and edit them directly. Do not paste their contents into chat, Git, screenshots, or support tickets.

```bash
ssh -i "C:\Users\nguye\OneDrive - nguyenngocthanhhx7\key\marxmatrix.pem" ec2-user@ec2-100-27-194-124.compute-1.amazonaws.com
nano /opt/marxmatrix/apps/api/.env
nano /opt/marxmatrix/apps/web/.env.production
```

## Web values

The web environment contains public build-time values, not server secrets:

```dotenv
VITE_API_BASE_URL=https://api.ngocthanhhx7.site/api/v1
VITE_SOCKET_URL=https://api.ngocthanhhx7.site
VITE_APP_NAME=MarxMatrix
VITE_ENABLE_DEMO_MODE=false
```

## API values for first deployment with EC2-local MongoDB

This profile gets the site working with the MongoDB container installed by `bootstrap.sh`. For a self-hosted production deployment, use `NODE_ENV=production` and explicitly allow the self-hosted vector configuration.

Use these non-secret values and keep the remaining defaults from `.env.example`:

```dotenv
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://ngocthanhhx7.site
CORS_ORIGINS=https://ngocthanhhx7.site,https://www.ngocthanhhx7.site
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=marxmatrix
GRIDFS_BUCKET_NAME=uploads
COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
AI_PROVIDER=gemini
RAG_VECTOR_PROVIDER=local
ALLOW_SELF_HOSTED_PRODUCTION=true
DEMO_MODE=false
```

Enable the education-and-finance chat workspace with these non-secret values:

```dotenv
CHAT_ENABLED=true
GEMINI_CHAT_MODEL=<same validated multimodal model selected for chat>
CHAT_AI_TIMEOUT_MS=60000
CHAT_AI_MAX_RETRIES=2
CHAT_MAX_CONTEXT_MESSAGES=20
CHAT_MAX_CONTEXT_BYTES=100000
CHAT_MAX_RUN_AGE_MS=180000
CHAT_RATE_LIMIT_PER_MINUTE=10
```

Keep the existing `GEMINI_API_KEY`; do not paste it into chat, tickets, logs, or shell history. Confirm that `GEMINI_CHAT_MODEL` accepts both image input and structured output before restarting the API.

Set `GEMINI_API_KEY` yourself. Generate two different JWT secrets directly on EC2:

```bash
openssl rand -hex 48
openssl rand -hex 48
```

Paste the first output into `JWT_ACCESS_SECRET` and the second into `JWT_REFRESH_SECRET`. Never reuse them and never commit them.

## Production profile with MongoDB Atlas

For the production validation rules, change these values:

```dotenv
NODE_ENV=production
MONGODB_URI=mongodb+srv://YOUR_ATLAS_CONNECTION_STRING
RAG_VECTOR_PROVIDER=atlas
COOKIE_SECURE=true
AI_PROVIDER=gemini
DEMO_MODE=false
```

MongoDB Atlas must contain a vector-search index named `rag_chunks_vector_index` over the `embedding` field with `numDimensions: 768`, plus filter fields for `ownerId`, `courseId`, `documentId`, and `parseToken`. After changing to `gemini-embedding-2`, recreate the index if necessary and re-index or re-upload every previously ready document; vectors from the former model are not compatible.

## Activate after editing

```bash
sudo /opt/marxmatrix/deploy/ec2/activate.sh
sudo systemctl status marxmatrix-api marxmatrix-worker --no-pager
curl -fsS https://api.ngocthanhhx7.site/api/v1/health
```

## Update after merging to `main`

The updater fast-forwards the checked-out repository, then uses protected temporary runners to build the application, render and transactionally install embedded systemd and Nginx templates, restart services, and run local health checks directly. If the updater changed, the same command verifies the fetched updater against the trusted fast-forwarded commit and internally starts a second protected pass, so new privileged templates take effect immediately without an operator rerun. It intentionally does not consume privileged configuration directly from the pulled worktree. The updater refuses concurrent updates, dirty tracked files, missing environment files, and non-fast-forward history. It never copies, prints, or changes either environment file.

```bash
sudo /opt/marxmatrix/deploy/ec2/update.sh
```

If you change `GEMINI_API_KEY` in the API environment file, restart the API and worker after saving it:

```bash
sudo systemctl restart marxmatrix-api marxmatrix-worker
```

Changing API `.env` later only requires a service restart:

```bash
sudo systemctl restart marxmatrix-api marxmatrix-worker
```

Changing web `.env.production` requires a rebuild:

```bash
cd /opt/marxmatrix
pnpm --filter @marxmatrix/web build
sudo systemctl reload nginx
```

## Cloudflare SSL mode

The EC2 origin has a Let's Encrypt certificate. In Cloudflare, set **SSL/TLS encryption mode** to **Full (strict)**. Do not use Flexible mode in production. The installed Nginx configuration temporarily accepts both HTTP and HTTPS at the origin so an existing Flexible setting cannot create a redirect loop.
