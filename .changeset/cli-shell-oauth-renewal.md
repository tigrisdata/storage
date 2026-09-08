---
'@tigrisdata/cli-shell': patch
---

Fix OAuth token handling in the browser shell. Token expiry is now read from the access token's own `exp` claim, so it is exact for a fresh token and a cached one alike — previously a cached token carried the SDK's original `expires_in`, letting a near-expired token be recorded as good for another hour, after which commands failed until that wrong timestamp elapsed. Renewal forces a real refresh so the CLI gets a genuinely new token when it asks; a session with no refresh token (one cached before offline access was in use) falls back to its cached token and keeps working until it truly expires, while a refresh token the tenant rejects is discarded so the user signs in again. A renewal that cannot proceed reports a clean "session expired, run tigris login" message instead of the Auth0 SDK's internal audience and scope detail.
