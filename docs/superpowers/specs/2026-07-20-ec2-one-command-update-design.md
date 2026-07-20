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
7. Render the exact systemd and TLS Nginx templates embedded in the protected pre-fetch updater copy into a root-only temporary directory. Never consume privileged configuration from the newly pulled worktree.
8. Validate both Cloudflare endpoint responses as non-empty IPv4/IPv6 CIDR lists before rendering the real-IP configuration.
9. Install both systemd units transactionally, restoring both previous files and reloading systemd if either install or daemon reload fails.
10. Back up both live Nginx files, stage the embedded site and freshly generated Cloudflare configuration, and restore the previous files if validation, enablement, or reload fails.
11. Build and activate inside the protected pre-fetch updater copy; never execute a newly pulled shell script as root.
12. Verify local API health and readiness, the HTTPS web origin with local DNS resolution, all service states, and recheck API/worker state after five seconds before printing the deployed commit.

## Failure behavior

The script uses `set -Eeuo pipefail` and exits non-zero at the first failed gate. An error trap reports the current human-readable step and failed line without dumping commands or environment values. The repository is never reset automatically. Systemd and Nginx configuration changes are transactional; failed installation or reload restores the previous files and reloads the restored configuration.

## Configuration and compatibility

The deployment identity is fixed: `/opt/marxmatrix`, `ec2-user`, `origin`, `main`, and `https://github.com/ngocthanhhx7/spst_marxmatrix.git`. Environment overrides are intentionally unsupported. The script targets Amazon Linux 2023 and uses commands already installed by `bootstrap.sh`.

`bootstrap.sh` installs the updater as executable for new hosts. Existing hosts receive the file through the initial manual fast-forward deployment; every later deployment uses the updater itself.

Because each run deliberately continues from its protected pre-fetch copy, privileged template changes fetched during an update take effect on the next invocation. The update command is idempotent, so rerunning it immediately is safe and is the intended way to apply such a template change.

## Verification

- Validate shell syntax with `bash -n`.
- Assert the updater contains no command that reads or sources `.env`.
- Test dirty-worktree refusal using a temporary Git repository or a dry-run fixture.
- Run the updater on EC2, verify the deployed Git SHA matches `origin/main`, both services are active, MongoDB remains loopback-only, local/public health return 200, and `.env` metadata/ignored status remain unchanged except for the intentional production provisioning step.
