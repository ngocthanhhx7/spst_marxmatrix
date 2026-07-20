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

MongoDB Atlas must contain a vector-search index named `rag_chunks_vector_index` over the `embedding` field, with filter fields for `ownerId`, `courseId`, `documentId`, and `parseToken`.

## Activate after editing

```bash
sudo /opt/marxmatrix/deploy/ec2/activate.sh
sudo systemctl status marxmatrix-api marxmatrix-worker --no-pager
curl -fsS https://api.ngocthanhhx7.site/api/v1/health
```

## Update after merging to `main`

The updater fast-forwards the checked-out repository, then uses its protected temporary runner to build the application, render and transactionally install its embedded systemd and Nginx templates, restart services, and run local health checks directly. It intentionally does not consume privileged configuration or execute deployment scripts from the newly pulled worktree as root. A privileged template change fetched during an update takes effect on the next invocation because the current run continues from its protected pre-fetch copy; rerunning the idempotent command is safe. The updater refuses concurrent updates, dirty tracked files, missing environment files, and non-fast-forward history. It never copies, prints, or changes either environment file.

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
