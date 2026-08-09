# engine/lib — generic engine code

Engine-side code that is **not specific to this game** lives here, cleanly
separated from game-specific modules. Today that is the seeded RNG (`rng.ts`),
2D vector math (`vec.ts`), the declarative cutscene player (`cutscene.ts`) and
the sandboxed Lua VM (`lua/`) the content scripts run in.

**Always import it through its alias — `@game/lib/*`, never a relative path.**
The alias is what marks a module as belonging to the pool, and it is mapped in
four places that must stay in lockstep (`tsconfig.json`, `pwa/tsconfig.json`,
`vitest.config.ts`, `pwa/vite.config.ts`) plus `scripts/game-alias-loader.mjs`,
which is what lets a plain `node` script resolve it at runtime.

The separation exists so this code can be **reused by later games** — a
sequel keeps this pool and rewrites the game-specific modules around it.
Keep modules in this directory free of imports from game-specific code
(`engine/` outside `lib/`); the dependency arrow points the other way.

See the "Local reusable code" section in [AGENTS.md](../../AGENTS.md).
