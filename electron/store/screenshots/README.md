# Steam screenshot inventory

These are deterministic 1920×1080 captures from the real game renderer. They
contain the shipped HUD and no marketing captions, fabricated compositing, or
generated imagery. The debug FPS readout is hidden before capture. Achievement
recording and toasts are suppressed by default; a recipe must opt in when an
achievement is intentionally the subject.

The recipes they are shot from are the `SHOTS` array in
`pwa/scripts/store-shots/recipes.mjs`, which is where a frame's venue, seed,
staging and capture delay actually live — this file is the inventory, not the
source. The captures land in `steam-1080/`, the device's own subdirectory.

## Frames

1. **`01-nuke.png` — The Rift, Nightmare.** Level-90 hero with The Reckoning
   detonates the shipped nuke power amid Voidlings and Gravitons. The white-hot
   center, fire columns, damage numbers, XP, and loot are live game effects/UI.
2. **`02-horde.png` — Mars, Nightmare.** A Mjolnir build with Orbiting Flames
   and Immolation Aura trained is surrounded by Servo Bots, Phobos Shepherds
   and Olympus Engines, all of them hellborn. Damage and dodge text are live
   combat feedback.
3. **`03-talents.png` — The Rift, Nightmare.** Starfall plus fully trained
   Orbiting Flames, Storm Call, Seeker Orbs, Immolation Aura, and Arcane
   Singularity fight Unravelers and Star Jellies.
4. **`04-loot.png` — GOODCO HQ, Nightmare.** A quiet reward beat, moments after
   PAYLOAD-1 is killed for real: Skybreaker, Kingsbane, Sunwreath, The
   Stillward and Meteorfall are on the ground as genuine drops around the body,
   with the plant's staff held back at the edge of the frame.
5. **`05-boss.png` — The Moon, Nightmare.** The hero with The Reckoning stands
   in the Flagbearer's second-phase beam, ringed by wraiths and ghosts, in the
   real boss arena.
6. **`06-powers.png` — Boot Hill, Nightmare.** Mjolnir and the shipped Fire
   Orbs, Storm Cell, Ion Wake, and Blast Shield powers fight Tin Outlaws and
   Cowbots around the saloon frontage.

## Promise audit

Every frame is a reproducible endgame scenario using shipped enemies, items,
powers, talents, environments, HUD, and effects. The set intentionally samples
late-game Nightmare density and peak effect timings, so it represents the
game's dramatic ceiling rather than its first minutes. The quiet loot frame
balances that spectacle, and the set spans The Rift, Mars, GOODCO HQ, The Moon
and Boot Hill — five venues, five floor colours. No frame claims pre-rendered
fidelity or hides the actual viewpoint, pixel scale, interface, damage-number
density, or moment-to-moment readability.
