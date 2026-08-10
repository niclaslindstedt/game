---
name: sound-effects
description: "Use when adding or tuning game audio. All SHIPPED SFX and music are synthesized from authored YAML (WebAudio, zero audio files) — a MOD may also ship a real .wav/.mp3 recording; this skill covers the 16-bit sound design vocabulary, the event → sound mapping, the tracker-style music format, recorded sounds in a mod, and how to audition and iterate."
---

# Designing Sound Effects and Music

The game ships **no audio files**. Every sound is synthesized at runtime from a
handful of parameters, authored as YAML under `content/sounds/` and
`content/music/` and compiled like every other catalog — which keeps the PWA
tiny and offline-capable, makes audio as diffable as the pixel grids, and is
what lets a Steam Workshop mod ship a sound or a score of its own. The target
aesthetic is **16-bit console** (SNES era): layered detuned oscillators,
filtered noise percussion, attack envelopes on soft sounds, and a shared
echo bus for the big moments — richer than a bare NES blip, still
unmistakably chip.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs sound-effects --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Files

| File | Role |
| --- | --- |
| `pwa/src/lib/synth.ts` | The instrument: `tone()` (oscillator + glide + attack/decay + detune pair + vibrato + filter + pan + echo send) and `noise()` (fading white noise + filter + pan + echo). One shared SNES-style echo bus per context. Generic — extraction candidate. |
| `pwa/src/lib/chiptune.ts` | The music sequencer: a track = named **instruments** (patches) + named **patterns** (voice → note tokens) + an **order** arrangement list, scheduled lookahead-style on the synth. Generic — extraction candidate. |
| `content/sounds/<id>.yaml` | **The sound design.** One file per sound: a list of synth VOICES, plus an optional `on:` block naming the event shape that plays it. This is where SFX work happens. |
| `content/music/<id>.yaml` | **The soundtrack.** One file per track — its instruments, its patterns and its order — with `id` the value a `LevelDef.music` names (`title` is the menu's). |
| `pwa/src/game/sfx/` | The DISPATCH: `index.ts` looks a sound up in the compiled catalog by event shape (or by a weapon's own `sfx`) and plays it. The domain files (`combat.ts`, `world.ts`, `pickups.ts`, `jingles.ts`, `ui.ts`) now hold only what a static entry cannot express — the handful of sounds whose pitch or volume scales with a continuous intensity. |
| `pwa/src/game/music/index.ts` | The single player: play/stop/pause, which track is current, the per-track dynamic import, and `setModTracks` for a mod's scores. |
| `pwa/src/game/sfx/samples.ts` | **A MOD'S RECORDINGS** — the one place audio comes out of a file. Holds CLIPS (a file stem with one or more takes); what plays one is an ordinary sound def with a `call: sample` voice, so nothing downstream can tell a recording from an oscillator. Nothing shipped uses it. |
| `pwa/src/game/sfx/cues.ts` | **CUES** — moments the RENDERER knows and the engine never reported (a footfall). Matched by `on: { cue, surface }` in their own key space, rate-limited in the funnel. |
| `pwa/src/game/sfx/listener.ts` | Where the player is listening from (the local seat's camera), for `spatial:` sounds. |
| `pwa/src/game/render/footsteps.ts` | The first cue: steps off DISTANCE WALKED, surfaced from the level's own tile spec. |

The engine emits `GameEvent`s from `step()`; `playEventSounds` translates
them. A new sound usually starts as an engine event (see the `engine-system`
skill).

**But not always, and knowing which is the job.** A moment the RENDERER knows
and the simulation never reported — a footfall, cloth on a dodge, a weapon's
idle hum — is a CUE (`sfx/cues.ts`), answered by `on: { cue: … }`. The test is
frequency and origin: anything per-entity-per-frame must not become a
`GameEvent`, because that list is replicated over the wire, and anything the
receiving end could work out for itself should not travel at all.

**Three fields decide how a sound sits, and all three are as available to a
shipped sound as to a mod's:**

- `spatial: true` — pan and trim against the local seat's camera
  (`sfx/listener.ts`). Opt-in, because a menu click and a level-up fanfare are
  the PLAYER's, not the world's.
- `loop: true` + `stopOn:` + `fadeMs:` — a sustained source. Recording-only; a
  loop of oscillators is what the music system is for.
- A field LEFT OUT of `on:` answers every value of it. `on: { type: enemyHit }`
  is any hit; a `crit: true` entry beside it still takes the crits.

**THE ROUTE KEY IS FIVE FIELDS — `type|weaponClass|crit|kind|tier` — in four
places, and they move together or nothing plays.** `routeKey`
(`sfx/index.ts`), `matchKey` (`scripts/generate-sounds.mjs`), `soundMatchKey`
(`mod/tools/build.mjs`) and `MATCHABLE` (the schema). A sixth field on any one
of them makes every lookup miss, and it is INVISIBLE: the imperative fallbacks
in `combat.ts` and friends were recorded FROM the catalog, so they keep playing
the byte-identical sound and only a MOD's replacement goes quiet.
`tests/catalog_routing_test.ts` asserts through the runtime rather than
restating the formula, which is the only thing that keeps this honest.

## The shipped game synthesizes; a MOD may record

Everything under `content/sounds/` is parameters, and that is not changing —
zero audio files is what keeps the app small, offline and diffable, and a sound
you can read as a list of voices is one the next person can retune.

**A mod is not under that constraint**, and this is the one asymmetry in the
content format. Drop `sounds/<id>.{wav,mp3,ogg,opus,flac}` into a mod folder and
it is played in place of the synthesized sound of that name — a sound designer's
work IS the waveform, and no list of detuned oscillators is the orchestral hit
they recorded. A `music/<id>.opus` replaces a whole SCORE the same way (it plays
through an `<audio>` element, so it streams rather than sitting in memory as
decoded PCM). THE FILE NAME IS THE ROUTING: no `on:` block, no manifest field.

**The trap to warn a modder about, every time:** a recording repeats EXACTLY,
and the sound it replaced did not — `noise` voices redraw their buffer every
play. Four hundred identical takedowns a run is more fatiguing than the
oscillators. The cures are `<id>.1.wav`/`<id>.2.wav` takes (cycled round-robin)
and `pitchJitter: 0.05`, and a sound pack without at least the latter is worse
than what it replaced.

`node mod/tools/cli.mjs sounds [pattern]` prints every id with what fires it;
`--play <mod-dir>` auditions the modder's OWN recordings back to back without
launching the game. A `sounds/<id>.yaml` with a `sample:` block trims how one
sits (`volume`, `pan`, `echo`, `rate`, `pitchJitter`, `volumeJitter`, `pick`),
and a `voices:` list with `call: sample` in it COMPOSES — clips layered under a
synthesized tail, spaced with `delayMs`. Details: `mod/FORMAT.md` → "a
recording", `docs/modding.md`.

When the work lands in a mod folder, load `mod-authoring` too.

## Sound design vocabulary

A useful starting grammar (tweak from here, don't treat as law):

- **Player actions** are short and bright: square core, high start
  frequency, fast downward glide, ≤100 ms (`shot`: 880→220 Hz square +
  30 ms highpass-2500 noise crack).
- **Damage to enemies** sits mid-register and thuds: 150–340 Hz square +
  a 25 ms bandpass click of contact.
- **Damage to the player** must cut through: detuned sawtooth, low
  (150→55 Hz), ~200 ms, the loudest volume in the mix, with a lowpass
  noise body-thump under it.
- **Kills/explosions** get weight from three layers: a saw dive to the
  floor, a lowpass noise boom, and delayed highpass "debris" sizzle.
- **Rewards** are consonant triangle/sine steps upward; rarity scales the
  echo send and adds a high sine sparkle.
- **Jingles** are scheduled notes via `delayMs`, harmonized 16-bit style:
  melody + sine octave above, or brass squares over a held triangle root.
- **16-bit layering rules of thumb:** `detuneCents: 5–12` turns one pulse
  into a section; `echo: 0.15–0.3` for accents, `0.3–0.5` only for rare
  moments; filtered noise reads as material (lowpass = dust/rumble,
  bandpass = clicks/snares, highpass = hats/sizzle); `attackMs` ≥ 200 for
  pads, 0 for anything percussive.
- **A BED gets `holdMs`; an EVENT never does.** Every tone falls away from the
  moment it starts — a tenth of its peak a quarter of the way through
  `durationMs` — which is why a longer duration makes a hit RING rather than
  sustain. `holdMs` keeps it at the peak first. Reach for it only for the
  sounds you intend to fire over and over so the copies fuse into one
  continuous noise (an engine, a machine, a wind); for a hit, a shot or a
  pickup it is the wrong shape. Building one is its own craft — read the
  `continuous-bed-needs-a-hold` lesson before tuning a grain cadence.

Mixing rules:

- Volumes live in 0.03–0.09; playerHurt is the ceiling. If everything is
  loud, nothing is. Gloss layers (sine octaves, shimmer) sit at 0.015–0.03.
- Frequent sounds (shots fire every 380 ms!) must be the quietest and
  shortest; rare sounds may be big.
- Keep every effect's full description in its own YAML file's `description` —
  a sound is a readable list of voices with a sentence saying what it should
  feel like, so the next person to retune it knows what they are aiming at.

## Music format

A track is `content/music/<id>.yaml`, tracker data for `@ui/lib/chiptune.ts`:

- **`instruments`**: named patches (`wave`, `volume`, `gate`, `attackMs`,
  `detuneCents`, `vibrato`, `pan`, `echo`, `filter`, `slide`). Drums are
  instruments too: `slide: 0.25` on a triangle = kick; noise + highpass
  6500 = hat; noise + highpass 1400 = snare.
- **`patterns`**: named sections (verse/chorus/break…); each maps a voice
  to bars of 16 sixteenth-note tokens, authored as a block string one bar
  per line (`=` ties, `.` rests, `x` triggers noise voices). Short voice lines cycle within the
  pattern (write a 1–2 bar drum loop under an 8-bar lead) — their length
  must divide the pattern length. Omitted voices are silent.
- **`order`**: the arrangement — pattern names in play order; the whole
  list loops. Target **~2 minutes per loop** with real section contrast
  (intro / verse / chorus / breakdown / build / turnaround), enforced by
  `tests/chiptune_test.ts` (loop length 100–145 s, ≥4 patterns, order
  longer than the pattern list).

Composition guidance: lean on the progressions classic game scores run on
(i–VI–VII drive, i–VI–iv–V laments, a relative-major chorus lift, a thin
breakdown that builds back up) but write original melodies — nothing
sampled or transcribed. Keep music volumes well under SFX (lead ~0.03,
bass ~0.055, pads ~0.009, hats ~0.011).

## What a landing sounds like is what it is MADE OF

A drop is THROWN clear of the body it came out of (`engine/game/items/toss.ts`),
and three rules decide what the player hears:

- **THE SCATTER SPENDS NO `state.rng()` DRAW.** It is hash-derived off the
  item's own id, because the drop ladder's rng draws are load-bearing
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
- **THE STANDING AURA is the app's, and it is SILENT.**
  `pwa/src/game/render/loot-aura.ts` climbs a ladder gated on `TIER_RANK` —
  halo, ground pool, smoke, light shaft, orbiting motes, ground pulse — every
  layer lit in `TIER_RGB`, the same colour the item's name is written in. It is
  closed-form off the render clock and the item's id, raises no event, and
  therefore has no sound of its own: the ONE noise a find makes is its landing.
  → `docs/rendering.md`

## Iteration cycle

1. Edit the YAML — `content/sounds/<id>.yaml` for a sound (a new one needs an
   `on:` block, or a weapon's `sfx:` naming it), `content/music/<id>.yaml` for a
   score. Only an intensity-scaled sound belongs in an `sfx/` domain file.
2. `npm run levels` to recompile, then `npx vitest run tests/chiptune_test.ts
   tests/content/music_roundtrip_test.ts` after music edits — a typo'd note or a
   mis-sized pattern fails at the SCHEMA now, before it can reach a run, and the
   round-trip guard prints exactly which bars moved. An intentional score change
   is accepted with `node scripts/update-music-snapshot.mjs`.
3. Audition in a real browser — headless screenshots can't judge audio:
   `make website-dev`, play, trigger the event repeatedly (the `playtest`
   skill's rush strategy triggers combat sounds densely).
4. Check the mix, not the sound in isolation: fire + hit + kill overlap
   constantly in play, over the level theme. If a sound smears the mix,
   shorten it before quieting it.
5. Loop until each event is identifiable with eyes closed.

Audio normally can only start after a user gesture: `synth.unlock()` is called
on run start and every canvas pointerdown — keep that invariant if you touch
`GameScreen.tsx`. The one exception is `synth.autostart()`, which builds the
context with no gesture ONLY where the browser says that is allowed
(`navigator.getAutoplayPolicy` — the desktop shell, and a browser that already
trusts the origin); it is a deliberate no-op anywhere that cannot answer,
because a context built off-gesture on iOS is one no later gesture revives.
That is what lets the title theme start with the MENU rather than with the
first row pressed (`armTitleMusic`, `game/music/index.ts`), and where the
policy withholds it the first touch or key ANYWHERE unlocks instead.

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the sound vocabulary above.

```sh
node scripts/skill-lessons.mjs sound-effects --list
```

The lessons here are a **palette of parameter recipes that worked** ("UI confirm
= square 660+990 stepped 60 ms apart, detune 5, echo 0.15") — read it back
before designing a sound, and add to it after.

- **Arrangement shapes** — this game's proven title/level track structures
  live in [`GAME_NOTES.md`](./GAME_NOTES.md); record new score-specific
  arrangements there, and keep reusable synth/mixing recipes in `.lessons/`.
