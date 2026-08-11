---
title: `useTextColumn` must be DESTRUCTURED at the call site, or `react-hooks/refs` fails the lint
date: 2026-08-10
scope: pwa/src/
concepts: [css-cascade, lint, refs, text-wrap, modals]
---

`useTextColumn` (`@ui/lib/use-text-column.ts`) hands back `{ ref, fontPx }`, and
the lint reads a member access on that object as a REF READ DURING RENDER:

```
Cannot access refs during render                             react-hooks/refs
Passing a ref to a function may read its value during render
```

Both errors land on perfectly correct code — `column.ref` on a `<div>` and
`columnCapRem(column.fontPx, …)` — because the rule is name-based and cannot
see that `ref` here is a callback ref rather than a `useRef` object.

Destructure with a rename at the call site, which is what every existing caller
already does (`IntroOverlay`, `TalkOverlay`, `QuestOverlay`, `CutsceneOverlay`):

```ts
const { ref: bodyRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
```

The failure only shows up in `make lint`, which is minutes and runs at the END
of a session — so copy the destructuring shape from an existing overlay when
adding a wrapped-text surface rather than discovering it there.
