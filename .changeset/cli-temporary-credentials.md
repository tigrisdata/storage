---
"@tigrisdata/cli": minor
---

Support temporary credentials. `tigris credentials temporary <bucket> --name <name> --access read|write|readwrite` issues credentials limited to one bucket (or use `--actions` or `--policy`), lasting `--duration` (default 1h). `--export` prints them as shell `export` lines for `eval "$(...)"`, with `--for aws` for the AWS variable names. Issuing needs an access key. Logged in with OAuth, the command offers to create one for the bucket (ReadOnly or ReadWrite, matching what is granted), or to stop so you can log in with an access key.

The CLI now also authenticates with temporary credentials: `AWS_SESSION_TOKEN` or `TIGRIS_STORAGE_SESSION_TOKEN` alongside the matching access key variables, or an AWS profile that holds a session token. Access errors then say the credentials are temporary, and `whoami`, `credentials test` and the access-key and IAM commands explain what temporary credentials can't do instead of failing with "Access Denied".
