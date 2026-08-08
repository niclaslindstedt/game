---
title: The store shells' `src/` is not skip-listed either — only their `scripts|tests|store/` are
date: 2026-08-08
scope: electron/src, tauri/shell/src, tauri/src-tauri/src, scripts/release/check-changeset.mjs
concepts: [skip-list, no-changelog, shells, false-red]
---

The SKILL.md names `engine/` and `pwa/src/` as the deliberate holes in the
skip-list. The same trap applies to the desktop shells and is easier to walk
into, because the skip-list entry beside them reads as if the whole tree were
covered: what is skipped is **`native|electron|tauri/scripts/`,
`native|electron|tauri/tests/`, `native|electron/store/` and
`tauri/{shell,src-tauri}/tests/`** — not `electron/src/`, and not
`tauri/shell/src/`, `tauri/src-tauri/src/` or `tauri/src-tauri/tauri.conf.json`.

Read the ALTERNATION, not the comment above it. That comment said "the store
shells (native/, electron/)" while every pattern beside it listed only
`(native|electron)` — the Tauri tree was added later and never joined the group,
so a `tauri/scripts/`-only PR demanded a fragment for months. Fixed in the same
pass that wrote this line; the lesson is that a third shell has to be added to
each pattern by hand and nothing fails when it isn't.

So a shell-only PR — a comment sweep across the Rust modules, a renamed
constant, a new decision module nothing player-facing sits on — still demands a
fragment or the label, even though every other path in it (`docs/`, `scripts/`,
`.github/`, `*.md`) is skipped.

Worth checking before reaching for the label: a shell change often IS visible to
a player even when it looks like plumbing, because the shells are what a
downloaded build is. A launch failure that now prints one sentence instead of a
stack trace is a `Fixed` a player would notice; a renamed internal constant next
to it is not.
