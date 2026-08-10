# sound-effects — game-specific notes

Track arrangements and tunings for **this** game's soundtrack. The synth
vocabulary, mixing rules, and reusable recipes live in `SKILL.md`; this file
records what is specific to these scores (`pwa/src/game/music/*`). A
sequel resets this file and rewrites its scores.

## Arrangement shapes that worked

- **title (2026-07):** intro / verse / chorus / verse / break / chorus /
  outro at 90 bpm (48 bars ≈ 128 s).
- **level (2026-07):** intro / A / A2 / B / A / break / build / B / A2 /
  turn at 150 bpm (76 bars ≈ 122 s).
- **the road, `overdue` (2026-08):** the same ten-section shape at 162 bpm
  (76 bars ≈ 113 s), which is worth knowing: the shape takes a tempo change
  without re-planning, so a new score is a key, a tempo and new melodies.
  What makes this one DISTRESS rather than action is three choices, none of
  them the melody — a Phrygian **i–bII** lurch (Dm → Eb) that never settles,
  a two-tone SIREN wailing a minor second that is a chord tone in BOTH of
  those chords (so the emergency signal is also the harmony), and a dry
  quarter-note CLOCK tick that is in every single pattern including the
  breakdown, where it is the loudest thing left. The build is a bare
  chromatic bass climb, D–Eb–E–F–F#–G–G#–A, one bar apiece.

The break-then-build pair is what makes a 2-minute loop feel composed
instead of repeated; the outro's bar of near-silence makes the loop seam
read as a phrase, not a glitch.

## Jingle recipes

- **The ding (2026-07):** sized to the engine's 1s celebration window —
  triangle C3 root swell (950 ms, attack 40, detune 6) + delayed highpass-6200
  shimmer noise + a 5-note C-major harp run (triangle 523→1319, 55 ms apart,
  sine octaves on top) landing on a held detuned-square C-major chord at
  330 ms, capped by a 2093→3136 sine sparkle at 620 ms, echo 0.3–0.5. Reads
  as "holy light burst" while staying chip.
