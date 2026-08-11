---
title: An annex costs a whole band of level; size the room off the map or it looks like a bug
date: 2026-07-28
scope: content/maps/
concepts: [blueprint, annex, sizing]
---

An `annex` adds a band to the level rect that is the room's height plus its
margins — and that band is as wide as the MAP, whether the room is or not. A
fixed-width control room therefore leaves a bigger and bigger apron of dead rock
either side of it as the carve scales up: on boot_hill LARGE a 900px room sat in
a 4800px band, and the minimap showed a wide empty strip that reads as "half my
map failed to load".

`MapAnnex.widthFrac` sizes the room as a fraction of the carved width (clamped to
at least `width`), so the band stays mostly ROOM at all three sizes. A long low
gallery is also a better operations centre or strongroom than a square hall, so
this is not only a fix for the waste.
