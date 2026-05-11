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
- **`@tigrisdata/agent-kit`** ([packages/agent-kit](packages/agent-kit)) — Composition library for AI agents (depends on `@tigrisdata/storage` and `@tigrisdata/iam`)
- **`@tigrisdata/keyv-tigris`** ([packages/keyv-tigris](packages/keyv-tigris)) — Keyv adapter (depends on `@tigrisdata/storage`)
- **`@tigrisdata/react`** ([packages/react](packages/react)) — React components (depends on `@tigrisdata/storage`)

Cross-package deps use the `workspace:^` protocol; pnpm rewrites them to real ranges at publish time.

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
