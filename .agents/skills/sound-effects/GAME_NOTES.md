# sound-effects — game-specific notes

Sound-design decisions specific to **this** game's effects. The synth
vocabulary, mixing rules and reusable recipes live in `SKILL.md`; a sequel
resets this file.

**The SCORES are not here.** Music is the `soundtrack` skill, and its
arrangement shapes and per-track decisions are in
`.agents/skills/soundtrack/GAME_NOTES.md`.

## Jingle recipes

- **The ding (2026-07):** sized to the engine's 1s celebration window —
  triangle C3 root swell (950 ms, attack 40, detune 6) + delayed highpass-6200
  shimmer noise + a 5-note C-major harp run (triangle 523→1319, 55 ms apart,
  sine octaves on top) landing on a held detuned-square C-major chord at
  330 ms, capped by a 2093→3136 sine sparkle at 620 ms, echo 0.3–0.5. Reads
  as "holy light burst" while staying chip.
