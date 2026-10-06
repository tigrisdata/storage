---
"@tigrisdata/iam": minor
---

`getUsage({ month })` fetches the organization's usage and charges for a billing month from the management API — the data behind the console's Usage page: every charge with its quantity, billed quantity, tiers and amount, plus subtotal, credits, total, plan and invoice state. Defaults to the current month; needs a session token.
