---
title: Fire is the one road effect made of SPRITES — particles are right for everything else and wrong for flame
date: 2026-08-10
scope: pwa/src/game/drive-screen/drive-fx.ts
concepts: [drive, fire, smoke, particles, additive-glow]
---

`drive-fx.ts` draws everything with canvas primitives, and that is correct for
grit, sparks, shards, dust and smoke: there are HUNDREDS of each, every one a
pixel or a disc, and the mass IS the picture. Fire is the opposite — there is
ONE of it, it is the brightest thing in the frame, and it has a shape the eye
knows, so built out of orange dots it reads as sparks. Use the game's own flame
ladder (`content/sprites/effects/flame_*.yaml`, five stages × two frames) and
pass the atlas into `drawDriveFx`; the burn's own progress picks the stage, so
the player watches a flicker under a wing become an engine bay going up.

Three things that make it read: THREE tongues spread along the body rather than
one sprite on the middle of a four-metre car; each on its own frame phase off
the effect's seed, so two burning cars never flicker in step; and drawn
`lighter`, because over night tarmac `source-over` pastes an orange sticker on
the road. The blast's SMOKE is the exception and must NOT be additive — smoke is
matter, and `lighter` brightens the road it is supposed to be hiding.

And a burning car must be issued on a CADENCE at its own position, never with
`DriveFx.follow` — that flag means the hero's wagon, so a fire that set it burns
on the player's own bonnet. Same shape as `wreck-smoke.ts`, and the same for any
state (a car being SHOVED) rather than event.
