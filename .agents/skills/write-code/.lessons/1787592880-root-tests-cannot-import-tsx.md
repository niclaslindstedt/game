---
title: A test under tests/ cannot import a `.tsx` — vitest passes and `make lint` fails, so pure logic belongs in a `.ts` leaf beside the component
date: 2026-08-24
scope: tests/, pwa/src/
concepts: [testing, typecheck, tsconfig, components]
---

The root `tsconfig.json` sets no `jsx`, so `tsc --noEmit` refuses any file that
reaches a `.tsx`:

```
tests/x_test.ts(22,8): error TS6142: Module '…/MenuHeading.tsx' was resolved to
'…', but '--jsx' is not set.
```

The trap is the ORDER the checks fail in. Vitest transpiles JSX itself, so
`npx vitest run tests/x_test.ts` is green and the test looks finished; the error
only appears minutes later inside `make lint`, which is the slowest check in the
loop and the one most likely to be run last.

Do not widen the root tsconfig for it. **Put the pure logic in a `.ts` leaf
beside the component and let the component import it** — the title screen
already does this everywhere (`menu-highlight.ts`, `sun-race.ts`,
`use-title-layout.ts`, and now `heading-fit.ts` beside `MenuHeading.tsx`). It is
the better shape anyway: the math becomes testable without a renderer, and the
leaf usually wants to drop the component's own types on the way out (taking a
measured width rather than a `PixelFont`).

So when a change to a component produces something worth asserting, extract
FIRST and test the leaf — not test the `.tsx` and discover the wall at the gate.
