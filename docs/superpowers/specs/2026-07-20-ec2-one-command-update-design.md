# EC2 one-command update design

## Goal

Provide one executable file at `/opt/marxmatrix/deploy/ec2/update.sh` so the operator can update the entire deployed MarxMatrix application with:

```bash
sudo /opt/marxmatrix/deploy/ec2/update.sh
```

The updater must never read, print, replace, copy, or commit either runtime environment file.

## Update sequence

1. Require root because systemd and Nginx configuration are installed system-wide.
2. Acquire a non-blocking `flock` lock so two updates cannot run concurrently.
3. Verify the application directory, Git repository, API env, and web production env exist and are non-empty.
4. Refuse to run when tracked files have local changes. Never reset or discard operator changes.
5. Verify the fixed `origin` URL, fetch its fixed `main` branch, reject a target commit that tracks either runtime environment path, and require a fast-forward-only update.
6. Install workspace dependencies with `pnpm install --frozen-lockfile` as `ec2-user`.
7. Validate that pulled systemd units use the fixed unprivileged identity and exact Node entry points, and validate the expected Nginx names and certificate paths before installing anything.
8. Build and activate inside the protected pre-fetch updater copy; never execute a newly pulled shell script as root.
9. Back up both live Nginx files, stage the site and freshly generated Cloudflare configuration, and restore the previous files if validation, enablement, or reload fails.
10. Verify local API health and readiness, the HTTPS web origin with local DNS resolution, all service states, and recheck API/worker state after five seconds before printing the deployed commit.

## Failure behavior

The script uses `set -Eeuo pipefail` and exits non-zero at the first failed gate. An error trap reports the current human-readable step and failed line without dumping commands or environment values. The repository is never reset automatically. Nginx configuration changes are transactional: failed validation, enablement, or reload restores and revalidates the previous files.

## Configuration and compatibility

The deployment identity is fixed: `/opt/marxmatrix`, `ec2-user`, `origin`, `main`, and `https://github.com/ngocthanhhx7/spst_marxmatrix.git`. Environment overrides are intentionally unsupported. The script targets Amazon Linux 2023 and uses commands already installed by `bootstrap.sh`.

`bootstrap.sh` installs the updater as executable for new hosts. Existing hosts receive the file through the initial manual fast-forward deployment; every later deployment uses the updater itself.

## Verification

- Validate shell syntax with `bash -n`.
- Assert the updater contains no command that reads or sources `.env`.
- Test dirty-worktree refusal using a temporary Git repository or a dry-run fixture.
- Run the updater on EC2, verify the deployed Git SHA matches `origin/main`, both services are active, MongoDB remains loopback-only, local/public health return 200, and `.env` metadata/ignored status remain unchanged except for the intentional production provisioning step.
