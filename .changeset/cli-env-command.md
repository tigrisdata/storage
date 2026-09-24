---
"@tigrisdata/cli": minor
"tigris": minor
---

`tigris env` prints the active credentials as the environment variables the
AWS SDKs, the AWS CLI and the Tigris SDKs read, ready for
`eval "$(tigris env)"`, `tigris env --format dotenv > .env`, or
`tigris env --shell fish | source`. `--tigris` switches to the
`TIGRIS_STORAGE_*` names and `--json` returns an object.

Only the assignments go to stdout, so the output is safe to evaluate; the
same convention `gh auth token`, `fly auth token` and direnv rely on.
OAuth sessions have no key pair to export, so `env` explains how to mint
one instead of printing something that would not work.
