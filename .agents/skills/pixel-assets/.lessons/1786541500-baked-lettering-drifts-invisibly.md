---
title: Lettering baked into a grid drifts from its own description, and no textual search can ever find it
date: 2026-08-12
scope: content/sprites/
concepts: [lettering, signage, naming, drift, review, fonts]
---

`boot_hill_gate` spelled EASTWORLD across its signboard for the whole life of
the venue while its own `description`, its `subject.features`, the level name
and the spoken intro line all said BOOT HILL. Nothing caught it: the word was
drawn glyph by glyph into the `grid`, so `grep -ri eastworld` over the entire
tree returned nothing, and `git log -S EASTWORLD` had no history to show
either. Every rename sweep `docs/naming.md` describes was textual, and a word
made of pixels is invisible to all of them.

Two things follow for any sprite carrying a word — a sign, a banner, a
billboard, a screen, a shop front:

- **The `description`/`subject` is the ONLY textual handle on it, and it is
  exactly the field that drifts** — here it had been corrected to the new name
  while the pixels kept the old one. So it is not evidence. Read
  `pwa/assets-preview/<name>@8x.png` and LOOK at the word. `sprite-author
  verify` passes happily on a sign spelling the wrong thing: its coherence
  check compares prose to prose, never prose to glyphs.
- **Do not hand-draw the glyphs.** The house 3×5 pixel font already exists as
  `GLYPHS` in `scripts/asset-tools/font.mjs` (`B`, `H`, `I`, `L`, … each five
  rows of a 3-wide string). Generate the replacement rows from it rather than
  eyeballing them — the original's hand-drawn `E` and `R` had drifted off the
  font's own shapes. The board's geometry is a 1-px pad, then 3-wide glyphs
  separated by one background column, so a 9-slot board takes "BOOT HILL"
  (space included) in exactly the footprint the old 9-letter word used.
