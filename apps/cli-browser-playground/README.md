# CLI browser harness

Runs `@tigrisdata/cli/browser` in a real browser, so you can check commands
against a live Tigris account without the Node-only `DOMParser` gap.

```bash
pnpm --filter @tigrisdata/cli build     # produces dist/browser
pnpm --filter cli-browser-playground dev
```

Credentials are pre-filled from the repo-root `.env` in dev mode, and are kept
in memory only — nothing is written to `localStorage`, cookies, or disk.

`iam`, `organizations` and `access-keys` commands will fail from `localhost`:
`iam.storageapi.dev` only returns `Access-Control-Allow-Origin` for allowlisted
origins. Bucket and object commands go to `t3.storage.dev`, which is open.
