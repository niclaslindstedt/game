---
title: The three expensive gates cannot run CONCURRENTLY — each opens by rebuilding the same generated tree
date: 2026-08-10
concepts: [quality-gates, ci, false-green, drift]
---

`make lint`, `make test` and `make build` each open by regenerating
`engine/generated/` and `pwa/src/generated/` (and the sprite atlas). That is
what makes them minutes long, and it is also what makes them mutually
exclusive: two of them started together have two `generate-content.mjs` runs
writing the same files while the other process is reading them, so a green run
proves nothing and a red one is unreproducible.

AGENTS.md's "run alongside the push" is about running them WHILE the push and
PR happen, not about running them alongside EACH OTHER — it is easy to read the
other way, and backgrounding two of them at once is the natural next move.

Run them one at a time. If wall-clock matters, `make lint` alone is the cheapest
proof the tree compiles (it ends in `tsc --noEmit` over both projects), and a
targeted `npx vitest run <file>` is fine DURING the edit loop — it is only the
whole-repo gate that must be serialized.
