---
name: gore-system
description: "Use when working on GORE — blood spray and the floor it soaks, the hero's own bloodied coat and bootprints, a body coming apart (a CLEAVE by an edged weapon, a GIB by a mass), a new gib or organ, a new gore FAMILY (blood/ecto/sparks/cosmic), the overkill ladder that decides which death a blow earns, or the MATURE CONTENT / NSFW gate any of it hangs off. Covers the volume-vs-force split, the one-byte-per-tile floor grid, the anatomy bands a cut spills, the depth illusion, the four families and how they are re-hued rather than re-authored, and how to MEASURE a gore rate on a real run instead of judging it from a diorama."
---

# The gore system

Everything here is **presentation** — the engine emits a kill and a damage
event, and none of this changes what happens. It is also the part of the game
most easily made worse by a reasonable-sounding simplification, so nearly every
rule below is written with the version it replaced, because those are the
versions somebody will propose again.

Load `visual-effects` for how a transient effect reaches the screen at all,
`docs/rendering.md` for the projection every one of these passes draws through,
`pixel-assets` for authoring a new gib sprite, and `enemy-design` for the
`gore` / `anatomy` / `locomotion` fields on the def.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs gore-system --list`,
and `node scripts/skill-lessons.mjs visual-effects --concepts=blood-floor` for the
neighbouring fragments about the blood floor and measuring soak rates. Reading
them here and reflecting on them before the commit is the **`skill-reflection`**
skill's job — load it at both ends of the session.

## Where everything lives

| Piece | File |
| --- | --- |
| What a landed blow is worth | `pwa/src/game/game-screen/blood-hit.ts` (`bloodBlow`) |
| The spray | `pwa/src/game/render/blood.ts` (cloud, splash, droplets, haze, `AIR`) |
| The floor | `pwa/src/game/render/blood-ground.ts` + `blood-rungs.ts` (the rung rule, testable) |
| The hero's coat | `pwa/src/game/game-screen/hero-soak.ts` (the five zones) + `pwa/src/game/render/hero-coat.ts` (the compositor) |
| The bootprints | `pwa/src/game/render/blood-tracks.ts` |
| Which death a blow earns | `pwa/src/game/game-screen/overkill.ts`, applied in `kill-presentation.ts` |
| What a body becomes | `pwa/src/game/game-screen/gore-burst.ts` (anatomy bands, pools, `cleaveCut`) |
| Cutting the victim's own art | `pwa/src/game/render/sprite-split.ts` (`splitSprite`, `shredSprite`, `slicedPiece`) |
| The pieces in flight | `pwa/src/game/render/gibs.ts` (rides `items/toss.ts`'s arc) |
| The four families | `pwa/src/game/game-screen/gore.ts` + `pwa/src/game/render/recolor.ts` |
| What a BURNED body leaves | `charredRemains` + `GoreFamily.remains` in the same `gore.ts`, drawn by the `incinerate` pass in `pwa/src/game/render/effects.ts` |
| The one gate | `pwa/src/game/game-screen/gore-gate.ts` (`goreAmount`, `nsfwAllowed`) |
| Sharpness on the weapon | `engine/game/items/edge.ts` (`WeaponDef.edge`), rides out on `enemyKilled.edged` |
| The art | `content/sprites/effects/blood_*`, `gib_*`, `charred_*`, `cleave_wound`, `gore_inside` |
| Measuring | `scripts/gore-rate.mjs`; the EFFECTS GALLERY exhibits (below) |

## The blow, and the two numbers it splits into

**BLOOD SCALES WITH THE BLOW, AND THE FLOOR REMEMBERS IT.** A hit that takes a
mob's whole bar and a chip that finishes one already down to its last fifth used
to throw the identical two-frame splash, so nothing the player did read as
harder than anything else. `bloodBlow` (`game-screen/blood-hit.ts`, a pure leaf
beside `corpse-launch.ts`) prices every landed blow in the victim's own STARTING
HEALTHBARS — `damage / maxHp`, the same number the kill launch rides, which is
what keeps it honest across the campaign instead of drowning the late game in
gore as the damage figures grow.

**That number then SPLITS IN TWO, and the split is the whole design.** VOLUME is
how much blood came out and it SATURATES — a body holds one body's worth, so a
blow ten times its health cannot spill more than it had; it owns the count of
the blood and how wet the floor gets. FORCE is how hard it was hit and has NO
CEILING — the same pint can be pushed out or blown clear across the room; it
owns the reach, the haze, the size of the pieces, and how far up the wound's
frame chain the splash gets. One shared severity was the first design and it
flattened the top of the range (a 3× and a 10× overkill both hit the cap and drew
the same picture); the split is what lets a level 99 hero in a level 1 crowd keep
escalating for ever. Three pieces:

- **THE SPRAY** (`render/blood.ts`, built like `dust.ts`): a CLOUD of colour
  under everything, a wound splash at the point of impact, droplets thrown along
  seeded bearings that arc up and back down, and a haze only a blow worth more
  than a scratch makes at all. The **CLOUD** is the one part that is not authored
  art and deliberately so — it is atomized liquid with no shape of its own, and
  pixel art is the wrong tool for a soft edge — so it is a handful of BAKED
  radial glows (`glowSprite`) thrown down the same cone the drops fly, blooming
  and thinning, and it is what makes a landed blow read before a single drop has
  travelled anywhere. It is **composited with plain alpha, never `lighter`**, and
  that is what lets one pass serve four families: additive is the obvious choice
  for a glow and is wrong here, because a machine's cloud is near-black and
  adding black to a floor draws nothing at all. Plain alpha lets red, green and
  violet lie over the ground as colour AND lets the oily one genuinely DARKEN it.
  Its alpha is deliberately low — this is a wash the fight is seen THROUGH, and a
  solid one hides the mob being hit, which is the one thing a hit effect may
  never do. The splash
  grows by walking FURTHER UP ITS OWN FRAME CHAIN rather than by being scaled —
  scaling a pixel sprite just resamples the art — and the chain runs past the
  16 px `blood_hit_*` ring into the `blood_burst_*` gore detonations, because a
  ring is the right picture for a solid kill and the wrong one for a blow a
  hundred times a body's health. Past `CHUNK_FORCE` the drops become authored
  PIECES (`blood_chunk_*`) instead of beads.
- **THE FLOOR** (`render/blood-ground.ts`) is **ONE BYTE PER TILE** — a
  `Uint8Array` of saturation over the level's tile grid, 28 KB for the biggest
  map, permanent, never evicted. A list of stains would grow with every kill and
  eventually have to start forgetting; a grid does not, so painting is `+=` and a
  floor with forty thousand hits on it draws exactly as fast as one with forty.
  **Making a grid of squares read as spilled blood is the entire difficulty**, and
  it takes four rules that each fix a distinct way it comes out looking stamped:
  1. **A LADDER, NOT A SWITCH** — four authored rungs (`blood_tile_0..3`), two
     variants each, mirrored on both axes off the tile hash, with the alpha
     ramping inside a rung so a stain darkens smoothly.
  2. **THE HEAVY RUNGS OVERHANG THEIR CELL** — they are 24 px blobs drawn
     CENTRED on a 16 px cell and nudged by the tile hash (`blot`, `JITTER_PX`),
     never blitted into the cell rect, so neighbours overlap and the boundary of
     a mess is the ragged union of a dozen blobs rather than the outline of the
     cells that happen to be stained.
  3. **THE TOP RUNG IS INTERIOR-ONLY** (`drawnRung`, its own leaf
     `blood-rungs.ts` so it is testable) — a cell may climb one rung above its
     four orthogonal neighbours AND may only reach the near-opaque top rung when
     all EIGHT are heavy. The orthogonal cap alone is not enough and believing
     otherwise shipped a bug: land a few kills together and every cell in the
     blob has soaked neighbours, clears the cap, and the blob draws as a
     RECTANGLE.
  4. **THE RIM IS AUTHORED, NOT FADED** (`blood_fringe_h/v`) — a pool's edge is
     not a fainter pool, so a cell much bloodier than the neighbour it faces
     frays into it with real edge art: transparent inside, a scalloped lip, then
     droplets petering out. Two sprites cover four directions via the flip cache.
     The interior MUST be transparent — a fringe with a solid inner half is a
     half-plane, and four of them on one cell union into a filled square.

  The floor is deliberately **STILL**: nothing on it animates. A moving specular
  glint over the soaked cells was tried and cut — a highlight that travels across
  a dark red mass reads as the blood BUBBLING, and a floor that simmers is a
  floor nobody believes. Blood on the ground is settled; the only thing that
  moves is the spray, and that is over in a third of a second.

- **ONE GATE, CHECKED IN ONE PLACE — `game-screen/gore-gate.ts`.** The device's
  MATURE CONTENT switch, the player's own GORE switches and the DEVELOPER →
  VISUALS **BLOOD** amount fold into one answer, `goreAmount(family)`, which is
  what everything that spills anything asks, `bloodBlow` included. Off means
  nothing is drawn AND nothing is recorded — a gate at the draw call would leave
  the grid filling up invisibly and hand the player a red floor the moment they
  switched it back on. Only ONE of the three is different in kind: a blow refused
  because the DEVELOPER amount is zero lands completely DRY, where one refused by
  the device or the player falls back to the plain two-frame splash (`splashOnly`)
  — that knob exists to clear a field for a screenshot, not to make the game
  gentler.

- **AND "IS THIS TOO MUCH" IS NOT ONE QUESTION — SETTINGS → GORE.** What
  was a single EXTRA GORE switch is a PAGE of eight, all shipping ON, because the
  one switch made a player who did not want to watch a PERSON opened up turn off
  the machines' sparks and the ghosts' ectoplasm with it. Three groups: one row
  per gore FAMILY (HUMAN GORE, GHOST GORE, ROBOTIC GORE, COSMIC GORE — so
  `goreBlood` off with
  the other three on is "no human gore", the request the split was built for),
  one per way a body comes APART (CLEAVES, GIBS — separate rows because a blade
  opening a body and a mass bursting it are separate sights, and both cross every
  family), and the two things blood leaves on the HERO (BLOODY HERO, BOOTPRINTS).
  Those last two are blood's own art in blood's own colours, so HUMAN GORE off
  leaves
  them nothing to do: they are shown LOCKED rather than hidden, the way a locked
  KEYS row shows where the movement went. A save carrying the retired `extraGore`
  key at `off` arrives as all eight off — a player who turned the gore off years
  ago must not be handed a page of switches that turned themselves back on. A
  ninth kind of gore is a switch here plus its row in `FAMILY_SWITCH`/`KIND_SWITCH`,
  never a new gate somewhere else.

## The hero wears it out

**AND THE MAN DOING IT DOES NOT WALK AWAY CLEAN — THE SOAK AND THE TRAIL.** The
floor remembering a fight is only half of it; a hero still factory-fresh after
six hundred bodies is the loudest thing on the screen saying none of it happened.
So blood lands on HIM and stays, and his boots carry it out onto clean ground.
Both are pure presentation, priced off the very same `BloodBlow`, and both are
gated with everything else — at `heroSoakAmount()` / `bloodTrackAmount()`, which
are BLOOD's own gate plus each one's own switch.

- **THE SOAK IS FIVE NUMBERS, AND A ZONE IS A GEAR SLOT**
  (`game-screen/hero-soak.ts`): the four armor slots plus the weapon. That is the
  design, not a convenience — the only thing that ever CLEANS a zone is putting
  something new on it, compared on the piece's INSTANCE id, so swapping the
  breastplate freshens his front while the helmet he has worn all level stays
  crusted and a blade picked up off the floor comes up clean in his hand. The
  head zone is his FACE when he has nothing on it. There is no decay; he does not
  wipe it off.
- **IT ONLY LANDS AT CONTACT RANGE, AND THAT IS THE WHOLE BUILD DIFFERENCE.** A
  blow marks him if it landed about a melee swing away (`SPLASH_RANGE`, held
  UNDER the shipped blades' own 24–48 px) and not otherwise, so a hero who kills
  things by walking up to them wears every one of them and a gunslinger working
  at 160–300 px only wears what died in his face. Nothing anywhere reads a
  weapon's CLASS — the difference falls out of where the bodies were, which is
  also why a mage cornered in a doorway gets exactly as filthy as he should.
  GENEROUS IS THE FAILURE MODE: measured on autopilot runs, a 40 px range made a
  ranged build come out DIRTIER than a melee one, because in a swarm map almost
  everything eventually dies within a stride.
- **THE FLOOR MARKS HIM BACK, AND STOPS AT THE KNEES.** Standing in a pool wets
  the BOOTS fast and the shins a little (`wadeHero`), on a LOWER threshold than
  the trail's pickup — there can be far too little on a tile to track a print out
  of and still plenty to stain a boot. It never reaches his chest or his face,
  deliberately: the wade is the one source of soak that does not care how he
  fights, and a generous one climbing past his knees quietly erases the build
  difference above.
- **THE COAT IS MASKED TO HIS OWN SILHOUETTE AND IT MULTIPLIES**
  (`render/hero-coat.ts`). Authoring a bloodied twin of every sprite he can be
  drawn as is a combinatorial explosion (two costumes × three stride frames ×
  four slots × eighty generated overlays, plus whatever a mod adds), so the doll
  is composed into a scratch canvas and the coat is CLIPPED TO WHAT IS ACTUALLY
  THERE — it hugs gear that did not exist when the coat was drawn. And it
  `multiply`s rather than repaints: opaque red over him deletes the dark outline
  every sprite in the game is built on and a drenched hero becomes a red blob in
  the shape of a man, while multiply keeps the outline, keeps the shading, and
  makes the same four sprites work over white plate, brown leather and black
  mail. A second pass at `GLOSS` lifts it back toward blood red, because pure
  multiply over an already-dark boot goes to mud. **The WEAPON is composited
  separately**, inside its own swing pivot, or its blood would hang in mid-air
  while the blade swept out from under it. The DOM portraits (HUD bust,
  inventory, dialogue) run the same compositor off the same numbers — a hero
  drenched on the field and pristine in his own portrait is the feature
  contradicting itself on one screen.
- **THE TRAIL IS A CARRY, NOT A TIMER** (`render/blood-tracks.ts`). The boot
  holds a finite amount and spends one print per footfall, so the trail always
  fades out and always ENDS — a duration would print at full strength for N
  seconds and then stop dead, which reads as a bug. The step is GROUND COVERED,
  like the gait's (its own accumulator, because `walkGait` measures from its last
  call and a second call in a frame reads zero). Prints are PERMANENT like the
  floor's blood, so they cannot be a list that grows with the walking: they are
  BUCKETED BY TILE with a small per-tile cap, which bounds the whole record by
  the map's area however long the player paces one corridor. Orientation is
  quantized to the four compass steps and drawn from two authored sprites
  mirrored — the same trick the floor's fringe uses, because rotating pixel art
  to an arbitrary bearing resamples it. **A print must be DARKER than the spray,
  not fainter**: it lands on ground the fight has already freckled in the same
  three reds, so contrast is the only thing that separates it (the art carries a
  near-black pressed rim; a low-alpha print is invisible exactly where the trail
  matters most).

Judge both in the EFFECTS GALLERY — `blood-soaked` (DRENCHED) and `blood-tracks`
(BLOODY BOOTPRINTS) — and MEASURE the rates on a real autopilot run rather than
guessing: the whole feature is a curve over a map's worth of kills, and a
diorama cannot show you where that curve sits.

## The cleave and the gib

**AND PAST A POINT THE BODY DOES NOT SURVIVE THE BLOW AT ALL — THE CLEAVE AND
THE GIB.** The blood ladder above tops out at a spray; what it could not say is
that the body came APART. So a killing blow far past what a body could hold now
takes it apart, and **WHICH WAY IT COMES APART IS THE WEAPON'S DOING**: an EDGE
opens it (the sprite is cut in two along the swing and the halves keel outward),
a MASS bursts it (Quake's gibs — meat, gut, bone, organs and a head, thrown
across the floor). Everything else in the game lands blunt: a round, a bolt, a
spell, a bomb, a hazard, a bare fist.

**WHAT DECIDES WHETHER IS THE OVERKILL, AND IT IS QUAKEWORLD'S RULE —
`pwa/src/game/game-screen/overkill.ts`.** The measure is `damage - hpBefore`,
the health the blow spent PAST ZERO, carried in the victim's own healthbars so
one ladder holds from a moon rat to a rift horror; the engine supplies the
missing half on the kill event (`enemyKilled.hpBefore`, captured in `hitEnemy`
before the damage is spent, because a step later the mob's hp is negative and
the question is unanswerable). Quake bursts at `health < -40` against a
100-health bar, and `GIB_BARS` is that same four tenths — not an arbitrary
number, but the one that makes a rocket burst the man who was already hurt and
merely kill the one who was not.

**THE MISTAKE IT REPLACED IS THE ONE WORTH REMEMBERING, because it looks
identical from the code.** Judging on `damage / maxHp` — the size of the blow —
cannot tell a clean one-shot on a full-health mob from the same blow finishing
one already down to a sliver, and those are opposite events. So the honest
one-shot toppled while the mob hit by five times what was left of it came apart,
and what the player saw bore no relation to what they had just done — which is
what "it looks random" means from the outside, even though nothing in this
feature has ever rolled a die. Note the OTHER obvious reading, the ratio
`damage / hpBefore`, is wrong too and in a way a diorama will never show you: it
bursts a body on its last point of health with a blow of two damage, because two
is twice one. Spending the excess against `maxHp` keeps every case that was
wanted and costs a feeble tap nothing.

**THE RATE IS A READOUT, NOT A TARGET.** The share of deaths that come apart is
how far the hero's damage has outgrown the horde's health: an even trade dies
whole, a mob that dies in two hits and is left on a fifth of its bar bursts, and
a build one-shotting the fodder several times over bursts nearly all of it. So a
rising gib rate is the game reporting a rising power curve — measure it with
`scripts/gore-rate.mjs`, which plays campaigns and replays every kill through the
shipped ladder, and read the SPREAD across the rungs rather than the single
average. A flat rate at every difficulty is the one way this can be wrong while
still looking reasonable.

Five more rules:

1. **SHARPNESS IS CONTENT, NOT AN APP-SIDE LIST.** `WeaponDef.edge`
   (`edge: blunt` on the mauls, batons and knuckles; omitted means sharp,
   because most things that swing are blades) is resolved by the engine leaf
   `engine/game/items/edge.ts` and rides out on `enemyKilled.edged`. The
   alternative — the app guessing from weapon NAMES — drifts the moment anyone
   authors a new one and could never include a MOD's. Nothing in the simulation
   reads it; damage, reach and cadence are identical either way.
2. **THE GATE IS `gore-gate.ts`, THE SAME ONE THE BLOOD ASKS**, checked in
   `kill-presentation.ts` where the death is DECIDED — and TWO switches have to
   agree, the victim's FAMILY and the KIND of dismemberment. What a refusal falls
   back to is the ORDINARY punt-and-topple, never the OTHER kind (turning cleaves
   off must not start bursting the bodies a blade would have opened) — the same shape the nuke's
   incinerate gate takes, and for the same reason (a censored blow whose bodies
   cease to exist reads as a bug, not as a gentler game). A boss NEVER comes
   apart: it speaks its last words over its own body and that corpse is the
   level's landmark of the fight. Nothing that doesn't bleed comes apart either
   — a wisp has no halves and a rover has no intestines.
3. **THE PIECES AND THE BLOOD ARE ONE LIST, READ TWICE.** `gore-burst.ts` owns
   what a body becomes and where each piece lands; `event-fx.ts` wets the floor
   at `landingSpots(burst)` and `render/gibs.ts` flies each piece to the same
   spot — so a head always comes down ON its own spatter. Either half deriving
   its own scatter is how you get blood pooled where nothing landed.
4. **A GIB FLIES LIKE LOOT DOES, AND WHAT BOUNCES IS WHAT IT IS MADE OF.** The
   arc, the shadow that tightens as it climbs and the tumble are the loot toss's
   (`items/toss.ts`) — a body's pieces and a body's drops leave the same corpse
   at the same instant, and the two reading as one event is most of what sells
   the kill. On top of it: a skull, a ribcage, a bone shard, a heart and a
   kidney are dense and BOUNCE; a liver, a gut, a hand and a slab of meat are wet
   and stick where they land. Get that pairing wrong and it is comically wrong —
   a bouncing liver is a beach ball.
5. **A BURST THROWS PIECES OF THE THING IT BURST.** `render/sprite-split.ts` is
   the one module in the game that takes authored art apart: `splitSprite` cuts
   a bitmap in two for the cleave, `shredSprite` cuts it into fragments that ride
   the burst — so a green alien throws green pieces, for every mob and every mob
   a MOD adds, with nothing authored per monster. Both are baked and cached
   (dropped by `ensureCaches`), and the cut angle is quantized into eight
   buckets: a cut is a canvas allocation, and one per body per frame on a
   screen-clearing kill is how a spectacle becomes a stutter.

**THE CLEAVE'S CUT IS ROLLED, NOT PICKED OFF A LIST, AND THE VARIETY IS THE
FEATURE** — a spectacle you have already seen is scenery, so a player a hundred
kills in should still be shown something new. A catalog of hand-authored cuts
gives however many rows somebody typed; `cleaveCut` (gore-burst.ts) instead ROLLS
the cut line — one of the four angles the pixel art survives, and a CONTINUOUS
offset along its own normal — which is unbounded. The bearing picks the family (a
blade that swept down the screen cannot open a body sideways) and the force
decides how near the MIDDLE the cut may fall, which is the whole ladder in one
number: a blade that just barely went through takes a head or a pair of legs, and
only a monstrous blow takes a man through the middle.

**EVERYTHING ELSE ABOUT A CUT IS DERIVED FROM WHERE THE LINE LANDED**, which is
what makes an unbounded catalog maintainable. `ANATOMY_BANDS` says what a person
is made of top to bottom (skull, neck, chest, belly, hips, legs) and WHAT IS
INSIDE EACH, and a cut spills the bands it PASSED THROUGH — so a cut at the neck
drops a skull and a brain, one across the belly drops the gut and the liver, and
one straight down the middle drops nearly everything, for free, because a
vertical line crosses every band on its way. Nobody wrote the bisection down.
Which piece is thrown clear and which is left standing is derived too: a piece
smaller than a third of the body is a LIMB, and a limb off the TOP flies (a head
has nowhere to stand) while one off the BOTTOM stays (a pair of legs is already
on the floor) — the game's two most memorable cuts, neither of them authored.
The geometry knob that matters is `BODY_WIDTH_FRAC`: a humanoid sprite is a
narrow column in a square frame, and measuring a diagonal's reach against the
frame instead makes every diagonal cross the whole body, every cut spill
everything, and the entire rule evaporate into one anonymous pile.

**THE THIRD AXIS IS DEPTH, AND IT IS AN ILLUSION A BILLBOARD CANNOT CONTRADICT.**
A body here is one flat sprite that always faces the camera, so a cut through its
THICKNESS has nothing to split — and that is exactly why it can be faked
perfectly. Picture a blade going in at the middle of the FRONT and coming out at
the SIDE of the BACK: on screen that plane crosses the silhouette TWICE, and the
band between the two lines is the wet face of the cut, seen foreshortened. So one
piece keeps a quarter of the body and the other keeps the rest plus a red wedge,
exactly as a real oblique slice would leave them — and nobody can tell the two do
not add up in depth, because nobody can see either one's other side.

`CleaveCut.depth` is how far the cut travels sideways between the front face and
the back, and `slicedPiece` (render/sprite-split.ts) draws ONE piece of it: its
own art out to the entry line, then its cut face out to the exit line. That one
function covers all three cuts — the lines coincide and it is a plain half; a
little apart and it is the oblique slice; right across and the blade took a slab
off the front and left a body-shaped mess with a rind of skin down one edge. The
RATIO between skin and red is how deep the blade went, and the eye reads it as
such with nothing else to go on. The wet face is the authored `gore_inside` tile
masked to the victim's OWN silhouette, so every monster and every mod's monster
gets a correct view of its own insides with nothing authored per creature.

Two bounds are load-bearing: an oblique slice is a MINORITY (a body opening
across the screen is the legible picture and has to stay the common one), and it
never goes all the way through — at a full slab the far piece starts at the
body's own edge and there is nothing left of it to draw, so the cut loses a half
instead of gaining a dimension.

**EVERY GIB IS SOMETHING THAT WAS ON THE INSIDE.** There is no severed head, no
hand, no foot and no arm in any pool — the victim's OWN SPRITE supplies those
(`splitSprite` hands the cleave two halves of the actual monster, `shredSprite`
hands the burst a fistful of its actual fragments, all in its own colours and
its own gear, for every mob and every mob a mod adds). An authored generic head
thrown beside them is a second, worse answer to a question already answered, and
a wrong one the moment the monster is not that shape. So the authored gore is
exactly what a sprite cannot show: organs, viscera, bone and meat.

Two things about the LOOK are worth knowing before touching it, because both
were shipped wrong first and are wrong again the moment they are "simplified".
**THE CUT IS NEVER AT THE BLOW'S TRUE BEARING** — the bearing chooses the family
and nothing else, because a cut at the exact angle is what a physicist would draw
and it is mush: a 16 px body ends up a red smear nobody can read. And **THE TWO
CLOCKS ARE SEPARATE** — the flight runs on the burst's own short duration
(`GORE_BURST_MS` / `CLEAVE_MS`) while the effect LIVES for seconds after it, so
the pieces come apart at the speed of a blow and then lie there at the speed of a
battlefield. One clock for both plays the whole thing in slow motion and reads as
a body politely disassembling itself.

**ONLY A PERSON LOSES A FACE.** `EnemyDef.anatomy` (`humanoid` by default, since
nearly everything on this roster that BLEEDS is a person; `beast` on the giant
lizard and the thing on wheels) decides whether the head, hands, feet, arms and
shins are in the pool at all. It is presentation only, like `gore` and
`locomotion` — and, like them, a new `EnemyDef` field has to be added to
`canonicalEnemyDef` or it silently reads `undefined` with every check green.

The gore art is `content/sprites/effects/gib_*` (a skull, a brain, a ribcage, a
heart, a liver, a kidney, two lengths of gut, a bone shard, two meat slabs — all
of them bloody, all of them things that were on the INSIDE) plus `cleave_wound`,
the cut face drawn in the gap a cleaved body opens. That one is
deliberately the DARKEST gore in the game: a bright band between two halves
reads as a light source rather than as an inside.

## The four families

**AND EVERY KIND OF BODY COMES APART AS ITSELF — `EnemyDef.gore` IS A FAMILY, AND
`game-screen/gore.ts` IS ITS ONE CATALOG.** A ghost, a machine and a rift-thing
used to keep a plain two-frame splash and a plain corpse whatever killed them,
which made three quarters of the roster the one part of the game a hit did not
land on. There are four families now — `blood`, `ecto`, `sparks`, `cosmic` — and
each sprays, cuts, bursts, spills, hangs its own ambient and burns down to its
own remains. Adding a fifth is a ROW IN THAT FILE plus its art, never an edit to
the spray, the burst, the cleave, the floor and the effect pass. Six things vary,
and each is a different reason a burst reads as one kind of thing:

- **THE PIECES**, which is the half that does the work. A rover has no liver and
  a collapsed star has no ribcage, so each family carries its own `bands` (what
  is inside a body of that kind, top to bottom — a machine's are sensor, chassis,
  core and drive), its own `signature` ladder and its own `filler` shower. The
  cut rule is untouched: it still spills WHAT IT WENT THROUGH, so a cut across a
  rover's head spills its eye for exactly the reason one across a man's neck
  spills his skull. Each family also says what BOUNCES, and a machine is the
  inverse of a body — everything it is made of is hard except its oil.
- **THE RAMP.** The spray, the haze, the floor rungs and the plain splash are
  BLOOD's authored art re-hued onto three stops (`render/recolor.ts`: luminance
  per pixel → a colour off the family's ramp, alpha untouched), not authored four
  times over — sixty sprites nobody would keep in step. A TINT cannot do this:
  tinting MULTIPLIES, which only darkens, and red art multiplied by green is
  near-black. **Blood's ramp is deliberately `null`** rather than the red one it
  would otherwise be: a re-hue of red art onto a red ramp is very nearly the
  identity and "very nearly" is a silent regression on the look that shipped.
- **THE CLOUD's COLOUR** — `GoreFamily.cloud`, the one colour that names the
  family. For the three re-hued families it is the ramp's own middle stop; blood
  states it outright, because blood has no ramp and the cloud still has to know
  what colour blood is.
- **THE AIR** (`AIR` in `render/blood.ts`) — what hangs once the pieces land, and
  the cheapest of the four differences as well as the one that names the family
  from across a room. Blood HAZES, a machine SMOKES (climbs three times as far
  and outlives the burst that made it), a haunting PUFFS (blows outward, gone
  fastest), a rift-thing GLIMMERS (hardly moves, just goes out).
- **THE FLOOR.** Blood, oil and a ghost's goo are all matter and all stay for the
  rest of the level; a rift-thing is LIGHT and marks nothing. That is recorded as
  a SECOND byte per tile — which family last spilled there — so the same eight
  authored rungs draw red, green or oil-black, with last writer winning the
  colour while the saturation stays the running total either way. `stains` is
  checked where the mark is DECIDED (event-fx.ts), never at the draw, exactly as
  the gore gate itself is. `bloodAt` — what the hero's boots wade through — is
  deliberately blood ALONE, because the soak and the trail are blood art in
  blood's colours and a tile of oil must not print red bootprints out of it.
- **THE REMAINS** (`GoreFamily.remains`, read by `charredRemains`) — what is
  left when a body is BURNED rather than opened, which is the nuke's and the
  flamethrower's whole picture. A machine has no ribcage to char and a
  rift-thing has no bones at all, so each family burns down to its own art:
  scorched bone (three rungs of it, by how much the fire got, plus a
  long-skulled carcass for a `beast` — the same anatomy split `humanOnly` is),
  a slagged chassis, a dropped veil, a cold husk. THE POOL IS THE POINT AS MUCH
  AS THE FAMILY IS: a nuke kills a screenful at once, so one mark per family
  would still be a decal stamped forty times. The pick comes off the KILL'S OWN
  SEED — never a `state.rng()` draw, and never `Math.random()` at the draw,
  which would flicker across the 1600ms the body burns for.

The same gate covers all four — `goreAmount(family)`, one switch per family — so
a blow refused by the device or by the player's own row still falls back to the
plain splash and the ordinary corpse. **A boss is still the one body
that never comes apart**, and that is a rule about the FICTION — it has last
words to say over its own corpse, and that corpse is the level's landmark.


## Measuring and judging it

**A DIORAMA CANNOT SHOW YOU A CURVE.** Every rate in this system is a function
of a map's worth of kills against a hero whose damage is climbing — the share of
deaths that come apart, how filthy a melee build is by the boss, how far a
trail reaches. Judging any of them from a staged exhibit gives you one sample of
a distribution.

| Instrument | Answers |
| --- | --- |
| `node scripts/gore-rate.mjs` | Plays campaigns and replays every kill through the shipped ladder. Read the SPREAD across the rungs, not the average — a flat rate at every difficulty is the one way this can be wrong while still looking reasonable |
| The `playtest` / `simulate-run` skills | The soak and trail rates, which are only honest over a real run's kill count and positions |
| EFFECTS GALLERY (`?effects=<id>`, or DEVELOPER → GALLERIES → EFFECTS) | One effect per screen, staged as a real fullscreen situation and replayed on a loop; `S` steps it down to ⅛× SLOW MOTION, which is the only way to judge a burst that is over in a fifth of a second |
| `make gallery ARGS=\"--only <id> --strip N\"` | A filmstrip of a whole exhibit composited into one contact sheet — what a review actually reads. It starts and stops its own dev server; add `--speed 0.125` for the slow motion a burst needs. (It used to be a raw `node pwa/scripts/effects-gallery.mjs` that silently required a server somebody else had started, which is most of why it went unused.) |

The exhibits that belong to this skill: `cleave` (CLEAVED IN TWO), `gib` (BURST
INTO PIECES), `gore-ecto` / `gore-sparks` / `gore-cosmic` (each family's cut and
burst side by side — the only way to judge the claim that a ghost comes apart as
a ghost rather than as a person in green), `blood-soaked` (DRENCHED) and
`blood-tracks` (BLOODY BOOTPRINTS).

**THE RARE CUTS ARE PINNED SO THEY CAN BE LOOKED AT.** Everything about a cleave
is rolled, which is the feature and also what makes its rare cuts impossible to
study — an oblique slice comes up about a fifth of the time. `Exhibit.cut` pins
a PARTIAL cut over the roll for the length of a show (`pinCleaveCut`, cleared
when the gallery stops so it can never reach a real run): `cleave-behead` and
`cleave-legs` pin the two ends of the limb rule, `cleave-oblique` and
`cleave-slab` the two ends of the depth one. **Pin the ONE axis the exhibit is
about and let the rest go on rolling** — a diorama showing the same picture every
take would misreport a system whose whole point is that it does not.

## Adding to it

| Adding | Costs |
| --- | --- |
| A gore PIECE a burst throws | `content/sprites/effects/gib_<part>.yaml` (it must be something that was INSIDE) + its entry in `SIGNATURE` / `FILLER` in `gore-burst.ts`, plus `BOUNCY` if it is dense and `HUMAN_ONLY` if only a person has one |
| An ORGAN a cut can spill | the sprite + the `ANATOMY_BANDS` band it lives in. Every cut through that band spills it from then on — nobody writes the combinations down |
| A gore FAMILY | one row in `gore.ts` (bands, signature ladder, filler, ramp, cloud colour, what bounces, whether it `stains`, what it BURNS DOWN TO) + its art. Never an edit to the spray, the burst, the cleave, the floor and the effect pass |
| A burned body's REMAINS | `content/sprites/effects/charred_<what>.yaml` + its name in that family's `remains` pool in `gore.ts`. The pool is picked from on the KILL'S OWN SEED, so a second entry is what stops a nuked screenful leaving one decal forty times |
| A KIND of dismemberment | a switch in `KIND_SWITCH` + the settings row; the fallback for a refusal is always the ORDINARY corpse, never the other kind |
| A mature feature of any sort | a `nsfwAllowed()` check — **never a new setting**. See the gate's rules above |

## Checklist

- [ ] Priced off the victim's own healthbars (`damage / maxHp`), not off a raw
      damage figure — or it drowns the late game in gore as the numbers grow.
- [ ] VOLUME saturates, FORCE does not. Check both ends: a feeble tap and a
      hundred-fold overkill.
- [ ] Gated where the thing is DECIDED, not where it is drawn — nothing may
      accumulate invisibly while a switch is off.
- [ ] Fails open: no native module, an Android build, a browser, a malformed
      payload all play the full game.
- [ ] A boss never comes apart. It has last words to say over its own body.
- [ ] Nothing that doesn't bleed comes apart as though it did — a wisp has no
      halves, a rover has no intestines.
- [ ] Deterministic: seeded off the item/victim hash or the blow, never
      `state.rng()` (a presentational draw shifts every roll after it).
- [ ] Judged in the gallery in SLOW MOTION, and the RATE measured on a real run.
- [ ] New `EnemyDef` field? Add it to `canonicalEnemyDef` (`defs/enemies/index.ts`)
      or it silently reads `undefined` with every check still green.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the rules and checklist above.

```sh
node scripts/skill-lessons.mjs gore-system --list
```
