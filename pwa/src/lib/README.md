# pwa/src/lib — generic game UI

React components and hooks that are **not specific to this game** (HUD
widgets, touch-steering surfaces, pause overlays, virtual controls) live
here, cleanly separated from game-specific app code.

The separation exists so this code can be **reused by later games** — a
sequel keeps this pool and rewrites the game-specific app code around it.
Keep modules in this directory free of imports from game-specific app code
(`pwa/src/` outside `lib/`); the dependency arrow points the other way.

See the "Local reusable code" section in [AGENTS.md](../../../AGENTS.md).
