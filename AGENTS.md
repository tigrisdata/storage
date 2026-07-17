# Contribution Guidelines

## Code Quality & Security

### Agent Behavior

- **Never `git commit`, `git push`, or open a PR without an explicit, in-the-moment user instruction.** Treat each commit, push, and PR as a separate confirmation: approval for one does not extend to the next. When unsure, stop and ask.
- Stage proposed changes and surface them in chat first; let the user decide when (and whether) to commit. The same rule applies to fixup commits, follow-up commits, and changeset commits — none are implied by an earlier "commit" instruction.

### Commit Guidelines

Commit messages follow **Conventional Commits** format:

```text
[optional scope]: <description>
[optional body]
[optional footer(s)]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

- Add `!` after type/scope for breaking changes or include `BREAKING CHANGE:` in the footer
- Keep descriptions concise, imperative, lowercase, and without a trailing period
- A scope is required (commitlint enforces this); use the package name (`storage`, `iam`, `agent-kit`, `keyv-tigris`, `react`) or `shared` / `repo` for cross-cutting changes
- Reference issues/PRs in the footer when applicable

### Attribution Requirements

AI agents must disclose what tool and model they are using in the "Assisted-by" commit footer:

```text
Assisted-by: [Model Name] via [Tool Name]
```

Example:

```text
Assisted-by: GLM 4.6 via Claude Code
```

### Pull Request Requirements

- Include a clear description of changes
- Reference any related issues
- Pass CI (`pnpm test` for JavaScript)
- Add a changeset for any change that should ship to npm: `pnpm changeset`
- Optionally add screenshots for UI changes

### Security Best Practices

- Secrets never belong in the repo; use environment variables or the `secrets` directory (ignored by Git)
- Run `pnpm audit` periodically for JavaScript packages and address reported vulnerabilities

## Project Structure

This is a monorepo for Tigris object storage SDKs, containing:

### JavaScript/TypeScript Packages

Located in the root `packages/` directory as a pnpm workspace (`pnpm-workspace.yaml`):

- **`@tigrisdata/storage`** ([packages/storage](packages/storage)) — Tigris Storage SDK
  - Built with TypeScript, uses AWS SDK v3 for S3 compatibility
  - Exports both server and client modules
- **`@tigrisdata/iam`** ([packages/iam](packages/iam)) — IAM SDK
- **`@tigrisdata/cli`** ([packages/cli](packages/cli)) — Command line interface for Tigris object storage (depends on `@tigrisdata/storage` and `@tigrisdata/iam`)
- **`@tigrisdata/agent-kit`** ([packages/agent-kit](packages/agent-kit)) — Composition library for AI agents (depends on `@tigrisdata/storage` and `@tigrisdata/iam`)
- **`@tigrisdata/keyv-tigris`** ([packages/keyv-tigris](packages/keyv-tigris)) — Keyv adapter (depends on `@tigrisdata/storage`)
- **`@tigrisdata/react`** ([packages/react](packages/react)) — React components (depends on `@tigrisdata/storage`)
- **`@tigrisdata/agent-shell`** ([packages/agent-shell](packages/agent-shell)) — A virtual bash environment for AI agents, backed by Tigris object storage (depends on `@tigrisdata/storage`)

Cross-package deps use the `workspace:^` protocol; pnpm rewrites them to real ranges at publish time.

### Apps

Non-published apps live in `apps/` (part of the pnpm workspace via the `apps/*` glob) and are marked `private: true` so Changesets never publishes them:

- **`agent-shell-playground`** ([apps/agent-shell-playground](apps/agent-shell-playground)) — Vite playground for `@tigrisdata/agent-shell`, deployed to Fly.io via the `deploy-agent-shell-playground.yml` workflow

Shared code lives in [`shared/`](shared) and is imported via the `@shared/*` TS path alias and the matching tsup esbuild alias. It is bundled into each package at build time and is not published as its own package.

Root-level scripts:

- `pnpm build` — build all packages (`pnpm -r run build`)
- `pnpm test` — run all tests
- `pnpm lint` — lint with Biome
- `pnpm format` — format with Biome
- `pnpm clean` — clean build artifacts

## Development Workflow

### JavaScript/TypeScript Development

1. Install dependencies: `pnpm install`
2. Build packages: `pnpm build` (or `pnpm --filter @tigrisdata/storage build` for one)
3. Run tests: `pnpm test`
4. Format code: `pnpm format`
5. Lint code: `pnpm lint`

## Testing

- **JavaScript**: Uses Vitest as the test runner
- Always run tests before committing changes
- Ensure all tests pass in CI before merging

## Release Process

- Releases are managed with [Changesets](https://github.com/changesets/changesets).
- For any change that should ship to npm, run `pnpm changeset`, choose the affected packages and bump levels, write a short summary, and commit the resulting `.changeset/*.md` file with your PR.
- When PRs land on `main`, the release workflow opens (or updates) a "Version Packages" PR that bumps each package's `version` and updates its `CHANGELOG.md`.
- Merging that PR publishes the affected packages to npm (using GitHub OIDC trusted publishing with provenance) and creates git tags of the form `@tigrisdata/<pkg>@<version>`.
- All work happens on `main`. Pre-release flows use `pnpm changeset pre enter <tag>` on the same branch when needed.

## Additional Notes

- The project uses Husky for Git hooks (commitlint via `commit-msg`, Biome `check` via `pre-commit`).
- Commitizen is configured for Conventional Commits (`pnpm commit`).
- Biome handles linting and formatting (replaced ESLint and Prettier).

## Known pitfalls

### SigV4 path encoding for object keys

Scope: this only applies to code that talks to the **custom HTTP
client** in `shared/http-client.ts` (used by `copy`, `move`,
`updateObject`, and the `setBucket*` family). Anything routed through
the AWS SDK (`ListObjectsV2Command`, `PutObjectCommand`,
`HeadObjectCommand`, `GetObjectCommand`, `RemoveObjectCommand`, etc.)
handles its own SigV4 correctly — don't touch encoding there.

**Rule for the custom client**: whenever you build a **request path**
that embeds an object key, do **not** encode the whole key with
`encodeURIComponent`. Use `encodeObjectKey` from `@shared/utils`
instead.

Why the path specifically: there are two encoding traps that compound.

1. **Signer setting**: `@smithy/signature-v4`'s `SignatureV4`
   constructor defaults `uriEscapePath: true` — the AWS-standard
   double-encoding scheme. S3 uses single-encoding, so our custom HTTP
   client passes `uriEscapePath: false`. If you ever build a second
   signer instance, set the same flag. With the default, the signer
   re-percent-encodes any sequence in the path during canonicalization
   (`%20` → `%2520`), and Tigris gateway — which uses S3 single-encoding
   — diverges from the client canonical and returns
   `403 SignatureDoesNotMatch` for every key with a special char.
2. **Pre-encoding**: even with `uriEscapePath: false`, the wire URL
   must still be a valid URL — keys with `/`, spaces, `?`, etc. need
   percent-encoding when serialized. Use `encodeObjectKey` (single
   encode, per-segment, preserves `/`) so the on-wire path is valid
   and matches what the signer signs.

**Other surfaces — not affected by the double-encode bug but worth
knowing**:

- **Query strings**: the HTTP client extracts query params via
  `URL.searchParams.forEach`, which returns the **decoded** value
  before handing it to the signer. The signer encodes once for the
  canonical query string, the server canonicalizes the same way —
  single encoding round-trip. Writing `?prefix=${encodeURIComponent(p)}`
  is safe; so is writing the value raw and letting `URL` percent-encode
  it.
- **Header values**: SigV4's canonical-header construction does not
  URL-escape header values (only trims and collapses whitespace), so
  there's no double-encode mismatch. However, S3's
  `X-Amz-Copy-Source` spec **requires** the value be URL-encoded; the
  server URL-decodes it before treating it as a key. Use
  `encodeObjectKey` there too — it gives you the spec-correct encoding
  for free (special chars escaped, `/` separators preserved).

Symptoms that point at this bug:

- `403 Forbidden` with body `<Code>SignatureDoesNotMatch</Code>` for
  requests that include a nested object key (key contains `/`).
- Works fine in tests that mock the network or run with OAuth/session
  tokens (those skip the SigV4 branch entirely — see
  `shared/http-client.ts`), then fails the first time a real consumer
  exercises the call with access keys.
- A previously-fine flat key like `file.txt` succeeds, but
  `folder/file.txt` 403s.

Mitigation for new code:

```ts
import { encodeObjectKey } from '@shared/utils';

path: `/${bucket}/${encodeObjectKey(key)}?x-id=...`,
headers: {
  [TigrisHeaders.COPY_SOURCE]: `${srcBucket}/${encodeObjectKey(src)}`,
}
```

When adding tests for any function that hits the custom HTTP client,
exercise at least these two key shapes against the real gateway with
access-key auth:

- A key with `/` (e.g. `folder/file.txt`) — catches the per-segment
  encoding regression.
- A key with a character that requires percent-encoding (space, `?`,
  `=`, `&`) — catches the `uriEscapePath` regression. Unit tests on
  `encodeObjectKey` alone aren't enough; the bug only shows up when
  the signer's canonicalization pass runs end-to-end.
