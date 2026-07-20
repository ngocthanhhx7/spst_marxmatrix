#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
updater="${script_dir}/update.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
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

repo="$(mktemp -d)"
trap 'rm -rf "${repo}"' EXIT
git -C "${repo}" init -q
git -C "${repo}" config user.email test@example.invalid
git -C "${repo}" config user.name test
printf 'initial\n' > "${repo}/tracked.txt"
git -C "${repo}" add tracked.txt
git -C "${repo}" commit -qm initial

verify_clean_worktree "${repo}"
printf 'dirty\n' >> "${repo}/tracked.txt"
if verify_clean_worktree "${repo}"; then
  fail "dirty tracked worktree was accepted"
fi

assert_contains "${updater}" 'if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then'
assert_contains "${updater}" 'exec "${runner}"'
assert_contains "${updater}" 'mktemp'
assert_contains "${updater}" 'flock -n'
assert_contains "${updater}" 'status="$(run_as_app git -C "${repository}" status --porcelain --untracked-files=no)"'
assert_contains "${updater}" 'systemctl enable --now nginx'

env_consumer_regex='(^|[[:space:];|&()])(cat|source|[.]|grep|sed|awk|head|tail|less|more|cp|install)([[:space:]]|$).*([.]env([^[:alnum:]_]|$)|ENV_FILE|apps/api/[.]env|apps/web/[.]env[.]production)'
if grep -En -- "${env_consumer_regex}" "${updater}"; then
  fail "updater contains a command that may consume environment-file contents"
fi

assert_not_contains "${updater}" 'systemctl enable nginx'

echo "update.sh tests passed"
