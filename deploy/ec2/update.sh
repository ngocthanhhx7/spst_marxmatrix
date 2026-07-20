#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/opt/marxmatrix"
readonly APP_USER="ec2-user"
readonly REMOTE="origin"
readonly BRANCH="main"
readonly EXPECTED_REMOTE_URL="https://github.com/ngocthanhhx7/spst_marxmatrix.git"
readonly API_ENV="${APP_DIR}/apps/api/.env"
readonly WEB_ENV="${APP_DIR}/apps/web/.env.production"
readonly API_UNIT_TARGET="/etc/systemd/system/marxmatrix-api.service"
readonly WORKER_UNIT_TARGET="/etc/systemd/system/marxmatrix-worker.service"
readonly NGINX_TARGET="/etc/nginx/conf.d/marxmatrix.conf"
readonly CLOUDFLARE_TARGET="/etc/nginx/conf.d/cloudflare-realip.conf"

CURRENT_STEP="initialization"
app_home=""
root_work_dir=""

on_error() {
  local line="$1"
  echo "Update failed during ${CURRENT_STEP} at line ${line}. No environment values were printed." >&2
}

cleanup_temporary_files() {
  if [[ -n "${root_work_dir:-}" && "${root_work_dir}" == /tmp/marxmatrix-update-work.* && -d "${root_work_dir}" ]]; then
    rm -rf -- "${root_work_dir}"
  fi
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" == "1" && -n "${MARXMATRIX_UPDATE_RUNNER_PATH:-}" ]]; then
    rm -f -- "${MARXMATRIX_UPDATE_RUNNER_PATH}"
  fi
}

resolve_app_home() {
  local passwd_entry shell_field
  if ! passwd_entry="$(getent passwd "${APP_USER}")" || [[ -z "${passwd_entry}" ]]; then
    echo "Application user ${APP_USER} does not exist." >&2
    return 1
  fi
  IFS=: read -r _ _ _ _ _ app_home shell_field <<< "${passwd_entry}"
  if [[ -z "${app_home}" ]]; then
    echo "Application user ${APP_USER} has no home directory." >&2
    return 1
  fi
}

run_as_app() {
  sudo -u "${APP_USER}" env HOME="${app_home}" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

verify_clean_worktree() {
  local repository="$1" status
  status="$(run_as_app git -C "${repository}" status --porcelain --untracked-files=no)"
  if [[ -n "${status}" ]]; then
    echo "Tracked files have local changes; refusing to update." >&2
    return 1
  fi
}

verify_expected_remote() {
  local repository="$1" actual_url
  if ! actual_url="$(run_as_app git -C "${repository}" remote get-url "${REMOTE}")"; then
    echo "Required Git remote ${REMOTE} is missing." >&2
    return 1
  fi
  if [[ "${actual_url}" != "${EXPECTED_REMOTE_URL}" ]]; then
    echo "Git remote ${REMOTE} does not match the trusted MarxMatrix repository." >&2
    return 1
  fi
}

verify_target_does_not_track_env() {
  local repository="$1" ref="$2" tracked_paths
  tracked_paths="$(run_as_app git -C "${repository}" ls-tree -r --name-only "${ref}" -- \
    apps/api/.env apps/web/.env.production)"
  if [[ -n "${tracked_paths}" ]]; then
    echo "Fetched commit tracks a runtime environment file; refusing to merge." >&2
    return 1
  fi
}

fast_forward() {
  local repository="$1" ref="$2"
  run_as_app git -C "${repository}" merge --ff-only "${ref}"
}

require_environment_files() {
  if [[ ! -s "${API_ENV}" || ! -s "${WEB_ENV}" ]]; then
    echo "Environment files are missing or empty. Follow deploy/ec2/ENVIRONMENT.md first." >&2
    return 1
  fi
}

acquire_update_lock() {
  local lock_path="$1"
  exec 9>"${lock_path}"
  flock -n 9
}

reexec_from_temporary_runner() {
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" == "1" ]]; then return; fi
  local runner
  runner="$(mktemp /tmp/marxmatrix-update.XXXXXX)"
  export MARXMATRIX_UPDATE_RUNNER=1
  export MARXMATRIX_UPDATE_RUNNER_PATH="${runner}"
  trap cleanup_temporary_files EXIT
  install -m 700 "${BASH_SOURCE[0]}" "${runner}"
  exec "${runner}"
}

render_api_unit() {
  local target="$1"
  cat > "${target}" <<'UNIT'
[Unit]
Description=MarxMatrix API
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/marxmatrix/apps/api
ExecStart=/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/marxmatrix

[Install]
WantedBy=multi-user.target
UNIT
}

render_worker_unit() {
  local target="$1"
  cat > "${target}" <<'UNIT'
[Unit]
Description=MarxMatrix document worker
After=network-online.target docker.service marxmatrix-api.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/marxmatrix/apps/api
ExecStart=/usr/local/bin/node /opt/marxmatrix/apps/api/dist/worker.js
Restart=always
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/marxmatrix

[Install]
WantedBy=multi-user.target
UNIT
}

render_nginx_config() {
  local target="$1"
  cat > "${target}" <<'NGINX'
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

map $http_x_forwarded_proto $forwarded_proto {
  default $http_x_forwarded_proto;
  '' $scheme;
}

server {
  listen 80;
  listen [::]:80;
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ngocthanhhx7.site www.ngocthanhhx7.site;

  ssl_certificate /etc/letsencrypt/live/ngocthanhhx7.site/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ngocthanhhx7.site/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  root /opt/marxmatrix/apps/web/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location ~* \.(?:css|js|mjs|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
    expires 7d;
    add_header Cache-Control "public, max-age=604800, immutable";
    try_files $uri =404;
  }

  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header X-Frame-Options SAMEORIGIN always;
}

server {
  listen 80;
  listen [::]:80;
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name api.ngocthanhhx7.site;

  ssl_certificate /etc/letsencrypt/live/ngocthanhhx7.site/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ngocthanhhx7.site/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  client_max_body_size 100m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $forwarded_proto;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
}
NGINX
}

install_file() { install "$@"; }
systemd_daemon_reload() { systemctl daemon-reload; }
nginx_test() { nginx -t; }
nginx_service() { systemctl "$@"; }

backup_target() {
  local backup_dir="$1" target="$2" name="$3" label="$4"
  if [[ -L "${target}" || ( -e "${target}" && ! -f "${target}" ) ]]; then
    echo "Existing ${label} target ${target} is not a regular file." >&2
    return 1
  fi
  if [[ -e "${target}" ]]; then
    cp -p -- "${target}" "${backup_dir}/${name}"
    : > "${backup_dir}/${name}.existed"
  fi
}

restore_target() {
  local backup_dir="$1" target="$2" name="$3"
  if [[ -f "${backup_dir}/${name}.existed" ]]; then
    install_file -m 644 "${backup_dir}/${name}" "${target}"
  else
    rm -f -- "${target}"
  fi
}

backup_systemd_units() {
  local backup_dir="$1" api_target="$2" worker_target="$3"
  backup_target "${backup_dir}" "${api_target}" api.service "systemd unit"
  backup_target "${backup_dir}" "${worker_target}" worker.service "systemd unit"
}

restore_systemd_units() {
  local backup_dir="$1" api_target="$2" worker_target="$3" failed=0
  restore_target "${backup_dir}" "${api_target}" api.service || failed=1
  restore_target "${backup_dir}" "${worker_target}" worker.service || failed=1
  systemd_daemon_reload || failed=1
  return "${failed}"
}

install_units_atomically() {
  local api_source="$1" worker_source="$2" api_target="$3" worker_target="$4" backup_dir="$5"
  backup_systemd_units "${backup_dir}" "${api_target}" "${worker_target}" || return 1
  if ! install_file -m 644 "${api_source}" "${api_target}" || \
    ! install_file -m 644 "${worker_source}" "${worker_target}"; then
    restore_systemd_units "${backup_dir}" "${api_target}" "${worker_target}" || true
    return 1
  fi
  if ! systemd_daemon_reload; then
    restore_systemd_units "${backup_dir}" "${api_target}" "${worker_target}" || true
    return 1
  fi
  rm -f -- "${backup_dir}/api.service" "${backup_dir}/api.service.existed" \
    "${backup_dir}/worker.service" "${backup_dir}/worker.service.existed"
}

backup_nginx_configs() {
  local backup_dir="$1" nginx_target="$2" cloudflare_target="$3"
  backup_target "${backup_dir}" "${nginx_target}" marxmatrix.conf "Nginx configuration"
  backup_target "${backup_dir}" "${cloudflare_target}" cloudflare-realip.conf "Nginx configuration"
}

restore_nginx_configs() {
  local backup_dir="$1" nginx_target="$2" cloudflare_target="$3" failed=0
  restore_target "${backup_dir}" "${nginx_target}" marxmatrix.conf || failed=1
  restore_target "${backup_dir}" "${cloudflare_target}" cloudflare-realip.conf || failed=1
  return "${failed}"
}

rollback_nginx_configs() {
  local backup_dir="$1" nginx_target="$2" cloudflare_target="$3" failed=0
  CURRENT_STEP="restoring previous Nginx configuration"
  restore_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || failed=1
  nginx_test || failed=1
  if nginx_service is-active --quiet nginx; then nginx_service reload nginx || failed=1; fi
  return "${failed}"
}

install_nginx_atomically() {
  local source="$1" cloudflare_candidate="$2" backup_dir="$3" nginx_target="$4" cloudflare_target="$5"
  backup_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || return 1
  if ! install_file -m 644 "${source}" "${nginx_target}" || \
    ! install_file -m 644 "${cloudflare_candidate}" "${cloudflare_target}"; then
    rollback_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || true
    return 1
  fi
  CURRENT_STEP="validating staged Nginx configuration"
  if ! nginx_test; then
    rollback_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || true
    return 1
  fi
  CURRENT_STEP="enabling Nginx"
  if ! nginx_service enable --now nginx; then
    rollback_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || true
    return 1
  fi
  CURRENT_STEP="reloading staged Nginx configuration"
  if ! nginx_service reload nginx; then
    rollback_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}" || true
    return 1
  fi
  rm -f -- "${backup_dir}/marxmatrix.conf" "${backup_dir}/marxmatrix.conf.existed" \
    "${backup_dir}/cloudflare-realip.conf" "${backup_dir}/cloudflare-realip.conf.existed"
}

fetch_cloudflare_ranges() { curl -fsSL "$1" -o "$2"; }

validate_cloudflare_ranges() {
  local source="$1" version="$2"
  if ! python3 - "${source}" "${version}" <<'PY'
import ipaddress
import pathlib
import sys

lines = [line.strip() for line in pathlib.Path(sys.argv[1]).read_text(encoding="ascii").splitlines() if line.strip()]
if not lines:
    raise SystemExit(1)
try:
    networks = [ipaddress.ip_network(line, strict=False) for line in lines]
except ValueError:
    raise SystemExit(1)
if any(network.version != int(sys.argv[2]) for network in networks):
    raise SystemExit(1)
PY
  then
    echo "Cloudflare IPv${version} endpoint returned empty or invalid ranges." >&2
    return 1
  fi
}

generate_cloudflare_config() {
  local candidate="$1" work_dir="$2" range
  local v4_file="${work_dir}/cloudflare-v4.txt" v6_file="${work_dir}/cloudflare-v6.txt"
  fetch_cloudflare_ranges https://www.cloudflare.com/ips-v4/ "${v4_file}" || return 1
  fetch_cloudflare_ranges https://www.cloudflare.com/ips-v6/ "${v6_file}" || return 1
  validate_cloudflare_ranges "${v4_file}" 4 || return 1
  validate_cloudflare_ranges "${v6_file}" 6 || return 1
  {
    echo '# Generated from validated Cloudflare official IP range endpoints.'
    while IFS= read -r range; do [[ -n "${range}" ]] && printf 'set_real_ip_from %s;\n' "${range}"; done < "${v4_file}"
    while IFS= read -r range; do [[ -n "${range}" ]] && printf 'set_real_ip_from %s;\n' "${range}"; done < "${v6_file}"
    echo 'real_ip_header CF-Connecting-IP;'
    echo 'real_ip_recursive on;'
  } > "${candidate}"
}

build_and_activate() {
  CURRENT_STEP="building contracts"
  run_as_app pnpm -C "${APP_DIR}" --filter @marxmatrix/contracts build
  CURRENT_STEP="building API"
  run_as_app pnpm -C "${APP_DIR}" --filter @marxmatrix/api build
  CURRENT_STEP="building web application"
  run_as_app pnpm -C "${APP_DIR}" --filter @marxmatrix/web build
  CURRENT_STEP="enabling application services"
  systemctl enable marxmatrix-api marxmatrix-worker
  CURRENT_STEP="restarting application services"
  systemctl restart marxmatrix-api marxmatrix-worker
  CURRENT_STEP="waiting for local API health"
  local attempt
  for attempt in {1..20}; do
    if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then
      systemctl reload nginx
      return 0
    fi
    sleep 2
  done
  echo "API health check failed after service restart." >&2
  return 1
}

verify_final_state() {
  CURRENT_STEP="checking service state"
  systemctl is-active --quiet marxmatrix-api
  systemctl is-active --quiet marxmatrix-worker
  systemctl is-active --quiet nginx
  systemctl is-active --quiet docker
  CURRENT_STEP="checking local API health"
  curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null
  CURRENT_STEP="checking local API readiness"
  curl -fsS http://127.0.0.1:3000/api/v1/ready >/dev/null
  CURRENT_STEP="checking local HTTPS web origin"
  curl --resolve "ngocthanhhx7.site:443:127.0.0.1" -fsS https://ngocthanhhx7.site/ >/dev/null
  CURRENT_STEP="checking for immediate restart loops"
  sleep 5
  systemctl is-active --quiet marxmatrix-api
  systemctl is-active --quiet marxmatrix-worker
}

main() {
  trap 'on_error "$LINENO"' ERR
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run with sudo: sudo /opt/marxmatrix/deploy/ec2/update.sh" >&2
    exit 1
  fi
  CURRENT_STEP="acquiring update lock"
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" != "1" ]]; then
    if ! acquire_update_lock /var/lock/marxmatrix-update.lock; then
      echo "Another MarxMatrix update is already running; refusing concurrent update." >&2
      exit 1
    fi
  elif ! flock -n 9; then
    echo "Protected updater did not inherit its update lock." >&2
    exit 1
  fi
  CURRENT_STEP="creating protected update runner"
  reexec_from_temporary_runner
  trap cleanup_temporary_files EXIT

  CURRENT_STEP="resolving application user"
  resolve_app_home
  CURRENT_STEP="validating deployment repository"
  if [[ ! -d "${APP_DIR}" ]] || ! run_as_app git -C "${APP_DIR}" rev-parse --is-inside-work-tree >/dev/null; then
    echo "${APP_DIR} is not a Git repository; refusing to update." >&2
    exit 1
  fi
  require_environment_files
  verify_clean_worktree "${APP_DIR}"
  verify_expected_remote "${APP_DIR}"

  local old_commit new_commit
  old_commit="$(run_as_app git -C "${APP_DIR}" rev-parse HEAD)"
  CURRENT_STEP="fetching trusted main branch"
  run_as_app git -C "${APP_DIR}" fetch "${REMOTE}" "${BRANCH}"
  CURRENT_STEP="checking fetched environment-file metadata"
  verify_target_does_not_track_env "${APP_DIR}" FETCH_HEAD
  CURRENT_STEP="fast-forwarding worktree"
  fast_forward "${APP_DIR}" FETCH_HEAD
  new_commit="$(run_as_app git -C "${APP_DIR}" rev-parse HEAD)"

  CURRENT_STEP="installing workspace dependencies"
  run_as_app pnpm -C "${APP_DIR}" install --frozen-lockfile
  CURRENT_STEP="rendering protected privileged templates"
  root_work_dir="$(mktemp -d /tmp/marxmatrix-update-work.XXXXXX)"
  chmod 700 "${root_work_dir}"
  mkdir -m 700 "${root_work_dir}/systemd-backup" "${root_work_dir}/nginx-backup"
  render_api_unit "${root_work_dir}/marxmatrix-api.service"
  render_worker_unit "${root_work_dir}/marxmatrix-worker.service"
  render_nginx_config "${root_work_dir}/nginx-marxmatrix-tls.conf"
  if command -v systemd-analyze >/dev/null; then
    systemd-analyze verify "${root_work_dir}/marxmatrix-api.service" "${root_work_dir}/marxmatrix-worker.service"
  fi
  CURRENT_STEP="validating Cloudflare IP ranges"
  generate_cloudflare_config "${root_work_dir}/cloudflare-realip.conf" "${root_work_dir}"

  CURRENT_STEP="installing systemd units transactionally"
  install_units_atomically "${root_work_dir}/marxmatrix-api.service" \
    "${root_work_dir}/marxmatrix-worker.service" "${API_UNIT_TARGET}" "${WORKER_UNIT_TARGET}" \
    "${root_work_dir}/systemd-backup"
  CURRENT_STEP="installing Nginx configuration atomically"
  install_nginx_atomically "${root_work_dir}/nginx-marxmatrix-tls.conf" \
    "${root_work_dir}/cloudflare-realip.conf" "${root_work_dir}/nginx-backup" \
    "${NGINX_TARGET}" "${CLOUDFLARE_TARGET}"

  build_and_activate
  verify_final_state
  echo "Updated ${old_commit} -> ${new_commit}"
  echo "Update complete. Rerun this command to apply privileged template changes fetched during this update."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
