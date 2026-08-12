---
title: Gates run concurrently corrupt each other's generated tree and fake a failure in an unrelated suite
date: 2026-08-12
concepts: [quality-gates, false-red, flake, generated-content, parallelism]
---

Backgrounding `make lint`, `make test` and `make build` together to "save time"
cost an extra ten minutes instead. All three OPEN by regenerating the whole
content tree into the same paths (`engine/generated/`, `pwa/src/generated/`,
the sprite atlas), so they raced each other, and the suite came back
`2 failed | 7263 passed` in `tests/steam_achievements_verify_test.ts` — a file
with no connection whatever to the one sprite grid the session had touched. Run
sequentially, the same tree passed 402/402 files and 7265/7265 tests.

The signature to recognize, because it reads exactly like a real pre-existing
bug worth chasing: **the failing file is unrelated to the diff, and it PASSES
when run alone** (`npx vitest run tests/<file>_test.ts`). That combination is
the overlap, not a flaky product. Before opening an investigation into a
failure like that, check whether another whole-repo gate was running at the
same time — and just re-run the suite on its own first, which settles it in one
pass.

The skill already says the gates cannot overlap; this is what ignoring it looks
like from the inside. Only ONE whole-repo gate at a time. The convention that
overlaps the FINAL suite with the push is about overlapping it with `git push`
and the PR call — never with another gate.
