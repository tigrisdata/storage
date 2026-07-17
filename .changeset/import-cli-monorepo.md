---
"@tigrisdata/cli": patch
---

Import the Tigris CLI into the storage monorepo and align its dev tooling with the workspace: drop the redundant `@types/node` dependency so pnpm resolves a single `@types/node` version across all packages (previously it pulled a second major, which broke `@tigrisdata/keyv-tigris`'s type-check).
