---
"@tigrisdata/iam": minor
---

Access keys gain a scope. `createAccessKey(name, { scope })` sets it at creation and the new `setAccessKeyScope(id, scope)` changes it on an existing key, leaving its bucket roles as they are. `standard` (the default) grants the implicit default-allowed operations such as creating and listing buckets on top of what the key's policies and bucket roles grant; `no_default_allow` limits the key to what they explicitly allow. `getAccessKey` and `listAccessKeys` report it as `scope`, and `ACCESS_KEY_SCOPES` lists the valid values.
