# pwa/src/lib — generic game UI

Preact components, hooks and browser plumbing that are **not specific to this
game** live here, cleanly separated from game-specific app code: the pixel-skin
widgets (`PixelBar`, `PixelText`, `PixelSlider`, `PixelToggle`, …), the fixed-step
game loop, pointer/gamepad/haptics input, the chiptune sequencer and synth, the
pixel font and atlas readers, and the PWA update plumbing.

**Always import it through its alias — `@ui/lib/*`, never a relative path.** The
alias is what marks a module as belonging to the pool, and it is mapped in four
places that must stay in lockstep (`tsconfig.json`, `pwa/tsconfig.json`,
`vitest.config.ts`, `pwa/vite.config.ts`) — the last two so DOM-free modules here
stay testable from `tests/`.

**It is Preact, spelled `react`.** `react`, `react-dom` and `react-dom/client`
are aliased to `preact/compat` in those same four maps; React itself is not
installed. Write `from "react"` as every other component here does.

The separation exists so this code can be **reused by later games** — a
sequel keeps this pool and rewrites the game-specific app code around it.
Keep modules in this directory free of imports from game-specific app code
(`pwa/src/` outside `lib/`); the dependency arrow points the other way.

See the "Local reusable code" section in [AGENTS.md](../../../AGENTS.md).
