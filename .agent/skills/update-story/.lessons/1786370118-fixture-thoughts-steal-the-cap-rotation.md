---
title: Registering `thoughts` in the engine fixtures silently takes the cap-farm mutter away from every other suite
date: 2026-08-10
scope: tests/engine/fixtures.ts, tests/engine/
concepts: [thoughts, fixtures, register-defs, testing]
---

`tests/engine/fixtures.ts` deliberately registers NO `thoughts`, so engine
suites run against the SHIPPED thought catalog — and `xp_cap_test.ts` depends on
that for the cap-farm rotation. `registerDefs({ thoughts })` replaces the whole
catalog and takes `capThoughts` with it (`setThoughtDefs` drops any id not in
the rotation it is handed), so adding one fixture thought to `installFixtures`
turned three passing cap-mutter assertions red in the FULL run while every file
still passed on its own. A suite that needs one synthetic thought registers it
itself in a `beforeAll`; per-file module isolation keeps it local.
