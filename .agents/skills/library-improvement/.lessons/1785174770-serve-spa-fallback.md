---
title: Serve the built library WITHOUT the SPA fallback, or you screenshot the game
date: 2026-07-27
scope: pwa/scripts/library/
concepts: [serving, spa-fallback, screenshots]
---

`npx serve -s dist` is the obvious way to preview a build, and for this repo it
is the wrong one. `-s` is single-page-app mode: it rewrites every unmatched URL
to `index.html`, and since `index.html` at the root is THE GAME, every library
URL returns 200 with the game shell. Playwright then screenshots the title
screen for `/library/arsenal/geology-hammer/` and reports every element selector
as missing — which reads like a broken generator rather than a broken server.

Use `npx serve dist` (no `-s`). The library is static files with real
`index.html` files in real directories; it needs no fallback. Confirm before
capturing anything:

```sh
curl -sS http://localhost:PORT/library/arsenal/<id>/ | grep -o '<title>[^<]*'
```

If that prints the game's title instead of the page's, the fallback is on and
every shot from that session is worthless.

Two related traps from the same session:

- Playwright installed with `--no-save` wants a browser build that
  `/opt/pw-browsers` does not have. Launch with
  `chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })` rather than
  running `npx playwright install`.
- The library stylesheet is a JS template literal (`styles.mjs`), so a backtick
  inside a CSS comment is interpolation. Writing ``` `.site-head` ``` in a comment
  fails the build with `ReferenceError: head is not defined`. Never put backticks
  in a comment inside that file.
