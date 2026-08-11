---
title: A root test cannot reach `.tsx` directly, transitively, or through `import()`
date: 2026-08-08
scope: tests/, pwa/src, tsconfig.json
concepts: [quality-gates, false-green, typecheck, tests, lint, code-splitting]
---

The root tsconfig typechecks `tests/` without JSX support, so any import graph
from a test that reaches a `.tsx` file fails `make lint` with TS6142. Vitest and
the PWA typecheck both miss it, and a dynamic `import()` is still an edge in the
graph. Keep testable policy in a plain `.ts` sibling and the picture in `.tsx`;
do not add JSX settings to the root tsconfig, which would relax the boundary and
also disturb tests that parse the configs as strict JSON.
