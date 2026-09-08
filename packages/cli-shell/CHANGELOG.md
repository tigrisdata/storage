# @tigrisdata/cli-shell

## 0.2.1

### Patch Changes

- [#300](https://github.com/tigrisdata/storage/pull/300) [`c91f372`](https://github.com/tigrisdata/storage/commit/c91f372680b8cc05f0950fec059d7ff74ea16594) Thanks [@designcode](https://github.com/designcode)! - Fix OAuth token handling in the browser shell. Token expiry is now read from the access token's own `exp` claim, so it is exact for a fresh token and a cached one alike — previously a cached token carried the SDK's original `expires_in`, letting a near-expired token be recorded as good for another hour, after which commands failed until that wrong timestamp elapsed. Renewal forces a real refresh so the CLI gets a genuinely new token when it asks; a session with no refresh token (one cached before offline access was in use) falls back to its cached token and keeps working until it truly expires, while a refresh token the tenant rejects is discarded so the user signs in again. A renewal that cannot proceed reports a clean "session expired, run tigris login" message instead of the Auth0 SDK's internal audience and scope detail.

- [#302](https://github.com/tigrisdata/storage/pull/302) [`cf16c17`](https://github.com/tigrisdata/storage/commit/cf16c17fe23e8203078840ee402bb54b04058ace) Thanks [@designcode](https://github.com/designcode)! - Default to S3 path-style addressing (`TIGRIS_FORCE_PATH_STYLE=true`), as `@tigrisdata/agent-shell` does. In a browser, virtual-hosted URLs put each bucket on its own subdomain — a separate origin with its own CORS policy — so bucket-scoped commands such as `objects list` failed with CORS errors. Path style sends them to `<endpoint>/<bucket>/...` on the one origin. A caller's `env` still overrides it.

## 0.2.0

### Minor Changes

- [#286](https://github.com/tigrisdata/storage/pull/286) [`73d4a3e`](https://github.com/tigrisdata/storage/commit/73d4a3e679845ea1f0f690a0753c4c00400dcbf9) Thanks [@designcode](https://github.com/designcode)! - Initial release: Tigris CLI as an embeddable React terminal.

  ```tsx
  import { TigrisShell } from "@tigrisdata/cli-shell";

  <TigrisShell />;
  ```

  The CLI runs inside a [just-bash](https://github.com/vercel-labs/just-bash)
  virtual shell, so its commands and POSIX builtins compose over an in-memory
  filesystem:

  ```
  /home/tigris $ tigris objects list my-bucket --format json | grep report
  /home/tigris $ echo 'hello' > note.txt
  /home/tigris $ tigris objects put my-bucket note.txt note.txt
  ```

  `tigris login` runs Auth0's SPA popup and stores the session in the CLI's own
  credential store, so `whoami` and `logout` work unchanged. The OAuth session
  persists across reloads and renews silently off the refresh token; access keys
  are held on an in-memory filesystem and are gone on reload.

### Patch Changes

- Updated dependencies [[`73d4a3e`](https://github.com/tigrisdata/storage/commit/73d4a3e679845ea1f0f690a0753c4c00400dcbf9)]:
  - @tigrisdata/cli@3.12.0
