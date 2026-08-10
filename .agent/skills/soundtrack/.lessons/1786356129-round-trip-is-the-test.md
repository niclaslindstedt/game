---
title: A two-way notation is testable and a one-way importer is not — build the exporter FIRST, then let `yaml → song → yaml` be the whole test suite
date: 2026-08-10
scope: scripts/asset-tools/song-format.mjs, scripts/song-import.mjs, scripts/song-export.mjs
concepts: notation, round-trip, testing, tooling
---

The `.song` importer was written first and looked fine. There is no honest way
to check an importer on its own: its output is read by the same eye that wrote
its input, so a duration that rounds, a tie dropped at a bar line, or a drum
grid that flattens two pitches into one all survive review comfortably.

`song-export.mjs` was added for a different reason (opening an existing score in
the short format) and turned out to be the test. `tests/content/song_format_test.ts`
takes every shipped score, writes it out as a `.song`, compiles it back and
demands it match note for note — one property that covers every duration form,
every rest, every drum grid, every instrument flag, the order and the tempo at
once. It found a real fault on the first run: `rift_drift`'s kick plays A1 in
some sections and B1 in others, and a drum grid carries ONE pitch, so gridding
it silently flattened the track. The exporter now only grids a voice playing at
most one distinct pitch.

The transferable part: **when adding a compact authoring format for anything in
this repo, write both directions.** The reverse tool is cheap, it makes the
existing catalogue reachable in the new format, and it turns "I read the output
and it looked right" into a property a machine checks over hundreds of cases.
Also: it must NOT guess. The exporter recovers no chord plan and infers no
figure — a `pump` and eight bars that merely look like one are the same tokens,
and a tool that told them apart would eventually tell them apart wrongly.
