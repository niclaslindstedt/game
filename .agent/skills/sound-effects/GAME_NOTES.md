# sound-effects — game-specific notes

Track arrangements and tunings for **this** game's soundtrack. The synth
vocabulary, mixing rules, and reusable recipes live in `SKILL.md`; this file
records what is specific to these scores (`website/src/game/music/*`). A
sequel resets this file and rewrites its scores.

## Arrangement shapes that worked

- **title (2026-07):** intro / verse / chorus / verse / break / chorus /
  outro at 90 bpm (48 bars ≈ 128 s).
- **level (2026-07):** intro / A / A2 / B / A / break / build / B / A2 /
  turn at 150 bpm (76 bars ≈ 122 s).

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
