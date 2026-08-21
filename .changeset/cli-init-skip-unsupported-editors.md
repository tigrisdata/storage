---
'@tigrisdata/cli': patch
---

Fix `tigris init` failing the whole skills step over one unsupported editor, and
the install banner appearing twice

Two things went wrong in a single `npx tigris@latest init` run:

- **Skills installed for nobody.** `init` passes every selected editor to the
  upstream `skills` installer in one call, and that tool validates all of its
  `-a` names before doing any work — so one name it doesn't know fails the step
  for every editor. A user with Zed selected got
  `Invalid agents: zed` and no skills at all, in any editor. Two changes: the
  installer is now pinned to `skills@latest`, since npx otherwise reuses a
  cached release that predates the newer agent names; and when the installer
  does reject an editor, `init` warns about that editor and installs for the
  rest instead of giving up.
- **The banner printed mid-wizard.** The package's postinstall banner is written
  straight to `/dev/tty`, so it escaped the captured stdio of the `npm install
  -g` that `init` and `tigris update` run and was painted over the wizard's own
  prompts. Children the CLI spawns to install or update itself now set
  `TIGRIS_NO_BANNER`, which postinstall honours — the banner still greets a
  first-time install.
