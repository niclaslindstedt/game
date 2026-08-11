---
title: An app-side audio scheduler must reset when a restarted simulation rewinds its clock
date: 2026-08-11
scope: pwa/src/game/drive-screen/loop.ts, tests/drive_restart_test.ts
concepts: [audio, scheduler, restart, clock-rewind, drive]
---

The DRIVE engine-note scheduler outlives the simulation object, so a restart can
leave its next due time far ahead of the fresh run's clock and make the engine
sound disappear for most of the attempt. Detect the rewind before the due-time
guard, reset the scheduler to its initial state, and pin the comparison in a
test that does not need to synthesize audio.
