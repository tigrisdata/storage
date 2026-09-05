# @tigrisdata/cli-shell

The Tigris CLI as an embeddable React terminal, running entirely in the browser.

It is the same CLI as `@tigrisdata/cli` — the same commander program, the same
handlers, the same `specs.yaml` — inside a [just-bash](https://github.com/vercel-labs/just-bash)
virtual shell, so `tigris` commands and POSIX builtins compose:

```
/home/tigris $ tigris buckets get my-bucket | head -20
/home/tigris $ tigris objects list my-bucket --format json | grep report
/home/tigris $ echo 'hello' > note.txt
/home/tigris $ tigris objects put my-bucket note.txt note.txt
```

The filesystem is the shell's own, held in memory — a scratch space for
building up files to upload and for reading what the CLI writes. Buckets are
not mounted as directories: the CLI has no such concept, and presenting one
would mean a second, weaker way to reach object storage. `tigris ls` and
`tigris objects list` are how you browse.

## Install

```bash
npm install @tigrisdata/cli-shell react react-dom
```

## Use

```tsx
import { TigrisShell } from '@tigrisdata/cli-shell';

import '@xterm/xterm/css/xterm.css';
import '@tigrisdata/cli-shell/styles.css';

export function Console() {
  return <TigrisShell />;
}
```

Both stylesheets are required: xterm's own, and this package's (which only
sizes and frames the terminal).

### Signing in

`tigris login` runs Auth0's SPA popup and stores the session in the CLI's own
credential store, so `whoami`, `logout` and every authenticated command work
unchanged.

To skip the popup, pass an access key:

```tsx
<TigrisShell accessKey={{ accessKeyId, secretAccessKey }} />
```

The two credential types are stored differently:

| | Stored in | Survives a reload |
| --- | --- | --- |
| OAuth session | Auth0's SDK cache (`localStorage`) | yes |
| Access key | in-memory filesystem | **no** |

So signing in with `login` sticks across reloads and renews silently off the
refresh token — including mid-command, when a long upload outlives the access
token — while an access key is never written anywhere durable.

A refresh token in `localStorage` is readable by any script on the origin. That
is the usual trade for a persistent SPA session — worth weighing before
embedding this on a page that loads third-party scripts.

## Bundler setup

just-bash's browser bundle imports `node:zlib` for `gzip`/`gunzip`/`zcat`.
Nothing else needs it, so alias it to a stub:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: { 'node:zlib': '/src/stubs/zlib.ts' },
  },
});
```

## Commands

- **Bash builtins** — `ls`, `cat`, `cp`, `mv`, `rm`, `grep`, pipes, redirects.
  These operate on the shell's in-memory filesystem.
- **`tigris` / `t3`** — the full CLI, invoked by name exactly as in a terminal.
  CLI commands are not aliased bare, so `ls` lists files and `tigris ls` lists
  buckets, with no third set of rules to learn.
- **`clear`** — the one verb the shell owns, because only the frontend can
  clear the screen.

### Consent on localhost

Auth0 shows a confirmation prompt on every login when the callback URI is
non-verifiable — which `localhost` is — even for a first-party app with
*Allow Skipping User Consent* enabled on the API. It guards against app
impersonation on the same device and cannot be disabled from client code, so
expect it in local development and not on a deployed origin. The Node CLI is
unaffected because its device flow has no callback URI.

## Known limitations

- `iam`, `organizations` and `access-keys` commands call
  `iam.storageapi.dev`, which only returns CORS headers for allowlisted
  origins. They fail from other origins, including `localhost`, until the
  origin is allowlisted.
- `bundle` is not available: it streams a tar of objects to stdout as binary,
  which has no browser analogue. `update`, `init` and `telemetry` are
  machine-local and also excluded.
- The CLI cannot tell when the shell redirects its output. In a terminal,
  `tigris objects get` prints its status line only when stdout is a TTY, so
  `> file.pdf` gets clean bytes. Here stdout is always a TTY, so
  `t3 objects get photo.jpg > photo.jpg` prepends the status line to the
  file. Use `--output photo.jpg` instead, which is exact.
- Everything lives in memory. The shell's filesystem is an in-memory volume,
  and `tigris objects get` with no `--output` buffers the whole download to
  render it. A multi-gigabyte object will exhaust the tab either way; use
  `presign` to hand large objects to the browser's own downloader instead.

## Props

| Prop | Description |
| --- | --- |
| `auth` | Auth0 domain/clientId/audience overrides |
| `accessKey` | Sign in with an access key instead of OAuth |
| `env` | Extra environment variables the CLI can read |
| `welcome` | Replace the banner, or `false` for none |
| `onReady` | Receives the `ShellEngine` for imperative use |
| `className`, `style` | Applied to the container |

## License

MIT
