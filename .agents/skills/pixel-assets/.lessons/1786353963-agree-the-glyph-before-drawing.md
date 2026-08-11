---
title: Agree WHICH object each glyph in a set depicts before drawing any of them
date: 2026-08-10
scope: content/sprites/icons/
concepts: [icons, readability, judging, unintended-reading]
---

Drawing a SET of icons (a difficulty ladder, a class row, a rarity ladder) is two
decisions, and only the second is pixel work: what each mark depicts, then
whether the pixels say it. Getting the first one wrong is invisible in the @8x
preview — the sprite is a perfectly good picture of the wrong idea — and it is
only caught by a human reading the list. A pass that drew five glyphs on its own
taste had three of the five rejected on sight ("the rest I actually don't
understand") and redrew them; asking first would have cost one question.

So: propose the mapping as a list (rung → object) and get it confirmed, THEN
draw. Two things that came out of that exchange and are worth carrying:

- A set of small icons coheres by STYLE, not by motif — the shipped `icon_menu_*`
  row is a cloud, an arrow, a plus, a power symbol. Do not contort the set into
  one shared subject; pick the most legible object per row.
- At 12×12 an organic subject collapses toward its nearest neighbour (a feather
  reads as a leaf, a rank of bars as a six-pack). Hard-edged manufactured objects
  — a shield, crossed blades, a skull, a mushroom cloud — survive the size. If a
  rung wants something organic, expect it to read as a category ("something soft")
  rather than as the specific thing.
