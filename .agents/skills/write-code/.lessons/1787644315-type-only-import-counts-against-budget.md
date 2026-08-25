---
title: A type-only `@game/core` import still fails the startup-path budget — restate the union in the leaf
date: 2026-08-25
scope: pwa/src/game/
concepts: [code-splitting, budgets, typecheck, imports]
---

`tests/content/net_reachability_test.ts` walks the import graph with a regex
(`from "..."`), so `import type { X } from "@game/core"` in a startup-path
module (anything cloud save, settings or the title menu reaches —
`rocket-scores.ts` was the case) fails "never statically reaches the whole
engine" even though the emitted JS carries no edge. The house fix is the
`minigames.ts` pattern: restate the small union in the leaf with a comment
naming this rule, and let structural typing hold the seam together. Do not
teach the walker about `import type` — an erased import is still a statement
that the leaf depends on the engine's front door, and the leaf must not.
