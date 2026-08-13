---
title: Two pad voices struck IN TURN are heard as a melody, not a wash — and on this synth the stagger buys no smoothness to pay for it
date: 2026-08-13
scope: content/songs/, content/music/
concepts: [arrangement, composition, review, tracker, mix]
---

Nothing here sustains, so a bed is re-struck — but re-striking two voices
ALTERNATELY, each holding its own chord tone, does not make a wash. It makes a
tune. MOONLIGHT VIGIL had padHi on beats 1 and 3 against padLo on beat 2, which
is three isolated attacks at two pitches, once per bar, for the whole track: the
player who reported it heard "up down up, up down up" and could not stop hearing
it. Each voice was static on the page — the figure exists only in the composite,
so no single staff shows it.

Check it by flattening the section's onsets in time order and reading the TOP
sounding pitch at each one (a ~20-line script over `cookTrack` from
`scripts/music-data/load-yaml.mjs`). If that pitch moves between attacks, the
accompaniment has a melody in it. The fix, if the pad stays, is that the lower
voice is never struck ALONE — padHi in quarters, padLo in halves underneath, so
every attack has the same tone on top.

And the smoothness the stagger is supposed to buy is worth measuring before
paying for it: `tone()` decays exponentially to 1e-4 across the note, so a note
is within 12 dB of its peak for only ~15% of its length. Modelling the composite
envelope showed the staggered spelling held the bed up 26% of the bar and the
lockstep one 25% — a rounding error, for an audible melody.

Two review lessons around it. The complaint named "the second sound that is
heard", and ranking the voices by A-weighted power per section (harmonic series
× envelope integral × A-weighting) found it in one pass, where reading the YAML
had produced three wrong guesses. And when a fault is a layer's very existence,
ASK before re-spelling it: the answer here was to delete both voices outright,
because the gap suits the piece better than any pad would.
