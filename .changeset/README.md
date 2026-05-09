# Changesets

This folder contains [changesets](https://github.com/changesets/changesets) — files that record what changes will go into the next release of each package.

## Adding a changeset

When you make a change worth releasing, run:

```sh
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a short summary. Commit the generated `.changeset/*.md` file with your PR.

## Releasing

When PRs with changesets land on `main`, the release workflow opens (or updates) a "Version Packages" PR that:
- bumps each affected package's `version` in its `package.json`
- updates each package's `CHANGELOG.md`
- consumes the `.changeset/*.md` files

Merging that PR triggers the same workflow to publish the new versions to npm and create git tags (`@tigrisdata/<pkg>@<version>`).
