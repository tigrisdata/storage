---
"@tigrisdata/cli": patch
---

Fix `tigris --help` on narrow terminals. Commander only wraps a description when the aligned description column is at least 40 characters wide, and our widest command term is 30 characters — so below ~75 columns it stopped wrapping entirely and emitted lines up to 192 characters. Help output now stacks each description under its term and wraps to the terminal width whenever the aligned column would be too narrow to read; 80-column and wider output is unchanged.
