---
title: The SEO check is a CI job the local gate never runs — `npm run check:seo --workspace pwa` after any change to the shell or the critical path
date: 2026-08-09
scope: pwa/index.html, pwa/pwa-plugin.ts, pwa/src, pwa/scripts/check-seo.mjs, .github/workflows/seo.yml
concepts: [quality-gates, ci, false-green, seo, budget]
---

`make fmt-check`, `make lint`, `make test` and `make build` all pass over a
change that `.github/workflows/seo.yml` then fails, because that workflow is the
ONLY thing that runs `pwa/scripts/check-seo.mjs`. Nothing in the Makefile calls
it and `build:site` does not either — it stops at `generate-seo.mjs`, which
WRITES the surfaces rather than checking them.

What it guards is exactly what a change to `pwa/index.html`, `pwa-plugin.ts`'s
`transformIndexHtml`, or anything on the startup path moves: the 170 KB gzipped
critical-path budget, the `<title>`/description/canonical/robots set on all ~576
emitted pages, the JSON-LD `@graph`, and duplicate titles across slots. So run
it by hand after the build, from the repo root:

```sh
npm run build && npm run check:seo --workspace pwa
```

It needs `pwa/dist/` to exist, which is why it belongs after `make build` rather
than beside `make lint`.
