---
title: A gallery capture costs one dev-mode APP BOOT per navigation — not dep optimization, not the server
date: 2026-08-08
scope: pwa/scripts/, pwa/src/game/effects-gallery/
concepts: [effects-gallery, tooling, measurement, review-loop]
---

`make gallery` takes tens of seconds and the three obvious explanations are all
wrong. Measured, on a single-exhibit capture:

- cold dep cache **44 s** vs warm **51 s** — `optimizeDeps` is not the cost, so
  disabling it saves nothing;
- self-started server **44 s** vs an already-warm persistent one **42 s** — the
  server is not the cost either;
- `waitUntil: "load"` vs `"domcontentloaded"` — a wash.

The cost is the APP BOOTING in dev inside the browser (a few hundred unbundled
modules, the sprite atlas, the audio graph), about fifteen seconds, and it is
paid **per navigation**. So the only lever that matters is navigating fewer
times: the script used to open the catalog's head purely to read a list of
exhibit ids and then navigate away, and opening the first WANTED exhibit
instead took a capture from 44 s to 24 s.

If you are iterating on one effect, that is the floor — do not go looking for a
flag to make it faster, and do not burn a run proving `optimizeDeps` again.
