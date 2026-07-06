---
name: sound-effects
description: "Use when adding or tuning game audio. All SFX are synthesized in code (WebAudio, zero audio files); this skill covers the sound design vocabulary, the event → sound mapping, and how to audition and iterate."
---

# Designing Sound Effects

The game ships **no audio files**. Every sound is synthesized at runtime
from a handful of parameters — which keeps the PWA tiny and offline-capable,
and makes sounds as diffable and tweakable as any other code.

## Files

| File | Role |
| --- | --- |
| `website/src/lib/synth.ts` | The instrument: `tone()` (oscillator + pitch glide + decay) and `noise()` (fading white noise). Generic — extraction candidate. |
| `website/src/game/sfx.ts` | The sound design: one `case` per `GameEvent`, mapping events to synth calls. This is where you work. |

The engine emits `GameEvent`s from `step()`; `playEventSounds` translates
them. A new sound therefore starts as an engine event (see the
`engine-system` skill) — the app never invents audio moments the simulation
didn't report.

## Sound design vocabulary

A useful starting grammar (tweak from here, don't treat as law):

- **Player actions** are short and bright: square/triangle, high start
  frequency, fast downward glide, ≤100 ms (`shot`: 880→320 Hz square).
- **Damage to enemies** sits mid-register and thuds: 160–320 Hz.
- **Damage to the player** must cut through: sawtooth, low (90–180 Hz),
  longer (~180 ms), the loudest volume in the mix.
- **Kills** get weight from a long saw drop (320→60 Hz) + a noise burst.
- **Rewards** (pickup, heal) are consonant sine steps upward (660→990 Hz).
- **Jingles** (victory/defeat) are 3–4 scheduled notes via `delayMs`:
  rising major-ish for victory, falling for defeat.

Mixing rules:

- Volumes live in 0.03–0.09; playerHurt is the ceiling. If everything is
  loud, nothing is.
- Frequent sounds (shots fire every 380 ms!) must be the quietest and
  shortest; rare sounds may be big.
- Keep every effect's full description inline in `sfx.ts` — a sound is one
  readable `synth.tone({...})` call, not a helper three files away.

## Iteration cycle

1. Edit the mapping in `sfx.ts` (or add the event `case` for a new system).
2. Audition in a real browser — headless screenshots can't judge audio:
   `make website-dev`, play, trigger the event repeatedly (the `playtest`
   skill's rush strategy triggers combat sounds densely).
3. Check the mix, not the sound in isolation: fire + hit + kill overlap
   constantly in play. If a sound smears the mix, shorten it before
   quieting it.
4. Loop until each event is identifiable with eyes closed.

Audio can only start after a user gesture: `synth.unlock()` is called on
run start and every canvas pointerdown — keep that invariant if you touch
`GameScreen.tsx`.

## Skill self-improvement

Record parameter recipes that worked ("UI confirm = sine 660+990 stepped
90 ms apart") so the palette of proven sounds grows over time.

- **NES palette rule (2026-07):** the SFX set deliberately sticks to
  square (actions/damage), triangle (rewards/jingles), and noise
  (percussion/impacts) — no sines or saws, they read as "not 8-bit". UI
  recipes: cursor move = square 880 Hz 45 ms; confirm = square 660→990
  stepped 60 ms; back = the inverse; equip = 35 ms noise + square 784.
- **Music (2026-07):** background tunes are note data in
  `website/src/game/music.ts` played by the `@ui/lib/chiptune.ts`
  sequencer through `audio.ts`'s music-volume synth view. Compose in bars
  of 16 sixteenth-note tokens (`"A2 . = G2 …"`); `tests/chiptune_test.ts`
  smoke-plays every shipped theme, so a typo'd note fails CI. Keep music
  volumes well under SFX (lead ~0.03, bass ~0.05, hats ~0.012).
