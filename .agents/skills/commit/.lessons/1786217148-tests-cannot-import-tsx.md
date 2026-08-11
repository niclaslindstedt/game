---
title: A suite under `tests/` cannot import a `.tsx` — the root tsconfig has no `jsx`, and only `make lint` says so
date: 2026-08-08
scope: tests/, pwa/src, tsconfig.json
concepts: [quality-gates, false-green, typecheck, tests, lint]
---

`npx vitest run` transforms JSX happily, so a new test that imports something
out of a `pwa/src/**/*.tsx` component goes green locally and then fails the
gate with `TS6142: … but '--jsx' is not set` — `make lint`'s `typecheck:only`
runs the ROOT tsconfig over `tests/`, and that config has no `jsx` setting
(only `pwa/tsconfig.json` does). There is no root-side fix worth making: the
answer is that the thing being tested belongs in a plain `.ts` sibling. A
component's POLICY (what a terminal beat does, what a restart throws away) is
exactly the half worth pinning, so extract it — `drive-screen/end-drive.ts` is
the worked example — and leave the `.tsx` as the picture. Checking a touched
`.tsx` with `npx tsc --noEmit -p pwa/tsconfig.json` will NOT catch this either;
the failing compile is the root one, over the test file.
