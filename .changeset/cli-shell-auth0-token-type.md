---
"@tigrisdata/cli-shell": patch
---

Builds against `@auth0/auth0-spa-js` 2.25 and later, where `getTokenSilently` is typed as possibly returning nothing. An empty result — which the modes the shell uses cannot produce — is reported as an error instead of being read as a token.
