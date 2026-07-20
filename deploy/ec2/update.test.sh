#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
updater="${script_dir}/update.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_contains() { grep -Fq -- "$2" "$1" || fail "expected $1 to contain $2"; }
assert_not_contains() { grep -Fq -- "$2" "$1" && fail "did not expect $1 to contain $2"; }

[[ -f "${updater}" ]] || fail "update.sh is missing"
source "${updater}"

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
for forbidden in 'cat ' 'source ' 'grep ' 'sed ' 'awk ' 'head ' 'tail '; do
  assert_not_contains "${updater}" "${forbidden}apps/api/.env"
  assert_not_contains "${updater}" "${forbidden}apps/web/.env.production"
done

echo "update.sh tests passed"
