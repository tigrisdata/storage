# @tigrisdata/cli-shell

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
