# Modding — how it works

The authoring guide is [`mod/README.md`](../mod/README.md); the field reference
is [`mod/FORMAT.md`](../mod/FORMAT.md). This page is the other half: what
happens between a player subscribing to a Workshop item and a mod's monster
appearing on screen, and why it is built the way it is.

**Desktop builds only.** The browser and mobile builds have no Workshop and no
filesystem to read a mod from. Ordinary players may use mods only with the
Windows, macOS, or Linux game acquired through Steam. Before that unpublished
edition is available, a mod creator may run an official downloaded desktop
binary with `--modifications` solely to create and test their own mod; it is not
a player entitlement and does not license multiplayer.

## The shape

```
Workshop item (YAML, as authored)
        │  Steam downloads it into its own folder
        ▼
electron/src/workshop.ts     ← the only module that knows Steam exists
        │  a folder path
        ▼
mod/tools/build.mjs          ← the compiler: validates, rasterizes, emits JSON
        │  one ModBundle, all data
        ▼
pwa/src/game/mods.ts         ← registerDefs() + sprite merge
        │
        ▼
the run
```

Five decisions carry it.

### 1. A mod is compiled, never interpreted — and its CODE runs in a box

The game never parses a mod's YAML. The desktop shell's main process compiles
each mod once, at load, into a `ModBundle` of plain JSON — and only that reaches
the page. The renderer keeps no filesystem and no YAML parser.

A mod may ship one thing that is not data: **`scripts/<id>.lua`**, the rules the
engine hands out rather than keeping (→ [`docs/scripting.md`](scripting.md)).
That is what makes a total conversion able to be a different GAME rather than a
re-skin of this one — until it existed, a conversion could replace every
monster, venue, relic, scene and recruit and still hand the player _this_ game's
XP curve, loot rain and damage formula.

It is also, unavoidably, a stranger's code, so it never leaves the box:

- **The VM is ours** (`src/lib/lua/`), and its standard library is a SUBSET
  chosen as the security model. No `io`, no `os`, no `require`, no `load`, no
  `debug`, no `_G`, no `coroutine` — there is nothing to reach the filesystem
  with, and no way to bring in a chunk the compiler did not see.
- **A script sees only what the host hands it**: `game.config`, `game.balance`
  and `game.run`, all deeply FROZEN. A write is an error naming the field, and
  the freeze is on the tables themselves rather than behind a metatable, so
  `setmetatable` does not lift it.
- **Every call is METERED.** A hook that loops forever dies on its instruction
  budget, and its own `pcall` cannot swallow the kill signal.
- **It is deterministic.** No clock, no `math.random`, insertion-ordered
  iteration, a stable sort — a seeded run and a multiplayer session both depend
  on two machines getting the same numbers.
- **It cannot break the run.** A script that will not compile, a hook that
  throws, one that runs away, one that returns `nil` — each falls back to the
  file it was overriding, reports itself once with a file and a line, and the
  run keeps playing.
- **The compiler RUNS it**, with the same interpreter the game uses, so a syntax
  error or a typo'd hook name fails on the author's machine. That last one
  matters more than it sounds: a mis-spelled hook is otherwise silent forever,
  since the shipped rule quietly stands in and the author's file appears to do
  nothing.

The engine still owns everything a script must not be able to move — chiefly the
RNG. A loot hook decides what a draw is measured against; the draws themselves,
and their order, stay on the engine's side of the seam.

### 2. One compiler, one schema

A mod's level is a `content/levels/<id>.yaml` file; its enemy is a
`content/enemies/<biome>/<id>.yaml` file; its sprite is a
`content/sprites/<family>/<name>.yaml` file; its cutscene is a
`content/cutscenes/<id>.yaml` file. Same keys, same loaders, same validators —
which is why `scripts/*-data/load-yaml.mjs` take a directory rather than owning a
constant. `node mod/tools/cli.mjs check` runs the identical code
the game runs at load, so "it works in my mod" and "it works in the game" mean
the same thing. A second, friendlier mod schema would drift from the real one
inside a release.

### 3. The catalogs go in through the seam that already existed

`registerDefs` (`src/game/defs/registry.ts`) replaces the ACTIVE content
registry every `levelDef` / `enemyDef` accessor reads. It was built so the
engine test suites could run against synthetic fixtures; a mod is the same move
with different data, which is why applying one needed no engine change at all.
Sprites merge into the loaded `Record<name, ImageBitmap>` the renderer reads
through `spriteByName`, so a mod's frames are indistinguishable from the atlas's.

The AUDIO has two seams of its own, both of which existed before mods did
because the sounds and the scores are compiled content (`content/sounds/`,
`content/music/`). `setSoundCatalog` swaps the bank the sfx bus dispatches
through, so a mod's sound plays by name from a weapon's `sfx:` or answers an
event shape and replaces a shipped one. `setModTracks` (`game/music/index.ts`)
installs a mod's scores beside the shipped ones — as DATA rather than as a
module, since the shell compiled them, which is the one place a mod's content
does not travel the same road as the game's: the shipped scores are each behind
their own dynamic `import()` and stay there.

**Every catalog kind rides that same seam**, and each one needed a small thing
of its own to get there. The sections up to "Clashes between mods" are those —
one per catalog family, in the order they landed.

### A mod may ship RECORDED sound, and the game may not

The one asymmetry in the format, and a deliberate one. Every shipped effect is
synthesized from parameters, because a PWA that ships no audio files stays small
and offline and diffable. That reasoning does not transfer to a mod: a sound
designer's work IS the waveform, and no list of detuned oscillators is going to
be the orchestral hit they recorded. So a recording — `.wav`, `.mp3`, `.ogg`,
`.opus` or `.flac`, under `sounds/` or `music/` — is the one media file a mod
may hand the game. (The container list is set by where recordings can actually
arrive: only through the Steam shell, so the decoder is always Chromium.)

**The file name is the routing, and there is no second mechanism.** A recording
named `enemy_killed.wav` replaces the sound `enemy_killed` — the event table the
shipped catalog already carries keeps pointing exactly where it pointed. That is
what makes a SOUND PACK a complete mod with no YAML in it at all, and it is why
this is the one id clash an ADDON is allowed: naming the sound it stands in for
is the only way to ship a recording, so a footstep pack would otherwise have to
declare itself a total conversion.

**A RECORDING IS A SOUND DEF, NOT A SECOND KIND OF THING.** This is the piece
worth understanding, because it is what makes composing possible at all. The
compiler turns a dropped-in `enemy_killed.wav` into an ordinary catalog entry
whose one voice is `call: sample, clip: enemy_killed`, so the page merges it,
routes it and plays it through exactly the code that handles a synthesized
sound. Writing that def out longhand is then just… writing it: two clips
layered under a synthesized tail, spaced with `delayMs`, is a sound a mod can
author. (It began as a parallel bank consulted AHEAD of the catalog, which
worked for replacing a sound and made building one impossible.)

**A clip may have several TAKES**, `enemy_hit.1.wav` and friends, cycled
round-robin. This is not a flourish: the shipped bank's `noise` voices redraw
their buffer every play, so four hundred takedowns a run are four hundred
slightly different sounds, while one recording is one waveform four hundred
times. A sound pack without takes (or at least a `pitchJitter`) is measurably
more fatiguing than the oscillators it replaced.

Rules that hold the seam together, each one that would otherwise bite:

- **The check goes in the FUNNEL, not in a caller.** Every sound in the game —
  a run's events, the interface's clicks, the road's scrapes, a weapon's own
  `sfx:` — passes through `playSound` (`pwa/src/game/sfx/play.ts`), so one line
  there is every sound id at once. (The interface keeps its `ui_*` sounds in
  their OWN catalog so a title screen does not download the combat bank to click
  a button — which is why `applyMods` merges into both, or `ui_confirm.yaml`
  would compile, ship, and never be heard.)
- **THE ROUTE KEY AND THE DEDUPE KEY ARE TWO KEYS.** An event picks its sound by
  `type|weaponClass|crit|kind|tier` — the same five fields the generator and the
  mod compiler build from an `on:` block, and a sixth field on any one of the
  three makes every lookup miss. It did once, and the failure was invisible: the
  imperative fallbacks in `sfx/combat.ts` and friends kept playing the
  byte-identical sound they had been recorded FROM, so nothing in the shipped
  game noticed, and the only casualty was every mod's `on:`-routed replacement.
  What wanted the sixth field (an event's own `sfx`) is the question "are these
  two events in one step the same noise" — a different question, and now a
  different function. `tests/catalog_routing_test.ts` asserts THROUGH the
  runtime rather than restating its formula, which is the only way this stays
  fixed.
- **A missing discriminator answers every value of it.** `on: { type: enemyHit }`
  answers crits and non-crits alike; a more specific entry beside it still wins.
  Without that ladder, an `on:` naming only a type builds `enemyHit||||` while
  the event builds `enemyHit||true||`, and the sound is never played — with no
  error, because both halves are individually correct.
- **Decoding is lazy and FAILS OPEN.** `decodeAudioData` needs a running
  AudioContext, and there is none until the player has touched something, so a
  recording cannot be decoded at the moment a mod is applied; it is warmed as
  soon as audio is live and decoded on demand otherwise. A file the browser
  refuses is DROPPED, and a clip that loses its last take is dropped with it,
  which puts the SHIPPED sound back — a corrupt download must not silence one
  sound for the rest of a run.
- **The bytes are never parsed by us.** They travel base64'd and untouched and
  go to the browser's own audio decoder, the same one every `<audio>` on the web
  uses. This is a real widening of what a mod reaches — the sprites deliberately
  arrive as raw pixels rather than as PNGs precisely to keep a stranger's file
  away from a decoder — and it is accepted here because re-encoding somebody's
  mastered audio into a container of ours would be the one lossy step in a
  pipeline that has none. What the compiler can check honestly, it does: the
  name is an id, the magic bytes agree with the extension, the size is sane
  (2 MiB a file, 24 MiB a mod; 8 MiB and 32 MiB for music), and nothing deeper.
- **A recorded SCORE streams; a recorded EFFECT decodes.** A track plays through
  an `<audio>` element rather than `decodeAudioData`
  (`pwa/src/game/music/recorded.ts`), because a decoded `AudioBuffer` is 32-bit
  float PCM — a three-minute stereo score is over 60 MB resident, and a
  conversion with six themes would be most of a gigabyte. It also loops
  seamlessly and pauses in place for free, which the sequencer would otherwise
  have to be rebuilt to do. The cost is that it bypasses the AudioContext, so
  the music volume is PUSHED to it (`onMusicVolume`) rather than read per note.

### A mod may ship DRAWN art, and animate it past two frames

The same asymmetry as recorded sound, arrived at the same way. Every shipped
sprite is a character grid with a palette legend
(`content/sprites/<family>/<id>.yaml`), and that is a good format for what it
is: it diffs per pixel, it reviews in a pull request, and it is authorable in
the same editor as everything else. It is a poor way to RECEIVE a finished
sprite from somebody who draws for a living. So a mod's sprite may be a
`.png` — the file's stem is the sprite name, exactly as a recording's stem is
its sound id.

**The pixels are decoded by the COMPILER, and the page's contract does not
move.** `ModSprite` is still `{ name, width, height, rgba }` with the bytes
base64'd, and the page still does `new ImageData(bytes, w, h)` over a buffer
whose size it already knows. That was a deliberate choice before PNGs existed
(decoding a stranger's image in the process holding the player's save is an
attack surface with no upside) and shipping PNG bytes through would have thrown
it away for nothing. `mod/tools/png.mjs` is therefore a from-scratch
non-interlaced PNG reader on `node:zlib`: the toolchain runs outside the app's
asar and installs no packages of its own, which rules out `sharp`, and a decoder
short enough to read end to end is a decoder whose refusals can be explained to
an author by line. `tests/content/mod_png_test.ts` pins it byte-for-byte against
`sharp` across every filter, depth and colour type.

**Replacing a sprite is the second id clash an ADDON is allowed**, for the same
reason a recording is the first: naming the sprite it stands in for is the ONLY
way to redraw it, the monster's def and everything referencing it are untouched,
and an art pack that had to declare itself a total conversion to give the hero a
new coat would be lying about what it does. A reskin IS the addon-shaped change.

**`animations.yaml` is the other half, and it is the half that was missing.**
The renderer has always animated a body by convention — `<sprite>_0` and
`_1` alternating, `<sprite>_cast_0/1` for a windup — which is exactly right for
sixteen-pixel art and unsayable-past: a mod whose artist drew a six-frame walk
had nowhere to put frames three through six, and a mod that drew a mouth moving
had no MOMENT to hang it on, because nothing in the game had ever asked a body
to talk. So a mod may declare CLIPS: subject → state → frames, with `idle`,
`walk`, `talk` and `cast` as a closed vocabulary
(`scripts/asset-tools/animation-schema.mjs`, played by
`pwa/src/game/render/clips.ts`).

Four rules hold it together, and each is a way replaced art could otherwise look
worse than what it replaced:

- **NO CLIP MEANS NO CHANGE.** Every call site keeps its own fallback and takes
  it whenever the table says nothing — which, for the shipped game, is always.
  The table cannot change how the game looks on its own; only a mod can.
- **A WALK IS DRIVEN BY THE GROUND COVERED, and that is not authored.** The
  drive follows the STATE (`walk` → the gait's own phase, everything else → the
  clock), because it is a fact about what the state means rather than a
  preference: a walk cycle on a timer moonwalks the instant its owner is slowed,
  blocked or standing still, and an idle breath on a distance would stop at the
  one moment it is the only thing keeping the body alive. Letting a file choose
  would only be letting it choose wrong. Six frames therefore cover the same
  ground two did.
- **EVERY BODY KEEPS ITS OWN PHASE**, seeded off its entity id — the two-frame
  shimmer always did (`timeMs / 300 + enemy.id`), and a clip that dropped it
  would animate a horde of forty as one organism.
- **A STATE EXISTS BECAUSE THE RENDERER ASKS IT.** A fifth state is a renderer
  change first and a schema change second; a state nothing raises is a promise
  to a mod author that the game silently breaks.

`talk` is the one that is new rather than wider, and it is raised in three places
at once for one speaker: the portrait in the dialogue box, the portrait on the
errand or shop panel (`useSpeakingBust`), and the body standing on the field
behind both. The field's clock is RENDER time rather than sim time, which is
what lets a mouth keep moving while the run is frozen behind the modal — the
same reason the horde keeps breathing through its own dialogue.

The one body that is only half in: the HERO is a paper doll, not a sprite, and
his worn armor overlays are derived per shipped pose. A `walk` clip on his
appearance replaces the BODY layer and leaves the overlays on their two poses —
a six-frame body in two-frame trousers, which reads fine and is a far better
trade than refusing the body until somebody hand-draws six frames of every armor
piece in the game.

### A CUE is a sound the engine does not know it is making

Most sounds answer a `GameEvent`: the simulation reports a thing and the catalog
says what it sounds like. A few moments the simulation never reports at all, and
a footfall is the one that forced a second axis. The engine moves a body from A
to B; it is the RENDERER that knows the body has legs, how long its stride is,
and that a boot just came down — and a party of four walking would put hundreds
of events a second into `state.events`, a list replicated to every client, to
describe something the receiving end works out for itself.

So the app raises a CUE, matched through the same `on:` block in its own key
space (`cue|surface`) rather than smuggled into the event key, since a cue has
no event type and a blank one would be a thing an author could write:

```yaml
on:
  cue: footstep
  surface: metal
```

Three rules, each earned:

- **The rate limit lives in the funnel** (`sfx/cues.ts`), not in the caller.
  Cues are raised from per-frame code by definition, so every one needs a cap
  and a cap each caller reimplements is a cap somebody forgets.
- **A cue falls back to its generic.** `footstep|metal`, then `footstep|`. A
  biome nobody wrote a specific sound for is still audible, and a mod may be as
  specific as it likes without covering the board.
- **The surface is the level's own ground family, not a fixed enum.** The
  shipped families map down to six materials a boot can be told apart on
  (`render/footsteps.ts`), and a family with no entry PASSES THROUGH AS ITSELF —
  so a conversion that lays down `lava_0` gets `surface: lava` and can author
  for it. Mapping the unknown onto `dust` instead would have made every mod's
  new ground silently sound like regolith with no way to say otherwise.

### A mod may replace the HUD — the one piece of chrome that IS content

The bars, the pouch, the quest button, the party rail, the minimap hub, the
docks and the drive minigame's dashboard are authored under `content/hud/` and
compiled to `pwa/src/generated/hud.ts` (→ [content pipeline](content-pipeline.md)).
A mod ships the same four things in its own `hud/` folder — the frame, the
elements, the event sounds, the judgements — through the same loader and the
same schema.

**Why this and not the title menu.** The two questions look alike and are not.
A menu tree decides which SCREENS exist and which rows reach them, so a mod that
could ship one could hand itself the hidden developer tree — the level warp, the
balance multipliers, the coin grant — on a shipped store build. A HUD hands out
nothing. Its buttons carry `action:` names out of a fixed list of verbs the app
already had, its values are READS of the HUD snapshot, and the one place it can
compute anything is a Lua judgement in the same metered sandbox the rules run in.
So the HUD is as safe to replace as a monster, and the menu is still refused.

Four things make it work as a format rather than as a theme:

- **The id is the whole merge rule.** Elements merge by id, later wins
  (`mergeHud`), so a file named after one of ours REPLACES that element and a
  file named anything else ADDS one. That single rule is both "re-skin my pouch"
  and "give me a WoW-style panel of my own", and a mod that ships one element
  keeps the player the rest of their HUD — the alternative ("last mod to mention
  the HUD owns all of it") would make a tweak and an addon mutually exclusive
  for no reason a player could see.
- **A WIDGET is the honest limit.** The minimap is a canvas the render loop
  paints; the party frames are portraits composed per frame by the paper-doll
  compositor; the docks are gesture surfaces. Those stay TypeScript and are
  PLACED by content (`kind: widget`), so a mod moves, hides, reorders and
  re-sounds them without any of them having to be re-authorable as boxes. A
  widget may still take authored PARTS — the weapon slot's round count is an
  ordinary text node in the YAML.
- **The scripts are judgements, not draw calls.** `{ script: "vitals.gauge_color" }`
  is called when the HUD's snapshot PUBLISHES — on a real change, a few times a
  second — never per element per frame, which is the same rule the engine's own
  hooks keep. A judgement may answer a colour, a yes/no, a whole line or a
  value, and a broken one falls back to what the element would have done with no
  script at all, reported once.
- **Nothing plays an interface sound outside the catalog.** Every press names its
  sound on the element that carries it, and every app-raised moment is answered
  by `hud/events.yaml` — so "what does this HUD sound like" is one file, and
  replacing the sound `ui_confirm` itself is the other way to answer it.

The drive minigame is the second SURFACE: one catalog, two mounts (the fight's
`GameScreen`, the road's `DriveScreen`), with a top-level region naming which.
Its dials read the `drive.*` bindings — speed, the gear the box has chosen and
how far up it the wagon is, the crank's own rpm against both its redline
(`rpmFrac`, the face a tachometer sweeps) and the point the box changes up at
(`shiftFrac`, the only one worth a warning, since the wagon never goes near its
redline), the bodies, the wear — and what they SAY is
`content/hud/scripts/drive.lua`, which makes the
dashboard the cheapest place in the game for a conversion to put its own voice.
The shipped one is three pieces along the bottom of the windscreen: a
speedometer with the tachometer drawn inside it, the shift gate (an `icon` whose
sprite a judgement picks, one picture per position), and the damage dial.

### A mod's venue is CARVED, like every other

`maps/<id>.yaml` is the map half of a venue (the `mapgen-improvement` skill in
`AGENTS.md`): the mission's geometry is carved fresh from the run's own seed —
the only way a venue gets a floor, for a mod exactly as for the shipped campaign
— so the boss has to be found. A mod that ships a level therefore ships a
blueprint beside it; a level on its own compiles, but no run can be built from
it. The treatment is identical to the game's own — the loader
(`scripts/map-data/load-yaml.mjs`) takes a directory like every other, the schema
is `validateMap`, and the ramp names expand against the shipped `ladder.yaml`
using the mod's own rows for its own venue.

Two details are the whole design here, and both come from rules that already
existed:

- **The registry is a LEAF.** `src/game/mapgen/blueprints.ts` holds the active
  catalog and nothing else, so `registerDefs({ blueprints })` swaps a mod's
  recipes in without the def registry importing `generate.ts` — the carve, the
  dressing passes and the whole area rule engine. Same move `flags.ts` makes for
  the engine's runtime toggles.
- **A blueprint carves the mission it is NAMED AFTER**, so `maps/moon.yaml` is
  not a new map, it is the shipped moon re-cut. An addon may therefore only name
  one of its own levels; a conversion may name any, which is how it re-carves a
  venue it has already re-skinned. The compiler says exactly that, with the fix
  in the message.

The one thing that could not travel is the compass-region PARSER. The compiler
runs in the shipped app's main process, which has no TypeScript and cannot call
`mapgen/regions.ts` — and a second grammar in the SDK would drift within a
release. So `mod/catalog.json` carries the list of names the engine's own parser
accepts, enumerated from it by `mod/tools/catalog.mjs` and drift-tested like
every other id set in that file. One grammar, a snapshot of what it says yes to.

### A conversion opens under its own name

`ModBundle.brand` — a title and a tagline, declared in `mod.yaml` — is what the
title screen draws while an enabled conversion has one. It is the smallest
possible surface on purpose: **the screen, never the install.** The storage
prefix, the precache id, the character archive's game name and every discovery
surface (`<title>`, the manifest, the OG card) stay `pwa/src/identity.ts`'s,
because a mod that moved them would orphan the player's roster and rewrite a
site it does not own.

Two details are load-bearing:

- **It is REMEMBERED, not derived.** The installed-mod list is compiled lazily,
  the first time MODS is opened, so at launch there is nothing to ask — and a
  conversion that opened under its own name yesterday and under this game's
  today reads as a bug. So `settings.modBrand` holds it, the MODS screen
  corrects it the moment the real list arrives (which is what forgets a mod the
  player switched off or unsubscribed from), and the title screen pays nothing
  at launch.
- **The last enabled conversion wins**, the same rule `mod-order.ts` resolves
  every other clash by, so the name on the front page can never contradict the
  content behind it.

The one check worth knowing about is the FONT. `PixelText` falls back to `?` for
a glyph the atlas has no cell for, so a brand with an accent in it renders as
`H?LLSTR?M` at triple size on the author's own front page. `mod/catalog.json`
therefore carries the font's glyph set — the one entry in it that is not an id —
and the compiler names the offending character.

### The kits are content too

`content/sets.yaml` is the last catalog to have been code. A SET is what makes a
boss worth farming past the first drop, and a mod could already ship
`rarity: set` pieces — they just belonged to nothing. The lift is the same one
the story and the companions had: a loader that takes a DIRECTORY
(`scripts/set-data/`), the schema both the shipped build and a mod validate
through (`asset-tools/set-schema.mjs`), a generator into `src/generated/sets.ts`,
and a snapshot frozen from the hand-written TypeScript the moment before, so the
move is provably lossless.

Two decisions worth keeping:

- **The affix vocabulary is SHARED** (`asset-tools/affix.mjs`). A set's tiered
  bonuses are the same `Affix[]` a unique's `bonuses:` are, and a second copy of
  the kind list would be a second answer to "is `armorPen` a real bonus", one of
  which is wrong within a release.
- **A mod's kit may only claim the MOD's own pieces.** A piece and its kit each
  name the other, and a mod cannot edit a shipped piece's `setId` — so claiming
  one would compile into exactly the mismatch the schema exists to catch. A
  conversion re-homing a shipped kit ships the pieces too, which puts them in
  the list anyway.

### The ladder speaks in the mod's voice

`difficulties.yaml` renames the five rungs and rewrites their taglines, and does
nothing else. The split is the interesting part, and it is the same one
`item_rarity.yaml` sits on:

- **The VOICE is the mod's.** "JESUS CHRIST!" / "THEY NEVER STOP COMING" is this
  game's register, and a conversion set in a hospital or a courtroom reads as
  somebody else's game the moment its ladder speaks in it. There is nothing to
  balance in a label.
- **The NUMBERS are the game's.** A rung's mob multipliers, xp rates, mercy
  curves, stamina ladders and starting weapon are one economy with
  `content/ladder.yaml`, which prices every venue — the shipped ones included —
  against them.

So `DefOverrides.difficulties` takes a FULL def, but `applyMods` folds a mod's
two strings onto the shipped rung rather than replacing it, and the schema
refuses any other field with that reason in the message. A mod also cannot ADD a
rung: the ladder's length is baked into the unlock chain, the per-map ladder
cells and the four-tuple every level compiles its ramps into.

It lands before the picker is drawn — `applyMods` runs and then the flow goes to
the difficulty ladder — so the rows a player reads are already the mod's, with
no extra plumbing.

### A mod's weapon flares its own element

`UniqueDef.fx` is the last of the four "a mod's content can only look like
whichever shipped thing it resembles" gaps. The signature slash and muzzle flash
were a table in `weapon-fx.ts` keyed by shipped unique id, so a mod's legendary
had no way in at all; the mapping now lives on the weapon (`fx:` in its own
YAML) and the app keeps only the kits and the drawing. Exactly the move
`AbilityDef.look` made for the powers, and the shipped roster was migrated onto
it wholesale — verified by resolving all 43 styled weapons both ways and
comparing (the diff found two dead rows on the way: a slash style each for
`skybreaker` and `stormlash`, a gun and a wand, which could never have played).

Three decisions:

- **The kits are a LEAF** (`weapon-elements.ts`). `generate-items.mjs` reads the
  element names from it to check every authored `fx:`, and it runs FIRST in the
  content chain — before the catalog `weapon-fx.ts` reaches through
  `@game/core`. A leaf breaks that cycle; the names beside the drawing re-make
  it.
- **The vocabulary is SYMMETRIC.** Every element has a slash kit and a shot kit,
  so `element: blood` means something on a rifle as well as on a blade. The four
  melee kits and one shot kit that were missing were derived from their
  counterparts' palettes rather than left out.
- **The resolved style is MEMOIZED**, keyed by unique id and rebuilt when the
  def's identity changes — which is exactly when a mod is applied or backed out,
  so it needs no invalidation hook. `shotStyleFor` is asked per projectile per
  frame, and building a style object there would allocate through the whole
  flight of every round on screen.

### The story travels the same road — and nobody governs a mod's script

Cutscenes, the hero's inner monologues and story items are catalogs
`registerDefs` already accepted; what was missing was the AUTHORING form. All
three are content now (`content/cutscenes/<id>.yaml`, `content/thoughts.yaml`,
`content/story-items.yaml`, compiled by `scripts/generate-story.mjs`), so a mod
ships them by putting the same files in its own folder. Without them a total
conversion had no opening scene, no monologues and no lore pages — new monsters
walking somebody else's plot, which is a re-skin rather than a different game.

Three things are worth knowing about the format:

- **`variants:` is how one scene is five.** The shipped prelude is the same
  living room on every difficulty except the weapon on the wall, so it carries
  `label:` handles on the parts that differ and a `variants:` block patching them
  per rung. The loader expands those into `prelude_<difficulty>` scenes — exactly
  what `cutsceneVariant` resolves at run creation — so a mod's prelude can show
  the run's actual starting weapon too, from one file.
- **The cap-farm mutter is a LIST, not a catalog.** `capRotation` replaces the
  shipped rotation wholesale rather than merging into it, and `setThoughtDefs`
  filters it to ids the active catalog actually holds: a conversion that replaces
  the thoughts without authoring a rotation gets silence rather than a throw the
  first time a player out-levels a map.
- **A mod's story answers to the schema and to nothing else.** The three-tier
  chain that makes `docs/manuscript.md` the authority on every line the campaign
  speaks stops at the mod folder's edge (see AGENTS.md, and the note at the top of
  the manuscript). A mod's scenes are never transcribed there and never corrected
  to match it. The distinction is origin, not format.

### The party is the story's other half

A companion is the same lift again: `registerDefs` already took a `companions`
catalog, and what was missing was the authoring form. The roster is content now
(`content/companions.yaml`, compiled by `scripts/generate-companions.mjs`), so a
mod ships one by putting that file at its own root.

It belongs beside the story rather than beside the stat catalogs, because of what
it gates. **Sparing a beaten elite is one of the few decisions the game asks the
player to make**, and the payoff is a named figure who thanks you, follows you,
fights with the weapon it just used on you, and talks over its own kills. Until
the roster was loadable the only figures a mod could hand over were the shipped
four, so a conversion's monsters, venues, script and loot could all be its own
while its allies stayed Tesla and a leprechaun — the one place the re-skin showed
through at the exact moment the player had earned something.

Two things are worth knowing about the format:

- **`spareable` resolves against BASE ∪ MOD, both ways.** A mod's elite may
  recruit a mod's companion (the point) or a shipped one (an addon that hands the
  player Tesla off a monster of its own, authoring no roster at all). An addon may
  not shadow a shipped companion id; a conversion may, which is how it makes the
  spare verdict hand over its own figure instead.
- **The schema refuses a power that grows a kit the companion has not got.** A
  `power:` block is pure growth applied on top of a base — and
  `novaRadiusPerRank` reads a `nova:` block that may not be there, so on a
  companion without one every rank-up adds precisely nothing, forever, with no
  error at play time to explain it. That is exactly the class of failure a
  compiler exists to catch, so `companion-schema.mjs` names the missing block and
  refuses the mod. The other four growth fields are grants in their own right
  (`chainPerRank` teaches an un-chained weapon to arc) and are legal alone.

### The build system is content too

The passive TALENT trees were the last catalog a mod could not touch — the one
place where a total conversion could re-skin every monster, venue, relic, scene
and recruit and still hand the player _this_ game's eight melee talents. The
trees are content now (`content/talents.yaml`, compiled by
`scripts/generate-talents.mjs` into `src/generated/talents.ts`), `registerDefs`
takes a `talents` catalog beside `abilities`, and a mod ships one by putting that
file at its own root. A mod's talents MERGE into the shipped trees like its
monsters do, so an addon adds one good passive and a conversion replaces one by
shipping its id.

The lift is not just a file move, because a talent's numbers used to live in two
places at once: the def carried its per-rank slopes, and every structured PROC
(a parry, a volley, a frost nova) kept its chances, radii and cooldowns in
`src/game/config/talents.ts` under a key the accessor reached for by SHIPPED
TALENT ID — `talentParry` read `TALENTS.parry` after checking the rank of the
talent literally called `parry`. A YAML catalog on top of that would have let a
mod author a talent and no numbers to put in it.

So the procs moved onto the def as **blocks**, and the hook now asks the catalog
_which trained talent carries this block_ (`procTalent` in `talent-effects.ts`)
rather than what rank `frost_nova` is. That is the same rule
[`AbilityDef`](../AGENTS.md) already followed — `kind` is a label, the BLOCKS are
the behaviour — and it is what makes a mod's talent able to fire a shipped proc
with its own numbers. `src/game/config/talents.ts` is down to the one thing that
is true of every talent: the shared rank ceiling.

Three things are worth knowing about the format:

- **A proc has exactly one carrier**, checked at compile time over BASE ∪ MOD.
  Two carriers would make "whose numbers apply" a question about catalog order,
  which is not a decision anybody made — so an addon that carries `parry:` is
  refused by name, and re-carrying a proc means REPLACING the talent that has it
  (a conversion's business). The compiler knows who carries what from
  `catalog.json`'s `talentProcs`, which is a map of proc → talent NAME and
  carries no numbers, like the rest of that file.
- **A talent that does nothing is refused.** A def with no slope, no `conjure`
  and no proc block still draws a card, still costs a point, and buys nothing —
  forever, with nothing at play time to explain it. That is the one bug this
  format could produce in total silence, so `talent-schema.mjs` names it.
- **`conjure:` is the cheapest powerful thing a mod can write.** It hands the
  talent's rank to one of the game's always-on granted spells — the machinery a
  legendary's `spell` affix already drives — so a fully drawn, fully sounded,
  INT-deepened magic passive is four lines and no numbers.

What stays the game's is the point ECONOMY: how many chosen stat points earn a
talent point, and the rank ceiling every talent shares. Both price the whole
level-up flow, and a talent ranked past the ceiling would enqueue points the
picker has no milestone to spend them at.

### 4. Clashes between mods resolve by an order the player owns

The compiler catches a clash with the BASE GAME (an addon may not shadow a
shipped id; a conversion may, and that is what it is for). It cannot catch a
clash between two MODS: each is compiled alone, and its author never saw the
other. So that resolution happens at load, by one rule covering every kind of
content — **later in the load order wins**, for sprites, levels and enemies
alike.

`mod-order.ts` is the whole of it, and it is a leaf of pure functions over the
persisted list. Three decisions in it are load-bearing:

- **The persisted list is the source of truth for order, not the installed
  set.** A list rebuilt from whatever is installed would reshuffle itself every
  time the player subscribed to anything, silently changing which mod wins. So
  entries persist for mods that are not installed right now, and a resubscribe
  restores the rank the player had chosen.
- **A newly-seen mod is APPENDED**, landing last and therefore winning. A mod
  the player just subscribed to doing nothing visible because an older mod
  outranks it is the worst possible first impression.
- **Moving a row steps OVER the entries that are not installed.** Otherwise a
  list with three stale entries between two visible mods takes four presses to
  reorder, with nothing on screen changing for the first three.

`applyMods` merges the enabled stack in that order and RECORDS every override
(`ModClash`) rather than performing it silently, so the MODS screen can tell a
player which of their mods is currently losing — and that moving it down fixes
it. It also re-merges from the SHIPPED catalogs every time rather than from
whatever the last apply left behind: merging onto the live registry would make
the result depend on the order runs were started in, and switching a mod off
would not actually remove its content until a relaunch.

### 5. A mod applies to a RUN, not to an install

The catalogs are global mutable state. A mod is applied when a modded run
starts, and `restoreBaseDefs()` puts the shipped game back when it ends — so the
menus, the roster and the next run are always the base game. A hero played under
a mod carries a `ModStamp` (id, name, version) rather than any of the mod's
content, which is what keeps a roster readable on a device that has since
unsubscribed from everything.

## The reference catalog

`mod/catalog.json` is every id a mod may name — enemies, weapons, gear, powers,
uniques, sprites, sounds, music tracks, the shipped venues, the compass regions a
map blueprint points its boss with, and the engine's event names (what a sound's
`on:` may answer). It exists because the compiler runs in the
shipped app's main process, which has no TypeScript and no `src/generated/` to
import the real catalogs from, so the id sets are snapshotted into JSON that
travels inside the build.

It is **committed and drift-tested** (`tests/content/mod_catalog_test.ts`), the
same pattern the Game Center and Steam achievement manifests use: a content
change that adds or retires an id regenerates it in the same commit
(`make mod-catalog`), and the diff is the exact list of what moved. Deliberately
absent from it: any number. A mod may NAME the game's content; it may not read
the game's tuning out of a file that would then have to stay compatible for ever.

## The measuring instruments — `--mod`, and the one seam behind it

The compiler answers whether a mod is VALID. Nothing answered whether it is any
good, and this repo's own content is not authored by reading YAML: it is
rendered, simulated, priced and played back. So every analyzer, renderer and
simulator under `scripts/` takes **`--mod <dir>`** (repeatable, in the player's
load order), and one module — `scripts/mod-support.mjs` — is the whole of what
that flag does. `mod/AGENTS.md` step 5 is the author-facing half: which command
answers which question, in the order a mod gets built.

Three rules keep it honest, and they are the same three the shipped app follows:

1. **One compiler.** `--mod` runs `buildMod`, exactly as `cli.mjs check` and the
   desktop shell do. There is no friendlier tooling loader that could accept a
   mod the game would refuse.
2. **One seam in.** The result is registered through `registerDefs`, the way
   `pwa/src/game/mods.ts` registers it — so a tool measures a mod's level
   through the same `createGame` / `levelDef` / `enemyDef` path a run does, and
   nothing in the engine learns that a mod exists.
3. **Plus an in-place merge of the shipped catalog records, which is
   TOOLING-ONLY.** Half these scripts REPORT on a catalog rather than play it
   (`Object.values(WEAPON_DEFS)`, `ENEMY_DEFS[id].role`, iterating
   `LEVEL_ORDER`), and the registry is a separate thing from those exported
   records. Assigning into them is what makes `--mod` one line per script
   instead of a rewrite of every script's data access. It is safe here and only
   here: a script process loads one stack of mods, once, before it does any
   work, and then exits. The app must never do it — it re-merges from the
   SHIPPED catalogs on every apply, which is what lets switching a mod off
   actually remove its content.

Two consequences worth knowing. A mod's **sprites** are merged into the
node-side sprite maps the previews render from (and its monsters' wound frames
and its armor's worn overlays are derived there, exactly as the shipped ones
are) — but never into the built atlas, which is why `make assets` is not part of
a mod's loop. And the **playtest harness** reaches the same place from outside
the page: `pwa/scripts/playtest.mjs --mod` compiles the mod in node and hands
the bundles to the app's own `applyMods` through a `window.__mods` hook that
exists only under `__DEV_TOOLS__` **and** `?debug` — the store build drops it at
compile time, and no ordinary page carries it. That hook is why `?level=` is
answered by `hasLevel()` (the ACTIVE catalog) rather than by probing the shipped
`LEVELS` record, which a mod's venue never joins.

## Publishing

`electron/src/workshop.ts` wraps ISteamUGC. The first publish calls `createItem`
and remembers the returned id, so publishing again updates the same item. What
is uploaded is the **authored folder**, not a compiled bundle — each subscriber's
game compiles it locally, and a published mod stays readable and forkable the
way the game's own content is.

Steam hides an item until its author has accepted the Workshop legal agreement
once per account; `needsToAcceptAgreement` on the publish result is that, and it
is surfaced rather than swallowed because the item is otherwise invisible with no
indication why.

## The MODS screen

**MODS is a row on the MAIN menu**, not a page under SETTINGS, and that is a
statement about what mods are: a total conversion is a different game living in
the same binary, and burying it three rows deep would say it was a
configuration detail. The row appears only where `modsBridgeAvailable()` is true
— the Steam shell — so no other build shows a door it cannot open.

**The list is a list of doors.** Each row names a mod, says ON or OFF, and
opens that mod's own page (`modinfo`) — it does not flip anything itself. What a
mod actually puts in the game is far more than a row can hold, and switching on
a total conversion is a bigger decision than a tap on a list should carry.

**The page is built from the mod's own manifest.** `contents:` lists every file
the game loads with a line saying what it is, and `buildModInfoMenu` turns each
into a row: the file, whether it ADDS or REPLACES, and the author's sentence.
Everything the app could work out for itself — two levels, nine sprites — is
arithmetic, and arithmetic does not answer "what will this do to my game". A mod
compiled before the block existed says so and falls back to the counts; a mod
that did not compile at all gets its whole list of problems in place of an
inventory, because the row that opened the page can only carry the first one.
The switch is the page's first row, and PUBLISH — for a `local` mod — its
second.

The rest of what is load-bearing in `menus-mods.ts`:

- **The screen says where mods come from, and opens it.** Two rows at the foot
  of the list name the folders the list was just read from — the path in the
  subtitle, the file manager one press away (`shell.openPath`, through a
  `reveal` action that takes WHICH folder rather than a path, so the renderer
  can never name one of its own). Documentation is where "put it in
  `%APPDATA%\adastrail\mods`" goes to be not read; the screen the player is
  already on is where it works. The row is absent where the platform has no such
  folder, which is how macOS shows one row instead of two.
- **The list is re-read every time the screen is opened**, and the previous one
  stays up while it compiles (so returning never flashes LOADING). That is what
  makes the loop closed: press the row, drop a mod in, come back, play it — no
  relaunch. It was a launch-once cache when the only source was a Steam
  subscription, which the player could not add to without restarting anyway.
- **A mod that did not compile still appears** in the list, greyed, with its
  first error as the row's help line. A player who subscribed to something and
  then finds an empty list has no way at all to learn why.
- **Text from outside the game goes through `speakable()`.** A compiler error
  names ids in double quotes and the pixel font has no cell for one, so it would
  draw a row of `?`. A mod's OWN authored lines are checked at compile time
  instead (`readContents` runs the same `glyphProblem` check `brand:` gets),
  which is the fix that scales.
- **Reordering is its own screen** (`modorder`). One pair of arrow keys cannot
  mean both "on/off" and "earlier/later" without the player having to remember
  which screen they are on. The `reorder` capability on `MenuEntry` is what the
  arrows drive there; confirm also moves a row, so the screen works on a pad and
  a touch screen, which have no arrow keys.
- **The builder imports `mod-state.ts`, never `mods.ts`.** The MODS screen is on
  the app's startup path, and `mods.ts` reaches `@game/core` for `registerDefs`
  and the shipped catalogs — one import away from the level catalog, the loot
  roller and the whole step pipeline. So the mod system's TYPES and the
  "which mod is on" state live in an import-free leaf (the same move
  `src/game/flags.ts` makes for the engine's runtime toggles), and the apply
  itself is a **dynamic** import inside the row's own handler. The 200 KB
  gzipped critical-path budget is what notices; it is at 161.3 KB.

## The shell handler, and what ships with it

`electron/src/mods.ts` is where the three halves meet: it asks `workshop.ts`
what the player is subscribed to, walks the two mods folders on disk, runs the
compiler over each one, and answers the bridge. It is the peer of
`cloud-save.ts` with one difference that shapes the file — it does real work,
because **compiling is the security boundary**. A mod's YAML is read, parsed
and validated here so that only checked JSON crosses to the renderer.

**Three sources, one list**, and each answers a different question:

| Source     | Where                                   | Why it exists                                                                                                                                                                   |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workshop` | wherever Steam downloaded it            | a subscription — somebody else's to update, so no PUBLISH row                                                                                                                   |
| `local`    | `<userData>/mods/`                      | the mod being WRITTEN. Authoring by publishing-to-test is a miserable loop and litters the Workshop with drafts. The only publishable source                                    |
| `portable` | `mods/` beside the game (Windows/Linux) | a mod somebody was SENT. Folders or `.zip` files, and a `.zip` is `portable` wherever it sat — what compiles is a copy in the cache, which nobody is authoring. Never published |

The portable folder is the answer to a question the other two cannot take: **a
friend sent me this**. The data folder is correct and unguessable — spelled
differently on three platforms and hidden on two — which is fine for somebody
who typed a command to be told where it is, and useless as an instruction to
pass to a player. The install folder is one place, the player owns it, and it
travels with a copied install.

**macOS has none, and that is the platform's answer rather than a gap.** An
installed app lives in `/Applications`, so "beside the app" is a system
directory a game has no business writing into — and the inside of the bundle is
worse: a file added there breaks the signature the app is notarized under. macOS
keeps user data in Application Support, so `localModsDir()` is the whole answer
there, and it reads archives too — which is what keeps "somebody sent me a zip"
answerable on every platform. `portableModsPath` is a pure function precisely so
that rule can be tested for all three from one machine.

### The one archive this app opens

`electron/src/mod-archive.ts` reads a `.zip` from that folder, and it is worth
being precise about what changed and what did not. The Workshop path still has
no archive parser: Steam downloads and unpacks a subscription, so a stranger's
file never meets code of ours. What the reader answers is the other arrival —
where the alternative was never "no parser" but "the player unzips it by hand
into a folder whose name they have to be told". The file is opened either way.

So it is a small reader rather than a dependency, and it refuses more than a
general-purpose one would: stored and deflated entries only, no zip64, no
encryption; every name checked BEFORE anything is written (absolute paths,
drive letters, backslashes, `..` segments and control characters all refused);
hard caps on entry count and size so a bomb is a refusal rather than a full
disk; and sizes read from the central directory, never from the local header,
which may legally be zeroed. Extraction goes to `<userData>/mod-archives/`,
keyed by the archive's size and mtime so replacing the zip re-extracts and an
unchanged one costs a `statSync`. That cache is deliberately NOT inside
`<userData>/mods/`, because the publish containment check is a prefix of that
folder — a mod that arrived cannot be republished by accident.

A zip that will not open is reported the way a mod that will not compile is:
the row appears with the reason on it. Unlike a nameless directory, which is
silently skipped, a file called `something.zip` in the mods folder was put
there to be played, so "it is not a mod" is an answer the player needs.

**Shipping the compiler is its own problem.** It lives outside `electron/` — in
`mod/tools/`, importing the game's own loaders out of `scripts/` — because
there must be exactly one compiler. So `electron-builder.config.cjs` carries it
in through `extraResources`, and three details there are load-bearing:

- The packaged tree **mirrors the repo's layout** under `resources/modtools/`.
  Every module in there finds its neighbours by relative path
  (`../../scripts/…`, `new URL("../../content", import.meta.url)`), so a
  flattened copy resolves to nothing. `resources.ts` is the one place that knows
  which root applies, off `app.isPackaged`.
- It is **outside the asar**, because it is loaded by dynamic `import()`, which
  resolves real files on disk rather than asar entries.
- **`yaml` rides along** into `modtools/node_modules/`, for the same reason: a
  package inside the asar is not resolvable from a module outside it.
- **Every `scripts/` directory the compiler imports has to be listed.** One that
  is not is a mod that compiles in the repo and fails on a player's machine with
  a resolve error — `scripts/powerup-data` was exactly that until the story lift
  added a test that walks the toolchain's own import graph against the packager's
  copy list (`tests/content/mod_toolchain_deps_test.ts`).

The one value that crosses from the page INWARD in this whole feature is the
`folder` a PUBLISH names, so it is the one that is checked — resolved and
compared as a path prefix against the local mods directory, which is what stops
both `..` traversal and a sibling like `mods-elsewhere`. `electron/tests/`
covers that, and compiles the worked example end to end through the real
dynamic import.

## What is not here yet

- **A NEW KIND of talent proc.** A mod may author, retune or replace any of the
  eleven proc blocks the engine fires (see “The build system is content too”
  above), but a proc the engine has no hook for — "your blows sometimes stun" —
  is engine code, not content. The scripting seam does not reach it either: a
  hook is a FORMULA the engine asks for an answer from, not a place to hang a
  new behaviour off. → [`docs/scripting.md`](scripting.md)
- **`grades:`** ladders and the loot economy (`content/item_quality.yaml`,
  `content/item_rarity.yaml`) are deliberately the game's rather than a mod's — a
  mod that moved the tier ladder would be rebalancing the campaign instead of
  adding to it.
