---
"@tigrisdata/cli": minor
---

`tigris orgs delete [id]` deletes an organization you own, after a confirmation (`--yes` skips it). With no ID it lets you pick one from a list; organization names are not unique, so they are not accepted. The organization must be empty first; the gateway's reason is shown otherwise (IAM gateway errors now surface their message instead of the HTTP status text, for every IAM command). Your last organization cannot be deleted, and Fly.io organizations are not offered. If the deleted organization was the active one, the first remaining organization becomes active and is named, so the next command just works; JSON output always reports `activeOrganization`.
