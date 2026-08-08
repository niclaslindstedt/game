---
title: A repo-wide path sweep passes the whole gate while it is wrong — six directories are named `src/` and only one of them is the engine
date: 2026-08-08
concepts: [quality-gates, sweep, false-green, drift]
---

Renaming the root `src/` to `engine/` looked like one `git mv` plus a
find/replace. It is not: `pwa/src/`, `native/src/`, `electron/src/`,
`tauri/shell/src/` and `tauri/src-tauri/src/` all exist, and `../src/` resolves
to a DIFFERENT tree depending on which file the string sits in — from
`pwa/vite.config.ts` it is the engine, from `pwa/scripts/planet-maps.mjs` it is
pwa's own.

`make lint`, `make test` (6823 tests) and `make build` were all green over a
sweep that had silently rewritten three things none of them read: the vendored
`OSS_SPEC.md` (whose `src/output.rs` and `src/test/` are generic
cross-language examples, and which the spec forbids editing), a
`.agent/skills/` lesson title about the SHELLS' `src/`, and prose comments in
`electron/` and `tauri/`. The `@ui/lib` alias in `pwa/tsconfig.json` and
`pwa/vite.config.ts` was the one that WOULD have broken the build — it is
`./src/lib`, pwa's own — and it was caught by reading the diff, not by a check.

So for any whole-tree rename: discriminate on the character BEFORE the match
(`(?<![\w./-])src/` leaves every `<tree>/src/` alone), exclude the sibling
trees and sweep them by hand, and review the diff per-tree — the gate cannot
tell you a comment now points at the wrong directory. Verify the three ignore
lists together (`.gitignore`, `.prettierignore`, `eslint.config.js`), and that
`node scripts/skill-lessons.mjs --check` is clean, since every lesson `scope:`
naming the old path goes stale at once.
