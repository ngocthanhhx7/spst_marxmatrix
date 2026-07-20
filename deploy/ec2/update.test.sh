#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
updater="${script_dir}/update.sh"
package_json="${script_dir}/../../package.json"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected '$1' to equal '$2'"; }
assert_contains() { grep -Fq -- "$2" "$1" || fail "expected $1 to contain $2"; }
assert_not_contains() {
  if grep -Fq -- "$2" "$1"; then
    fail "did not expect $1 to contain $2"
  fi
  return 0
}

[[ -f "${updater}" ]] || fail "update.sh is missing"
source "${updater}"
run_as_app() { "$@"; }

test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT

# Fixed deployment identity cannot be redirected through environment variables.
assert_eq "${APP_DIR}" /opt/marxmatrix
assert_eq "${APP_USER}" ec2-user
assert_eq "${REMOTE}" origin
assert_eq "${BRANCH}" main
assert_eq "${EXPECTED_REMOTE_URL-}" https://github.com/ngocthanhhx7/spst_marxmatrix.git
if (APP_DIR=/tmp) 2>/dev/null; then fail "APP_DIR is mutable"; fi

# Missing users fail cleanly instead of aborting in a command substitution.
getent() { return 2; }
if resolve_app_home 2>/dev/null; then fail "missing application user was accepted"; fi
unset -f getent

# Clean tracked state is accepted; dirty tracked state is rejected.
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

# A repository pointing anywhere except the fixed GitHub origin is rejected.
git -C "${repo}" remote add origin https://example.invalid/attacker/repo.git
if verify_expected_remote "${repo}" 2>/dev/null; then fail "wrong origin URL was accepted"; fi

# A fetched commit that starts tracking a runtime env is rejected without touching
# the existing untracked synthetic secret.
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

# Pulled root-owned configuration is constrained before installation.
valid_api="${test_root}/api.service"
valid_worker="${test_root}/worker.service"
printf '%s\n' '[Service]' 'User=ec2-user' 'Group=ec2-user' \
  'ExecStart=/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js' > "${valid_api}"
printf '%s\n' '[Service]' 'User=ec2-user' 'Group=ec2-user' \
  'ExecStart=/usr/local/bin/node /opt/marxmatrix/apps/api/dist/worker.js' > "${valid_worker}"
validate_unit_file "${valid_api}" '/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js'
validate_unit_file "${valid_worker}" '/usr/local/bin/node /opt/marxmatrix/apps/api/dist/worker.js'
printf '%s\n' '[Service]' 'User=root' 'Group=ec2-user' \
  'ExecStart=/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js' > "${valid_api}"
if validate_unit_file "${valid_api}" '/usr/local/bin/node /opt/marxmatrix/apps/api/dist/main.js' 2>/dev/null; then
  fail "root service unit was accepted"
fi

valid_nginx="${test_root}/nginx.conf"
printf '%s\n' \
  'server_name ngocthanhhx7.site www.ngocthanhhx7.site;' \
  'server_name api.ngocthanhhx7.site;' \
  'ssl_certificate /etc/letsencrypt/live/ngocthanhhx7.site/fullchain.pem;' \
  'ssl_certificate_key /etc/letsencrypt/live/ngocthanhhx7.site/privkey.pem;' > "${valid_nginx}"
validate_nginx_source "${valid_nginx}"
ln -s "${valid_nginx}" "${test_root}/nginx-link.conf"
if validate_nginx_source "${test_root}/nginx-link.conf" 2>/dev/null; then fail "symlinked Nginx source was accepted"; fi

# Backup/restore helpers preserve old Nginx files and remove newly introduced ones.
nginx_target="${test_root}/live-nginx.conf"
cloudflare_target="${test_root}/live-cloudflare.conf"
backup_dir="${test_root}/nginx-backup"
mkdir "${backup_dir}"
printf 'old-nginx\n' > "${nginx_target}"
backup_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}"
printf 'candidate-nginx\n' > "${nginx_target}"
printf 'candidate-cloudflare\n' > "${cloudflare_target}"
restore_nginx_configs "${backup_dir}" "${nginx_target}" "${cloudflare_target}"
assert_eq "$(<"${nginx_target}")" old-nginx
[[ ! -e "${cloudflare_target}" ]] || fail "new Cloudflare config was not removed on restore"

# Structural checks cover privileged ordering and the pre-fetch runner boundary.
assert_contains "${updater}" 'if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then'
assert_contains "${updater}" 'exec "${runner}"'
assert_contains "${updater}" 'flock -n 9'
assert_contains "${updater}" 'merge --ff-only FETCH_HEAD'
assert_contains "${updater}" 'verify_target_does_not_track_env "${APP_DIR}" FETCH_HEAD'
assert_contains "${updater}" 'curl --resolve "ngocthanhhx7.site:443:127.0.0.1"'
assert_contains "${updater}" 'http://127.0.0.1:3000/api/v1/ready'
assert_eq "$(grep -Fc '  build_and_activate' "${updater}")" 1
assert_contains "${updater}" 'mkdir -m 700 "${nginx_work_dir}/backup"'
assert_contains "${updater}" '"${nginx_work_dir}/backup"'
assert_not_contains "${updater}" 'deploy/ec2/activate.sh'
assert_not_contains "${updater}" 'deploy/ec2/refresh-cloudflare-ips.sh'
assert_not_contains "${updater}" '${APP_DIR:-'
assert_not_contains "${updater}" '${APP_USER:-'

# Only metadata checks may target runtime environment paths.
env_consumer_regex='(^|[[:space:];|&()])(cat|source|[.]|grep|sed|awk|head|tail|less|more|cp|install)([[:space:]]|$).*([.]env([^[:alnum:]_]|$)|ENV_FILE|API_ENV|WEB_ENV|apps/api/[.]env|apps/web/[.]env[.]production)'
if grep -En -- "${env_consumer_regex}" "${updater}"; then
  fail "updater contains a command that may consume environment-file contents"
fi

assert_contains "${package_json}" '"test:ops": "bash deploy/ec2/update.test.sh"'
assert_contains "${package_json}" '"verify": "pnpm run test:ops && pnpm run lint'

echo "update.sh tests passed"
