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
5. Fetch the configured remote branch and require a fast-forward-only update.
6. Install workspace dependencies with `pnpm install --frozen-lockfile` as `ec2-user`.
7. Install the current systemd unit files and the TLS Nginx template from the repository, reload systemd, and validate Nginx before reloading it.
8. Delegate builds, service enablement/restarts, and local API health polling to the existing `activate.sh`.
9. Verify local API health, web root availability through local Nginx with the correct Host header, worker/API service state, and print the deployed commit.

## Failure behavior

The script uses `set -Eeuo pipefail` and exits non-zero at the first failed gate. An error trap reports the failed line without dumping environment values. The repository is never reset automatically. If dependency installation or build fails before service restart, existing processes keep running; the operator fixes the issue and reruns the same command.

## Configuration and compatibility

Defaults are `APP_DIR=/opt/marxmatrix`, `APP_USER=ec2-user`, `REMOTE=origin`, and `BRANCH=main`. These may be overridden as environment variables for maintenance. The script targets Amazon Linux 2023 and uses commands already installed by `bootstrap.sh`.

`bootstrap.sh` installs the updater as executable for new hosts. Existing hosts receive the file through the initial manual fast-forward deployment; every later deployment uses the updater itself.

## Verification

- Validate shell syntax with `bash -n`.
- Assert the updater contains no command that reads or sources `.env`.
- Test dirty-worktree refusal using a temporary Git repository or a dry-run fixture.
- Run the updater on EC2, verify the deployed Git SHA matches `origin/main`, both services are active, MongoDB remains loopback-only, local/public health return 200, and `.env` metadata/ignored status remain unchanged except for the intentional production provisioning step.
