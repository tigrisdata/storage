---
"@tigrisdata/cli": minor
---

`tigris orgs delete [id]` deletes an organization you own, after a confirmation (`--yes` skips it). With no ID it lets you pick one from a list; organization names are not unique, so they are not accepted. The organization must be empty first; the gateway's reason is shown otherwise (IAM gateway errors now surface their message instead of the HTTP status text, for every IAM command). If it was your active organization, the first remaining organization becomes active and is named, so the next command just works.
