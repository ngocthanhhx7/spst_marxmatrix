# Security notes

## Identity

- User email addresses are trimmed and lowercased before lookup or storage; the unique Mongo index is the final duplicate safeguard.
- Passwords use bcrypt hashes and the password-hash field is non-selected and never serialized to API responses.
- Access tokens are short-lived signed JWTs held only in browser memory. Refresh credentials are opaque, cryptographically random values in HTTP-only cookies; Mongo stores only SHA-256 hashes.
- Refresh sessions rotate on use. A used, revoked, expired, or missing refresh token is rejected. Logout revokes the presented session and clears the cookie.
- Rotation takes a short Mongo lease before user lookup, signing, and replacement persistence. Failures before handoff release the lease and retain the original session. An ambiguous final write is read-reconciled: a proven committed handoff returns its replacement, while a proven pre-commit failure deletes the replacement and releases the original lease.
- Cookie-mutating authentication POSTs validate Origin or Referer against configured frontend/CORS origins. Test-mode origin bypass is explicit and limited to test execution.
- `AUTH_COOKIE_SAME_SITE`, `COOKIE_SECURE`, path, and lifetime are validated configuration. `SameSite=none` requires secure cookies in production.
- Registration always assigns `student`; administrative access is guarded by explicit role metadata.

## Dependency policy

- bcrypt's project-local build script is allowed for its native binary. `@scarf/scarf` remains explicitly blocked in `pnpm-workspace.yaml`.
