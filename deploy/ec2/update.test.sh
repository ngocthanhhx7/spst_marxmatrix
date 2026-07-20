#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
updater="${script_dir}/update.sh"
package_json="${script_dir}/../../package.json"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected '$1' to equal '$2'"; }
assert_contains() { grep -Fq -- "$2" "$1" || fail "expected $1 to contain $2"; }
assert_not_contains() {
  if grep -Fq -- "$2" "$1"; then fail "did not expect $1 to contain $2"; fi
  return 0
}
require_function() { declare -F "$1" >/dev/null || fail "required function $1 is missing"; }

[[ -f "${updater}" ]] || fail "update.sh is missing"
source "${updater}"
run_as_app() { "$@"; }

for function_name in render_api_unit render_worker_unit render_nginx_config \
  install_units_atomically install_nginx_atomically generate_cloudflare_config \
  fast_forward acquire_update_lock cleanup_temporary_files; do
  require_function "${function_name}"
done

test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

# Fixed deployment identity and missing-user handling.
assert_eq "${APP_DIR}" /opt/marxmatrix
assert_eq "${APP_USER}" ec2-user
assert_eq "${REMOTE}" origin
assert_eq "${BRANCH}" main
assert_eq "${EXPECTED_REMOTE_URL}" https://github.com/ngocthanhhx7/spst_marxmatrix.git
if (APP_DIR=/tmp) 2>/dev/null; then fail "APP_DIR is mutable"; fi
getent() { return 2; }
if resolve_app_home 2>/dev/null; then fail "missing application user was accepted"; fi
unset -f getent

# The protected runner renders byte-for-byte known-good privileged templates.
render_dir="${test_root}/rendered"
mkdir "${render_dir}"
render_api_unit "${render_dir}/marxmatrix-api.service"
render_worker_unit "${render_dir}/marxmatrix-worker.service"
render_nginx_config "${render_dir}/nginx-marxmatrix-tls.conf"
cmp -s "${render_dir}/marxmatrix-api.service" "${script_dir}/marxmatrix-api.service" || fail "API unit rendering drifted"
cmp -s "${render_dir}/marxmatrix-worker.service" "${script_dir}/marxmatrix-worker.service" || fail "worker unit rendering drifted"
cmp -s "${render_dir}/nginx-marxmatrix-tls.conf" "${script_dir}/nginx-marxmatrix-tls.conf" || fail "Nginx rendering drifted"

# Clean/dirty worktrees and the fixed trusted remote guard.
repo="${test_root}/worktree"
git init -q "${repo}"
git -C "${repo}" config user.email test@example.invalid
git -C "${repo}" config user.name test
printf 'initial\n' > "${repo}/tracked.txt"
git -C "${repo}" add tracked.txt
git -C "${repo}" commit -qm initial
verify_clean_worktree "${repo}"
printf 'dirty\n' >> "${repo}/tracked.txt"
if verify_clean_worktree "${repo}" 2>/dev/null; then fail "dirty tracked worktree was accepted"; fi
git -C "${repo}" restore tracked.txt
git -C "${repo}" remote add origin https://example.invalid/attacker/repo.git
if verify_expected_remote "${repo}" 2>/dev/null; then fail "wrong origin URL was accepted"; fi

# A fetched commit that tracks an env path is rejected without changing existing
# untracked synthetic secret data.
remote="${test_root}/remote.git"
seed="${test_root}/seed"
clone="${test_root}/clone"
git init -q --bare "${remote}"
git init -q -b main "${seed}"
git -C "${seed}" config user.email test@example.invalid
git -C "${seed}" config user.name test
printf 'apps/api/.env\napps/web/.env.production\n' > "${seed}/.gitignore"
printf 'base\n' > "${seed}/README.md"
git -C "${seed}" add .gitignore README.md
git -C "${seed}" commit -qm base
git -C "${seed}" remote add origin "${remote}"
git -C "${seed}" push -q -u origin main
git clone -q --branch main "${remote}" "${clone}"
mkdir -p "${clone}/apps/api" "${clone}/apps/web"
printf 'synthetic-secret-that-must-survive\n' > "${clone}/apps/api/.env"
printf 'synthetic-public-config-that-must-survive\n' > "${clone}/apps/web/.env.production"
api_checksum_before="$(sha256sum "${clone}/apps/api/.env" | cut -d' ' -f1)"
web_checksum_before="$(sha256sum "${clone}/apps/web/.env.production" | cut -d' ' -f1)"
mkdir -p "${seed}/apps/api"
printf 'malicious-tracked-env\n' > "${seed}/apps/api/.env"
git -C "${seed}" add -f apps/api/.env
git -C "${seed}" commit -qm 'track runtime env'
git -C "${seed}" push -q origin main
git -C "${clone}" fetch -q origin main
if verify_target_does_not_track_env "${clone}" FETCH_HEAD 2>/dev/null; then
  fail "target commit tracking a runtime env was accepted"
fi
assert_eq "$(sha256sum "${clone}/apps/api/.env" | cut -d' ' -f1)" "${api_checksum_before}"
assert_eq "$(sha256sum "${clone}/apps/web/.env.production" | cut -d' ' -f1)" "${web_checksum_before}"

# A factored fast-forward rejects genuinely divergent history.
divergent="${test_root}/divergent"
git clone -q --branch main "${remote}" "${divergent}"
git -C "${divergent}" config user.email test@example.invalid
git -C "${divergent}" config user.name test
base_commit="$(git -C "${divergent}" rev-parse HEAD^)"
git -C "${divergent}" switch -q --detach "${base_commit}"
printf 'local\n' > "${divergent}/local.txt"
git -C "${divergent}" add local.txt
git -C "${divergent}" commit -qm local
target_commit="$(git -C "${seed}" rev-parse main)"
if fast_forward "${divergent}" "${target_commit}" >/dev/null 2>&1; then
  fail "divergent history was accepted as a fast-forward"
fi

# Lock contention and protected-runner cleanup are behavioral.
lock_path="${test_root}/update.lock"
exec 8>"${lock_path}"
flock -n 8
if acquire_update_lock "${lock_path}" 2>/dev/null; then fail "contended update lock was acquired"; fi
flock -u 8
exec 8>&-
acquire_update_lock "${lock_path}"
flock -u 9
exec 9>&-
(
  runner_path="${test_root}/synthetic-runner"
  printf 'runner\n' > "${runner_path}"
  MARXMATRIX_UPDATE_RUNNER=1
  MARXMATRIX_UPDATE_RUNNER_PATH="${runner_path}"
  root_work_dir=""
  cleanup_temporary_files
  [[ ! -e "${runner_path}" ]] || fail "temporary runner was not removed"
)

# Both systemd files roll back when the second install fails.
(
  unit_dir="${test_root}/unit-install-failure"
  mkdir "${unit_dir}"
  api_target="${unit_dir}/api.target"
  worker_target="${unit_dir}/worker.target"
  backup_dir="${unit_dir}/backup"
  mkdir "${backup_dir}"
  printf 'old-api\n' > "${api_target}"
  printf 'old-worker\n' > "${worker_target}"
  install_calls=0
  install_file() {
    install_calls=$((install_calls + 1))
    if [[ "${install_calls}" -eq 2 ]]; then return 1; fi
    command install "$@"
  }
  reload_calls=0
  systemd_daemon_reload() { reload_calls=$((reload_calls + 1)); }
  if install_units_atomically "${render_dir}/marxmatrix-api.service" \
    "${render_dir}/marxmatrix-worker.service" "${api_target}" "${worker_target}" "${backup_dir}" 2>/dev/null; then
    fail "second unit install failure was accepted"
  fi
  assert_eq "$(<"${api_target}")" old-api
  assert_eq "$(<"${worker_target}")" old-worker
  assert_eq "${reload_calls}" 1
)

# Both systemd files also roll back when daemon-reload fails.
(
  unit_dir="${test_root}/unit-reload-failure"
  mkdir "${unit_dir}"
  api_target="${unit_dir}/api.target"
  worker_target="${unit_dir}/worker.target"
  backup_dir="${unit_dir}/backup"
  mkdir "${backup_dir}"
  printf 'old-api\n' > "${api_target}"
  printf 'old-worker\n' > "${worker_target}"
  install_file() { command install "$@"; }
  reload_calls=0
  systemd_daemon_reload() {
    reload_calls=$((reload_calls + 1))
    [[ "${reload_calls}" -gt 1 ]]
  }
  if install_units_atomically "${render_dir}/marxmatrix-api.service" \
    "${render_dir}/marxmatrix-worker.service" "${api_target}" "${worker_target}" "${backup_dir}" 2>/dev/null; then
    fail "daemon-reload failure was accepted"
  fi
  assert_eq "$(<"${api_target}")" old-api
  assert_eq "$(<"${worker_target}")" old-worker
  assert_eq "${reload_calls}" 2
)

# Failed candidate validation restores both old Nginx files.
(
  nginx_dir="${test_root}/nginx-failure"
  mkdir "${nginx_dir}"
  nginx_target="${nginx_dir}/nginx.target"
  cloudflare_target="${nginx_dir}/cloudflare.target"
  backup_dir="${nginx_dir}/backup"
  mkdir "${backup_dir}"
  printf 'old-nginx\n' > "${nginx_target}"
  printf 'old-cloudflare\n' > "${cloudflare_target}"
  install_file() { command install "$@"; }
  nginx_test_calls=0
  nginx_test() {
    nginx_test_calls=$((nginx_test_calls + 1))
    [[ "${nginx_test_calls}" -gt 1 ]]
  }
  nginx_service() { return 0; }
  if install_nginx_atomically "${render_dir}/nginx-marxmatrix-tls.conf" \
    "${render_dir}/nginx-marxmatrix-tls.conf" "${backup_dir}" \
    "${nginx_target}" "${cloudflare_target}" 2>/dev/null; then
    fail "invalid staged Nginx configuration was accepted"
  fi
  assert_eq "$(<"${nginx_target}")" old-nginx
  assert_eq "$(<"${cloudflare_target}")" old-cloudflare
  assert_eq "${nginx_test_calls}" 2
)

# Cloudflare ranges are accepted only when each endpoint contains valid CIDRs.
test_cloudflare_case() (
  local v4_content="$1" v6_content="$2" expected="$3" label="$4"
  local case_dir="${test_root}/cloudflare-${label}"
  mkdir "${case_dir}"
  printf '%s' "${v4_content}" > "${case_dir}/v4"
  printf '%s' "${v6_content}" > "${case_dir}/v6"
  fetch_cloudflare_ranges() {
    if [[ "$1" == *ips-v4* ]]; then cp "${case_dir}/v4" "$2"; else cp "${case_dir}/v6" "$2"; fi
  }
  if [[ "${expected}" == pass ]]; then
    generate_cloudflare_config "${case_dir}/candidate" "${case_dir}"
    assert_contains "${case_dir}/candidate" 'set_real_ip_from 173.245.48.0/20;'
    assert_contains "${case_dir}/candidate" 'set_real_ip_from 2400:cb00::/32;'
  elif generate_cloudflare_config "${case_dir}/candidate" "${case_dir}" >/dev/null 2>&1; then
    fail "invalid Cloudflare ${label} response was accepted"
  fi
)
test_cloudflare_case $'173.245.48.0/20\n' $'2400:cb00::/32\n' pass valid
test_cloudflare_case '' $'2400:cb00::/32\n' fail empty-v4
test_cloudflare_case $'not-a-network\n' $'2400:cb00::/32\n' fail malformed-v4
test_cloudflare_case $'173.245.48.0/20\n' '' fail empty-v6
test_cloudflare_case $'173.245.48.0/20\n' $'not-a-network\n' fail malformed-v6

# Structural checks retain diagnostics/readiness and exclude pulled privileged inputs.
assert_contains "${updater}" 'if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then'
assert_contains "${updater}" 'exec "${runner}"'
assert_contains "${updater}" 'fast_forward "${APP_DIR}" FETCH_HEAD'
assert_contains "${updater}" 'curl --resolve "ngocthanhhx7.site:443:127.0.0.1"'
assert_contains "${updater}" 'http://127.0.0.1:3000/api/v1/ready'
assert_not_contains "${updater}" 'API_UNIT_SOURCE'
assert_not_contains "${updater}" 'WORKER_UNIT_SOURCE'
assert_not_contains "${updater}" 'NGINX_SOURCE'
assert_not_contains "${updater}" 'deploy/ec2/activate.sh'
assert_not_contains "${updater}" 'deploy/ec2/refresh-cloudflare-ips.sh'

# Only metadata checks may target runtime environment paths.
env_consumer_regex='(^|[[:space:];|&()])(cat|source|[.]|grep|sed|awk|head|tail|less|more|cp|install)([[:space:]]|$).*([.]env([^[:alnum:]_]|$)|ENV_FILE|API_ENV|WEB_ENV|apps/api/[.]env|apps/web/[.]env[.]production)'
if grep -En -- "${env_consumer_regex}" "${updater}"; then
  fail "updater contains a command that may consume environment-file contents"
fi

assert_contains "${package_json}" '"test:ops": "bash deploy/ec2/update.test.sh"'
assert_contains "${package_json}" '"verify": "pnpm run test:ops && pnpm run lint'

echo "update.sh tests passed"
