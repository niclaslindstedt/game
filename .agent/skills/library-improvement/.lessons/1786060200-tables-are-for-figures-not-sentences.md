---
title: The library's table helper is for figures — a column of sentences has to be a list
date: 2026-07-30
---

`table()` in `html.mjs` is the obvious container for any row-shaped data, and
reaching for it with a text column is a phone bug you will not see on a desktop.
The stylesheet sets `th, td { white-space: nowrap }`, deliberately, because
every existing table's cells are numbers and a wrapped damage band reads as two
numbers. Put a full sentence in a cell and it cannot fold: the table grows to
the width of its longest sentence and `.scroller` turns the reference 844×390
viewport into a horizontal scroll several screens wide, which is a straight fail
of the phone rule.

The shape that works is the one the GAME already uses for the same content — a
list whose row is a fixed sprite column beside a stacked block: the name in the
pixel font, the sentence in the prose font (wrapping), and the figures in a
small pixel-font meta line under it. It costs about twenty lines of CSS, it
matches the in-game shelf row it is documenting, and it collapses correctly at
every width without a media query.

While you are there, cut the meta line down by what the row already says. Two
cheap derivations removed a column each: a goal is not worth printing when the
condition already spells it out ("KILL 1,000 MOBS" beside "GOAL 1,000"), and a
per-row flag is not worth printing when the page's opening lines already state
the norm for the whole group — mark the exceptions instead. Same rule one level
up: a value identical down every row of a rack belongs in the sentence above it,
not stamped on all 149.
