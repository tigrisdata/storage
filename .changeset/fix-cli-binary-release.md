---
"@tigrisdata/cli": patch
---

Fix the release pipeline so the standalone binaries and Homebrew formula are actually built and published. The `build-binaries` job installed dependencies but never built the workspace packages, so the binary `tsc` could not resolve `@tigrisdata/iam` / `@tigrisdata/storage` types and failed before any assets were uploaded (3.4.2 shipped to npm but without binaries).
