---
title: On the drive's OUTSKIRTS the footway is a lane away from the tarmac, so any y-rule measured off `roadBandEdges()` puts bodies on the grass
date: 2026-08-12
scope: engine/game/drive/, pwa/src/game/drive-screen/
concepts: [drive, outskirts, road-geometry, footway, pavement-riders, lane-ai]
---

The drive's road is NOT the same width all the way down it: the town is four
lanes and both outskirts are the middle two (`roadBandHalfAt`), while the
paving and the crowd band sit at the FULL road's kerb line for the whole leg
(`roadBandEdges` / `crowdEdges`, which are constants). So out of town there is
a lane's worth of painted verge between the tarmac and the pavement — and any
rule that measures a y off the constants lands a body in it. Two shipped
rules did: the footway riders' cut-in reached `cutInPx` inside `roadBandEdges`,
which out of town is grass rather than carriageway, and the lane drivers'
aim was clamped to `roadEdges()` — the TOWN's road. Both wanted
`roadBandHalfAt(travel, params)` at the body's own x. Rule of thumb: inside
`engine/game/drive/`, a constant road edge is only correct for the town.

The other half of the same bug is a CASTING fact: `DriveVehicleDef.pavement`
answers where a machine belongs IN TOWN (it is what splits the two spawner
pools), and the outskirts cast their one footway from `OUTSKIRT_IDS`, which
holds `traffic_bicycle` — whose def rides the road. Asked of the def, every
intro cyclist was handed to `steerTraffic` and driven at a lane centre the
approach does not have. "Is this one on the footway" is now
`DriveTraffic.footway`, stamped where the vehicle is laid down.

HOW TO SEE IT, which is most of the work: `?drive&bot=1&debug&seed=N` mounts
the real minigame with the auto-driver, and `window.__drive` (the `?debug` hook
in `DriveScreen.tsx`) is the live `DriveState`. Poll it from Playwright and
screenshot only when the predicate you care about holds — waiting for a rider
to be both in the grass band AND inside the visible dx window is otherwise a
fishing trip. For the numbers, skip the browser entirely: `register`
`scripts/game-alias-loader.mjs` and drive `createDrive`/`stepDrive` straight
from a node script (`stepDrive` takes MILLISECONDS and `{ pedal, wheel }`, not
seconds and `{ throttle, steer }`). Judge "on the grass" with
`roadBandHalfAt` at each body's own travel — an x-independent test reports the
town's own lane traffic as strays.
