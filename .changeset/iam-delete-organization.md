---
"@tigrisdata/iam": minor
---

`deleteOrganization(organizationId)` deletes an organization you own, through `DELETE /tigris-iam/namespaces` scoped to that organization. The gateway accepts it only from an OAuth session, only for Tigris-native organizations, only from the owner, and only once the organization is empty (no buckets, access keys, policies, teams, or other members); its shares and invitations are removed with it. Gateway errors are returned as is.

Errors from the IAM gateway now carry its reason (`{ status: "error", message }`) instead of the HTTP status text, so a refused request says why rather than `Bad Request`.
