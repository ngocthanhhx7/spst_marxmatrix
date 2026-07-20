#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/marxmatrix}"
APP_USER="${APP_USER:-ec2-user}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"

on_error() {
  local line="$1"
  echo "Update failed at line ${line}. No changes were rolled back; inspect service status and logs." >&2
}
verify_clean_worktree() {
  local repository="$1"
  local status
  status="$(run_as_app git -C "${repository}" status --porcelain --untracked-files=no)"
  if [[ -n "${status}" ]]; then
    echo "Tracked files in ${repository} have local changes; refusing to update." >&2
    return 1
  fi
}

require_environment_files() {
  if [[ ! -s "${APP_DIR}/apps/api/.env" || ! -s "${APP_DIR}/apps/web/.env.production" ]]; then
    echo "Environment files are missing or empty. Follow deploy/ec2/ENVIRONMENT.md first." >&2
    return 1
  fi
}

run_as_app() {
  sudo -u "${APP_USER}" env HOME="${app_home}" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

reexec_from_temporary_runner() {
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" == "1" ]]; then
    return
  fi

  local runner
  runner="$(mktemp /tmp/marxmatrix-update.XXXXXX)"
  export MARXMATRIX_UPDATE_RUNNER=1
  export MARXMATRIX_UPDATE_RUNNER_PATH="${runner}"
  trap cleanup_runner EXIT
  install -m 700 "${BASH_SOURCE[0]}" "${runner}"
  exec "${runner}"
}

cleanup_runner() {
  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" == "1" && -n "${MARXMATRIX_UPDATE_RUNNER_PATH:-}" ]]; then
    rm -f -- "${MARXMATRIX_UPDATE_RUNNER_PATH}"
  fi
}

main() {
  trap 'on_error "$LINENO"' ERR

  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run with sudo: sudo /opt/marxmatrix/deploy/ec2/update.sh" >&2
    exit 1
  fi

  if [[ "${MARXMATRIX_UPDATE_RUNNER:-}" != "1" ]]; then
    exec 9>/var/lock/marxmatrix-update.lock
  fi
  if ! flock -n 9; then
    echo "Another MarxMatrix update is already running; refusing concurrent update." >&2
    exit 1
  fi

  reexec_from_temporary_runner
  trap cleanup_runner EXIT

  app_home="$(getent passwd "${APP_USER}" | cut -d: -f6)"
  if [[ -z "${app_home}" ]]; then
    echo "Application user ${APP_USER} does not exist." >&2
    exit 1
  fi

  if [[ ! -d "${APP_DIR}" ]] || ! run_as_app git -C "${APP_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "${APP_DIR} is not a Git repository; refusing to update." >&2
    exit 1
  fi

  require_environment_files
  verify_clean_worktree "${APP_DIR}"

  local old_commit new_commit
  old_commit="$(run_as_app git -C "${APP_DIR}" rev-parse HEAD)"
  run_as_app git -C "${APP_DIR}" fetch "${REMOTE}" "${BRANCH}" >/dev/null 2>&1
  run_as_app git -C "${APP_DIR}" merge --ff-only FETCH_HEAD >/dev/null 2>&1
  new_commit="$(run_as_app git -C "${APP_DIR}" rev-parse HEAD)"
  run_as_app pnpm -C "${APP_DIR}" install --frozen-lockfile >/dev/null 2>&1

  install -m 644 "${APP_DIR}/deploy/ec2/marxmatrix-api.service" /etc/systemd/system/marxmatrix-api.service
  install -m 644 "${APP_DIR}/deploy/ec2/marxmatrix-worker.service" /etc/systemd/system/marxmatrix-worker.service
  install -m 644 "${APP_DIR}/deploy/ec2/nginx-marxmatrix-tls.conf" /etc/nginx/conf.d/marxmatrix.conf
  "${APP_DIR}/deploy/ec2/refresh-cloudflare-ips.sh" >/dev/null 2>&1
  systemctl daemon-reload
  nginx -t >/dev/null 2>&1
  systemctl enable --now nginx >/dev/null 2>&1

  "${APP_DIR}/deploy/ec2/activate.sh" >/dev/null 2>&1

  systemctl is-active --quiet marxmatrix-api
  systemctl is-active --quiet marxmatrix-worker
  systemctl is-active --quiet nginx
  systemctl is-active --quiet docker
  curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null
  curl -fsS -H 'Host: ngocthanhhx7.site' http://127.0.0.1/ >/dev/null

  echo "Updated ${old_commit} -> ${new_commit}"
  echo "Update complete. Check status with: sudo systemctl status marxmatrix-api marxmatrix-worker nginx docker --no-pager"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
