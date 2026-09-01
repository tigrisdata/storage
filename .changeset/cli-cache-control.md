---
'@tigrisdata/cli': minor
---

Add `--cache-control` to `objects put` and `cp`, and report it in `stat`.

The value is stored with the uploaded object and returned by Tigris on every
read:

```sh
tigris objects put my-bucket app.js ./app.js \
  --cache-control 'public, max-age=31536000, immutable'

tigris cp ./dist/ t3://my-bucket/assets/ -r \
  --cache-control 'public, max-age=31536000, immutable'
```

On `cp` it applies to local-to-remote uploads only, matching `--access`.
