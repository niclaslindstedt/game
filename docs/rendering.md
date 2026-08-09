# Rendering — how the picture is made

The engine simulates a flat, square, top-down world and knows nothing about how
it is drawn. Everything in this document lives in `pwa/src/game/render/` and is
**presentation only**: change any of it and the simulation produces the same
bytes. (One knob is not, and it is named where it is described: the camera's YAW
turns the ground a BILLBOARD stands on, which the car's blockers have to lie
under.) It is the reference half of the renderer — the projection, the post
effects, the canvas and its scale tiers, how bodies carry themselves, and how
loot announces itself.

Task-shaped rendering work has its own skills, and they own their subject:
`visual-effects` (a transient effect), `gore-system` (blood, cleaves, gibs),
`talent-fx` (the always-on talent looks), `weapon-system` (a weapon's signature
slash and muzzle), `pixel-assets` (the art itself), `ui-review` (the DOM UI at
the nine reference viewports).

## The world projection

**THE WORLD PROJECTION — the simulation is square, the PICTURE is not.**
`pwa/src/game/render/tilt.ts` is the one leaf that decides how the flat
top-down world reaches the screen, and it has exactly two knobs. **PITCH** is
how far the camera looks DOWN: the ground plane foreshortens, so a step north
covers less screen than a step east and the floor rakes away from the eye
(shipped at 0.75, a ~41° lean). **YAW** is how far it stands round from
square-on — the half that turns a tiled floor into DIAMONDS, i.e. the thing
people mean by isometric; 45° with pitch 0.5 is Diablo's 2:1 floor. Both are
live sliders on DEVELOPER → VISUALS (persisted as `cameraPitch`/`cameraYaw`,
stripped from a store build like every developer setting), because the answer to
"how far down, how far round" is settled by dialling it on a real field, not by
rebuilding to look. **Yaw ships at 0**: front-facing structures whose sprites no
longer cover their axis-aligned collision boxes still read wrong under a turned
camera, and a proper isometric look needs that structural art redrawn as iso
pieces — which is an art project, not a render setting. The WALLS are out of that
backlog (`plane: wall` extrudes them off their own footprint, below) and so are
the belts (`directional:`); what is left is the front-facing BUILDINGS.

**THE YAW IS ALSO THE ONE THING ON THIS PAGE THE SIMULATION HEARS ABOUT**, and
the exception proves the rule: a body drawn standing up covers a strip of FLOOR
running along whichever world bearing comes out horizontal, and every body in the
game is round enough not to care — except the CAR, whose blockers have to lie
under a 48-px side profile that nothing rotates. So the app pushes the yaw into
the engine's own import-free leaf (`setCameraYaw` → `billboardBearing`,
engine/game/flags.ts) beside `setWorldProjection`, and nothing else crosses. See
**SO THE GROUND IT BLOCKS…** under the vehicles below.

The whole thing rests on one split, and getting it backwards is the only way to
break it: **the FLOOR lies down and the BODIES stand up.** Anything painted on
the ground — the baked ground layer, blood, burn scars, craters, AoE footprints
— takes the projection whole (a ground ring becoming an ellipse IS the effect,
which is why none of those passes has a line about the tilt in it). Anything
with a body — a character, a rock, a shot in flight, a floating damage number —
is anchored at its projected spot and then drawn upright at FULL size through
`billboard`, whose composite works out to exactly the identity at a whole-pixel
offset so the pixel art stays crisp. Billboarding a pass is therefore a one-line
wrap, never a rewrite of its arithmetic — which is how the yaw knob was added
later without touching a single draw pass.

**AND A TURNED FLOOR STAIRCASES, WHICH IS WHAT `ANTI-ALIASING` IS FOR — a THIRD
switch on the same page, and one that is deliberately inert unless the yaw is
up.** Nearest-neighbour is the resample every bake uses, and square-on it is
simply correct: the pitch is a pure vertical squash, so whole rows are dropped
and every straight run of pixels stays where the artist put it. Turn the camera
and those runs cross the destination grid at an angle instead — a tile seam comes
out as a dotted, ragged staircase, and a floor full of them reads as broken
rather than drawn. ANTI-ALIASING (persisted as `cameraAntialias`, DEVELOPER →
VISUALS under the two knobs) bakes the ground layer supersampled and averages it
down, so those seams land on real intermediate tones instead. The renderer asks
one question — `projectionSmoothing()`, the knob AND `worldYaw() > 0` — and the
answer rides in `projectionKey()`, so flipping the switch re-bakes rather than
blitting the old floor. What it costs, why it is opt-in, and how the bake stays
inside a phone's memory are under **ANTI-ALIASING IS THE OTHER ONE** below.

**A FLOOR PASS TAKES THE PROJECTION IN ITS ART OR IN ITS TRANSFORM, AND WHICH
ONE DECIDES WHETHER IT WOBBLES.** A pass drawn live inside
`applyWorldProjection` is resampled every frame, and a nearest-neighbour squash
decides which rows to drop from the DESTINATION offset — so at pitch 0.75, where
a world unit of northward travel moves that offset three quarters of a pixel,
every piece re-picks its dropped rows at its own moment while the baked ground
layer under it sits perfectly still. That is what made the BLOOD wobble hardest
as the hero walked north or diagonally — north is the axis the pitch actually
foreshortens — though the camera's world point is exact on both axes
(`computeCamera` deliberately does not round it), so east-west was quieter rather
than exempt. The fix is the ground layer's and the flat
furniture's: bake the art through the projection ONCE (`bakeFlat`) and blit it in
SCREEN space at the decal's own whole-pixel seat — `render/plane.ts`
`drawFloorDecal`, used by the blood grid and the boot prints, seated on
`bodyAnchor*` like everything else. The live transform is still right for
anything the projection has to reshape per frame (a growing crater, a swept AoE
footprint); it is wrong for authored pixel art that merely lies there.

**WHICH SIDE OF THAT SPLIT A PIECE OF FURNITURE FALLS ON IS THE ART'S CALL, NOT
THE PASS'S — `plane:` on the sprite.** A boulder and a house front are drawn in
elevation and have to stand; a painted lane marking, a hatch and a crate seen
from above are drawn in PLAN and have to lie. Standing plan-view art up is loud:
the piece comes out taller than the floor grid it is set into, and under a yaw a
straight run of them staircases diagonally across a floor whose own seams run the
other way. So `content/sprites/<family>/<id>.yaml` carries
`plane: upright | floor | wall` (**upright is the default**, so a sprite that says
nothing keeps the look it has), the build emits the floor-plane names to
`assets/sprite-planes.json`, and `render/plane.ts` is the ONE place that acts on
it — read by the obstacles, the decor, the landmarks, the lair doors and the
elevator pads, never by an actor. A floor-plane sprite is **baked through the
projection once** (`flatSprite`) for exactly the reason the ground layer is:
transforming pixel art per frame re-picks which rows the nearest-neighbour
resample drops, and the art boils as the camera pans.

**AND "DRAWN IN PLAN" IS NOT "FLAT" — `plane: wall`, THE THIRD CASE, AND THE ONE
THE WALLS ARE IN.** A lane marking really is paint on the ground. A wall panel is
a plan view of a thing you cannot see past, and laid down it reads as a paving
slab: turn the camera and a lab's partitions become a slightly darker path
across the floor, a garage becomes a yard, and a room stops being a room. So a
wall-plane sprite keeps the same footprint on the same floor and is **EXTRUDED
off it** — the one projected slice, stacked `rise` px of screen height with the
cap laid back on top at its authored brightness, then a `source-atop` ramp for
the contact shadow (`wallBlock`, render/caches.ts). It is sprite stacking, and it
is the answer here for the reason it is the answer anywhere: **no second piece of
art, and right at every pitch and yaw**, because the projection is applied to the
slice rather than to a hand-drawn elevation that would only ever suit the one
camera it was drawn for. The stack is a BAKE — once per sprite per projection,
dropped alongside the flat bakes when a knob moves — so the per-frame cost is one
blit per panel, same as before.

**THE STACK CUTS THE SHAPE; IT MUST NOT ALSO CHOOSE THE COLOUR.** Every slice
covers the one behind it, so a plain stack leaves each face pixel showing the
cap's BOTTOM EDGE — and every wall in this game is outlined pixel art, whose
bottom edge is the outline. The face came out one flat near-black smear: a bar of
shadow under every panel rather than a wall standing on the floor, loudest
square-on, where the face is taller than the cap it hangs off. So the silhouette
the stack cuts is kept and REPAINTED, `source-atop`, with the same plan art
stretched over the whole block. A plan view of a wall panel already reads
top-to-bottom as an elevation would — lit bevel, panel field, base shadow — so
stretching it down the block gives the face the artist's own material and their
own light, and the outline stays a contour round the silhouette instead of a fill
inside it. Nothing is authored twice, and the shape is still the projected
slice's, so it is still right at every pitch and yaw.

`rise` defaults to the art's OWN height, so a 16×16 plan panel extrudes into a
cube: a wall a hero tall, which is what it takes to read as one. A piece that is
deliberately lower than it is deep (a parapet, a kerb) says so with `rise:`.

**AND IT IS A KNOB — STANDING WALLS (DEVELOPER → VISUALS).** The extrusion earns
itself under a yaw and is a matter of taste square-on, where the floor grid is
still rectangles and the flat panel already read as a wall, so a developer may
turn it off — and off means the THIRD case collapses back into the SECOND, not
into the first: the same footprint on the same floor, taking the projection
whole, exactly as it was drawn before the extrusion existed. `drawnWallRise` and
`laidFlat` (render/plane.ts) are the pair that says so, and **every pass asks
them, never `wallPlaneRise`** — that is the catalog's answer and does not know
about the switch. It is deliberately NOT folded together with the yaw the way
`projectionSmoothing` is: the knob means "I do not want the faces", so sweeping
the camera round to compare the two looks must not switch the answer out from
under it.

Three consequences worth carrying. **The walls are drawn LAST in the obstacle pass
and back-to-front**, by PROJECTED y — the axis that actually runs into the screen
once the camera is turned — because an extruded panel is tall enough to slice the
cap off its own neighbour otherwise. A door hung in a wall run **must be on the
wall's plane too**: a door on a different plane from the run it interrupts is a
hole in the world, which is why the garage door's roll-up (`drawWorldSpriteTop`)
answers the plane question the same way one frame later, seat included.

And **everything with a BODY is drawn after `drawObstacles`** (render.ts), which
the obstacle pass earns by no longer being a floor pass: a face that sweeps
`rise` px up the screen covers whatever was painted there, which is right for the
ground the wall stands in front of and wrong for anything standing on it. The
hero, the horde and the loot were always down there; the lamps and the rift
portals were moved for it (a fitting is BOLTED to the stone), and so are the
VEHICLES — a machine is a body, and a car parked at the garage's north wall was
swallowed whole by that wall's face, wheels down.

**FLAT ART CAN ALSO RUN ONE WAY — `directional: true`, and the bearing comes from
the PLACEMENT.** A stain lies whichever way round it likes; a conveyor belt does
not. Its side rails run along the belt, its rollers cross it, and its frames
march the pattern one way — and a rank of belts is laid along whichever axis the
chamber it landed in is longest (`buildRows`, mapgen/place.ts), so the same art is
east-west in one bay and north-south in the next. Drawn unturned, half the belts
in the game carry their cargo sideways across their own rails: invisible
square-on, where rails and rollers still line up with the screen's own axes, and
glaring the moment the camera turns, when the belt is the only thing on the floor
moving at 45° to itself. So the ART declares that it HAS a bearing (authored
running SOUTH, down the sprite's own rows), the PLACEMENT supplies which
(`Decor.facing`, stamped from the prop line's direction — presentation-only state,
because nothing in the simulation cares), and `bakeFlat` turns the art in before
it projects it, so the result is a bake like any other.

**A DISTANCE ACROSS THE FLOOR IS NOT A DISTANCE ACROSS THE SCREEN —
`projectOffset`.** The billboarded EFFECTS layer projects its ANCHOR and draws
everything else at full size in screen px, which is right for a thing happening
in the AIR above a point (an explosion, a rising damage number, a muzzle flash)
and wrong for anything that measures ground: a blood drop's travel, a jump's
dust smear, a corpse punted along a bearing, the wedge of floor a swing sweeps.
Those go through `projectOffset`, so they stay over the marks they leave — a
spray whose drops flew along the screen while its own spatter landed on the
turned floor was the tell. A VERTICAL is the exception and stays a true screen
vertical: a drop's hop, a corpse's arc, dust drifting up. Beware the tempting
shortcut this replaced — a hardcoded `FLATTEN` squash faking the foreshortening,
which is wrong at every pitch but the one it was eyeballed at.

**AND WHAT HAS COME TO REST IS NO LONGER PART OF THAT LAYER —
`restsOnFloor`.** The effect layer is drawn OVER the finished frame because
nearly everything in it happens in the air. What is left when those are over is
not: a corpse lies on the floor for seconds, a burst's gibs and a cleave's halves
for the ten of GORE LINGER, an epic's remains for the whole level. The field is a
painter's stack with no depth sort to appeal to (floor → furniture → loot →
horde → hero), so drawn with the rest of the layer every one of those was painted
OVER the hero the moment he walked across the spot. They change layers when they
land: `drawFloorRemains` puts them down inside `drawFrame`, under the loot and the
bodies and over the floor furniture, while `drawEffects` draws everything else on
top as before. The moment of the handover is each one's own animation ending
(`CLEAVE_MS`, `GORE_BURST_MS`, a corpse's keel-over or the flight of a punted
one), so nothing is still moving when it changes sides — and a launched body stays
in the air layer for its whole arc, because it genuinely is in the air.

**A PUSH IS A SCREEN DIRECTION AND HAS TO BE CONVERTED LIKE ANY OTHER —
`screenDirToWorld`.** A destination goes through `toWorld`, but the controls that
STEER rather than point (the touch dpad, the stick, the WASD cluster) have no
destination to convert: they hand the simulation a direction. Passing the raw
screen vector is the bug the pointer would have had without the inverse — under
a yaw, down the screen is south AND west, so a hero told to walk "down" sets off
45° from where the player pushed. Only the BEARING comes from the projection; the
length is normalized away, because the caller's own magnitude is the PACE and the
foreshortening would otherwise make walking north slower than walking east.

**THE FOG IS COMPOSITED IN SCREEN SPACE, SO IT SNAPS TO A SCREEN PIXEL.** Its
Bayer stipple is a rigid lattice on its own buffer, so the buffer has to be
registered the way every other pass is: `fogGridAnchor` seats the camera on the
PROJECTED ground grid, rounded to a whole pixel, exactly as the ground blit does,
and the dither is indexed there. Snapping in WORLD units instead (what this did
before the projection existed, when the two were the same thing) leaves the fog
looking at a floor up to a whole world unit from the one under it — a
fractional, continuously-varying number of screen pixels once the floor is
foreshortened and turned. That misregistration is the crawl: the frontier band
slides against the ground and the stipple re-phases as the hero walks.

Three consequences to keep in mind. The ground layer is **baked already
projected** (`groundLayer`, keyed on the projection so a knob change re-bakes):
a nearest-neighbour resample picks which rows to drop from the destination
offset, so transforming per frame re-picks them every time the camera moves a
pixel and the floor visibly boils. **The hero is always at the middle of the
screen** — `computeCamera` no longer clamps the view to the level, because a
projected view is bigger than the canvas in world units and the old clamp bit on
nearly every map, sliding him off toward a corner; the letterbox showing past a
map edge is the cheaper price. And every screen↔world crossing OUTSIDE the
renderer goes through the viewport's `toWorld`/`toCss` pair (GameScreen), which
are functions rather than two scale factors because the projection is a matrix:
where the player is pointing, which foe the cursor aims at, whether a tap hit the
merchant, and where a floating DOM label pins itself all follow from that pair.

**A BODY'S PIXEL GRID IS ITS OWN, NOT THE CAMERA'S — quantize the two ends
SEPARATELY.** `beginBillboard` used to place a body at
`round(project(world - camera))`, rounding the camera-relative offset in ONE
go, so every body's rounding phase depended on where the camera was. The
camera's world point is EXACT — `computeCamera` deliberately does not round it,
because a camera quantized in WORLD units projects to fractional SCREEN steps
and the hero rocks above and below centre — so `world - camera` sweeps
continuously and each body crosses its own rounding boundary at its own moment:
two static props 16.4 units apart measured 12 px apart on one frame and 13 on
the next, and the whole field rippled as the hero walked. It shouts in y, where
the pitch makes a world unit of travel 0.75 of a screen pixel, and under a yaw
there is no quiet axis left at all. Floor tiles were exempt because the baked ground
layer is a single rigid blit — which is what made the rest of the picture look
like it was warping against a floor that wasn't.

So the camera is quantized ONCE PER FRAME (`cameraAnchorX`/`cameraAnchorY`) and
each body ONCE PER BODY (`bodyAnchorX`/`bodyAnchorY`). A body's own term then
depends on nothing but where the body is, and panning moves the whole picture
by the same whole number of pixels. `render/effects.ts` had the identical flaw
in its billboarded anchor (corpses, blood, gore, floating damage numbers) and
takes the same fix; `drawGround` steps by the same camera anchor with
`bakeOrigin` made integral so the floor cannot drift against the cast, and
`fogGridAnchor` was already this formula and now calls it rather than repeating
it. `tests/world_tilt_test.ts` sweeps 36 projections (pitch 1 → 0.25 × yaw
0° → 45°) asserting the screen distance between static bodies does not change
as the camera pans — against the old math 35 of the 36 fail, every setting
except the true no-op at pitch 1, yaw 0.

**…AND INSIDE THAT BILLBOARD, ROUND THE SEAT AND ADD WHOLE PIXELS — `seatX` /
`seatY` (`render/shared.ts`), THE ONLY PLACE A CAMERA-RELATIVE OFFSET MAY BE
ROUNDED.** `beginBillboard` shifts a body's space by
`bodyAnchor − Math.round(pos − camera)`, and that subtraction exists to CANCEL
the pass's own `Math.round(pos − camera)` so the body lands exactly on the rigid
anchor above. Round the seat and an offset TOGETHER —
`Math.round(pos.x − sprite.width / 2 − camera.x)`, which is what `spriteTopLeft`
and a dozen passes did — and the cancellation only survives when the offset is a
whole number. Half of an EVEN sprite is; half of an ODD one is `k + 0.5`, the two
rounds step at different fractions of `pos − camera`, and their difference flips
between two values as the camera tracks.

That is the WOBBLE, and its signature is that it afflicts only SOME of the art:
a 12×12 ammo box sat perfectly still on the same floor a 14×9 pile of coins
shivered on. **The axis a piece wobbles on is the axis its ODD dimension is on**
— odd width east/west, odd height north/south, odd × odd everywhere — which is
also why turning the yaw up makes it general: under a yaw both screen axes are
mixtures of both world ones, so any direction of travel moves both seats and
every odd-dimensioned sprite in the atlas shivers at once. Of the 1834 frames in
the shipped atlas, 222 have an odd dimension.

So half a sprite, half a health bar, a hover, a lift, a jump's height off the
floor: each is rounded to a whole pixel of its OWN and then added to a seat.
`tests/world_tilt_test.ts` sweeps the same 36 projections × five sprite sizes
covering all four parities, along a deliberately fractional camera walk (whole
world steps hide it — every body lands on the same side of its boundary every
time), asserting a sprite's top-left keeps ONE fixed offset from its seat.

**AND THE FRONTIER GLIDES RATHER THAN LURCHING, WHICH IS A DIFFERENT DEFECT
FROM THE ONE ABOVE.** `state.explored` is one byte per `MAP.cellSize` (32 world
px) cell, so the chamfer distance the band is built from advances a whole CELL
at a time — while `MAP.fogBand` is only 48 px, barely more than one cell. A
single cell flipping shifted the frontier by a third to a half of the entire
band in ONE frame and redrew the whole stipple at once, which reads as the fog
flashing as the hero walks. Measured walking a straight line at one world px
per frame, the edge sat still for 20–30 px of travel and then jumped 16, with a
period of exactly 32. The drawn distance now eases toward the real one
(`FogField.shown`) so the frontier LINE glides outward, at the error over
`FOG_EASE_MS` floored at `FOG_EASE_MIN` — an exponential alone never quite
lands and would park the frontier a hair inside where it belongs for the rest of
the run, and the floor sits just above the hero's own pace because the frontier
advances at exactly the speed he walks. Easing UPWARD ONLY is a guarantee
rather than an optimization: the fog can never crawl back over floor already
uncovered. `fogDistanceAt` reads the drawn field, so the mob cull and the band
stay the same frontier — a mob appears as the ground under it clears.

**AND THE FRONTIER IS SHAPED BY THE WALLS, NOT BY A RADIUS.** The sweep that
lifts the fog (`revealAround`, `engine/game/fog.ts`) tests each cell of its disc
with `lineOfSight` before uncovering it, so a wall inside the disc casts a
shadow: the ground behind it stays dark until the hero stands somewhere it is in
view. That is what makes a doorway show a CONE of the room rather than the room,
and it is a targeting rule as much as a picture one — a body is drawn exactly
where the fog has lifted, so the disc alone put the horde waiting inside a
compound on screen from outside its wall. The sight line stops
`MAP.fogWallDepth` short of the cell it is testing, which is load-bearing rather
than slop: a line that stopped ON the wall would leave the wall's own cells
fogged, running a frontier down the inside face of every wall in the level, and
the band is what hides a mob and `clearOfFog` is what refuses to shoot one — so
every mob standing near a wall would go undrawn and unshootable in the room the
hero is standing in. Reaching a band plus a half cell (the grid answers per cell
CENTRE) past the blocker instead puts the drawn clear ground right up against
the stone, and costs only a sliver of the floor immediately behind a thin wall
reading as seen — which draws as stipple anyway.

**ONLY ARCHITECTURE CASTS THAT SHADOW.** A LONE obstacle no longer stops the
sweep at all: it takes two obstacles standing in line — a wall's own chain, a
rank of machinery, two rocks shoulder to shoulder — or one piece wider than a
unit of ground (`OBSTACLES.loneSightSpan`, one fog cell) before the eye is
stopped. The rule and its two tests live in `engine/game/obstacles.ts`
(`lineOfSight`, which is now a different question from the PHYSICAL
`blockedByObstacle` a body and a bullet ask). Without it every dressed field
was a fan of dark wedges the hero had to walk into one at a time, thrown by
single scattered rocks, and — since a body is drawn exactly where the fog has
lifted — a mob standing in one went undrawn and unshootable on ground the
player was plainly looking at. It is SIGHT that changed and not substance: the
lone rock still stops a body walking into it and still eats the shot taken
past it.

**THE SIMULATION ANSWERS THAT SAME QUESTION FOR ITSELF, AND MUST.** A mob the
band hides is also a mob the hero refuses to fire at (`clearOfFog`,
`engine/game/fog.ts`, read through `visibleTo` in `engine/game/sight.ts`) — otherwise
the character shoots into blackness on the player's behalf, which is what a long
gun advancing into unexplored ground used
to do. The engine cannot read `FogField.shown` to decide it: that field eases on
a RENDER clock, and a simulation that depended on one would desync a session and
break every seeded replay. So the two are deliberately near-copies rather than
one function — the engine measures where the frontier IS, the picture draws
where it has eased to, and the few frames between them are the frontier gliding
the last pixels onto ground the hero already owns.

**AND THE FOG IS ONLY HALF OF "CANNOT SEE".** The other half is the edge of the
frame, and it is the half that actually bites, because the fog never rolls back:
a minute into a level the hero has explored far more ground than a phone held
sideways shows him (~422×195 world units, so ~211 to the side edge and ~97 to
the top). A power reaching 220–340 px — the storm, the volley, the singularity,
the sentry grid, the well's hunt — therefore spent itself on monsters that were
never on screen, and the fight the player was watching was not the fight the
game was fighting. So the CAMERA RECT is a simulation input
(`GameInput.view` → `Player.view`, per seat) and `visibleTo(state, hero, pos)`
runs both halves for every automatic pick. It is the same rule the picture obeys,
stated the same way twice: what is not drawn is not shot at.

Note the two defects only looked alike from outside: the warp above was
sub-pixel rounding in the PROJECTION, this is whole-cell quantization in the
EXPLORED GRID.

## How the picture is presented

**HOW THE PICTURE IS PRESENTED — DEVELOPER → VISUALS, and the split that decides
where each effect goes.** Three washes (`render/postfx.ts`): COLOR GRADE,
VIGNETTE and DEPTH HAZE, each an amount whose 0 is a true off, and all three ship
ON at the amounts that module calls the shipped look. They are DEVELOPER settings
— they sit on the same page as the camera knobs and are scrubbed by
`stripDeveloperState`, so a store build always plays the shipped look — and the
reason they can be is that none of them costs a frame: all three are CSS, so
there is no per-frame budget for a player to win back by turning one off.

**THERE IS NO CANVAS POST-EFFECT AT ALL, AND BLOOM IS WHY.** A bloom pass lived
here and was taken out, which is the argument worth keeping rather than the code.
It was the one knob that HAD to be on the canvas — the light it blooms is the
game's own baked glow art (`glowSprite`, `beamSprite`, the loot shafts, the muzzle
flashes) living on that same ~422×195 pixel grid, and a bloom computed at device
resolution is smoother than the light casting it, which reads as a photo filter
over pixel art rather than as pixel art glowing. But on pixel art at this size the
trade loses whatever the threshold and the gain are tuned to: every luminance
point a halo adds is a point of the artist's own shading it paints over, so the
loot shafts and the level-up pillar gained a little atmosphere and the floor, the
rocks and the bodies lost some of their drawing. It shipped at 0 for exactly that
reason, and a knob whose honest default is off is a knob the game is better off
without. **Do not bring it back — light the art instead.**

**THE CANVAS IS ~422×195 AND NEAREST-UPSCALED, AND THAT — NOT TASTE — DECIDES THE
MECHANISM.** The canvas is sized in WORLD units (`viewScaleFor`) and CSS blows it
up 2–3× with `image-rendering: pixelated`. So there are two places to put an
effect and they are not interchangeable. **ON THE CANVAS** is chunky, at world
resolution, in the same pixel grid as the art — right when the thing an effect
acts on IS the art, and a full-frame pass every frame on a phone. **IN CSS** is
smooth, at device resolution, and per-frame FREE — where the GRADE, the VIGNETTE
and the HAZE belong, because all three are broad low-frequency washes that on the
canvas would cost a full-frame composite every frame to come out in 2–3 px
staircase bands. The CSS half is three custom properties from `fxStyleVars`
written on the GAME SCREEN ROOT (not on the overlay — the grade is a `filter` on
the canvas, which is the overlay's SIBLING and would never inherit them), and the
overlay sits at `z-index: 0` directly after the canvas so every positioned HUD
element after it paints on top: the corners of the SCREEN going dark is
atmosphere, the corners of the HEALTH BAR going dark is a bug.

**THERE IS NO SHADER PASS, and that is a conclusion rather than a gap.** A WebGL
stage would have to own the whole present path — the world would move to an
offscreen target and the visible canvas would become the GL one, touching every
screen↔world crossing, the DOM overlay pinning, the screenshot tooling and the
gallery — and for three broad washes it buys nothing: all three are strictly
better in CSS. What a shader WOULD buy is CRT curvature, chromatic aberration and
a real 3D LUT. That is the day to write it.

**DEPTH OF FIELD IS THE ONE REQUEST TO REFUSE.** There is no depth to focus on —
the whole field is ONE ground plane and the hero is always at the middle of it —
so a distance blur would blur a mob standing beside him exactly as hard as one
the same distance north, and hide half the horde while it was at it. DEPTH HAZE
is the honest version: what reads as distance on a raked plane is losing contrast
toward the horizon. It is scaled by the live PITCH (`fxStyleVars`), because a
camera looking straight down has no horizon to fade toward.

**ANTI-ALIASING IS THE OTHER ONE, EXCEPT AT ONE PLACE.** The whole renderer is
built for crisp integer pixels — `imageSmoothingEnabled = false`, an INTEGER
`VIEW_SCALE × uiScale`, `billboard` composing to the identity at a whole-pixel
offset. The one place averaging is right is a PROJECTED BAKE, because it happens
once: `flatSprite` bakes at `BAKE_SUPERSAMPLE`× and box-averages down, so a wall
panel's turned edges come out antialiased instead of as a staircase of single
pixels, and at yaw 0 / pitch 1 it is a no-op by construction (a square-on sprite
downsampled from an integer upscale of itself is bit-identical).

The GROUND LAYER is the one bake that asks first, because there the averaging is
a TRADE rather than a free win: a wall panel is a small outlined silhouette, but
the floor is a texture covering the whole screen, so averaging its rotation
softens every speckle and grain rivet along with the seams. So it follows the
**ANTI-ALIASING** switch (`cameraAntialias`, DEVELOPER → VISUALS), off by
default and inert at yaw 0 where there is no staircase to smooth
(`projectionSmoothing`). Three things make the smoothed bake affordable:

- **It is CHUNKED.** One intermediate over a whole projected level would be tens
  of megabytes and would walk into the browser's canvas cap on a big map, so
  `paintGroundSmoothed` cuts the destination into squares no bigger than one
  bounded scratch buffer (`BAKE_CHUNK_PX`) and reuses that buffer for every one.
  Cutting on DESTINATION pixel boundaries is what makes it seamless — a finished
  pixel's whole sample block belongs to exactly one chunk — and each chunk draws
  only the tiles that can reach it, found by running the projection BACKWARDS
  over its corners (`chunkTiles`).
- **It samples 2×, not 3×.** `GROUND_SUPERSAMPLE` is its own constant for a
  reason: measured on a large map the crisp bake is the baseline, 2× costs about
  2.7× of it and 3× about 4.4×, and the two are indistinguishable at the canvas's
  ~422 px width — the staircase is made of whole destination pixels, so the first
  subdivision does nearly all the work.
- **It is keyed.** `projectionKey()` carries the smoothing, so flipping the
  switch re-bakes instead of blitting the old floor.

The real fix for a turned floor is still iso-drawn tile art; this is the one that
ships as a switch.

**AND GORE IS NEVER SMOOTHED, BY EITHER PATH.** The stains, the pools and the
boot prints tracked out of them go through the same `bakeFlat` as the floor
furniture, but they pass `antialias: false` and take the nearest-neighbour bake
at every camera, switch or no switch. What averaging is good at is a straight
outlined edge — architecture — and a spatter has none: smoothing its rotation
cleans nothing up and softens the clots into a smudge, which takes the bite out
of the one thing on the floor that is meant to look brutal. (The blood CLOUD is
the exception that proves it: atomized mist with no shape of its own, drawn from
a gradient, and smoothed on purpose — see `render/blood.ts`.)

**A CANVAS THAT IS DRAWN ONCE MUST REPAINT WHEN THE PAGE WAKES UP.** The field,
the minimap and a cutscene's stage are redrawn every frame, so whatever a
backgrounded page does to their bitmaps is gone by the next frame after it
returns. The DOM's pixel canvases are the opposite: every `PixelText` label and
the map card draw once and are then left alone, and a browser does not promise
to hand back what was drawn. A hidden page stops compositing, its canvas
bitmaps can be hibernated or lost outright, and a draw that lands WHILE it is
hidden — a dialogue crawl typing on through a throttled timer, a page turn — is
never composited at all, so the tile can come back rastered from the snapshot
taken when the player alt-tabbed away. That shipped as the dialogue box wearing
the bottom rows of its previous screen's text under the current line, and it
looked exactly like a canvas that had been 95% cleared. So a draw-once canvas
registers its paint with `onCanvasWake` (`@ui/lib/canvas-wake.ts`), which runs
it again on the animation frame after the page becomes visible and on the
canvas's own `contextrestored` — the paint must therefore draw the canvas from
scratch, sizing included, since a restored context comes back blank. Nothing
else in the app may assume a canvas it drew is still on screen.

## The night, and what burns in it

**A VENUE MAY KNOW WHAT TIME IT IS, AND EXACTLY ONE OF THEM DOES.** A mission
that names a `sky` (only the GARAGE, the hub the player keeps coming back to)
has its light follow the player's own clock: `render/night.ts` washes the
finished world picture down toward a cold blue-black and the map's own lamps
burn holes back in it. **Three owners, and they do not overlap** — the MISSION
says whether the venue has a sky at all, the APP reads the hour and hands the
run a `daylight` level as a session parameter (`RunParams.daylight`, because
`step()` may not touch a clock and a party in two time zones must play in one
night), and this file decides what the dark looks like. `nightAmount(state)`
(`engine/game/daylight.ts`) is the one accessor that folds the first two together.

**IT CHANGES NOTHING ABOUT THE SIMULATION, on purpose.** Sight, aggro, weapon
reach and spawns are what they are at noon; a hero is not blinded by a sunset
and a mob does not creep up on him because the screen went dark. The night is
the same class of thing as the vignette — and it is deliberately NOT the fog,
which is a different darkness with a different meaning (ground nobody has
walked). The night goes down first, the fog on top of it.

**IT IS A HOLE-PUNCH, NOT A PILE OF GLOWS, and that is the whole of why it does
not look cheap.** The wash is one flat sheet over the finished picture, and each
lamp is ERASED out of that sheet (`destination-out`) rather than painted on top
of it — so the artwork comes back through at full strength inside a pool, which
is what light does to a picture, instead of the dark floor plus a coloured haze
that additive glows give you. The lamp's own colour is then added back at a
fraction (`LAMP_TINT`), which is what makes one pool sodium-warm and the next
one fluorescent-cold. Two other things it must do, both learned from the
screenshot: each pool is cut with TWO LOBES (a narrow strong one over a wide
faint one), because a linear gradient cut from a flat sheet has a visible rim
and reads as a disc laid on the ground; and each is SQUASHED BY THE PITCH,
because a pool lies on the ground plane and a round one on a raked floor reads
as a glow hanging in the air.

**IT LIVES ON THE CANVAS RATHER THAN IN CSS** with the grade and the vignette
above, and the reason is the lamps: those three are broad screen-space washes
with nothing in them to line up with the world, while every lamp here is pinned
to a spot on the FLOOR — it pans with the camera and foreshortens with the
pitch. One thing to know if a wash ever comes out invisible: `ctx.save()`
preserves the composite mode and the alpha rather than resetting them, so the
sheet's blit states `source-over` outright. Blitted under a `lighter` some
earlier pass left behind, a near-black sheet ADDS nothing at all and looks
exactly like a pass that never ran.

**A ROOM IS LIT AS A ROOM, NOT AS A POOL.** The second instrument is
`LevelDef.litZones` — a carved district whose blueprint area carries a `lit`,
cut out of the sheet as its own RECT rather than as a circle. The garage bay is
one: it is a garage, the strip lights are on, and the honest picture of that is
the whole floor up to the walls. A pool big enough to fill a room spills half of
itself through the wall onto whatever is behind it, which is the one thing a
radial light cannot be talked out of. The rect is cut from its four PROJECTED
corners, so it turns with the floor under a yaw instead of peeling away from the
building it belongs to.

**EVERY POOL OUTDOORS NEEDS SOMETHING DRAWN THROWING IT.** A light with no
fixture over it does not read as a lamp, it reads as a bug — "a light bulb in
nowhere" was the exact verdict the first pass earned. So a blueprint's `light`
object carries a `fixture` sprite (the barn lights flanking the garage door, the
yard post on the lawn) and the map schema WARNS when one has neither that nor a
reason to be exempt. The two exemptions are real and narrow: a fitting that
genuinely hangs off the ground plane, and a pool pinned to something the game
already draws (the trader's back-lit machine, which is why `at: counter` exists).

**AND THE FIXTURE RIDES THE LIGHT, NOT THE LANDMARK LIST — because of the draw
order.** Landmarks are painted before the level's obstacles, so a barn light
bolted to a wall came out with its top half cut off by the stone in front of it,
and standing it clear of the wall to dodge that left the lamp hanging in
mid-driveway. `LevelLight.sprite` plus a `drawLamps` pass immediately AFTER
`drawObstacles` is what lets a fitting sit on the wall it is bolted to. That
pass runs in daylight too: a lamp is hardware, and a wall that grows a light
fitting at dusk is a bug — only the pool under it belongs to the night.

**AND HOW HIGH IT IS BOLTED IS THE FIXTURE'S BUSINESS ALONE** (`LevelLight.lift`,
authored as `lift:` on a door's `lamps`). A wall is drawn as an EXTRUDED FACE and
a fitting is painted from its foot upward, so a lamp placed at the last block of
a doorway sits across the opening rather than beside it. `lift` takes its world
px off the y before the projection — the way every other height in this renderer
is drawn — so the fitting rides up the brickwork and foreshortens with it. The
POOL does not move: `pos` is where the light lands, and the alternative (moving
`pos` to raise the lamp) drags the pool along and, on a door's own pair, walks
the lower fitting into the opening the pair exists to flank.

**A CAR HAS ONE PAIR OF LAMPS, AND THE ASSEMBLY OWNS THEM.** The lit
`car_lights` layer and the two cones it throws — a warm tungsten wedge off the
nose, a short red wash behind the tail — are drawn with the panels and the
arches in the body's own screen space (`drawLightCones`, `render/vehicles.ts`),
which is why the DRIVING MINIGAME and the garage light the same car identically:
they are the same code, and the minigame is the reference.

The night pass used to draw a SECOND pair on top — a wedge walked out of the
nose as nine overlapping glow pools and punched through the night sheet, so a
car laid its own light along the pavement. It was the wrong picture twice over.
It disagreed with the assembly's cone about what colour the lamps burn (the car
threw warm tungsten, the night pass threw cold daylight, out of the same two
bulbs) and about their SIZE — half a screen of reach, 26° each side — so a wagon
idling in its own bay lit the lot like a searchlight, and the same car on the
minigame's road looked like a different vehicle. It is gone;
`render/night.ts` draws no headlight at all.

**AND THE LAMPS ARE BOLTED ON — never aimed down `CarVehicle.heading`.** These
are sealed beams in a shell, not steering-linked cornering lamps: they turn when
the CAR turns and not one degree otherwise, and the car's picture never turns.
The body is one side-profile assembly cut nose-right that nothing mirrors or
rotates, while the heading it used to be steered on swung the better part of
180° — so anything walked down the heading swept a 172° arc across a car that
had not visibly moved a pixel, and read as a pair of lamps swivelling on their
own. (The swing itself is gone now — see below — but the rule stands on the
ART, not on the physics: the day something writes a heading again, the lamps
must still not care.)
That is what killed the night pass's wedge. The cones are laid out in SCREEN px
along the drawn body off the body's own anchor, exactly as the wheel arches are
(see the billboard rule below). `tests/vehicle_assembly_test.ts` holds the line.

**KEEP THE POOLS SMALL, and judge it at the phone viewport.** The garage is
512×280 world units and the landscape view sees ~422×260 of it, so two lamps
whose tails touch light the whole lot back to daylight — which is precisely how
the first pass of this came out, and it read as "someone turned the brightness
down" rather than as night. The shipped composition is four small pools (the
flood over the roll-up door, the bay's tube over the car, the vending machine at
its counter, the ship's work lamp) with real dark between them, plus a small one
every hero in play carries — the concession that makes a dark venue playable
without either brightening the night or inventing a flashlight item.

## The road, and the night over it

The drive minigame draws through the same projection as everything else
(`drive-screen/render.ts` reuses `drawWorldSprite`, which is why the rake, the
billboarding and the pixel seating all come free), but it frames itself
differently from a run, and it is the one screen in the game with a **sky**.

**The camera hangs off the BOTTOM of the frame, not the middle.** The ground a
drive shows is a fixed band of world — the far pavement, four lanes and the near
pavement come to 167 px whatever the screen is — while the frame is not. A
centred road therefore handed every spare pixel to the NEAR verge, which has
nothing on it by design (the town stands on the far side, so a row of houses
this side would hide the lane the crowd walks into); on a phone held upright
that was more than half the picture, a road across the top and an empty field
under it. `driveCamera` pins the near kerb a fixed margin above the bottom edge
instead, so a taller screen buys more SKY rather than more grass. Two traps live
in that one line: the drop must be measured in PROJECTED px (`unprojectY`,
exactly as `computeCamera` does it) because the view is taller in world units
than the canvas is in pixels, and the forward LEAD is a share of the frame's
width rather than a distance, or "the trailing third" stops being the trailing
third the moment the frame changes shape.

**The chrome on it changes shape with the frame, and the camera is told.**
Landscape pins the dashboard hard left (`.drive-dash`) and gives the hero's
speech window the room to its right; portrait has no such room, so the window
goes back to the middle of the screen and stacks ABOVE the dials — and the dials
centre under it, because a shelf still pinned left under a centred window reads
as two pieces of chrome that were never meant for each other. `DASH_BAND_CSS`
plus `BARK_BAND_CSS` (the second only when the frame is taller than it is wide)
is the band the camera holds back for the pair, which is why none of it prints
over the lane the crowd is walking into. Both the dials and the window sit on
`max(0.75rem, env(safe-area-inset-bottom))`: state that floor in one of them and
not the other, and a phone with a home indicator lifts one and not the other
until they meet.

**The steering pad draws itself, with the run's own parts.** A thumb anywhere on
the picture anchors the wheel, and the anchor is invisible until it is drawn —
so the road wears `.touch-dpad` (`ScreenChrome.tsx`'s markup, positioned and lit
from the drive's own frame loop): four arrows ringing the anchor that brighten
toward the push, and a nub that trails the finger. Two numbers differ from the
run's on purpose. The THROW is longer (`PAD_REACH_PX` vs `DPAD_RING_PX`) because
on foot the thumb is picking a heading and wants full tilt at once, while here it
is holding a line between two lanes; and the deadzone is the HINT's alone — the
wheel answers the first pixel of drag, and only the arrows wait for a push worth
calling a direction. Hidden for a mouse and for an auto-driven road, the same two
exemptions the run makes.

**The sky is the one pass that is NOT in world space** (`drive-screen/sky.ts`).
It sits at infinity, so running it through a transform that foreshortens
distance would squash the moon toward the horizon as though it were lying in a
field. It is painted first, in plain canvas px, and the projected world — the
strip of verge behind the frontages, the town's roofline, the gaps between the
houses — is drawn over it. The ground stops at a `skylineY` set back behind the
building line; before this it ran 400 px past the road on both sides, which on
any screen meant "everywhere", and the night was a field of grass.

**The depth is PARALLAX, and the fractions are a height ordering.** Five bands
scroll at five shares of the car's own travel — the moon barely at all, then the
stars, then a high wisp, mid puffs, and a low bank that slides past fastest
because it hangs nearest. Reverse any pair and the sky reads as a broken texture
rather than as distance. Two rules keep it honest: every cloud is DERIVED from
the cell it sits in (the same hash the town is dressed from, so the sky costs no
state, no rng draw, and a restart puts the same weather back over the stretch of
road that just killed you), and each band carries a slow drift on the render
clock as well — parallax alone freezes the sky when the car stops, which is
exactly when the player is looking at it. A band is a GRID rather than a line,
its row count derived from its own slice, because the sky is a strip on a phone
held sideways and most of the picture on one held upright.

**The moon is placed by a fraction of the sky, plus a fixed drop on a phone
held upright.** The fraction alone (`MOON_HOME_Y`) is right in landscape and
wrong in portrait, because the two frames do not disagree about the sky — they
disagree about what is in FRONT of the top of it. Upright, that is where the
phone keeps its clock, its signal and its notch, and a sixth of a tall sky
parked the one thing up there worth looking at squarely behind them.
`MOON_PORTRAIT_DROP` is the height of that furniture, in world px rather than as
a bigger fraction: a fraction would grow with the sky, and a tablet held upright
(no notch, a great deal of sky) would end up with its moon halfway to the
roofline. The whole-moon clamp still has the last word, so a sky too shallow to
spend the drop simply does not spend it.

The stars are the one thing up there that is not a sprite, and deliberately: a
star IS one pixel, so the whole drawing is where and how bright. The shipped
`stars_a`/`stars_b` tiles are cutscene-scale and laid a wallpaper of fat white
crosses over the road's sky; a tile also repeats, which across a 422-px frame is
seven copies of one constellation. They thin and dim toward the horizon, which
is the depth cue they have instead of parallax.

**Between the weather and the town stand three ridges of open country**, drawn
on the bottom edge of the sky band and each nearer than every cloud — which is
where the parallax ladder steps up toward the road. Without them the frontages
were cut out against stars, and a street on the edge of a place read as a stage
flat. Their crests are DERIVED like everything else up there (smooth value
noise between hashed control points, cosine-eased — linear interpolation gives
the land creases, and farmland does not have corners in it), with hedgerows
sitting on top as bumps, because at six canvas px a tree IS a bump and a field
without any is a dune. Each layer is one shape filled twice, a pixel apart, so
the sliver left showing along the top is the moonlight on the crest — cheaper
and crisper than a stroke, which straddles the line and comes out half-lit on a
grid this coarse.

Their LIFT is in canvas px and deliberately not a share of the sky, because the
measurement that matters is against the town's roofline — a fixed 19 px above
the horizon whatever the screen is, with the buildings standing 13 px of
projected ground behind the kerb. A ridge lifted less than that is only ever
seen through the alleys between frontages, which is the right answer for the
nearest one and the wrong answer for all of them.

### The town — a building is an ASSEMBLY, not a picture

Everything on the far verge is composed at draw time from a plan the engine
hands over, and the split is worth carrying because it is the same one the
hero's car uses (`render/vehicles.ts` stacks six panels and two wheels):

- **The catalog and the layout are the ENGINE's** — `engine/game/drive/town.ts`
  holds 26 archetypes and the parts bin they are dressed from;
  `town-plan.ts` tiles them onto a 20-px plot grid, a BLOCK at a time, and
  dresses each one from its own plot's hash. Nothing is simulated: the town
  stands behind the pavement where the wagon can never reach it. Nothing spends
  a draw of `drive.rng` either, which is load-bearing rather than tidy — that
  stream also lays the crowd and the traffic down, so a town that rolled dice
  would move every body on the road the moment somebody added a house.
- **The composition is the APP's** — `drive-screen/town-art.ts` stacks the
  planned layers onto one canvas and caches it by the plan's own `key`, so two
  identical semis a mile apart are one canvas and a hot loop is one blit per
  building.
- **The art is GENERATED, in two halves that are generated differently.**
  `asset-tools/facade.mjs` RULES each shell — the wall gauge, the bay rhythm,
  the roofline — because a facade is the most regular thing this game draws and
  regularity is what a loop gets right at 1x and a hand does not.
  `facade-parts.mjs` DRAWS every loose piece — the doors, the four faces a hole
  wears (dark, lit, boarded, smashed), the porches, signs, stains, fences and
  the junk in the front gardens — because a wheelie bin drawn from a formula
  reads as a formula.

Two things fall out of that and both show on screen. **The row has a
silhouette**: buildings are 16–96 px wide and 18–53 tall against 40×30 for
every house that used to stand there, so the skyline is a shape rather than the
ruled line it was. And **the road has a gradient**: `townDistrict(x)` runs 0 at
the hero's block to 1 at GOODCO's gate, and it picks the archetype, the wear
rung, the door, the fence, the junk and whether a window is lit — so the
neighbourhood becomes the business park without ever announcing it. The rosters
overlap across the middle third on purpose; a changeover at a line would put a
seam across the road. `tests/content/drive_town_test.ts` measures the gradient
rather than trusting it, because "the hero's end is worse" is a claim about a
mile of road and cannot be eyeballed from one frame.

`scripts/town-viewer.mjs` is how it is judged: it runs the real planner at five
stops along the leg and writes a sheet, which is the only way to look at a
street that exists in no file.

**The street lighting is the one thing on this road that lights the road**, and
it is not a second row of furniture: every third of the kerb posts the ENGINE
already stands (`engine/game/drive/street.ts`) is simply DRAWN as a tall mast
instead of as a yard light, throwing a cone down over its own carriageway and
laying a warm pool on the tarmac. Nothing about the simulation changes — the
column is the same column, at the same radius, and it still shears off its base
and cartwheels down the road. That is the point: street lights belong at the
KERB, the kerb is inside the band the wagon can reach, and a mast drawn there
and simulated nowhere is exactly the lie this road already learned not to tell.
`mastAt` recovers the slot from the post's own x, so the masts land on the same
stretches every run. Four things about them are worth carrying:

- **The pool is drawn in the PROJECTED space and the cone in the mast's own
  BILLBOARD.** A circle in the first comes out as the ellipse a downward lamp
  actually casts; the second is 1:1 screen px, so the pool it lands in has to be
  converted with `projectY` off the mast's feet — dropping the raw world offset
  in put every beam short of its own light by exactly the pitch.
- **The beam is sorted where the light LANDS, not where the lamp stands.** Light
  travels from the head to the tarmac, so the lit volume sits between the two —
  in front of its own post for the far row and BEHIND it for the near one.
  Sorted with the post instead, the near row painted its cone over every car it
  was supposed to be lighting.
- **The two rows are two SPRITES, not a mirror.** The far row throws its light
  toward the eye, so you look up into a burning lens (`road_lamp`); the near row
  throws it away, so what shows is the dark back of the cowl with the glow
  escaping round its edge (`road_lamp_near`). A mirrored head would put a lens
  on a lamp that is pointing away, which a night scene reads as wrong at once.
- **The masts are as tall as they are for a geometric reason.** A billboard
  stands at full size while the ground foreshortens, so a lamp lighting tarmac
  17 px across the road throws its light only 13 screen px. The near row's light
  lands up-screen from its own feet, and at any modest height its head sat below
  the patch it was lighting — the cone came out as a sliver pointing the wrong
  way. Height is the whole fix, and it is why a post-top head beats a cobra head
  here: an arm reaching out over the carriageway reaches toward or away from the
  eye, which a billboard cannot show at all.

**A lamp the car takes out says so three ways.** It goes DARK — the beam and the
pool are gated on `felled`, and both rows then wear the head with no lens in it.
It comes apart in TWO PIECES: a slip-base column shears at its foot, so the
stump stays bolted where it was (`DriveProp.stub`, minted by `fellLamp` — a
felled post's own `pos` is the flying half's and is moving by the next tick,
so there is no way back to the foot from it) and the rest cartwheels away with
its bottom rows cropped off. And its LENS goes: a `glass` burst thrown from the
lamp head rather than off the tarmac, which is the only effect on this road that
carries a `lift`. Its force is not the collision's — a lamp is glass on the end
of a lever, so what shatters it is the column whipping over rather than the
joules the bumper spent, and tying the burst to the impact made a slow nudge
produce three apologetic specks.

**The other traffic runs with its lights on**, through the hero's own
`drawLightCones` rather than a second implementation — every car in this game
throws the same light, the rule the garage and the minigame already share. Two
things fall out of it: `faceLeft` mirrors the lamps with the body (a beam that
did not flip lit the road out of an oncoming car's boot), and only
`DriveState.traffic` gets them. The cars somebody left at the kerb are
`DriveState.props` and stay dark, which is most of what tells the two apart at a
glance on a road where both wear the same sprites — and a vehicle that has been
FINISHED (`wrecked`) or knocked over (`downed`) loses its beams too, because a
wreck coasting to a halt still throwing light down the road undoes the whole
read.

**A vehicle wears its damage** (`trafficSprite(variant, rung)`): every model in
the fleet ships one clean grid and earns a three-rung ladder of dented,
de-glazed and folded-in-the-middle art at build time
(`scripts/asset-tools/wreck.mjs`), exactly as an enemy ships two frames and
earns its wounds. Nothing is authored per rung, so a new vehicle — a mod's
included — is destructible the moment it exists.

**…and it wears its collision as a POSE, not a picture**
(`drive-screen/wreck-draw.ts`). The rungs are a ladder of how battered a
vehicle is in general; one crash is a change to how it is standing, and no
amount of sprite-swapping says it. So the vehicle pass folds the end the
physics folded (`crushShare`, drawn as that half of the sprite squeezed toward
the middle, which leaves the axle under the OTHER half exactly where the eye
last saw it), turns it by whatever spun it, lifts it by whatever put it in the
air — and the fold is applied in the SPRITE's own frame, before the facing
flip, or every oncoming car in the game crumples at the wrong end.

**A lamp keeps its own picture when it breaks.** A felled post used to pick its
sprite from `mastAt(prop.pos)` — and a felled post's `pos` is the FLYING HALF's,
which is moving by the next tick, so a tall mast became the near row's picture
on the frame it was hit and then the little garden yard light a tick later. It
did not read as breaking; it read as being substituted, twice. The lookup asks
where the post STOOD instead (`prop.stub`, the foot it left behind), and it goes
dark by wearing its own derived lights-out grid (`<name>_out`,
`asset-tools/lamp.mjs`) rather than borrowing another lamp's — so the silhouette
the eye was tracking is the silhouette that breaks, into a stump still bolted to
the pavement and a column cartwheeling up the road.

**And a car's beams turn with its body.** `drawLightCones` takes the vehicle's
yaw and rotates about the same pivot `drawTrafficBody` uses; before that a car
spun out by a clip pointed one way and lit another, which reads as the lights
having come off it.

**Blood on the windows is an OVERLAY, not a fifth rung** (`<sprite>_gore`,
derived beside the ladder). Whether anybody died inside a car is independent of
how battered it is — a saloon can be folded up and empty, or barely marked with
two people dead in the front — so four rungs times two states is eight grids
nobody would keep in step, and one overlay laid over whichever rung is showing
lands correctly on all four because the windows do not move.

**A rider is drawn SEPARATELY from the machine under them** (`RIDER_SEATS`,
`drive-screen/scenery.ts`), and that is not an art decision: a person baked
into a moped cannot be thrown off it, cut in half, or left in the road while
the machine goes on down it without one. The seat offset is per MACHINE rather
than per rider — a scooter's saddle is not a motorcycle's — and the lift is a
SCREEN offset rather than a world one, because raising a rider in world y would
move them up the ROAD as well as up the screen.

**And what comes off a machine is drawn out of the machine.** A torn-off lump
is a crop of that vehicle's own sprite chosen off the piece's seed, and the two
halves of one that has snapped are the picture cut at `DriveRemain.cut`. So a
police cruiser sheds white and blue, a hot-box sheds amber, and a mod's vehicle
sheds itself — with no debris art authored anywhere in the repo.

## Mobile-first, landscape — and the scale tiers

**Mobile-first, landscape.** The reference device is a phone held
horizontally: a ~844×390 CSS viewport (≈422×260 world units at the app's
`VIEW_SCALE` of 2 and the shipped pitch — the projection makes the view taller
in world units than the canvas is in pixels). Design every element — HUD,
overlays, spawn distances, weapon ranges, anything sized against "the screen" —
to fit and feel right at that size. Run playtests and visual checks at this
viewport (the playtest harness defaults to it), not at a desktop size.

Large screens render the whole presentation at **2× the phone baseline** so
the phone-tuned HUD, text, and sprites stay legible instead of shrinking:
`viewScaleFor` (render.ts) doubles the world zoom, and a `min-width/height:
700px` media query doubles the root font-size (styles.css) so the rem-sized
DOM UI — PixelText canvases included — scales in lockstep. Keep the two
breakpoints in sync (`UI_SCALE_BREAKPOINT_PX`). A desktop still never sees
_less_ moon than the phone; it just sees it at phone-sized zoom rather than
zoomed out.

**A THIRD tier at 1200 (`UI_SCALE_3X_BREAKPOINT_PX`) exists for a BALANCE
reason, not a legibility one.** The view rect is the viewport divided by the
zoom, so a fixed zoom hands a bigger monitor a bigger slice of the world — and
in a game about being surrounded, seeing further is an advantage rather than a
preference. Measured against the phone's ~422×195 world units: a 1440p monitor
at the 2× tier saw **2.8×** the phone's map, and 4K saw 6.3×. The 3× tier pulls
those to 1.24× and 2.8×. Keep every tier an INTEGER — `VIEW_SCALE × uiScale` is
the sprite upscale factor and a fractional one resamples the pixel art — and
keep each one's media query in styles.css in step, or the HUD and the field
disagree about how big a pixel is. Note the tiers are deliberately not
monotonic (1080p tops the 2× tier at 1.57× while 1440p starts the 3× at 1.24×);
discrete tiers can't avoid that, and a test pins it so it stays a known oddity.
Anything reading the scale should treat it as a NUMBER, never test for one tier
(`=== 2`) — that is exactly what silently breaks when a tier is added.

## Bodies in motion

**EVERYTHING ON THE FIELD CARRIES ITSELF — `render/gait.ts`.** A body that
slides across the floor at a fixed sprite rate reads as a token being dragged,
so every actor the renderer draws (the hero, the horde, the companions, the
merchant, the fauna) is animated by HOW IT MOVES. Two things make it work:

- **The walk is driven by GROUND COVERED, not by the clock.** The stride phase
  advances by `distance / STRIDE_PX`, measured frame to frame, so the tip and
  the two-frame walk sprite BOTH keep pace with the walker for free — a nudged
  stick creeps, a full push runs, a hero wedged against a wall stops walking on
  the spot — with no notion anywhere of how fast anything is supposed to be
  going. A walk is a soft tip about the FEET plus a rise on each step, and the
  two peak together, because they are the same moment (a body vaults over the
  planted foot) — ONE lean per step, alternating. The tip is SHARPENED (cubed,
  `TILT_SHARPNESS`) so the body stands upright between steps and leans only
  briefly over each one: a plain sine sits near an extreme most of the stride,
  which reads as a slow drunken sway rather than as walking. Standing still, it
  breathes instead, so a mob is visibly alive through its own dialogue.
- **`EnemyDef.locomotion` says which gait.** `legs` (the default) walks;
  `float` HOVERS a few px up on a slow drift over a ground SHADOW — ghosts,
  wisps, drifting cores, anything with no legs; `wheels` does neither, because
  a rover that rocked like a walker reads as a machine pretending to have legs.
  Presentation only, like `gore` — but note `canonicalEnemyDef`
  (`defs/enemies/index.ts`) rebuilds every def through a fixed field list for
  V8 monomorphism, so a new `EnemyDef` field must be added THERE too or it
  silently reads `undefined` with every check still green.

**HOW MANY FRAMES A BODY HAS IS A CONVENTION, AND A MOD MAY SAY OTHERWISE —
`render/clips.ts`.** The shipped art is TWO frames per body and every pass that
draws a character knows it by heart: `<sprite>_0` and `<sprite>_1` alternate on
a 300ms clock while standing (offset by the mob's own id, or a horde of forty
flips in lockstep) and on the stride phase while walking, with
`<sprite>_cast_0/1` worn through a telegraph. Nothing about that is changing —
it is what a sixteen-pixel body authored as a character grid wants to be.

What it cannot express is a SIX-frame walk, or a mouth. So a mod may declare
CLIPS (`animations.yaml` → `docs/modding.md`), and every frame pick on the
field now asks the clip table first and falls through to the convention when it
says nothing — which, for the shipped game, is always. Three things about the
seam are worth carrying:

- **The state picks the drive, not the author.** `walk` runs on the gait's own
  phase, so six frames cover the ground two did and stop dead with the body;
  everything else runs on the render clock at the clip's `delayMs`. Render time
  never freezes, which is why an authored `talk` clip keeps a mouth moving while
  the run is paused behind the conversation that raised it.
- **The wound stage is the subject.** A clip is looked up under
  `<sprite>_hurt` / `_wrecked` / `_dying` while the body is wearing one, because
  the derived wound frames are their own art — so a mod may animate the bleeding
  version differently, or say nothing and keep the two frames it gets free.
- **The hero is half in.** He is a paper doll, so a clip replaces his BODY layer
  and the worn overlays stay on the two shipped poses they were derived for
  (`playerDollLayers`'s `body` option). A six-frame body in two-frame trousers
  is the deliberate trade.

**A MACHINE CARRIES ITSELF TOO — AND THE CAR STEERS**
(`pwa/src/game/render/vehicles.ts`). The hatchback's front wheels are drawn at
the rack's own angle (`CarVehicle.steer`, simulated in `engine/game/vehicles.ts`,
which is why a car standing still with the wheel cranked shows it), warped a
COLUMN AT A TIME out of the same eleven pixels rather than from a second
sprite — the trick the pitched shell beside it already uses, because a real
rotation resamples pixel art into mush while a per-column warp keeps every
texel and degenerates to the plain blit at dead centre. Three moves, all the
same fact — the tyre now stands across the line of sight rather than along it:
foreshortened to `cos(steer)` of its width, SHEARED by each column's own
displacement toward the camera (this is the Z), and drawn a pixel taller on the
near half off its own contact patch. The lean is deliberately NOT the ground
plane's pitch: the assembly is a billboard, and eleven pixels sheared by 0.75
read as a wheel BENT — a state this car really has — rather than turned. Only
the front axle gets any of it. Judge it from `node scripts/car-viewer.mjs
--steer`, which warps the same way.

**AND THE WHOLE MACHINE IS ONE BILLBOARD.** A wheel, an arch, a headlight cone,
the rocket's exhaust: every one of those is a PART of an assembly cut from one
shared part canvas (the car's is 48×26), so the numbers that place it —
`CAR.wheelOffsets` being the wheel arch columns — are SCREEN px along the drawn
body, and the assembly hangs off a SINGLE anchor through the projection. Giving a
part its own world anchor (`car.pos.x + offset`) reads those columns as ground
geometry instead, and that is a no-op at yaw 0 — the projection leaves x alone
there, so the parts land where they belong by coincidence. Turn the camera and
the coincidence goes: a step east comes out east AND south while the panels stay
dead straight-on, so at the full isometric 45° the car's front wheel sat a wheel
below its arch and the rear one climbed up behind the door, the pair offset at
exactly the yaw's own angle. The exception is a part that has genuinely become
its own body — a wheel that came OFF (`state.wheelDebris`), a shed panel lying on
the floor — which stands on its own ground and keeps its own world anchor.
`tests/vehicle_assembly_test.ts` holds the line across the whole knob range.

**SO THE GROUND IT BLOCKS IS THE GROUND ITS PICTURE STANDS ON — AND THAT IS THE
ONE NUMBER THE SIMULATION TAKES FROM THE PROJECTION.** A car's collision chain
(`vehicleFootprint`, engine/game/vehicles.ts) is three circles at three columns of
that same 48-px canvas, so it has to lie along whichever world bearing comes out
HORIZONTAL on screen — `billboardBearing()` in the import-free leaf
`engine/game/flags.ts`, which is `-yaw` and is exactly unit-preserving, so a drawn
column and a world offset along it are the same number. The app pushes the yaw in
beside `setWorldProjection` (pwa settings.ts) and never without it. Every other
body in the game is round enough not to care — a mob, a rock, a barrel blocks the
same circle whichever way that bearing points — which is why this is the only
place the engine hears about the camera at all. Walked down `CarVehicle.heading`
instead, the chain turned under a car whose picture never turns: a nose swung up
the screen laid the blockers square across the drawn body, and a yaw stood even a
PARKED car's chain off its own picture at the yaw's own angle. Both read the same
way from inside the game — the hero walks through the drawn bonnet and is stopped
by open floor half a car away, and hops onto a roof that is not there.

**AND THE CAR'S NOSE NEVER MOVES AT ALL.** The body is one side-profile
assembly and nothing mirrors it, so a car free to turn round drove away still
facing the way it came. There was a yaw stop for a while, holding the nose just
short of square to its own axis — and then the last reason for a heading to move
went with it, because NOTHING IN THE GAME DRAWS ONE. The wheel puts the BODY
across instead (`applyCarWheel`, engine/game/vehicles.ts — the driving minigame's
own steering, shared with it verbatim), so `CarVehicle.heading` is the axis the
car was parked on and `CarVehicle.faceLeft` is which way that axis points, both
settled at the parking spot and neither moving again. An invisible integrator
can only ever be felt rather than seen, and what this one was felt as was a car
that went on steering itself after the player let go — the garage's whole
handling difference from the road, in one field.

**A JUMP HAS THREE BEATS: takeoff, flight, landing.** The engine's `jump`/`land`
events carry the point, the `impact` (touchdown speed as a fraction of a
standing hop, so a Spring Heels launch lands heavy) and the ground `speed`. The
app answers with SQUASH AND STRETCH on the doll — he stretches off the floor and
folds into the landing (`impactScaleY`, keeping his volume by taking the inverse
scale across) — and with DUST at both ends (`render/dust.ts`): authored puff and
gravel sprites (`dust_puff_0..2`, `ground_grit_0..1`) drawn in neutral greys and
TINTED per landing to the colour of the floor he actually touched, sampled off
the baked ground layer (`groundColorAt`). That last part is the point: the moon
throws pale regolith, Mars rust, a base's deck plate grey — on carved maps and
any venue added later, with nothing authored per level. Impact sizes the cloud;
his ground speed smears it along his heading.

**WHICH WAY THE HERO IS TURNED — HIS FIGHT FIRST, HIS LEGS SECOND.** Facing is a
whole-doll horizontal mirror (`Player.faceLeft`, decided by the ENGINE in
`step/player.ts`), and everything the hero holds is drawn inside it: the weapon
layer, its swing pivot, the slash streak, the muzzle flash's side. So the flip
answers "which way is the weapon pointing", and pointing it down the hero's LEGS
put the whole armament behind him whenever he fought something he was not walking
toward — shots visibly leaving his back, a blade slashing away from the pack. It
now follows, in order:

1. **What he just STRUCK.** `stepWeapon` turns him onto each blow's bearing, and
   the steering pass leaves that alone while the weapon is recovering — one
   cooldown IS the gap between two blows, so a hero mid-fight stays turned on the
   fight rather than snapping back to his legs between shots. The hold needs no
   timer and no state of its own: when the fight stops paying out blows, the last
   cooldown drains and his legs have him again.
2. **Where he is AIMED.** Desktop AIM & SHOOT hands the cursor's world point in
   every tick (`GameInput.aim`), trigger down or not, so the hero turns with the
   cursor the instant it crosses him.
3. **Where he is WALKING** — the whole of it for a hero out of a fight.

A hero shooting left while running right is therefore mirrored left and reads as
RUNNING BACKWARD, which is what he is doing. The near-vertical deadzone
(`PLAYER.faceFlipMinX`) applies to all three, so a bearing within ~11° of
straight up or down keeps the last side instead of mirror-flickering.

## The hero doll, his kit and his weapon

**AND ALL THREE SHOW ON THE HERO.** A build choice the player cannot see on his
own character is one he has to open a screen to remember making. The two
off-hand kinds ride the SAME generated-overlay machinery the worn armor does
(`asset-tools/worn.mjs` → `worn_<defId>`, coloured from the piece's own icon), so
a new shield or bag costs no art beyond its 12×12 icon: a shield draws raised
and broad, a bag slung low and small, one glance apart. The overlay is the one
worn template that hangs OFF the body silhouette, so it is the one that paints
its own outline (the `4` char in `wornRamp`) — every sprite in this game is built
on that near-black, and a shield without it reads as a smear. The off hand is a
SOAK ZONE of its own (`SOAK_ZONES`, `blood_coat_offhand_0..2`) for the same
reason every other zone is a gear slot: it is the piece held BETWEEN him and the
work, it catches the most of what comes back, and swapping it is what cleans it.
A **TWO-HANDER is posed differently** rather than redrawn (`render/player.ts`):
it rests across the body, and its swing turns about the low central grip both
hands are on — wound back past the cone's start edge and carried past its end,
over a longer clock — so it comes ROUND the hero instead of off one shoulder. The
cone the engine hit with is untouched; only the picture changes.
The field hero **always shows and swings his held weapon** — these were the
CHARACTER WEAPON and WEAPON SWING developer flags, now shipped as the default
look (no toggle). Both are pure render concerns:

- **The held weapon draws on the field hero sprite.** `render.ts` passes
  `{ weapon: true }` to `playerDollLayers` (`paper-doll.ts`) so the weapon layer
  rides the paper-doll alongside the worn armor. The HUD avatar and inventory
  portrait draw the weapon too, so every surface agrees.
- **The held weapon animates on each attack** — a blade whips through its slash
  arc, a gun recoils with the muzzle rising, a wand thrusts up on the cast —
  pivoting the weapon layer about the **shoulder** (`paper-doll.ts`
  `WEAPON_SHOULDER`, not the grip) so the whole implied arm sweeps. For a melee
  swing the blade sweeps through its **cone**: it cocks to the cone's start
  edge, whips through the full cone to the end edge, and folds home
  (`weaponPose`), and its **slash is drawn ON the blade** — `drawBladeSlash`
  fills the exact arc the blade carves, anchored to the same `WEAPON_SHOULDER`
  pivot in the doll's own space (via the blade's tip/base points
  `SLASH_REST_TIP`/`SLASH_REST_BASE`), so the effect rides the weapon instead of
  fanning out of the hero's centre. The generic ground `swing` cone
  (`drawEffects`) drops to a faint AoE footprint behind it (still the read for
  companion swings). The cone widens with INTELLIGENCE (`weaponSweepHalfAngle`,
  capped at a half circle — `STATS.aoeMaxHalfAngle`), so a max-INT slash swings
  a full 180° arc; the swing is handed the weapon's cone via `PlayerAction.arc`.
  GameScreen captures the hero's own `swing`/`shot` events into a `PlayerAction`
  (matched to his position so a companion's blow is ignored), and `render.ts`
  `drawPlayer` poses the weapon layer via `weaponPose`.
- **AND THE BODY GOES WITH IT — `WeaponPose.lean`.** Nobody swings a sword with
  their arm alone, and a weapon that whips through an arc off a figure standing
  perfectly still reads as a sprite being rotated NEXT TO a hero rather than as a
  hero swinging it. So the same pose carries a roll of the WHOLE figure about its
  feet, handed to `withStance` alongside the walk's own tip — the costume, the
  armor, the weapon and the slash it throws all lean as one, and the weapon's own
  `rot` composes on top of it exactly as an arm composes on top of a torso. It is
  facing-RELATIVE (positive tips him toward whatever he is pointed at) while the
  stance transform sits outside the mirror, so `drawHero` flips its sign for a
  hero facing left; the walk's tip needs no such thing, a sway being symmetric.
  The DIRECTION is the read, and it is one per class: **melee** leans back on the
  wind-up and comes THROUGH the strike (riding the swing's own `lunge` signal, so
  the lean is the same motion as the blade rather than a second animation running
  beside it — a two-hander takes more of the body with it, and a `shake` weapon
  presses in and holds instead, having no arc to follow); **ranged** goes the
  OTHER WAY, rocked onto his heels by the muzzle's kick and settling forward
  again, damped by the same brace a two-handed long gun's recoil is; **magic** is
  the subtlest of the three — the staff comes up and his weight settles back
  under it, a counterbalance rather than a blow. All of it is a few degrees: the
  reference device is a phone, the hero is 16 px tall on it, and anything a
  player would call a lean at desk distance is a stagger down there.

  **Signature effects (`weapon-fx.ts`).** Each weapon CLASS has a plain base
  look, and a UNIQUE gets its OWN, so a named weapon FEELS more powerful. **THE
  WEAPON OWNS ITS LOOK** — `fx:` in its own YAML (`UniqueDef.fx`: an ELEMENT from
  the shared vocabulary plus any channel it wants to tweak), for exactly the
  reason a power owns its `look:`: while the mapping was a table in the app keyed
  by shipped ids, a MOD's legendary could only ever swing the plain class look.
  The kits live in the import-free leaf `weapon-elements.ts` (the item pipeline
  reads the element names from it to check every authored `fx:`, and runs before
  the catalog `weapon-fx.ts` reaches through `@game/core`); the drawing is
  `weapon-fx.ts`, and the resolved style is memoized per weapon because a shot
  style is asked for per projectile per frame. **Melee** (`SLASH_ELEMENTS` →
  `SlashStyle` → `drawSlash`): a themed slash crescent (core/edge/glow, a `particle` stream,
  `afterimages`) plus a `gore` `burst` (`drawBurst`) thrown over the plain splash
  on the hero's own blows (GameScreen's `heroGore`) — Excalibur flares holy gold,
  Mjölnir spits sparks, Muramasa bleeds. **Ranged/magic** (`SHOT_ELEMENTS` →
  `ShotStyle` → `drawMuzzle` + `drawProjectileTrail`): a themed muzzle flash / cast
  bloom at the tip AND a glow trail riding the hero's round/bolt in flight
  (`render.ts`, gated to the hero's own shots via the projectile's
  `hostile`/`companionId`) — Pyrelight casts fire, Pale Rider fires a deathly
  shot. The hero faces WHAT HE IS FIGHTING (see _Which way the hero is turned_
  below), so the flash leaves the barrel by construction; it is still pinned to
  the facing side (the muzzle effect's `faceLeft`) for the one case the two can
  disagree — a near-vertical shot, which the facing deadzone deliberately lets
  keep the last side. The PIXELS are the
  app's and the engine draws none of it; what travels on the def is the weapon's
  CHOICE. A weapon with no `fx:` keeps the plain class look, so the roster grows
  one weapon at a time. The eleven elements (fire, holy, frost, storm, void,
  blood, venom, cosmic, death, solar, tech) each have a slash kit AND a shot kit,
  so one word means the same element on a blade and on a gun — an asymmetric
  vocabulary would make `element: blood` mean nothing on a rifle. The engine's shared `nova` crit-AoE is NOT themed (it carries no
  weapon attribution).

  Tune and author all of it with the `weapon-swing` preview script
  (`pwa/scripts/weapon-swing.mjs`): `poses <weapon>` pins the swing/shot frame
  by frame, `live <weapon>` slows a real attack to show the slash + gore or the
  cast + projectile trail, `uniques` / `shots` render contact sheets of every
  melee slash / ranged-magic muzzle, and the debug `calibration_probe` weapon
  (red tip/base markers) calibrates the blade geometry. It drives the `?debug`
  `window.__swing` (pin the pose/muzzle, optionally
  with a cone) and `window.__timeScale` (slow the run) hooks.

## Loot presentation

**LOOT IS THROWN, LANDS, AND THEN ADVERTISES ITSELF.** A drop that materialises
under the corpse is indistinguishable from the floor texture, and a legendary
that materialises the same way is the entire chase arriving with no more
presence than a medkit. So a drop now has three beats, and each one is owned by
exactly one place:

- **THE TOSS is the engine's, and it is a TIMER, not a trajectory**
  (`engine/game/items/toss.ts`, `LOOT.toss`). Every drop in the game goes through
  the one funnel — `dropItem(state, item, from)` — which is what made the
  feature a two-line change at each of the twenty-odd sites that pay loot out.
  `item.pos` is the LANDING spot from the moment the item is minted, so the
  magnet, the pickup reach, the minimap and the bot's loot run all keep reading
  a position and need no notion of flight; the renderer arcs the icon in from
  `toss.from` over the countdown, tumbling it, with a shadow that stays on the
  ground. Airborne loot cannot be grabbed and the magnet leaves it alone — the
  same gate the angel delivery already used. **The scatter is HASH-DERIVED off
  the item's id, never `state.rng()`**: the drop ladder's draws are load-bearing
  (seeded runs, the simulator's A/B, every `rollEquipment` stream), so a
  presentational hop that consumed one would shift every roll after it.
- **THE LANDING IS WHAT MAKES THE NOISE, and what a thing sounds like is what
  it is MADE OF.** `stepItems` emits `itemLanded` carrying the item's MATERIAL
  (`itemVoice`: blade / gun / wand / plate / mail / leather / cloth / trinket /
  flask / scrap / spark / relic) — mail jingles, cloth flumps, plate clangs,
  glass clinks — and the app kicks a puff of dust in the FLOOR's own colour
  (`groundColorAt`, exactly as a jump does). A magic-or-better find rings a
  SECOND event over the top (`lootShine`, carrying the tier), which is the whole
  reason rarity and material don't multiply: layering two events is 12 + 6
  sounds where one combined event would have been 72. The old `itemDropped`
  event went with it — it fired once per SPILL rather than once per item, at
  the moment of minting rather than the moment of arrival, and after the sound
  moved to the landing nothing consumed it at all.
- **THE STANDING AURA is the app's, and it is a LADDER**
  (`pwa/src/game/render/loot-aura.ts`). Each layer switches on at its own rank
  and every one is lit in the tier's own colour (`TIER_RGB` — the colour the
  item's NAME is written in): regular keeps the plain warm halo, magic takes the
  tier colour and lights a pool on the floor, rare starts SMOKING, set thickens
  it, unique stands a LIGHT SHAFT over the piece (drawn twice — a wide soft
  flare with a narrow bright core, because one column cannot be both), legendary
  adds orbiting motes, and artifact pulses a ring out across the ground. It is
  closed-form off the render clock and the item's id, like the canopy and the
  fauna, so a floor covered in loot costs the simulation nothing and allocates
  nothing per frame; the light itself is BAKED (`glowSprite`, `beamSprite`),
  because building a gradient per item per frame is the most expensive thing a
  loot-covered floor can do. The four corner glint pixels this replaced are
  gone. Judge it in the EFFECTS GALLERY's WORLD shelf — `loot-rarity` stands the
  whole ladder side by side on the moon's dark regolith (a pale deck plate
  flatters every tier equally, which is the one thing a comparison must not do)
  and `loot-toss` runs a whole spill.

## The rift portals

**A HOLE IN REALITY IS THE ONE PROP A FLAT SPRITE CANNOT PLAY.** Four pieces of
art in the game are tears in space — the seam humming on the garage's bay wall
(`rift_seam`), the door THE FOUNDER left standing and the far door at the end of
the void (`rift`, twice on the rift's own road and once in the Mars prelude), the
warm door onto Boot Hill (`rift_west`), and the blast gate a mummified hand talks
open (`bunker_gate`) — and every one of them used to stand there as a still
picture. `pwa/src/game/render/rift-portal.ts` gives them the part the pixel art
cannot hold, and the read it aims for is **folding into itself**, not spinning
and not glowing:

- **THE THROAT** is nested shells receding into the mouth, and the trick is that
  each one TURNS as it goes — a half-turn over the depth of the throat, its width
  collapsing to a line at the halfway point and opening back out beyond it. A 3-D
  tunnel's rings only ever get smaller; these pass through edge-on and come back,
  which is what a solid looks like rotated through an axis the screen does not
  have. Two shells travel the other way, so the mouth swallows and disgorges at
  once.
- **THE FOLD** is the beat the whole thing is built around. Every `FOLD_MS` the
  throat closes: the mouth narrows and TWISTS, the shells and motes rush to a
  point, an iris of hot rim light collapses after them, and it snaps back open
  with an overshoot. Only the INSIDE turns — the pixel lips the art drew stay
  exactly where they are, which is the difference between a tear folding into
  itself and a sprite being spun around.
- **THE MOTES** are violet, gold and green sparks adrift in the black, spiralling
  in toward the point and winking out when they arrive. They are weighted
  unequally on purpose: gold drawn additively is nearly white on a black ground
  and swamps the other two, so three equal sparks make a tear full of yellow.
- **THE SMOKE** is black, rising, and the one layer here drawn `source-over`
  rather than additively — it has to take light AWAY. Each puff carries a violet
  edge under the black, because a black puff over the void's own black ground is
  invisible without one.

Three rules hold the family together. **The look is a CATALOG keyed by sprite
name** (the `powerup-fx.ts` idiom): a new tear is a sprite plus a row, and two
tears that are the same phenomenon differ in palette and size, never in code.
**A small mouth is not a small version of a big one** — the same shells over a
third of the area stack their additive light into a white-hot blob, which is the
opposite of the black nothing the whole thing is about, so every tear below the
road's own door turns itself down (`glow`). And **exactly one door in the game
can be seen through**: `rift_west` has a desert on the other side and the script
says so out loud, so it keeps its daylight and draws its shells as shadow instead
of light — every other tear is filled with the void.

**A TEAR IS IN A WALL, NOT BEHIND ONE**, so the portals are lifted out of the
landmark pass into `drawRiftPortals` and drawn AFTER the obstacles — the same
place, and for the same reason, as the lamps. The garage's seam hums on the bay
wall a step off the hero's landing; painted with the other landmarks the stone
went straight over it and left a hole in the world you could see about a third
of. It takes the same trade the barn lights take: anything drawn after the walls
is drawn over ALL of them, including one genuinely standing in front, and a
fixture bolted to masonry is better always-visible than sometimes-erased.

TWO CALLERS share the draw, which is the point: the field draws it inside the
landmark's own billboard (`render/world.ts`) and the cutscene stage draws it over
the scene prop (`overlays/CutsceneOverlay.tsx`), so the door the hero steps into
at the end of a prelude is the object he finds standing there when the level
loads. It is closed-form off the render clock and a seed taken from the tear's
own position — no state, nothing per-frame allocated, and two tears on one map
never fold in step. The smoke's gradient is BAKED once and blitted, for the same
reason the loot aura's light is. Judge it in the EFFECTS GALLERY's WORLD shelf:
`rift-portal` stands all four side by side on the rift's own ground, which is the
only floor dark enough to judge black smoke against.

## What advertises itself as tappable

The field carries a handful of things a press ACTS on rather than walks to, and
nothing about a top-down pixel scene says which. The rules are the same three
every time.

- **A MARK IS THE CUE, AND IT IS UP EXACTLY WHEN THE PRESS WORKS.** The parked
  car in the hub wears a bobbing gold arrow (`board_arrow`) while the local hero
  stands inside `CAR.boardRadius` — the reach `enterCar` revalidates the tap
  against — and it fades in over the last few paces rather than switching on
  over his head (`pwa/src/game/render/vehicles.ts`). It is drawn OVER the
  assembly, because a pointer under the thing it points at is a pointer that
  thing can hide, and it comes off the moment somebody is at the wheel: a
  running car has its lights on and its body shivering, and a mark still aimed
  at it would be telling the player to board a car he is sitting in.
  The car needs this and the rocket does not, which is the whole test for
  whether a fixture wants one — a rocket on a lawn is self-evidently a thing you
  press, and a thirty-year-old hatchback in a garage full of furniture is
  furniture until something says otherwise.
  **A VISITOR'S CAR NEVER GETS ONE**, and the reason is the same test read the
  other way: the night shift's cars on GOODCO's staff lot
  (`GameState.arrivals` — engine/game/arrivals.ts) are drawn by the same
  `drawCarAssembly`, on the same springs, out of the same panels, but three
  arrows over a car park would be the lot pointing at three machines the hero
  cannot take. Their engines are read off the ARRIVAL's own phase rather than
  off a seat in the party, so the lamps and the idle shiver die as each one
  parks and it becomes what it now is — furniture with an owner.
- **AND IT IS A MARK RATHER THAN A LIGHT, WHICH IS A RULE AND NOT A TASTE.**
  This cue was a faint amber halo under the machine for a while, and the trouble
  with it was structural: the hub is lit by real lamps, so one more warm pool on
  the floor reads as a fitting somebody left on. A pool says SOMETHING IS LIT
  HERE; the only sentence worth saying is THIS ONE, and a pool cannot point. The
  errand givers already had the answer — a bobbing `!` over the head
  (`render/quests.ts`) — and this is that idiom aimed at a machine, on the same
  terms: a glyph out of the atlas rather than a gradient, one whole-pixel bob,
  and the bob taken off the SIM clock so it holds still behind a modal.
- **THE TAP IS AIMED AT THE THING, NOT AT ITS ANCHOR.** A travel door is tapped
  through its LANDMARK, which is correct only because a landmark never moves. A
  driven car does — so the press that gets the hero back OUT of it
  (`exitCar`) hit-tests the car's own position, which is the machine the player
  can actually see under his thumb.

## The title sky — a solar system, on the real numbers

The main menu's backdrop is an orrery, and almost all of it is measured rather
than invented. `pwa/src/game/title-sky.ts` drives it; `@ui/lib/planet-globe.ts`
shades each world; `@ui/lib/planet-maps.ts` holds the geography and
`@ui/lib/planet-skins.ts` bakes it into textures.

**ONE PLANE, BECAUSE THE SOLAR SYSTEM HAS ONE.** All eight planets ride the
ecliptic — the system condensed out of a single spinning disc and never left it
— each keeping its own true inclination to that plane (Mercury's 7.0° is the
outlier, Neptune's 1.8° the rule). Orbits are solved from the J2000 elements
through Kepler's equation, so they are real ellipses with the sun at a FOCUS and
each world running fastest at perihelion. The camera sits nearly IN the plane
(`ECLIPTIC_PITCH`, 14°), which is why the planets string out along a line
through the sun and show phases like the Moon does.

**AND IT STANDS BETWEEN MARS AND JUPITER** (`CAM_R`), which sorts the system
into two kinds of world. Inside that radius — Mercury, Venus, Earth, Mars and
the Moon — are inferior worlds: they show every phase, come round in front of
the sun and transit it, and that inner system is the picture. Outside it, the
four giants are superior worlds and can never come round the front, because the
half of the orbit that would do it is behind the viewer. Each rises into the
frame from one side, runs in toward the star, crosses BEHIND it at conjunction,
and leaves by the other side. That is both the correct sight of them and the
better one: passing in front, a giant is at NEW phase and at its largest, and
the near leg of the loop used to park a screen-filling black Saturn over the
middle of the menu.

**A PLANET IS OPAQUE.** The globe shader lights the sphere per pixel, so the
night side is already dark and a backlit limb already keeps the thread of air a
crescent needs; anything that wants a body DIMMER — distance, or a superior
world on its way out of sight — says so through the shader's `exposure`, never
through the element's alpha. Fading a lit disc lets the starfield, the glare and
whatever it is passing show straight through a solid world, which is what made
the giants read as ghosts laid over each other rather than planets in front of
one another. Two things may still take alpha off, and both are occlusions
rather than shading: a body passing behind the sun, and the last of a superior
world's exit — spent only after the exposure has already taken it to black.

**THE DEPTH SORT IS A PRIVATE MATTER, AND THE WRAPPER IS WHAT MAKES IT ONE.**
Which body is in front is decided by writing each one's depth into its
`z-index` (`SUN_Z ± Z_SPREAD`, 150..850). That band has to be WIDE — z-index is
an integer, and two solid worlds a hair apart in depth must never round onto the
same index, or the tie falls back to DOM order and the farther one can draw in
front. Wide is also the danger: those are the same numbers the app's own
surfaces are banded with, and unwrapped they out-bid every one of them — the
SCREENSHOT gallery, the trophy shelf, the LOST & FOUND and the arsenal all sit
at 70, so a planet crossing the middle of the screen painted straight over the
picture being viewed. So the whole sky lives inside `.title-sky`, a stacking
context, and flattens to a single band as far as the rest of the title screen is
concerned. Widen the band freely; never write one of its numbers onto anything
outside that wrapper. The title screen's full ladder is the band map above
`.title-sky` in `styles.css`, pinned by `tests/overlay_layers_test.ts`.

**THREE THINGS ARE NOT TO SCALE, AND EACH IS DOCUMENTED WHERE IT IS DONE.**
Distance (an honest system is empty: Neptune's orbit would be thirteen screens
out); the size SPREAD (29:1 between Jupiter and Mercury — compressed by a power
law that keeps the ORDER exact, so the worlds still read correctly against each
other); and the fact that spins and orbits run on two different clocks, because
a faithful day at this year-length would be 0.175 s. Everything inside each of
those is exact: every orbit is right against every other orbit, every spin
against every other spin, every diameter against every other diameter.

The compression exponent and the orbit table are ONE decision, not two: every
gap between two screen orbits has to clear the two discs that ride in it, or the
outer four stop reading as four distances from the sun and become a single
crowded ring that crosses itself. Change either and check the other.

**A WORLD WITH WEATHER GETS TWO LAYERS.** The surface is one texture and the
CLOUD DECK is another, turning at its own rate over the ground below — Earth's
a little faster than the surface (the jet streams), Venus's sixty times faster
(super-rotation: its deck laps the planet in four days against a 243-day day,
and since the deck is opaque it is the only motion Venus has). Baking cloud into
the surface texture is the failure mode this exists to prevent, and
`tests/planet_globe_test.ts` is what keeps it honest.

**AN AIRLESS WORLD GETS NO ATMOSPHERE, ANYWHERE.** Mercury and the Moon have a
knife-edge terminator, a hard limb, no rim glow and no CSS halo. A world WITH
air keeps its limb alight even when backlit, because sunlight forward-scatters
straight through it — that thread of blue round a dark Earth is the most
recognisable thing in orbital photography, and it falls out of the same term.

**THE LAW, AND HOW IT IS CHECKED.** A body is lit from the sun's side, at every
orbital position and in any viewport orientation. `pwa/scripts/verify-sky.mjs`
asserts it twice: the driver's own light vector must project to the sun's screen
direction for every body (which a shader that ignored the light would still
pass), and the rendered Moon's sunward half must measure brighter than its
anti-sunward half (which only a shader that used it can pass). The frames for
the second pass are chosen by measurement, never hard-coded — pinned sample
points rot silently the moment the orbits change.

Look at the maps themselves with `node pwa/scripts/planet-maps.mjs`, which
writes an equirectangular sheet and a four-rotation globe strip per world into
`pwa/assets-preview/planets/`. Inspect the live sky with `?skytest`.
