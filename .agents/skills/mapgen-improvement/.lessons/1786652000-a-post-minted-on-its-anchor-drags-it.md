---
title: A mob minted ON a def-owned vector drags the anchor with it — the client/server hash is the tripwire
date: 2026-08-12
scope: engine/game/mapgen/, engine/game/mob-spawns.ts, engine/game/create.ts
concepts: [parts, mob-spawns, aliasing, replication]
---

`clearOfFurniture` (and any "find a clear spot" helper) answers with the INPUT
vector when the spot is already clear, and `spawnEnemy` adopts the vector it is
handed as the mob's live `pos`. Mint a post's first watch on `post.at` and the
occupant's every step mutates the post's authored anchor.

What made it visible is worth remembering: nothing local failed. The server's
`enemy.pos = moveToward(...)` REPLACES the pos object, so the server's post kept
its authored ints — but the client applies movement diffs IN PLACE, so the same
aliasing on the client mutated its posts, and `net_session_test`'s whole-state
hash (`worldOf`) was the first thing to disagree. When a new def-owned position
enters the state, the repo's "a COPY, never the same vector twice" comment is
not style — pass `vec(spot.x, spot.y)`.
