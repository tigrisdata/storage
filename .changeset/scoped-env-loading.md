---
'@tigrisdata/storage': patch
'@tigrisdata/iam': patch
---

Stop mutating the global `process.env` when loading configuration. Previously, importing the server entry ran `dotenv.config()` as an import-time side effect, loading the consuming app's entire `.env` (including unrelated keys) into `process.env`.

Configuration is now resolved on demand, per operation, directly from the environment: the SDK parses `.env` into a private object (never touching `process.env`), keeps only `TIGRIS_`-prefixed keys, and prefers explicitly-set `process.env` values. Importing the SDK no longer has side effects, and apps that manage their own environment are no longer overridden.
