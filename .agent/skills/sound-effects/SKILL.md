---
name: sound-effects
description: "Use when adding or tuning game audio. All SFX and music are synthesized in code (WebAudio, zero audio files); this skill covers the 16-bit sound design vocabulary, the event → sound mapping, the tracker-style music format, and how to audition and iterate."
---

# Designing Sound Effects and Music

The game ships **no audio files**. Every sound is synthesized at runtime
from a handful of parameters — which keeps the PWA tiny and offline-capable,
and makes sounds as diffable and tweakable as any other code. The target
aesthetic is **16-bit console** (SNES era): layered detuned oscillators,
filtered noise percussion, attack envelopes on soft sounds, and a shared
echo bus for the big moments — richer than a bare NES blip, still
unmistakably chip.

## Files

| File | Role |
| --- | --- |
| `website/src/lib/synth.ts` | The instrument: `tone()` (oscillator + glide + attack/decay + detune pair + vibrato + filter + pan + echo send) and `noise()` (fading white noise + filter + pan + echo). One shared SNES-style echo bus per context. Generic — extraction candidate. |
| `website/src/lib/chiptune.ts` | The music sequencer: a track = named **instruments** (patches) + named **patterns** (voice → note tokens) + an **order** arrangement list, scheduled lookahead-style on the synth. Generic — extraction candidate. |
| `website/src/game/sfx/` | The sound design, organized by domain: `ui.ts` (menus), `combat.ts`, `world.ts` (movement/doors/dialogue), `pickups.ts`, `jingles.ts`, dispatched from `index.ts`. This is where SFX work happens. |
| `website/src/game/music/` | The soundtrack: one score file per track (`title.ts`, `level.ts`) holding **all** of that track's instruments and notes; `index.ts` owns the single player and the play/stop API. |

The engine emits `GameEvent`s from `step()`; `playEventSounds` translates
them. A new sound therefore starts as an engine event (see the
`engine-system` skill) — the app never invents audio moments the simulation
didn't report.

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

Mixing rules:

- Volumes live in 0.03–0.09; playerHurt is the ceiling. If everything is
  loud, nothing is. Gloss layers (sine octaves, shimmer) sit at 0.015–0.03.
- Frequent sounds (shots fire every 380 ms!) must be the quietest and
  shortest; rare sounds may be big.
- Keep every effect's full description inline in its domain file under
  `sfx/` — a sound is one readable `synth.tone({...})` call (or a short
  stack of layered ones), not a helper three files away.

## Music format

A track is MIDI-like data for `@ui/lib/chiptune.ts`:

- **`instruments`**: named patches (`wave`, `volume`, `gate`, `attackMs`,
  `detuneCents`, `vibrato`, `pan`, `echo`, `filter`, `slide`). Drums are
  instruments too: `slide: 0.25` on a triangle = kick; noise + highpass
  6500 = hat; noise + highpass 1400 = snare.
- **`patterns`**: named sections (verse/chorus/break…); each maps a voice
  to bars of 16 sixteenth-note tokens (`"A2 . = G2 …"`, `=` ties, `.`
  rests, `x` triggers noise voices). Short voice lines cycle within the
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

## Iteration cycle

1. Edit the mapping in the right `sfx/` domain file (or add the event
   `case` for a new system), or the score file under `music/`.
2. `npx vitest run tests/chiptune_test.ts` after music edits — a typo'd
   note or a mis-sized pattern fails there, not mid-game.
3. Audition in a real browser — headless screenshots can't judge audio:
   `make website-dev`, play, trigger the event repeatedly (the `playtest`
   skill's rush strategy triggers combat sounds densely).
4. Check the mix, not the sound in isolation: fire + hit + kill overlap
   constantly in play, over the level theme. If a sound smears the mix,
   shorten it before quieting it.
5. Loop until each event is identifiable with eyes closed.

Audio can only start after a user gesture: `synth.unlock()` is called on
run start and every canvas pointerdown — keep that invariant if you touch
`GameScreen.tsx`.

## Skill self-improvement

Record parameter recipes that worked ("UI confirm = square 660+990 stepped
60 ms apart, detune 5, echo 0.15") as lesson fragments —
`.lessons/$(date +%s)-short-slug.md` with `title:`/`date:` front matter
(format in [`../LESSONS.md`](../LESSONS.md)) — so the palette of proven
sounds grows over time without parallel sessions conflicting on this file.
Read the palette back before designing a sound:

```sh
node scripts/skill-lessons.mjs sound-effects
```

- **Arrangement shapes** — this game's proven title/level track structures
  live in [`GAME_NOTES.md`](./GAME_NOTES.md); record new score-specific
  arrangements there, and keep reusable synth/mixing recipes in `.lessons/`.

When the printer nudges (more than 15 fragments), run the consolidation pass from
`../LESSONS.md`: merge near-duplicate recipes, delete stale ones, and
promote what every session relies on into the sound vocabulary above.
