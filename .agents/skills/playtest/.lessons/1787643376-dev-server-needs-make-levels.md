---
title: A new content id must be compiled (`make levels`) before a dev-server probe can raise it
date: 2026-08-25
scope: content/
concepts: [content-pipeline, probes, staleness, thoughts]
---

The dev server serves the GENERATED catalogs from disk
(`engine/generated/*.ts`, `pwa/src/generated/*`), so a probe against a page
that raises a freshly authored id (a thought, a sound, a menu row) throws
"unknown ... def" until `make levels` has recompiled — the YAML edit alone
changes nothing the browser sees. Run `make levels` after authoring and
before the probe; vite hot-reloads the regenerated module, no server restart
needed. The full `make test` gate would also have rebuilt it, but a probe
usually runs first.
