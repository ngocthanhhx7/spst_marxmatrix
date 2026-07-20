## Deploy Configuration (configured by /setup-deploy)

- Platform: Custom AWS EC2 (Amazon Linux 2023 ARM64) via SSH
- Production URL: https://ngocthanhhx7.site
- Deploy workflow: Manual fast-forward pull from `main` on `/opt/marxmatrix`
- Deploy status command: `curl -fsS https://api.ngocthanhhx7.site/api/v1/health`
- Merge method: merge to `main`
- Project type: React web app, NestJS API and worker
- Post-deploy health check: `https://api.ngocthanhhx7.site/api/v1/health`

### Custom deploy hooks

- Pre-merge: `pnpm run verify`
- Deploy trigger: SSH to EC2, then run `sudo /opt/marxmatrix/deploy/ec2/update.sh`
- Deploy status: `sudo systemctl status marxmatrix-api marxmatrix-worker nginx docker --no-pager`
- Health check: `curl -fsS https://api.ngocthanhhx7.site/api/v1/health`
