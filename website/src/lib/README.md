# website/src/lib — generic game UI

React components and hooks that are **not specific to this game** (HUD
widgets, touch-steering surfaces, pause overlays, virtual controls) live
here, cleanly separated from game-specific app code.

The separation exists so this code can be **extracted into
[oss-framework](https://github.com/niclaslindstedt/oss-framework)** — and
reused by later games — once it has matured and playtesting shows it works.
Until then it iterates here, where the loop is fast. Keep modules in this
directory free of imports from game-specific app code (`website/src/`
outside `lib/`); the dependency arrow points the other way.

See the "Reuse through oss-framework" section in
[AGENTS.md](../../../AGENTS.md).
