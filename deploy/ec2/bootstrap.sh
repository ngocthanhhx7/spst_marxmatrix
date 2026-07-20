#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/ec2/bootstrap.sh"
  exit 1
fi

APP_USER="${APP_USER:-ec2-user}"
APP_DIR="${APP_DIR:-/opt/marxmatrix}"
REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/ngocthanhhx7/spst_marxmatrix.git}"
WEB_ORIGIN="${WEB_ORIGIN:-https://ngocthanhhx7.site}"
API_ORIGIN="${API_ORIGIN:-https://api.ngocthanhhx7.site}"

dnf install -y git docker nginx certbot python3-certbot-nginx curl openssl tar xz
systemctl enable --now docker

if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

NODE_VERSION="$(${CURL:-curl} -fsSL https://nodejs.org/dist/index.json | python3 -c "import json,sys; print(next(item['version'] for item in json.load(sys.stdin) if item['version'].startswith('v24.') and item.get('lts')))" )"
NODE_ARCHIVE="node-${NODE_VERSION}-linux-arm64.tar.xz"
NODE_PREFIX="/opt/node-${NODE_VERSION}"

if [[ ! -x "${NODE_PREFIX}/bin/node" ]]; then
  work_dir="$(mktemp -d)"
  trap 'rm -rf "${work_dir}"' EXIT
  cd "${work_dir}"
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}"
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
  grep " ${NODE_ARCHIVE}$" SHASUMS256.txt | sha256sum -c -
  mkdir -p "${NODE_PREFIX}"
  tar -xJf "${NODE_ARCHIVE}" --strip-components=1 -C "${NODE_PREFIX}"
fi

for binary in node npm npx corepack; do
  ln -sfn "${NODE_PREFIX}/bin/${binary}" "/usr/local/bin/${binary}"
done
npm install --global pnpm@11.15.0
ln -sfn "${NODE_PREFIX}/bin/pnpm" /usr/local/bin/pnpm
ln -sfn "${NODE_PREFIX}/bin/pnpx" /usr/local/bin/pnpx

if [[ -e "${APP_DIR}" && ! -d "${APP_DIR}/.git" ]]; then
  echo "${APP_DIR} exists but is not a Git repository; refusing to overwrite it."
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}"
  sudo -u "${APP_USER}" git clone --branch main --single-branch "${REPOSITORY_URL}" "${APP_DIR}"
else
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only origin main
fi

user_home="$(getent passwd "${APP_USER}" | cut -d: -f6)"
run_as_app() {
  sudo -u "${APP_USER}" env HOME="${user_home}" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

cd "${APP_DIR}"
run_as_app pnpm install --frozen-lockfile
run_as_app pnpm --filter @marxmatrix/contracts build
run_as_app pnpm --filter @marxmatrix/api build
run_as_app env \
  VITE_API_BASE_URL="${API_ORIGIN}/api/v1" \
  VITE_SOCKET_URL="${API_ORIGIN}" \
  VITE_APP_NAME="MarxMatrix" \
  VITE_ENABLE_DEMO_MODE="false" \
  pnpm --filter @marxmatrix/web build

if [[ ! -f "${APP_DIR}/apps/api/.env" ]]; then
  install -m 600 -o "${APP_USER}" -g "${APP_USER}" \
    "${APP_DIR}/apps/api/.env.example" "${APP_DIR}/apps/api/.env"
fi
if [[ ! -f "${APP_DIR}/apps/web/.env.production" ]]; then
  install -m 600 -o "${APP_USER}" -g "${APP_USER}" \
    "${APP_DIR}/apps/web/.env.example" "${APP_DIR}/apps/web/.env.production"
fi

if ! docker container inspect marxmatrix-mongo >/dev/null 2>&1; then
  docker run -d \
    --name marxmatrix-mongo \
    --restart unless-stopped \
    -p 127.0.0.1:27017:27017 \
    -v marxmatrix-mongo-data:/data/db \
    mongo:8.0
else
  docker start marxmatrix-mongo >/dev/null || true
fi

install -m 644 "${APP_DIR}/deploy/ec2/marxmatrix-api.service" /etc/systemd/system/marxmatrix-api.service
install -m 644 "${APP_DIR}/deploy/ec2/marxmatrix-worker.service" /etc/systemd/system/marxmatrix-worker.service
install -m 644 "${APP_DIR}/deploy/ec2/nginx-marxmatrix.conf" /etc/nginx/conf.d/marxmatrix.conf
systemctl daemon-reload
nginx -t
systemctl enable --now nginx

echo "Bootstrap complete. Edit the two environment files, then run:"
echo "  sudo ${APP_DIR}/deploy/ec2/activate.sh"
