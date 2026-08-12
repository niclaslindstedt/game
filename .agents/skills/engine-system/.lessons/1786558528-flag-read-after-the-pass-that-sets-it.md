---
title: In the drive's collision pass, a latch read AFTER the passes that can set it is a guard that fires on its own blow — capture it in the caller, like `wasWrecked`
date: 2026-08-12
scope: engine/game/drive/collide.ts
concepts: [collisions, drive, ordering, latches]
---

`breakCar` guards the shove with "was this thing already a wreck / already off
its wheels". Both facts have to be captured BEFORE `hurtTraffic` and `smashEnd`
run, because both of those can set them: a fold that opens a tank up rolls for
combustion and `explodeVehicle` sets `downed`. `wasWrecked` was already passed
in by the caller for exactly this reason; `downed` was still being read inside
the function, so the hardest blows on the road produced no shove at all — a
parked car met flat out went up, hopped, and came back down on the spot.

The smell is general: in a pass that runs several mutators over one object,
any `if (!obj.someLatch)` sitting below them is asking about this blow rather
than about the last one. It stayed invisible for so long because it only
triggers on the combustion roll, which is a hash of the vehicle's id — so it
appears and disappears with unrelated changes to the spawn order.
