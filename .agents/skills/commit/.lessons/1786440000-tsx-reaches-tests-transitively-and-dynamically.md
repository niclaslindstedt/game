---
title: The `.tsx` a test cannot reach is TRANSITIVE and counts a dynamic import — a lazy `import("./App.tsx")` two hops away is the same TS6142
date: 2026-08-10
scope: tests/, pwa/src, tsconfig.json
concepts: [quality-gates, false-green, typecheck, tests, lint, code-splitting]
---

The sibling lesson (`tests-cannot-import-tsx`) reads as being about a test that
imports a component. It is not: the root typecheck walks the whole graph, and it
does not care that an edge is `import()` rather than `import`. Splitting the app
so the studio card fetches `App.tsx` lazily put a one-line `app-shell.ts` —
`export function loadAppShell() { return import("./App.tsx"); }` — into
`game/splash.ts`'s imports, which `tests/splash_test.ts` imports, and `make lint`
failed with `TS6142` on a file two hops from any test and behind a boundary whose
entire purpose is that the chunk is NOT loaded.

`npx tsc --noEmit -p pwa/tsconfig.json` says nothing (that config has `jsx`), and
`npx vitest run` says nothing. Only the ROOT `tsc --noEmit` does, which is inside
`make lint` — minutes long, and therefore run at the end.

**Adding `"jsx"`/`"jsxImportSource"` to the root `tsconfig.json` is the wrong
fix twice over.** It relaxes the wall the older lesson is about, and it breaks
`tests/preact_renderer_test.ts`, which `JSON.parse`s all four tsconfigs to check
the `react` → `preact/compat` aliases — so the repo's tsconfigs are strict JSON
and a `//` comment in one is a failing suite with a `SyntaxError` naming a line
number and nothing else. (`pwa/tsconfig.json` is comment-free for the same
reason; keep the reasoning in a module header instead.)

The right fix is the older lesson's, applied one level up: **keep the
renderer-free half renderer-free.** `splash.ts` is policy a test pins;
`SplashScreen.tsx` is the picture. So the lazy fetch moved from `warmBoot` into
the card's own effect, and `splash.ts` went back to zero static imports — which
it wanted anyway, because every static import there is a chunk downloaded in
FRONT of the card instead of behind it. Two constraints, one answer.
