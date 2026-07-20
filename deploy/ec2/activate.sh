#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo /opt/marxmatrix/deploy/ec2/activate.sh"
  exit 1
fi

APP_USER="${APP_USER:-ec2-user}"
APP_DIR="${APP_DIR:-/opt/marxmatrix}"
user_home="$(getent passwd "${APP_USER}" | cut -d: -f6)"

if [[ ! -s "${APP_DIR}/apps/api/.env" || ! -s "${APP_DIR}/apps/web/.env.production" ]]; then
  echo "Environment files are missing or empty. Follow deploy/ec2/ENVIRONMENT.md first."
  exit 1
fi

run_as_app() {
  sudo -u "${APP_USER}" env HOME="${user_home}" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

cd "${APP_DIR}"
run_as_app pnpm --filter @marxmatrix/contracts build
run_as_app pnpm --filter @marxmatrix/api build
run_as_app pnpm --filter @marxmatrix/web build

systemctl enable marxmatrix-api marxmatrix-worker
systemctl restart marxmatrix-api marxmatrix-worker

for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then
    systemctl reload nginx
    echo "MarxMatrix API and worker are active."
    exit 0
  fi
  sleep 2
done

echo "API health check failed. Inspect without printing .env:"
echo "  sudo systemctl status marxmatrix-api --no-pager"
echo "  sudo journalctl -u marxmatrix-api -n 80 --no-pager"
exit 1
