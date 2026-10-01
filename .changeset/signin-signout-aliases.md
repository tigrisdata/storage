---
'@tigrisdata/cli': minor
---

Add `tigris signin` and `tigris signout` as aliases for `tigris login` and `tigris logout`. Both names do the same thing, with every subcommand and flag (`tigris signin oauth`, `tigris signin credentials --access-key ...`). `login` and `logout` are unchanged. Help text and status messages now say "sign in" and "sign out".
