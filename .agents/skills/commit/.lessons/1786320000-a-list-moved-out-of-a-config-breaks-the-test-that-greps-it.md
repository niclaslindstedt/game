---
title: A list moved out of a config breaks the test that GREPS that config — point the test at the new home and assert every consumer still reads it
date: 2026-08-08
scope: tests/content, electron/electron-builder.config.cjs, scripts/modtools-manifest.cjs
concepts: [quality-gates, drift-tests, packaging, declared-once]
---

This repo has several tests that hold a hand-maintained list honest by reading
the file it is written in **as text** and regexing the entries out of it —
`tests/content/mod_toolchain_deps_test.ts` does exactly that against
`electron/electron-builder.config.cjs`'s `from: "../…"` literals. That works
right up until somebody does the thing the repo otherwise asks for and
declares the list ONCE somewhere both consumers read it. The grep then matches
nothing, the "is every module carried into the package?" assertion sees an
empty allow-list, and the test fails naming every file in the toolchain —
which reads like a packaging catastrophe and is in fact a moved constant.

It happened here moving the mod toolchain's file list into
`scripts/modtools-manifest.cjs` so `electron/electron-builder.config.cjs` and
`tauri/scripts/package.mjs` stop keeping one copy each.

**The fix is two halves and the second is the one that gets forgotten:**

1. Point the test's regex at the NEW home, so what it asserts is the list.
2. Add an assertion that **each consumer still reads it** — one
   `expect(source).toMatch(/modtools-manifest\.cjs/)` per packager. Without
   that, a packager that quietly stopped importing the shared list passes a
   test that is now only checking the list's own contents.

The sibling test one function down already had this shape for `mod/package.json`
("the config builds its entries FROM this manifest, so what is asserted is that
it still reads it") — so the pattern to copy was six lines away.

**And the cheap verification that made the refactor safe to do at all:** before
touching the config, dump what it currently produces
(`node -e "console.log(JSON.stringify(require('./electron-builder.config.cjs').extraResources))"`),
then diff it as a SET afterwards. A packaging config for the SHIPPING shell is
not a thing to refactor on faith, and that check is thirty seconds.
