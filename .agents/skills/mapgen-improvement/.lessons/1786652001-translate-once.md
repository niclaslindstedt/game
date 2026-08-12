---
title: Rooms translated IN PLACE must not be shifted again by the border pass — and seams recorded pre-translation must be
date: 2026-08-12
scope: engine/game/mapgen/parts.ts
concepts: [parts, assembly, translation, borders]
---

`assembleParts` deals rooms around the origin (negative coords allowed), then
translates every room in place to positive space. Geometry READ OFF THE ROOMS
after that (shared borders, perimeter spans) is already in map coordinates;
only values RECORDED MID-DEAL (the seams' door positions) still need the shift.
Adding the offset to both drew every interior wall a room-height off its room —
and the renders LOOKED plausible on the first seed (small dx), while seed 21
(dy=432) sealed the objective. The tell in the dump: a border's `doorAt`
outside its own `from–to` span.
