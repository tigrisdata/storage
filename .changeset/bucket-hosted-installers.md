---
'@tigrisdata/cli': minor
---

Serve the standalone installers from `get.t3.storage.dev`.

Installing no longer requires a long `raw.githubusercontent.com` URL:

```sh
curl -fsSL https://get.t3.storage.dev/install.sh | sh
```

```powershell
irm https://get.t3.storage.dev/install.ps1 | iex
```

Both installers now resolve artifacts from the bucket rather than the GitHub
releases API, which removes the anonymous 60-requests/hour rate limit that could
make installs fail from shared or CI IP addresses — a pinned `TIGRIS_VERSION`
now needs no API call at all. Downloads are verified against a published
`SHA256SUMS` and abort on a mismatch. If the bucket is unreachable the
installers fall back to the GitHub release assets automatically, and
`TIGRIS_BASE_URL` overrides the host.
