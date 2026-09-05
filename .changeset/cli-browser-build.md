---
'@tigrisdata/cli': minor
---

Add `@tigrisdata/cli/browser`: the CLI running in a page.

It is the same commander program, the same `src/lib` handlers and the same
`specs.yaml` as the Node binary — a third esbuild target alongside the npm and
bun-binary ones, reusing the seams the CLI already had (`CLIConfig.loadModule`,
`setSpecs()`, `getStorageConfig()`). New commands reach it for free.

```ts
import { createBrowserCli, setAccessKeySession } from '@tigrisdata/cli/browser';

await setAccessKeySession({ accessKeyId, secretAccessKey });
const { stdout, exitCode } = await createBrowserCli(host).run(['objects', 'list', 'my-bucket']);
```

77 of the 83 implemented commands are available. The six left out are
machine-local or have no browser analogue: `update` and `init` spawn processes
and write editor config, `bundle` streams a tar to stdout as binary, and the
three `telemetry` commands are deliberately stubbed — an embedded component
should not ship analytics on the host page's behalf.
