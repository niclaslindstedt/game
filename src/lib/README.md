# src/lib — generic engine code

Engine-side code that is **not specific to this game** (game-loop utilities,
input primitives, math/collision helpers, sprite/audio plumbing) lives here,
cleanly separated from game-specific modules.

The separation exists so this code can be **extracted into
[oss-framework](https://github.com/niclaslindstedt/oss-framework)** — and
reused by later games — once it has matured and playtesting shows it works.
Until then it iterates here, where the loop is fast. Keep modules in this
directory free of imports from game-specific code (`src/` outside `lib/`);
the dependency arrow points the other way.

See the "Reuse through oss-framework" section in [AGENTS.md](../../AGENTS.md).
