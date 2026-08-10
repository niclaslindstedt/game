# soundtrack — game-specific notes

Arrangement shapes and per-track decisions for **this** game's scores. The
format, the composition guidance and the review loop live in `SKILL.md`; this
file is what has actually worked here. A sequel resets it and writes new ones.

## Arrangement shapes that worked

- **title (2026-07):** intro / verse / chorus / verse / break / chorus /
  outro at 90 bpm (48 bars ≈ 128 s).
- **level (2026-07):** intro / A / A2 / B / A / break / build / B / A2 /
  turn at 150 bpm (76 bars ≈ 122 s).
- **the road, `overdue` (2026-08):** the same ten-section shape at 162 bpm
  (76 bars ≈ 113 s), which is worth knowing: the shape takes a tempo change
  without re-planning, so a new score is a key, a tempo and new melodies.

The break-then-build pair is what makes a 2-minute loop feel composed
instead of repeated; the outro's bar of near-silence makes the loop seam
read as a phrase, not a glitch.

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

## Known faults in the shipped catalogue

Found by engraving the scores (`make sheet`) the first time that was possible,
and left standing rather than quietly "fixed" — they are judgements somebody
should make deliberately:

- **`hq_lockdown` A never breathes.** 48 onsets over 8 bars, largest gap one
  beat. It reads as a solid hedge and cannot land a hook.
- **`hq_lockdown`'s `riff` sits inside its `lead`.** G4–C♯5 against D4–F5 —
  the two masking voices are the two carrying the tune.
- **`overdue`'s `pulse` and `bass` overlap by ten semitones** in every section.
  Deliberate thickening, but it is why the low end is busy.
