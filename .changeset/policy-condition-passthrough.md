---
'@tigrisdata/iam': minor
'@tigrisdata/cli': patch
---

Keep `Sid` and `Condition` in IAM policy documents

Policy documents were mapped field by field in four places, and every mapping
listed only `Effect`, `Action` and `Resource`. Conditions were dropped when
creating a policy, when updating one, and when reading one back, so an
IP-restricted or time-limited policy silently became unrestricted, and a
description-only `tigris iam policies edit` stripped the condition of a policy
created elsewhere. `toApiDocument` and `fromApiDocument` now own the mapping and
carry both fields.
