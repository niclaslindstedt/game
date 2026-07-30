---
title: A build-up effect is a CURVE — measure it on a real run, never in a diorama
date: 2026-07-30
---

An effect that accumulates over a whole map (the hero's blood soak, a rampage
meter, anything with a ladder of rungs) cannot be judged in the EFFECTS GALLERY.
The gallery answers "does the top rung look right"; it cannot answer "does the
player ever reach it", which is the only question that decides whether the
feature exists in play. Both times I tuned by eye in an exhibit the shipped rate
was out by 2–3×.

Drive the real game instead and read the numbers out of the module:

```js
// probe.mjs — playwright + the dev server's own ESM graph
await page.goto("http://localhost:5199/?debug&bot=aggro&level=spacez_hq&…");
// …click through play → new-game → character-create → difficulty → level…
await page.evaluate(async () => {
  const soak = await import("/src/game/game-screen/hero-soak.ts");
  return { kills: window.__game.stats.kills, ...soak.heroSoak(window.__game) };
});
```

Two traps that cost me a measurement each:

- **Vite HMR forks the module.** After editing the module under test, the app is
  still holding the OLD instance while a fresh `import()` gets a NEW one with
  zero state — the probe reads all zeros and looks like a bug in the feature.
  RESTART the dev server between edits, don't just reload.
- **A getter on the debug handle may be a function.** `window.__gallery.state`
  is `getState()`, not the state; `window.__game` IS the state. Check
  `typeof` rather than assuming.

Vary the bot's `--profile` (melee/ranged/magic) whenever the effect is supposed
to read differently per build — that comparison is the acceptance test, and it
is the one an exhibit can never run.
