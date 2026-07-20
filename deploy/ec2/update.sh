#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/opt/marxmatrix"
readonly APP_USER="ec2-user"
readonly REMOTE="origin"
readonly BRANCH="main"
readonly EXPECTED_REMOTE_URL="https://github.com/ngocthanhhx7/spst_marxmatrix.git"
readonly API_ENV="${APP_DIR}/apps/api/.env"
readonly WEB_ENV="${APP_DIR}/apps/web/.env.production"
readonly API_UNIT_SOURCE="${APP_DIR}/deploy/ec2/marxmatrix-api.service"
readonly WORKER_UNIT_SOURCE="${APP_DIR}/deploy/ec2/marxmatrix-worker.service"
readonly NGINX_SOURCE="${APP_DIR}/deploy/ec2/nginx-marxmatrix-tls.conf"
readonly API_UNIT_TARGET="/etc/systemd/system/marxmatrix-api.service"
readonly WORKER_UNIT_TARGET="/etc/systemd/system/marxmatrix-worker.service"
readonly NGINX_TARGET="/etc/nginx/conf.d/marxmatrix.conf"
readonly CLOUDFLARE_TARGET="/etc/nginx/conf.d/cloudflare-realip.conf"

CURRENT_STEP="initialization"
app_home=""
nginx_work_dir=""

on_error() {
  local line="$1"
  echo "Update failed during ${CURRENT_STEP} at line ${line}. No environment values were printed." >&2
}

cleanup_temporary_files() {
  if [[ -n "${nginx_work_dir:-}" && "${nginx_work_dir}" == /tmp/marxmatrix-nginx.* && -d "${nginx_work_dir}" ]]; then
    rm -rf -- "${nginx_work_dir}"
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

require_environment_files() {
  if [[ ! -s "${API_ENV}" || ! -s "${WEB_ENV}" ]]; then
    echo "Environment files are missing or empty. Follow deploy/ec2/ENVIRONMENT.md first." >&2
    return 1
  fi
}

reexec_from_temporary_runner() {
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" == "1" ]]; then
    return
  fi
  local runner
  runner="$(mktemp /tmp/marxmatrix-update.XXXXXX)"
  export MARXMATRIX_UPDATE_RUNNER=1
  export MARXMATRIX_UPDATE_RUNNER_PATH="${runner}"
  trap cleanup_temporary_files EXIT
  install -m 700 "${BASH_SOURCE[0]}" "${runner}"
  exec "${runner}"
}

validate_regular_file() {
  local path="$1" label="$2"
  if [[ ! -f "${path}" || -L "${path}" ]]; then
    echo "${label} must be a regular, non-symlink file." >&2
    return 1
  fi
}

validate_unit_file() {
  local path="$1" expected_exec="$2" count
  validate_regular_file "${path}" "Systemd unit" || return 1

  count="$(grep -Fxc 'User=ec2-user' "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has an invalid User directive." >&2; return 1; }
  count="$(grep -Ec '^User=' "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has multiple User directives." >&2; return 1; }
  count="$(grep -Fxc 'Group=ec2-user' "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has an invalid Group directive." >&2; return 1; }
  count="$(grep -Ec '^Group=' "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has multiple Group directives." >&2; return 1; }
  count="$(grep -Fxc "ExecStart=${expected_exec}" "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has an unexpected ExecStart directive." >&2; return 1; }
  count="$(grep -Ec '^ExecStart=' "${path}" || true)"
  [[ "${count}" == 1 ]] || { echo "Systemd unit has multiple ExecStart directives." >&2; return 1; }
  if grep -Eq '^Exec(StartPre|StartPost|Condition|Reload|Stop|StopPost)=' "${path}"; then
    echo "Systemd unit contains an unapproved executable directive." >&2
    return 1
  fi
}

validate_nginx_source() {
  local path="$1"
  validate_regular_file "${path}" "Nginx configuration" || return 1
  grep -Eq '^[[:space:]]*server_name ngocthanhhx7[.]site www[.]ngocthanhhx7[.]site;' "${path}" || {
    echo "Nginx configuration is missing the expected web server names." >&2; return 1;
  }
  grep -Eq '^[[:space:]]*server_name api[.]ngocthanhhx7[.]site;' "${path}" || {
    echo "Nginx configuration is missing the expected API server name." >&2; return 1;
  }
  grep -Eq '^[[:space:]]*ssl_certificate /etc/letsencrypt/live/ngocthanhhx7[.]site/fullchain[.]pem;' "${path}" || {
    echo "Nginx configuration has an unexpected certificate path." >&2; return 1;
  }
  grep -Eq '^[[:space:]]*ssl_certificate_key /etc/letsencrypt/live/ngocthanhhx7[.]site/privkey[.]pem;' "${path}" || {
    echo "Nginx configuration has an unexpected certificate key path." >&2; return 1;
  }
}

backup_one_config() {
  local backup_dir="$1" target="$2" name="$3"
  if [[ -e "${target}" ]]; then
    cp -p -- "${target}" "${backup_dir}/${name}"
    : > "${backup_dir}/${name}.existed"
  fi
}

restore_one_config() {
  local backup_dir="$1" target="$2" name="$3"
  if [[ -f "${backup_dir}/${name}.existed" ]]; then
    install -m 644 "${backup_dir}/${name}" "${target}"
  else
    rm -f -- "${target}"
  fi
}

backup_nginx_configs() {
  local backup_dir="$1" nginx_target="$2" cloudflare_target="$3"
  backup_one_config "${backup_dir}" "${nginx_target}" marxmatrix.conf
  backup_one_config "${backup_dir}" "${cloudflare_target}" cloudflare-realip.conf
}

restore_nginx_configs() {
  local backup_dir="$1" nginx_target="$2" cloudflare_target="$3"
  restore_one_config "${backup_dir}" "${nginx_target}" marxmatrix.conf
  restore_one_config "${backup_dir}" "${cloudflare_target}" cloudflare-realip.conf
}

generate_cloudflare_config() {
  local candidate="$1" endpoint
  {
    echo '# Generated from Cloudflare official IP range endpoints.'
    for endpoint in https://www.cloudflare.com/ips-v4/ https://www.cloudflare.com/ips-v6/; do
      curl -fsSL "${endpoint}" | awk 'NF { print "set_real_ip_from " $1 ";" }'
    done
    echo 'real_ip_header CF-Connecting-IP;'
    echo 'real_ip_recursive on;'
  } > "${candidate}"
}

rollback_nginx_configs() {
  local backup_dir="$1"
  CURRENT_STEP="restoring previous Nginx configuration"
  restore_nginx_configs "${backup_dir}" "${NGINX_TARGET}" "${CLOUDFLARE_TARGET}"
  nginx -t
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  fi
}

install_nginx_atomically() {
  local source="$1" cloudflare_candidate="$2" backup_dir="$3"
  backup_nginx_configs "${backup_dir}" "${NGINX_TARGET}" "${CLOUDFLARE_TARGET}"
  install -m 644 "${source}" "${NGINX_TARGET}"
  install -m 644 "${cloudflare_candidate}" "${CLOUDFLARE_TARGET}"

  CURRENT_STEP="validating staged Nginx configuration"
  if ! nginx -t; then
    rollback_nginx_configs "${backup_dir}"
    return 1
  fi
  CURRENT_STEP="enabling Nginx"
  if ! systemctl enable --now nginx; then
    rollback_nginx_configs "${backup_dir}"
    return 1
  fi
  CURRENT_STEP="reloading staged Nginx configuration"
  if ! systemctl reload nginx; then
    rollback_nginx_configs "${backup_dir}"
    return 1
  fi
  rm -f -- "${backup_dir}/marxmatrix.conf" "${backup_dir}/marxmatrix.conf.existed" \
    "${backup_dir}/cloudflare-realip.conf" "${backup_dir}/cloudflare-realip.conf.existed"
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
    exec 9>/var/lock/marxmatrix-update.lock
  fi
  if ! flock -n 9; then
    echo "Another MarxMatrix update is already running; refusing concurrent update." >&2
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
  run_as_app git -C "${APP_DIR}" merge --ff-only FETCH_HEAD
  new_commit="$(run_as_app git -C "${APP_DIR}" rev-parse HEAD)"

  CURRENT_STEP="installing workspace dependencies"
  run_as_app pnpm -C "${APP_DIR}" install --frozen-lockfile
  CURRENT_STEP="validating service units"
  validate_unit_file "${API_UNIT_SOURCE}" '/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js'
  validate_unit_file "${WORKER_UNIT_SOURCE}" '/usr/local/bin/node /opt/marxmatrix/apps/api/dist/worker.js'
  if command -v systemd-analyze >/dev/null; then
    systemd-analyze verify "${API_UNIT_SOURCE}" "${WORKER_UNIT_SOURCE}"
  fi
  CURRENT_STEP="validating Nginx source"
  validate_nginx_source "${NGINX_SOURCE}"

  CURRENT_STEP="generating Cloudflare real-IP configuration"
  nginx_work_dir="$(mktemp -d /tmp/marxmatrix-nginx.XXXXXX)"
  generate_cloudflare_config "${nginx_work_dir}/cloudflare-realip.conf"
  CURRENT_STEP="installing validated service units"
  install -m 644 "${API_UNIT_SOURCE}" "${API_UNIT_TARGET}"
  install -m 644 "${WORKER_UNIT_SOURCE}" "${WORKER_UNIT_TARGET}"
  systemctl daemon-reload
  CURRENT_STEP="installing Nginx configuration atomically"
  install_nginx_atomically "${NGINX_SOURCE}" "${nginx_work_dir}/cloudflare-realip.conf" "${nginx_work_dir}"

  build_and_activate
  verify_final_state
  echo "Updated ${old_commit} -> ${new_commit}"
  echo "Update complete. Check status with: sudo systemctl status marxmatrix-api marxmatrix-worker nginx docker --no-pager"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
