# Contribution Guidelines

## Code Quality & Security

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
- Pass CI (`npm test` for JavaScript, `go test` for Go)
- Optionally add screenshots for UI changes

### Security Best Practices

- Secrets never belong in the repo; use environment variables or the `secrets` directory (ignored by Git)
- Run `npm audit` periodically for JavaScript packages and address reported vulnerabilities
- For Go, use `go mod` to manage dependencies and keep them updated

## Project Structure

This is a monorepo for Tigris object storage SDKs and CLI, containing:

### JavaScript/TypeScript Packages

Located in the root `packages/` directory as npm workspaces:

- **`@tigrisdata/storage`** ([packages/storage](packages/storage)) - Tigris Storage SDK
  - Built with TypeScript
  - Uses AWS SDK v3 for S3 compatibility
  - Exports both server and client modules
  - Build: `npm run build:storage`
  - Test: `npm run test --workspace=@tigrisdata/storage`

- **`@tigrisdata/cli`** ([packages/cli](packages/cli)) - Command-line interface
  - Built with TypeScript using Commander.js
  - Depends on `@tigrisdata/storage`
  - Build: `npm run build:cli`

Root-level npm scripts:
- `npm run build` - Build all packages
- `npm test` - Run all tests
- `npm run lint` - Lint all packages
- `npm run format` - Format all packages with Prettier
- `npm run clean` - Clean build artifacts

### Go SDK

Located in the [`go/`](go/) directory:

- **Module**: `github.com/tigrisdata/storage`
- **Go version**: 1.25.5
- **Uses**: AWS SDK v2 for Go
- **Main files**:
  - `client.go` - Client implementation
  - `storage.go` - Storage operations
  - `tigrisheaders/` - Tigris-specific headers

Go commands:
- `go test ./go/...` - Run all Go tests
- `go build ./go/...` - Build all Go packages
- `go mod tidy` - Clean up dependencies

## Development Workflow

### JavaScript/TypeScript Development

1. Install dependencies: `npm install`
2. Build packages: `npm run build` or `npm run build:storage` / `npm run build:cli`
3. Run tests: `npm test`
4. Format code: `npm run format`
5. Lint code: `npm run lint`

### Go Development

1. Navigate to Go directory: `cd go`
2. Run tests: `go test ./...`
3. Build: `go build ./...`
4. Format code: `go fmt ./...`
5. Manage dependencies: `go mod tidy`

## Testing

- **JavaScript**: Uses Vitest as the test runner
- **Go**: Uses the standard `go test` command
- Always run tests before committing changes
- Ensure all tests pass in CI before merging

## Release Process

- Releases are automated using semantic-release
- Commits to `main` trigger automatic releases
- Pre-releases are done on the `next` branch
- Both JavaScript packages and Go SDK follow semantic versioning

## Additional Notes

- The project uses Husky for Git hooks (commitlint, etc.)
- Commitizen is configured for conventional commits
- ESLint and Prettier are used for JavaScript/TypeScript code quality
- Go code should follow standard Go conventions and use `go fmt`