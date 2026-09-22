---
"@tigrisdata/cli": minor
---

`tigris access-keys create` can now scope the key and hand its credentials over where they are needed:

- `--bucket` / `--role` / `--admin` scope the key at creation, with the same pairing rules as `access-keys assign`, so a scoped key no longer needs a second command.
- `--env [path]` writes the credentials to a dotenv file (default `./.env`). Existing assignments are replaced in place, everything else in the file is left alone (permissions included), a new file is created readable by its owner only, and the secret is no longer printed to the terminal. Warns when the file is not covered by `.gitignore`. A key scoped to one bucket also writes the bucket variable. The file is replaced atomically, so a write that fails part-way leaves it as it was; if it cannot be written at all, the credentials are printed instead and the command exits 1, so the one-time secret is never lost.
- `--export` prints `export VAR=...` lines and nothing else on stdout, for `eval "$(tigris access-keys create my-key --bucket my-app-bucket --role Editor --export)"`.
- `--for tigris|aws` chooses which SDK the variables are named for: `TIGRIS_STORAGE_*` for Tigris SDKs, or `AWS_*` plus Tigris endpoints and region for the AWS SDK. The endpoints are the ones the CLI itself is using (`configure --endpoint`, `TIGRIS_STORAGE_ENDPOINT`, `AWS_ENDPOINT_URL_*`, or the defaults), so a key made against a custom deployment points the SDK at that deployment.

Access-key commands now honour an AWS profile's `endpoint_url_iam`, as storage commands already did.

The `tigris init --agent` recipe now uses `tigris access-keys create … --env` instead of asking the agent to route the secret through a temporary file and `jq`.
