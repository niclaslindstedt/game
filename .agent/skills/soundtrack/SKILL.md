---
name: soundtrack
description: "Use when writing, rewriting or tuning a piece of MUSIC — a level's theme, the title screen's, a minigame's, or a whole score for a new venue. The tracks are tracker data authored as YAML under content/music/ (instruments, patterns, an order) and played by a chiptune sequencer over WebAudio; nothing is recorded, though a MOD may replace a score with an .opus. Covers the format, the composition guidance, where a track gets named, and the loop that actually makes a score good: engrave it with `make sheet` and judge it BY LOOKING at it — the staves for structure, the spectrum analyser under them for the mix — before and after listening. Not for sound effects, which are a different craft with a different loop: load `sound-effects` for those."
---

# Writing a soundtrack

Every track in this game is **tracker data**, not a recording: a handful of
synth patches, a set of patterns made of note tokens, and an order that
arranges them into a two-minute loop. That is what keeps the app free of audio
files, makes a score as diffable as a pixel grid, and lets a Steam Workshop mod
ship one of its own.

It also means a score arrives as eight hundred lines of YAML, which is the
central problem this skill exists to solve. **You cannot hear a wall of note
tokens, and you cannot judge a two-minute loop by playing it once** — the faults
that matter are structural, and they live in the relationship between bar 3 and
bar 40, or between two voices sounding at the same time. So the loop below is
built on LOOKING at the thing.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs soundtrack --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here
and reflecting on them before the commit is the **`skill-reflection`** skill's
job — load it at both ends of the session.

**A sound effect is NOT a small piece of music.** It is judged in a second, in
isolation, by ear, against a palette of synth recipes; it has no structure to
look at and no arrangement to balance. That craft is the **`sound-effects`**
skill, and the two share only the instrument they are played on.

## Files

| File | Role |
| --- | --- |
| `content/music/<id>.yaml` | **THE SCORE.** One file per track — its instruments, its patterns, its order. This is where the work happens. |
| `pwa/src/lib/chiptune.ts` | The sequencer: flattens patterns through the order and books each note on the synth with a lookahead. Generic — extraction candidate. |
| `pwa/src/lib/synth.ts` | The instrument every note is played on (`tone()` / `noise()`), shared with the sound effects. |
| `pwa/src/game/music/index.ts` | The single player — play/stop/pause, which track is current, the per-track dynamic import, and `setModTracks` for a mod's scores. |
| `scripts/generate-music.mjs` | The compiler: `content/music/*.yaml` → one gitignored module per track under `pwa/src/generated/music/`. |
| `scripts/asset-tools/music-schema.mjs` | What a score's YAML may SAY. A new field is added here, with its rule and its error message, before any generator reads it. |
| **`content/songs/<id>.song`** | **WHERE A SCORE IS WRITTEN.** The short notation — a note carries its own length, the chord plan is written once, drums are a grid. Compiles to the YAML above. |
| **`scripts/song-import.mjs`** | `.song` → `content/music/<id>.yaml`, and `--sheet` engraves it in the same breath (`make song`). |
| `scripts/song-export.mjs` | The way back (`make unsong`) — any shipped track written out as a `.song`, so an existing score can be opened in the short format. |
| `scripts/asset-tools/song-format.mjs` | The notation's parser and emitter, and where the reasoning for having one is written down. |
| **`scripts/music-sheet.mjs`** | **THE REVIEW SURFACE** (`make sheet`) — engraves a score as real sheet music with a spectrum analyser under every system. |
| **`scripts/song-artifact.mjs`** | **THE EAR** (`make audition` for one track, `make album` for ALL of them) — a self-contained page that plays a score with the game's own synth. What you publish as an artifact so somebody else can hear it. |
| `scripts/asset-tools/notation.mjs` | The engraver: staves, clefs, beams, ties, rests, accidentals, note names. |
| `scripts/asset-tools/spectrum.mjs` | The analyser: a spectrogram COMPUTED from the patch parameters rather than recorded off the synth. |

## Writing one — the `.song` notation

**Write a new score as a `.song` and compile it.** The YAML below is the right
thing to SHIP — an explicit grid, nothing computed at load — and a bad thing to
TYPE, for three reasons the notation fixes and no others:

- **Rhythm is padding.** `A4 = = = = = = = A#4 = = = = = = =` is sixteen tokens
  to say "two half notes", and the bar is only right if you counted to sixteen.
- **The chord plan is retyped once per voice**, in three different shapes, which
  is exactly how a chord comes to be changed in two voices out of three.
- **A kick drum is spelled as a pitch.**

```
id     long_noon
title  THE LONG NOON
tempo  138
about
  A knockoff spaghetti western, played by robots…

voice trumpet  square vol=.03 gate=.85 detune=8 vib=5/16/160 echo=.28
voice bass     triangle vol=.055 gate=.8
drum  kick     triangle vol=.062 gate=1 slide=.25 note=D2
drum  snare    noise vol=.034 gate=.75 hp=1400

section a
  chords   Dm | C | Dm | C | Dm | Bb | A | A
  trumpet  d5*4 f5*2 e5*2 d5*4 c5*4 | e5*8 c5*4 d5*4 | …
           g5*4 a5*2 g5*2 f5*4 d5*4 | …          # a continuation line
  bass     pump 2
  kick     x.......x.......
  snare    ....x.......x...

order  intro a b a standoff build b turn
```

| | |
| --- | --- |
| **A note** | `d5` is one step, `d5*4` is four, `d5---` is also four. `.` is a rest and takes the same suffixes. Flats are accepted (`eb5`) and folded to sharps, which the game's own token grammar has no way to spell. |
| **A bar line** | `\|` between bars is **checked** — a miscount is an error with a bar number on it, not a rhythm that silently shifts. |
| **A figure** | `bass pump 2` fills the section from its `chords` line. `pump gallop chug drive roll hold four arp arp16 offbeat stab`, each taking an octave. `roll:4` does ONE bar, which is how a voice enters partway through. |
| **A drum** | one character per step: `x` a hit, `.` silence, `-` a sustain. Spaces and `\|` are ignored, so group it however it reads. |
| **A continuation** | an indented line that does not open with a voice name is more of the line above — so an eight-bar melody is four bars to a line rather than running off the edge. |
| **Inheritance** | `section a2 from a`, then override the voices that differ. |

Anything the figures cannot say is written longhand, which is always available.
`make unsong ARGS="<id>"` opens an existing score in the notation — every
shipped track predates it, and `yaml → song → yaml` is lossless, so it is safe.

## The format it compiles to

- **`instruments`**: named patches (`wave`, `volume`, `gate`, `attackMs`,
  `detuneCents`, `vibrato`, `pan`, `echo`, `filter`, `slide`). Drums are
  instruments too: `slide: 0.25` on a triangle = kick; noise + highpass
  6500 = hat; noise + highpass 1400 = snare.
- **`patterns`**: named sections (verse/chorus/break…); each maps a voice to
  bars of 16 sixteenth-note tokens, authored as a block string one bar per line
  (`=` ties, `.` rests, `x` triggers noise voices). Short voice lines cycle
  within the pattern (write a 1–2 bar drum loop under an 8-bar lead) — their
  length must divide the pattern length. Omitted voices are silent.
- **`order`**: the arrangement — pattern names in play order; the whole list
  loops.

**Flats do not exist.** The note token is `[A-G]#?<octave>`, so E♭ is written
`D#` and B♭ is `A#`. A `Db4` fails the schema.

**WRITE TO THE LENGTH OF THE THING IT PLAYS UNDER, and that is two answers.**
A LEVEL theme is a bed under something that runs for minutes: **~2 minutes a
loop** with real section contrast — intro / verse / chorus / breakdown / build /
turnaround. A MINIGAME's score is a PIECE, not a bed — a leg of the DRIVE is
over in 40–60 s, so its loop is **~50 s** and the whole arc has to land before
the player arrives. `tests/chiptune_test.ts` enforces both through a
`SHORT_FORM` set of ids (100–145 s otherwise, 40–65 s inside it), plus at least
4 patterns and an order longer than the pattern list (so something repeats).

Getting this wrong is invisible and expensive: the road's two scores were
written to the level bound and spent 45% of their bars — break, build and turn —
on a listener who had already arrived. **Before composing anything, ask how long
the player will actually be listening**, and measure it rather than guessing
(`make drive-bench` for the road). `GAME_NOTES.md` has the short form's
arrangement shape and the three things it does differently.

### Where a track gets NAMED

A score nothing names is a score nothing plays, and each of these is a different
kind of caller:

| Who | How |
| --- | --- |
| A level | `music: <id>` on `content/levels/<id>.yaml`, played by `playLevelMusic(runLevelDef(state).music)` |
| The title screen | the reserved id `title` — `generate-music.mjs` refuses a build without it |
| A screen with no `LevelDef` | `playMusic(<id>)`, with the id owned by that screen (the drive's `ROAD_TRACK`, `DriveScreen.tsx`) |
| A mod | a `music/<id>.yaml` of its own, or a `music/<id>.opus` recording — both consulted ahead of ours by id |

A level with no `music`, or an id this build has no score for, falls back to
`DEFAULT_LEVEL_TRACK` rather than to silence.

## Composition guidance

Lean on the progressions classic game scores run on — i–VI–VII drive, i–VI–iv–V
laments, a relative-major chorus lift, a Phrygian i–♭II lurch for dread, a thin
breakdown that builds back up — but **write original melodies**. Nothing
sampled, nothing transcribed.

**Keep music well under the sound effects.** Lead ~0.03, bass ~0.055, pads
~0.009, hats ~0.011. The score plays continuously under gunfire; it is the bed,
not the event.

**The character of a track is usually two or three DECISIONS, not the tune.** A
mode that refuses to settle, one interval used as a signature, a rhythmic figure
that never stops — those are what a listener remembers and what a section can be
built out of. Write them down in the file's `description`, because that is what
the next person will check the music against.

`GAME_NOTES.md` beside this file records the arrangement shapes and per-track
decisions that have worked in THIS game; read it before starting a new score and
add to it after.

## The loop

```sh
make song FILE=content/songs/<id>.song      # compile the notation, and engrave it
make unsong ARGS="<id>"                     # the other way: a shipped score → .song
make sheet ARGS="<id>"                      # the whole score
make sheet ARGS="<id> --pattern=b"          # one section, readable
make sheet ARGS="<id> --pattern=b --bars=2 --scale=3"   # …bigger still
make audition ARGS="<id>"                   # the page you publish so it can be HEARD
make album                                  # …and EVERY score on one page, with a picker
make album ARGS="title bench_light overdue"  # …in that running order
```

1. **Write it** — `content/songs/<id>.song`, in the notation above. (An existing
   score is opened with `make unsong ARGS="<id>"` first.)
2. **Compile and engrave in one step** — `make song FILE=content/songs/<id>.song`
   writes `content/music/<id>.yaml` and draws the sheet. A miscounted bar is an
   error with a bar number on it; a typo'd note fails at the SCHEMA, before it
   can reach a run. **Read the `N bars ≈ Ns` it prints** and check it against
   the bound this score's ROLE has (100–145 s for a level, 40–65 s for a
   minigame — see above): the section lengths that feel right put a fast score
   under the floor and a slow one over the ceiling. Settle it by adding or
   removing an entry from `order` — the tempo is a decision about the piece, the
   order is arithmetic.
3. **LOOK AT THE SHEET, section by section.** A whole track engraves thousands
   of pixels tall and is illegible once it has been scaled down to be read — so
   read one `--pattern` at a time. Judge it against the first rubric below.
4. **READ THE ANALYSER ROW** under each system: the same bars as energy and
   loudness. This is the only view of the MIX there is, and the mix is half of
   whether a chip track works. Second rubric below.
5. **HEAR IT — and let the USER hear it.** `make audition ARGS="<id>"` builds a
   self-contained page that plays the track on the game's own synth, with
   per-voice mutes, a WAV render and the engraved score under it. **Publish that
   page as an artifact and hand over the link.** This is the whole point of the
   step: the sheet and the analyser are the only things YOU can judge a score
   with, and this page is the only way anybody else can judge it at all — a
   review that never made a sound is not a review. Do it on the first round that
   is worth listening to and on the last one, not only at the end.

   **A pass that touched MORE THAN ONE score publishes `make album` instead**,
   naming the ids in the order they should be listened to. Whether two levels
   sound like two PLACES rather than two tempos is the question a single track's
   page cannot answer, because answering it means switching between them inside
   a few seconds — and it is the question a soundtrack lives or dies on. The
   album page weighs ~1.3 MB a track with its sheets embedded, so ten tracks is
   ~13 MB and still inside an artifact's limit; `--no-sheet` drops it to ~120 KB
   if the sheets are not wanted.
6. **Fix the worst ONE thing** and go round again. Not the whole list — a score
   changed in six places at once cannot be judged, because you no longer know
   which change did what.
7. **Then the gates.** `npm run levels`, then `npx vitest run
   tests/chiptune_test.ts tests/content/music_roundtrip_test.ts
   tests/content/song_format_test.ts`. The round-trip guard prints exactly which
   bars moved, and an intentional change is accepted with `node
   scripts/update-music-snapshot.mjs` — never by editing a fixture. A new track
   is also added to the `SCORES` list in `tests/chiptune_test.ts`.

**The artifact is part of the deliverable, not a courtesy.** A soundtrack PR
whose reviewer would have to check out the branch and run a dev server to hear
the thing being reviewed is a PR nobody hears. Put the audition link in the PR
body.

### What to look for on the sheet

| Fault | What it looks like |
| --- | --- |
| **A melody that wobbles instead of moving** | The lead's noteheads hover in one two-space band for the whole section. Range is not contour: a line can span an octave and a half and still not GO anywhere. |
| **A line that never breathes** | An unbroken hedge of beams, bar to bar, with no rest anywhere. A phrase needs somewhere to end or it cannot be a hook. Check the section that is meant to be the tune. |
| **Two voices in one octave** | Two staves whose noteheads sit at the same height, or two bass-clef staves moving in lockstep. They will mask each other whatever the mix does; the names under the staff give you the octave to confirm it. |
| **A section that is not a section** | Two patterns whose pages look the same. If `a` and `a2` are one passing note apart, a seventy-six-bar loop has nine bars of material in it. |
| **A drum kit nobody wrote** | The kit's one- or two-bar loop repeating identically under everything, all track. Fine as a bed; fatal if it is the only rhythm. |
| **A cadence that never lands** | Every section ending on the same dominant with the same fill. Look at the last bar of each pattern side by side. |

### What to look for on the analyser row

| Fault | What it looks like |
| --- | --- |
| **A pedal that is really a pluck** | The loudness curve sawtooths — up at the bar line, dead before the next. See the rule below: nothing here sustains. |
| **Voices eating each other** | Two bright bands at the same height at the same time. A sawtooth's harmonics reach a long way up — a saw bass at D2 puts real energy where the lead is singing; a triangle at the same pitch does not. |
| **A loop with no arc** | The whole-loop strip at the top is a flat slab. A break should be visibly thinner and a build visibly climbing; if they are not, they are not doing their job whatever the note count says. |
| **A hole in the spectrum** | A band empty for a whole section — usually the mids, because every voice is either a bass or a hat. |
| **Something inaudible** | A voice you can see on the staff and cannot find in the strip. Its `volume`, its `gate` or its filter has buried it. |

The strip is **computed from the patch parameters, not recorded** — exact about
waveform harmonics, envelopes and filters, blind to the master limiter, the echo
bus and pan. Read it for BALANCE, never as a level meter.

## When a track is allowed to START

A browser will not make a sound before the player has touched something, and the
title theme is the one piece of music that wants to begin before they have
touched anything. `armTitleMusic` (`pwa/src/game/music/index.ts`) claims the
arrangement immediately, starts it with no gesture where the platform permits
that, and otherwise arms the first touch or key ANYWHERE — so the theme belongs
to the menu opening rather than to the first row pressed. The rule underneath it
(`synth.unlock` / `synth.autostart`, and why a context built off-gesture on iOS
is dead) is shared with the sound effects and is written down once, in the
**`sound-effects`** skill.

## NOTHING IN THIS SEQUENCER SUSTAINS

The single most important fact about writing for this instrument, and the one
the format hides completely.

`tone()` ramps to its peak and then decays **exponentially to a ten-thousandth
of it across the note's whole gated length**. A note is `steps × gate` long. So
a whole note at 162 bpm is a 1.3-second decay that is inaudible two-thirds of
the way through the bar — **a whole note is a pluck, not a pad.** A held pedal
written as sixteen ties is a bass drum with a long tail.

If a bed is wanted, **re-strike it**: a gallop, an eighth-note ostinato, a
tremolo. `ChiptuneInstrument` has no `holdMs` — the SFX voice grew one for
exactly this reason and the music voice did not — so there is no way to author a
sustain, only ways to imply one. The analyser row draws the difference
immediately: a real bed is a flat loudness curve, a decay is a sawtooth.

## The pipeline, and what it refuses

`content/music/*.yaml` → `scripts/generate-music.mjs` → one module per track in
`pwa/src/generated/music/` (gitignored; **never edit or commit it**). Each track
gets its own `import()` so the browser fetches only the score it is about to
play.

Four things fail the build rather than the run, and all four used to fail on a
player's machine three minutes into a level:

- a note token that is not a note (`x` under a pitched voice, a flat, `H4`)
- a voice whose step count is not whole bars, or does not divide its pattern
- an `order` naming a pattern nobody wrote
- a missing `title` track — the id the menu asks for by name

The guards: `tests/chiptune_test.ts` (every shipped score plays through a full
loop, at the right length, with enough sections — and the list of scores is held
against the generated index, so a new track cannot be added without joining it),
`tests/content/music_roundtrip_test.ts` (the compiled score still matches its
YAML), and `tests/content/notation_test.ts` (every score engraves, and every
voice's durations tile its pattern exactly).

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle: recording what the pass learned (with a `scope` and
`concepts`), fixing anything here that turned out WRONG, deleting what went
stale, merging duplicates, and promoting anything true in 100% of runs into this
file.

```sh
node scripts/skill-lessons.mjs soundtrack --list
```

Per-track decisions and arrangement shapes go in
[`GAME_NOTES.md`](./GAME_NOTES.md); reusable craft goes in `.lessons/`.
