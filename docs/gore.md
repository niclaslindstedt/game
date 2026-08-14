<!-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 -->

# Gore — what a landed blow leaves behind

Everything here is **presentation**. The engine emits a kill and a damage event
and none of it changes what happens: no rule below alters damage, reach, cadence
or the outcome of a fight. What it decides is what the player SEES a blow do —
how much blood came out and how hard it was thrown, what the floor remembers,
what the hero is wearing by the boss, whether the body survives the blow at all,
and what a body that is not made of blood does instead.

It is also the part of the game most easily made worse by a reasonable-sounding
simplification, so a rule that replaced a tempting wrong answer says which one:
that is the answer somebody will propose again.

**This is the mechanism.** The workflow — how to measure a gore rate on a real
run, what the gallery exhibits are for, what adding a piece or a family costs,
and the checklist a change is held to — is the `gore-system` skill. Load that
before changing any of this; it points back here for the detail.

Neighbouring documents: [`docs/rendering.md`](rendering.md) for the projection
every one of these passes draws through, [`docs/configuration.md`](configuration.md)
for the SETTINGS → GORE rows and the device's MATURE CONTENT switch, and
[`docs/modding.md`](modding.md) for what a mod may add to any of it.

## Where everything lives

| Piece                        | File                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What a landed blow is worth  | `pwa/src/game/game-screen/blood-hit.ts` (`bloodBlow`)                                                                                                   |
| The spray                    | `pwa/src/game/render/blood.ts` (cloud, splash, droplets, haze, `AIR`)                                                                                   |
| The floor                    | `pwa/src/game/render/blood-ground.ts` + `blood-rungs.ts` (the rung rule, testable)                                                                      |
| The hero's coat              | `pwa/src/game/game-screen/hero-soak.ts` (the five zones) + `pwa/src/game/render/hero-coat.ts` (the compositor)                                          |
| The CAR's coat, on the road  | `pwa/src/game/drive-screen/car-soak.ts` (seven panels, the airstream, the film ladder); look at it with `node scripts/car-viewer.mjs --gore` / `--film` |
| The bootprints               | `pwa/src/game/render/blood-tracks.ts`                                                                                                                   |
| Which death a blow earns     | `pwa/src/game/game-screen/overkill.ts`, applied in `kill-presentation.ts`                                                                               |
| What a body becomes          | `pwa/src/game/game-screen/gore-burst.ts` (anatomy bands, pools, `cleaveCut`)                                                                            |
| Cutting the victim's own art | `pwa/src/game/render/sprite-split.ts` (`splitSprite`, `shredSprite`, `slicedPiece`)                                                                     |
| The pieces in flight         | `pwa/src/game/render/gibs.ts` (rides `items/toss.ts`'s arc)                                                                                             |
| The four families            | `pwa/src/game/game-screen/gore.ts` + `pwa/src/game/render/recolor.ts`                                                                                   |
| What a BURNED body leaves    | `charredRemains` + `GoreFamily.remains` in the same `gore.ts`, drawn by the `incinerate` pass in `pwa/src/game/render/effects.ts`                       |
| The one gate                 | `pwa/src/game/game-screen/gore-gate.ts` (`goreAmount`, `sfwModeEnabled`)                                                                                |
| Sharpness on the weapon      | `engine/game/items/edge.ts` (`WeaponDef.edge`), rides out on `enemyKilled.edged`                                                                        |
| The art                      | `content/sprites/effects/blood_*`, `gib_*`, `charred_*`, `cleave_wound`, `gore_inside`                                                                  |
| Measuring                    | `scripts/gore-rate.mjs`; the EFFECTS GALLERY exhibits — the `gore-system` skill drives both                                                             |

## The blow, and the two numbers it splits into

**BLOOD SCALES WITH THE BLOW, AND THE FLOOR REMEMBERS IT.** `bloodBlow`
(`game-screen/blood-hit.ts`, a pure leaf beside `corpse-launch.ts`) prices every
landed blow in the victim's own STARTING HEALTHBARS — `damage / maxHp`, the same
number the kill launch rides. A raw damage figure instead drowns the late game in
gore as the numbers grow; a share of a bar holds across the whole campaign.

**That number then SPLITS IN TWO, and the split is the whole design.** VOLUME is
how much blood came out and it SATURATES — a body holds one body's worth, so a
blow ten times its health cannot spill more than it had; it owns the count of the
blood and how wet the floor gets. FORCE is how hard it was hit and has NO CEILING
— the same pint can be pushed out or blown clear across the room; it owns the
reach, the haze, the size of the pieces, and how far up the wound's frame chain
the splash gets. One shared severity flattens the top of the range (a 3× and a
10× overkill both hit the cap and draw the same picture); the split is what lets
a level 99 hero in a level 1 crowd keep escalating for ever.

- **THE SPRAY** (`render/blood.ts`, built like `dust.ts`): a CLOUD of colour
  under everything, a wound splash at the point of impact, droplets thrown along
  seeded bearings that arc up and back down, and a haze only a blow worth more
  than a scratch makes at all.

  The **CLOUD** is the one part that is not authored art, deliberately — it is
  atomized liquid with no shape of its own, and pixel art is the wrong tool for a
  soft edge. It is a handful of BAKED radial glows (`glowSprite`) thrown down the
  same cone the drops fly, and it is what makes a landed blow read before a
  single drop has travelled. Two properties are load-bearing. It is **composited
  with plain alpha, never `lighter`**, which is what lets one pass serve four
  families: a machine's cloud is near-black, and adding black to a floor draws
  nothing, while plain alpha lets red, green and violet lie over the ground as
  colour AND lets the oily one genuinely DARKEN it. And its alpha is **low**,
  because this is a wash the fight is seen THROUGH — a solid one hides the mob
  being hit, which is the one thing a hit effect may never do.

  The **SPLASH** grows by walking FURTHER UP ITS OWN FRAME CHAIN rather than by
  being scaled (scaling a pixel sprite just resamples the art), and the chain
  runs past the 16 px `blood_hit_*` ring into the `blood_burst_*` detonations —
  a ring is the right picture for a solid kill and the wrong one for a blow a
  hundred times a body's health. Past `CHUNK_FORCE` the drops become authored
  PIECES (`blood_chunk_*`) instead of beads.

- **THE FLOOR** (`render/blood-ground.ts`) is **ONE BYTE PER TILE** — a
  `Uint8Array` of saturation over the level's tile grid, 28 KB for the biggest
  map, permanent, never evicted. A list of stains grows with every kill and
  eventually has to start forgetting; a grid does not, so painting is `+=` and a
  floor with forty thousand hits draws exactly as fast as one with forty.
  **Making a grid of squares read as spilled blood is the entire difficulty**,
  and it takes four rules, each fixing a distinct way it comes out looking
  stamped:
  1. **A LADDER, NOT A SWITCH** — four authored rungs (`blood_tile_0..3`), two
     variants each, mirrored on both axes off the tile hash, with the alpha
     ramping inside a rung so a stain darkens smoothly.
  2. **THE HEAVY RUNGS OVERHANG THEIR CELL** — 24 px blobs drawn CENTRED on a
     16 px cell and nudged by the tile hash (`blot`, `JITTER_PX`), never blitted
     into the cell rect, so neighbours overlap and the boundary of a mess is the
     ragged union of a dozen blobs rather than the outline of the stained cells.
  3. **THE TOP RUNG IS INTERIOR-ONLY** (`drawnRung`, its own testable leaf
     `blood-rungs.ts`) — a cell may climb one rung above its four orthogonal
     neighbours AND may only reach the near-opaque top rung when all EIGHT are
     heavy. The orthogonal cap alone is not enough: with a few kills landed
     together every cell in the blob has soaked neighbours, clears the cap, and
     the blob draws as a RECTANGLE.
  4. **THE RIM IS AUTHORED, NOT FADED** (`blood_fringe_h/v`) — a pool's edge is
     not a fainter pool, so a cell much bloodier than the neighbour it faces
     frays into it with real edge art: transparent inside, a scalloped lip, then
     droplets petering out. Two sprites cover four directions via the flip cache.
     The interior MUST be transparent — a fringe with a solid inner half is a
     half-plane, and four of them on one cell union into a filled square.

  The floor is deliberately **STILL**: nothing on it animates. A moving specular
  glint over soaked cells reads as the blood BUBBLING, and a floor that simmers
  is a floor nobody believes. Blood on the ground is settled; the only thing that
  moves is the spray, and that is over in a third of a second.

- **ONE GATE, CHECKED IN ONE PLACE — `game-screen/gore-gate.ts`.** AGENTS.md
  carries the rule itself (gate where the thing is DECIDED, `nsfwAllowed()` is
  the umbrella, it FAILS OPEN); what is this skill's is the shape. Four
  authorities — the device's MATURE CONTENT switch, SFW MODE, the player's
  detailed GORE switches and the DEVELOPER → VISUALS **BLOOD** amount — fold into
  one answer, `goreAmount(family)`, which everything that spills anything asks,
  `bloodBlow` included. The three refusals differ: device policy or an individual
  gore switch falls back to the plain two-frame splash; the DEVELOPER amount at
  zero lands completely DRY; SFW keeps `splashOnly` false, because stardust is
  its hit marker.

- **AND "IS THIS TOO MUCH" IS NOT ONE QUESTION — SETTINGS → GORE.** SFW MODE is
  the page's master presentation override, preserving the detailed answers
  underneath while replacing blood, dismemberment, burned remains and the hero's
  own stains with stardust. Under it sit eight switches, all shipping ON, in
  three groups: one per gore FAMILY (so `goreBlood` off with the other three on
  is "no human gore", the request the split was built for), one per way a body
  comes APART (CLEAVES and GIBS are separate sights and both cross every family),
  and the two things blood leaves on the HERO. A single EXTRA GORE switch instead
  makes a player who does not want to watch a PERSON opened up turn off the
  machines' sparks with it. A save carrying the retired `extraGore` key at `off`
  arrives as all eight off (`settings.ts`, `legacyOff`) — a player who turned the
  gore off years ago must not be handed a page of switches that turned themselves
  back on. `docs/configuration.md` owns the row list; what matters here is that a
  new kind or family is a switch there plus its row in `FAMILY_SWITCH` /
  `KIND_SWITCH`, never a new gate somewhere else.

## The hero wears it out

**THE MAN DOING IT DOES NOT WALK AWAY CLEAN — THE SOAK AND THE TRAIL.** A hero
still factory-fresh after six hundred bodies is the loudest thing on screen
saying none of it happened. So blood lands on HIM and stays, and his boots carry
it out onto clean ground. Both are pure presentation, priced off the very same
`BloodBlow`, and both are gated at `heroSoakAmount()` / `bloodTrackAmount()` —
BLOOD's own gate plus each one's own switch.

- **THE SOAK IS FIVE NUMBERS, AND A ZONE IS A GEAR SLOT**
  (`game-screen/hero-soak.ts`): the four armor slots plus the weapon. That is the
  design, not a convenience — the only thing that ever CLEANS a zone is putting
  something new on it, compared on the piece's INSTANCE id, so swapping the
  breastplate freshens his front while the helmet he has worn all level stays
  crusted and a blade picked up off the floor comes up clean in his hand. The
  head zone is his FACE when he has nothing on it. There is no decay.
- **IT ONLY LANDS AT CONTACT RANGE, AND THAT IS THE WHOLE BUILD DIFFERENCE.** A
  blow marks him if it landed about a melee swing away (`SPLASH_RANGE`, held
  UNDER the shipped blades' own 24–48 px), so a hero who kills things by walking
  up to them wears every one of them and a gunslinger working at 160–300 px only
  wears what died in his face. Nothing anywhere reads a weapon's CLASS — the
  difference falls out of where the bodies were, which is also why a mage
  cornered in a doorway gets exactly as filthy as he should. GENEROUS IS THE
  FAILURE MODE: measured on autopilot runs, a 40 px range makes a ranged build
  come out DIRTIER than a melee one, because in a swarm map almost everything
  eventually dies within a stride.
- **THE FLOOR MARKS HIM BACK, AND STOPS AT THE KNEES.** Standing in a pool wets
  the BOOTS fast and the shins a little (`wadeHero`), on a LOWER threshold than
  the trail's pickup — there can be far too little on a tile to track a print out
  of and still plenty to stain a boot. It never reaches his chest or face: the
  wade is the one source of soak that does not care how he fights, and a generous
  one climbing past his knees quietly erases the build difference above.
- **THE COAT IS MASKED TO HIS OWN SILHOUETTE AND IT MULTIPLIES**
  (`render/hero-coat.ts`). A bloodied twin of every sprite he can be drawn as is
  a combinatorial explosion (two costumes × three stride frames × four slots ×
  eighty generated overlays, plus a mod's), so the doll is composed into a
  scratch canvas and the coat is CLIPPED TO WHAT IS ACTUALLY THERE — it hugs gear
  that did not exist when the coat was drawn. It `multiply`s rather than
  repaints: opaque red deletes the dark outline every sprite is built on and a
  drenched hero becomes a red blob in the shape of a man, while multiply keeps
  the outline and the shading and makes the same four sprites work over white
  plate, brown leather and black mail. A second pass at `GLOSS` lifts it back
  toward blood red, because pure multiply over an already-dark boot goes to mud.
  **The WEAPON is composited separately**, inside its own swing pivot, or its
  blood hangs in mid-air while the blade sweeps out from under it. The DOM
  portraits (HUD bust, inventory, dialogue) run the same compositor off the same
  numbers — drenched on the field and pristine in his own portrait is the feature
  contradicting itself on one screen.
- **THE TRAIL IS A CARRY, NOT A TIMER** (`render/blood-tracks.ts`). The boot
  holds a finite amount and spends one print per footfall, so the trail always
  fades out and always ENDS; a duration prints at full strength for N seconds and
  then stops dead, which reads as a bug. The step is GROUND COVERED, like the
  gait's — its own accumulator, because `walkGait` measures from its last call
  and a second call in a frame reads zero. Prints are PERMANENT like the floor's
  blood, so they cannot be a list that grows with the walking: they are BUCKETED
  BY TILE with a small per-tile cap, bounding the whole record by the map's area
  however long the player paces one corridor. Orientation is quantized to the
  four compass steps and drawn from two authored sprites mirrored — the same
  trick the floor's fringe uses, because rotating pixel art resamples it. **A
  print must be DARKER than the spray, not fainter**: it lands on ground the
  fight has already freckled in the same three reds, so contrast is the only
  thing separating it (the art carries a near-black pressed rim; a low-alpha
  print is invisible exactly where the trail matters most).

## The cleave and the gib

**PAST A POINT THE BODY DOES NOT SURVIVE THE BLOW AT ALL.** The blood ladder
above tops out at a spray; what it cannot say is that the body came APART. So a
killing blow far past what a body could hold takes it apart, and **WHICH WAY IT
COMES APART IS THE WEAPON'S DOING**: an EDGE opens it (the sprite is cut in two
along the swing and the halves keel outward), a MASS bursts it (Quake's gibs —
meat, gut, bone, organs and a head, thrown across the floor). Everything else in
the game lands blunt: a round, a bolt, a spell, a bomb, a hazard, a bare fist.

**WHETHER IS THE OVERKILL, AND IT IS QUAKEWORLD'S RULE — `game-screen/overkill.ts`.**
The measure is `damage - hpBefore`, the health the blow spent PAST ZERO, carried
in the victim's own healthbars so one ladder holds from a moon rat to a rift
horror. The engine supplies the missing half on the kill event
(`enemyKilled.hpBefore`, captured in `hitEnemy` before the damage is spent —
a step later the mob's hp is negative and the question is unanswerable). Quake
bursts at `health < -40` against a 100-health bar, and `GIB_BARS` is that same
four tenths: the number that bursts the man who was already hurt and merely kills
the one who was not.

**BOTH OBVIOUS ALTERNATIVES ARE WRONG, AND LOOK IDENTICAL FROM THE CODE.**
`damage / maxHp` (the size of the blow) cannot tell a clean one-shot on a
full-health mob from the same blow finishing one down to a sliver — opposite
events, so the honest one-shot topples while the chip comes apart, which is what
"it looks random" means from outside a system that rolls no dice. `damage /
hpBefore` fails where no diorama will show you: it bursts a body on its last
point of health with a blow of two damage, because two is twice one.

**THE RATE IS A READOUT, NOT A TARGET.** The share of deaths that come apart is
how far the hero's damage has outgrown the horde's health — an even trade dies
whole, a build one-shotting the fodder several times over bursts nearly all of
it. A rising gib rate is the game reporting a rising power curve. Measure it with
`scripts/gore-rate.mjs` and read the SPREAD across the rungs, never the single
average: a flat rate at every difficulty is the one way this can be wrong while
still looking reasonable.

Five more rules:

1. **SHARPNESS IS CONTENT, NOT AN APP-SIDE LIST.** `WeaponDef.edge`
   (`edge: blunt` on the mauls, batons and knuckles; omitted means sharp, because
   most things that swing are blades) is resolved by the engine leaf
   `engine/game/items/edge.ts` and rides out on `enemyKilled.edged`. The app
   guessing from weapon NAMES drifts the moment anyone authors a new one, and
   could never include a MOD's. Nothing in the simulation reads it.
2. **THE GATE IS `gore-gate.ts`, THE SAME ONE THE BLOOD ASKS**, checked in
   `kill-presentation.ts` where the death is DECIDED — and TWO switches have to
   agree, the victim's FAMILY and the KIND of dismemberment. A refusal falls back
   to the ORDINARY punt-and-topple, never to the OTHER kind: turning cleaves off
   must not start bursting the bodies a blade would have opened, and a censored
   blow whose bodies cease to exist reads as a bug rather than as a gentler game.
   A boss NEVER comes apart — it speaks its last words over its own body, and
   that corpse is the level's landmark. Nothing that doesn't bleed comes apart
   either: a wisp has no halves, a rover has no intestines.
3. **THE PIECES AND THE BLOOD ARE ONE LIST, READ TWICE.** `gore-burst.ts` owns
   what a body becomes and where each piece lands; `event-fx.ts` wets the floor
   at `landingSpots(burst)` and `render/gibs.ts` flies each piece to the same
   spot — so a head always comes down ON its own spatter. Either half deriving
   its own scatter is how you get blood pooled where nothing landed.
4. **A GIB FLIES LIKE LOOT DOES, AND WHAT BOUNCES IS WHAT IT IS MADE OF.** The
   arc, the tightening shadow and the tumble are the loot toss's
   (`items/toss.ts`) — a body's pieces and its drops leave the same corpse at the
   same instant, and the two reading as one event is most of what sells the kill.
   A skull, ribcage, bone shard, heart and kidney are dense and BOUNCE; a liver,
   gut, hand and slab of meat are wet and stick. That pairing is comically wrong
   when inverted: a bouncing liver is a beach ball.
5. **A BURST THROWS PIECES OF THE THING IT BURST, WHICH IS WHY THERE IS NO
   AUTHORED HEAD.** `render/sprite-split.ts` is the one module that takes
   authored art apart: `splitSprite` hands the cleave two halves of the actual
   monster, `shredSprite` hands the burst a fistful of its actual fragments — its
   own colours, its own gear, every mob and every mob a MOD adds. So no severed
   head, hand, foot or arm is in any pool: an authored generic one is a second,
   worse answer to a question already answered, and wrong the moment the monster
   is not that shape. **The authored gore is exactly what a sprite cannot show**
   — organs, viscera, bone and meat. Both splitters are baked and cached (dropped
   by `ensureCaches`) and the cut angle is quantized into eight buckets: a cut is
   a canvas allocation, and one per body per frame on a screen-clearing kill
   turns a spectacle into a stutter.

**THE CLEAVE'S CUT IS ROLLED, NOT PICKED OFF A LIST, AND THE VARIETY IS THE
FEATURE** — a spectacle you have already seen is scenery. A catalog of authored
cuts gives however many rows somebody typed; `cleaveCut` (gore-burst.ts) rolls
the cut line instead — one of the four angles the pixel art survives, and a
CONTINUOUS offset along its own normal — which is unbounded. The bearing picks
the family (a blade that swept down the screen cannot open a body sideways) and
the force decides how near the MIDDLE the cut may fall, which is the whole ladder
in one number: a blade that just barely went through takes a head or a pair of
legs, and only a monstrous blow takes a man through the middle.

**EVERYTHING ELSE ABOUT A CUT IS DERIVED FROM WHERE THE LINE LANDED**, which is
what makes an unbounded catalog maintainable. A family's `bands`
(`GoreFamily.bands` in `game-screen/gore.ts`) says what a body of that kind is
made of top to bottom — for a person: skull, neck, chest, belly, hips, legs — and
WHAT IS INSIDE EACH, and a cut spills the bands it PASSED THROUGH (`bandsCrossed`
in `gore-burst.ts`). A cut at the neck drops a skull and a brain, one across the
belly drops the gut and the liver, and one straight down the middle drops nearly
everything, for free, because a vertical line crosses every band on its way.
Nobody wrote the bisection down. WHICH PIECE FLIES is derived too: a piece
smaller than a third of the body is a LIMB, and a limb off the TOP flies (a head
has nowhere to stand) while one off the BOTTOM stays (a pair of legs is already
on the floor) — the game's two most memorable cuts, neither authored. The
geometry knob that matters is `BODY_WIDTH_FRAC`: a humanoid sprite is a narrow
column in a square frame, and measuring a diagonal's reach against the FRAME
makes every diagonal cross the whole body, every cut spill everything, and the
entire rule evaporate into one anonymous pile.

**THE THIRD AXIS IS DEPTH, AND IT IS AN ILLUSION A BILLBOARD CANNOT CONTRADICT.**
A body is one flat sprite that always faces the camera, so a cut through its
THICKNESS has nothing to split — which is exactly why it fakes perfectly. A blade
going in at the middle of the FRONT and out at the SIDE of the BACK crosses the
silhouette TWICE on screen, and the band between the two lines is the wet face of
the cut, seen foreshortened: one piece keeps a quarter of the body, the other
keeps the rest plus a red wedge, and nobody can tell the two do not add up in
depth because nobody can see either one's other side.

`CleaveCut.depth` is how far the cut travels sideways between front face and
back, and `slicedPiece` (render/sprite-split.ts) draws ONE piece of it: its own
art out to the entry line, then its cut face out to the exit line. That one
function covers all three cuts — lines coincident is a plain half, a little apart
is the oblique slice, right across is a slab off the front leaving a body-shaped
mess with a rind of skin down one edge. The RATIO between skin and red is how
deep the blade went, and the eye reads it as such with nothing else to go on. The
wet face is the authored `gore_inside` tile masked to the victim's OWN
silhouette, so every monster and every mod's gets a correct view of its own
insides with nothing authored per creature. Two bounds are load-bearing: an
oblique slice is a MINORITY (a body opening across the screen is the legible
picture and has to stay the common one), and it never goes all the way through —
at a full slab the far piece starts at the body's own edge with nothing left to
draw, so the cut loses a half instead of gaining a dimension.

Two things about the LOOK go wrong again the moment they are "simplified". **THE
CUT IS NEVER AT THE BLOW'S TRUE BEARING** — the bearing chooses the family and
nothing else, because a cut at the exact angle is what a physicist would draw and
it is mush: a 16 px body ends up a red smear nobody can read. And **THE TWO
CLOCKS ARE SEPARATE** — the flight runs on the burst's own short duration
(`GORE_BURST_MS` / `CLEAVE_MS`) while the effect LIVES for seconds after it, so
the pieces come apart at the speed of a blow and then lie there at the speed of a
battlefield. One clock for both reads as a body politely disassembling itself.

**ONLY A PERSON LOSES A FACE.** `EnemyDef.anatomy` (`humanoid` by default, since
nearly everything on this roster that BLEEDS is a person; `beast` on the giant
lizard and the thing on wheels) decides whether the head, hands, feet, arms and
shins are in the pool at all. Presentation only, like `gore` and `locomotion`.

The gore art is `content/sprites/effects/gib_*` (skull, brain, ribcage, heart,
liver, kidney, two lengths of gut, a bone shard, two meat slabs — all bloody, all
things that were on the INSIDE) plus `cleave_wound`, the cut face drawn in the
gap a cleaved body opens. That one is deliberately the DARKEST gore in the game:
a bright band between two halves reads as a light source rather than as an
inside.

## The four families

**AND EVERY KIND OF BODY COMES APART AS ITSELF — `EnemyDef.gore` IS A FAMILY, AND
`game-screen/gore.ts` IS ITS ONE CATALOG.** A ghost, a machine and a rift-thing
keeping a plain two-frame splash and a plain corpse whatever killed them makes
three quarters of the roster the one part of the game a hit does not land on.
There are four families — `blood`, `ecto`, `sparks`, `cosmic` — and each sprays,
cuts, bursts, spills, hangs its own ambient and burns down to its own remains.
Adding a fifth is a ROW IN THAT FILE plus its art, never an edit to the spray,
the burst, the cleave, the floor and the effect pass. Six things vary, and each
is a different reason a burst reads as one kind of thing:

- **THE PIECES**, which is the half that does the work. A rover has no liver and
  a collapsed star has no ribcage, so each family carries its own `bands` (a
  machine's are sensor, chassis, core and drive), its own `signature` ladder and
  its own `filler` shower. The cut rule is untouched: it still spills WHAT IT
  WENT THROUGH, so a cut across a rover's head spills its eye for exactly the
  reason one across a man's neck spills his skull. Each family also says what
  BOUNCES, and a machine is the inverse of a body — everything it is made of is
  hard except its oil.
- **THE RAMP.** The spray, the haze, the floor rungs and the plain splash are
  BLOOD's authored art re-hued onto three stops (`render/recolor.ts`: luminance
  per pixel → a colour off the family's ramp, alpha untouched), not authored four
  times over — sixty sprites nobody would keep in step. A TINT cannot do this:
  tinting MULTIPLIES, which only darkens, and red art multiplied by green is
  near-black. **Blood's ramp is deliberately `null`** rather than the red one it
  would otherwise be: a re-hue of red art onto a red ramp is very nearly the
  identity, and "very nearly" is a silent regression on the look that shipped.
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
  which would flicker across the 1600 ms the body burns for.
