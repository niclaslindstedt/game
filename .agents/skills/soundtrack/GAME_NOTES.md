# soundtrack — game-specific notes

Arrangement shapes and per-track decisions for **this** game's scores. The
format, the composition guidance and the review loop live in `SKILL.md`; this
file is what has actually worked here. A sequel resets it and writes new ones.

## Arrangement shapes that worked

- **title (2026-07):** intro / verse / chorus / verse / break / chorus /
  outro at 90 bpm (48 bars ≈ 128 s).
- **level (2026-07):** intro / A / A2 / B / A / break / build / B / A2 /
  turn at 150 bpm (76 bars ≈ 122 s).
- **the road (2026-08, REPLACED):** `overdue` first ran the same ten-section
  shape at 162 bpm (76 bars ≈ 113 s). Worth knowing that the shape takes a
  tempo change without re-planning — a new score is a key, a tempo and new
  melodies — but see the short form below for why it is the wrong shape here.

The break-then-build pair is what makes a 2-minute loop feel composed
instead of repeated; the outro's bar of near-silence makes the loop seam
read as a phrase, not a glitch.

## THE SHORT FORM — a score for a MINIGAME, not for a level

**A minigame is not a level, and a score written to the wrong one wastes half
of itself.** A leg of the DRIVE is over in 40–60 s for a competent driver
(`make drive-bench`'s cautious auto-driver is the slow end at ~110 s). Held to
the level bound, the road's two scores spent their whole back half — break,
build, turn — on a listener who had already arrived: 45% of the writing, never
heard once.

Both are now **36 bars** (`overdue` 53 s at 162, `hour_behind` 49 s at 176),
and `tests/chiptune_test.ts` holds them to 40–65 s instead of 100–145 s
through a `SHORT_FORM` set. A minigame's score goes in that set; a level's
never does.

The shape that came out of it, and it generalizes to any short-form score:

    intro(4)  A(8)  hinge(4)  B(8)  hinge(4)  turn(8)

- **THE BUILD BECOMES A HINGE.** Eight bars of climb once a loop is a fifth
  of the piece spent going up. Four bars, twice as steep, played TWICE —
  once into the chorus and once into the turn — is a gear change rather than
  a destination, and it gives a 36-bar loop two peaks instead of one.
- **THE INTRO DOES THE BREAKDOWN'S JOB.** There is no room to go thin in the
  middle of fifty seconds, so the thin moment is bar 1 — which is also the
  bar the title card sits on. `overdue` opens on the clock alone,
  `hour_behind` on the ping alone: exactly what each breakdown was for.
- **THE SIGNATURE ARRIVES EARLY.** Written for a listener who gets ONE pass:
  `overdue`'s siren enters in bar 5 of A rather than waiting for a
  restatement the arrangement no longer has.
- **A GRADIENT BEATS A SECTION.** `hour_behind`'s decision is a missing
  reply; the short form makes the hole CLOSE as the piece runs (two bars in
  A, one in B, none in the turn), which was buried in the ten-section
  version and is the audible shape of this one.

The two legs share the skeleton and invert the hinge — `overdue`'s CLIMB goes
up chromatically in bare fifths, `hour_behind`'s SLIP accelerates a fall and
drops an octave. One road, two directions, one shape, opposite motion.

## Giving a track a CHARACTER

A score's identity is two or three decisions, not the tune. What `overdue`
(2026-08) is made of, as a worked example of the size of decision to aim for:

- **A mode that refuses to settle** — a Phrygian i–♭II lurch, Dm → E♭, up a
  semitone and back. It is the one move in the piece that never resolves.
- **One interval as a signature** — a two-tone sawtooth SIREN wailing a minor
  second (A/A♯), which is a chord tone in BOTH of those chords. The emergency
  signal and the harmony are the same thing, so it never sounds pasted on.
- **A figure that never stops** — a dry quarter-note clock tick present in every
  single pattern including the breakdown, where it is the loudest thing left.

The build is a bare chromatic bass climb (D–E♭–E–F–F♯–G–G♯–A, one bar apiece)
under an accelerating snare roll, which is the cheapest way to make eight bars
feel like an ascent.

## The catalogue's decisions, one line each (2026-08)

The whole soundtrack was rewritten in one pass with the rule above applied
deliberately: **every track gets two or three decisions and NO TWO TRACKS SHARE
ONE.** That constraint is the reason the set sounds like nine places rather than
nine tempos, and it is the first thing to check when adding a tenth.

| Track | The decisions |
| --- | --- |
| `title` MOONLIGHT VIGIL | NO PAD AT ALL — the middle is empty and the space is the decision · the tune sits an octave clear of the arp it was buried in · the bell carries the harmony wherever the arpeggios do not. |
| `bench_light` BENCH LIGHT | A borrowed minor-iv once a phrase, never put back · the phrase is ONE BAR SHORT (bar 8 is empty) · no kit, only a wooden knock twice in four bars. |
| `hq_lockdown` NIGHT SHIFT | Lobby muzak played straight · the floor SINKS — bars 5–7 are bars 1–3 a semitone down · a photocopier every 3 sixteenths against a bar of 16. |
| `overdue` OVERDUE | Phrygian i–♭II lurch · a minor-second siren that is a chord tone in both chords · a clock in every pattern. SHORT FORM (2026-08): 36 bars, the build re-cut as a four-bar hinge played twice. |
| `hour_behind` AN HOUR BEHIND | The REPLY IS MISSING — two bars of tune, two bars of hole · the clock deleted, a sliding sonar ping in its place · a fall that never cadences and ACCELERATES. SHORT FORM (2026-08): 36 bars, and the hole now CLOSES across the piece. |
| `regolith_ride` QUIET SEA | One drone note, unmoving, re-coloured by everything under it · slow ground, fast surface · a hymn ending a whole tone under the drone. |
| `red_dust` THE TITHE | A sincere brochure · a tithe drum every 6 sixteenths, agreeing with the bar once every three · a chromatic fall where each cadence should be. |
| `rift_drift` NO NORTH | NO TONIC (augmented and suspended only) · two falls at different rates so one is always mid-descent · every strike at 3+3+3+3+4. |
| `long_noon` THE LONG NOON | Unchanged. Dorian sixth, bare fifths, a tremolo that never tires. |
| `perpetuity` PERPETUITY | A PASSACAGLIA — one four-bar ground bass, never transposed, never absent · gilded muzak on top that has not noticed · a lock on every downbeat. |

Two structural devices worth reusing, both cheap and both audible in one pass:
**a whole section transposed a semitone** (the building sinking) and **a drum on
a cycle that does not divide the bar** (the copier at 3, the tithe at 6). Write
those as a 4-bar grid so they restart cleanly — 64 steps divides every pattern
length in the catalogue, and a longhand line that does not divide is a build
error rather than a musical one.

## Known faults, and the two that got fixed

Found by engraving the scores (`make sheet`) the first time that was possible.
The first two below were fixed by the rewrite; the third was fixed on its own:

- ~~`hq_lockdown` A never breathes~~ — rewritten; the tune now rests every
  fourth bar and the section has a hook.
- ~~`hq_lockdown`'s `riff` sits inside its `lead`~~ — that voice is gone; the
  strip-light hum sits an octave above the bass and out of the tune.
- ~~`overdue`'s `pulse` and `bass` overlap by ten semitones~~ — the engine is
  `chug 4` now, an octave over the gallop, and the low end is legible.

Still standing, deliberately: `long_noon`'s tremolo, piano and trumpet share a
crowded mid band. Every register move that clears one pair collides another,
and the density is the point ("nothing here is played by anything that gets
tired"). Leave it unless somebody re-voices all three at once.
