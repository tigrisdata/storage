---
'@tigrisdata/cli': patch
---

Fix object counts reported by `cp`, `mv`, and `rm`

Folder markers (the zero-byte `folder/` keys that make an empty prefix show up
as a folder) were being counted as objects, so `mv -r` on a folder of 10 files
asked "Are you sure you want to move 11 object(s)?" and then reported "Moved 10
object(s)". `ls` hides those markers, so the counts now do too — the
confirmation prompt and the final tally are derived from the same rule and
always agree.

- `mv` and `rm` no longer count the folder's own marker, or the markers of any
  nested subfolders, as objects. The markers are still moved and deleted as
  before; they're just not counted or printed.
- An operation whose scope is nothing but markers reports the folders it
  handled, so an empty folder counts as `1` rather than reading as a no-op, and
  clearing three sibling empty folders reports `3` rather than `1`.
- `cp` remote-to-remote no longer counts nested folder markers, and a run whose
  object copies all failed now reports `0` instead of `No objects to copy`.

The `count` field in `--format json` output for these commands follows the same
rule and may be lower than before for folders that contain markers.

Wildcards also no longer operate on the folder they match inside. A wildcard
names files within a folder, not the folder itself, so:

- `mv 'folder/*.zip'` with nothing matching now reports `No objects to move`
  instead of `Moved 1 object(s)`. It previously moved the source folder's
  marker to the destination, which removed `folder/` itself.
- `cp 'folder/*'` no longer creates a folder marker at the destination.
- `rm 'folder/*'` empties the folder without deleting it, matching how
  `rm dir/*` behaves in a shell. Use `rm -r folder` to remove the folder too.
