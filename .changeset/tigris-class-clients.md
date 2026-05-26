---
'@tigrisdata/storage': minor
'@tigrisdata/iam': minor
---

Add class-based clients `Tigris` and `TigrisIAM` alongside the existing bare-function exports. `new Tigris({ auth, bucket, endpoints? })` and `new TigrisIAM({ auth, endpoints? })` hold auth and endpoint config so per-call options stay focused on per-call concerns — methods are arrow fields, safe to destructure (`const { get, put } = new Tigris(init)`).

New shared types: `TigrisInit`, `TigrisAuth`, `TigrisCredentials`, `TigrisSession`, `TigrisEndpoints`. `TigrisAuth` is a discriminated union of static credentials, a static session, or an async session resolver (`() => Promise<TigrisSession>`); resolver auth is cached with proactive refresh 60s before `expiration`, with concurrent calls coalesced. Construct-time validation throws on missing or malformed auth; all runtime failures (network, resolver rejection, missing bucket per call) flow through the existing `{ data, error }` response. Per-call `bucket` is surfaced as a top-level option on storage object methods for overriding the construct-time default. The bare-function API and its types are unchanged.
