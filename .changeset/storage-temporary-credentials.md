---
"@tigrisdata/storage": minor
---

Accept temporary credentials (STS `GetFederationToken`). Pass `accessKeyId`, `secretAccessKey` and `sessionToken` together, or set `TIGRIS_STORAGE_SESSION_TOKEN` alongside the access key variables, and every call signs the session token in. `copy`, `move` and `updateObject` previously refused a session token without an organization ID. A `credentialProvider` no longer needs `organizationId`, so it can return renewable temporary credentials. A session token passed without its key pair is still an OAuth token.

One undocumented combination changes meaning: a config with a non-empty `accessKeyId` and `secretAccessKey` plus an OAuth `sessionToken` and `organizationId` used to be sent as OAuth. It is now treated as temporary credentials. Pass an OAuth token without the key pair.
