---
name: debug-game
description: "Use when investigating a gameplay bug, visual glitch, audio problem, or crash. Covers reproducing deterministically with seeds, inspecting live state via ?debug, reading the engine log buffer, and locking the fix with a failing test first."
---

# Debugging the Game

The engine is deterministic by construction: `createGame(seed)` +
a fixed sequence of `step(state, input, dt)` calls always produces the same
run. Almost every gameplay bug can therefore be reduced to a **seed + input
script**, reproduced headlessly, and locked in with a test. Prefer that
route over clicking around in a browser.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs debug-game --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Instruments

| Instrument | How |
| --- | --- |
| Deterministic repro | `createGame(FIXED_SEED)` + fixed-dt `step()` loops in a scratch Vitest file |
| Live state inspection | Load the app with `?debug` → `window.__game` is the live `GameState` (see `GameScreen.tsx`); poke it in DevTools or via the playtest bot |
| Engine log buffer | `recentLogs()` from `@game/core` — ring buffer of all levels, always on. `debug(...)` messages print to console only in debug mode (`?debug` or `setDebugEnabled(true)`) |
| Autoplay + screenshots | The `playtest` skill's bot: strategies + `pageerror` logging + screenshots of the exact frame |
| Sim-vs-render split | Rendering reads state, never writes it. If values are wrong in `window.__game`, the bug is engine-side; if state is right but pixels are wrong, it's `render.ts`/assets |

## Process

1. **Classify by layer first** (5 minutes of `window.__game` inspection):
   - engine bug → state values are wrong (positions NaN, hp negative,
     phase stuck)
   - render bug → state right, pixels wrong (offsets, flips, z-order,
     camera)
   - input bug → `GameInput` wrong (check the steering target the app
     computes from the pointer + camera in `GameScreen.tsx`)
   - audio bug → events right (log `state.events`), sound wrong
     (`sfx/`/`synth.ts`; remember audio needs a user gesture to unlock)
2. **Engine bugs: write the failing test BEFORE the fix.** Arrange the
   exact scenario in `tests/engine/` (synthetic fixtures via `registerDefs`;
   `applyScenario` stages complex situations — see the `test-scenario`
   skill), step until the bad state appears, assert
   the correct behavior, watch it fail, then fix `engine/game/*`. The test
   stays forever; the bug can't return silently. Add diagnostic
   `debug(...)` calls to the engine (never `console.*` — lint forbids it)
   while narrowing down; they're free, buffered, and only print in debug
   mode.
3. **Render bugs:** reproduce with the playtest bot, screenshot, and
   compare against the sprite previews (`make assets`,
   `pwa/assets-preview/`) to separate "asset is wrong" from "renderer
   draws it wrong".
4. **Heisenbugs / timing:** the loop caps frame deltas at 100 ms
   (`pwa/src/lib/game-loop.ts`) — tab-background fast-forwarding is already
   handled. For dt-sensitivity, run the same scenario at dt=16 and dt=33
   in a test and compare.
5. Keep the repro test in `tests/` named after the behavior (not
   `bug123_test.ts`).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the classification table above, so triage gets faster.

```sh
node scripts/skill-lessons.mjs debug-game --list
```

What is worth a fragment here is the diagnosed root-cause *class*, never the
one-off bug.
