---
title: A new build-output directory needs THREE ignore lists, not one — .gitignore, eslint.config.js and .prettierignore
date: 2026-08-08
scope: .gitignore, .prettierignore, eslint.config.js
concepts: [quality-gates, lint, build-artifacts, packaging]
---

Adding a directory that a build writes into (a packager's output, a copied
site, a compiled bundle) and only adding it to `.gitignore` leaves `make lint`
and `make fmt-check` red — for everybody who has ever run that build, and
green for everybody who has not. That asymmetry is the trap: the branch passes
locally on a clean tree and fails the moment CI or a colleague runs the step
that produces the output.

It bit on `tauri/release/` (the Steam depot `tauri/scripts/package.mjs`
assembles): the depot contains a copy of the built site, so `eslint .` walked
its minified service worker and produced 712 `'self' is not defined` errors
against files nobody wrote. The fix is three lines, one per list —
`.gitignore`, the `ignores` array in `eslint.config.js`, and `.prettierignore`
— and the existing entries for `electron/release/` and `tauri/webroot/` are
the pattern to copy.

The general form: **when a change adds a path a build WRITES, grep for a
sibling artifact directory in all three files and add the new one beside it**
before running the fast quality gates, not after watching one go red.
