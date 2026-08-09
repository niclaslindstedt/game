---
title: A floating MARK is sized and proportioned against the thing it points at, and only a real-scale screenshot tells you — the @8x preview flatters every version
date: 2026-08-09
scope: content/sprites/markers/, content/sprites/quests/
concepts: [markers, readability, judging, screenshots]
---

`board_arrow` (the "you can get in this" pointer over the hub's car) took three
grids, and the @8x preview happily endorsed all three. What separated them was
the game at 844×390 with the car actually under the arrow:

- **10 px tall was a pin, not an arrow** — the head's barbs were only outline
  thick, so it read as a house or a shield.
- **A head as wide as the sprite reads as a chevron.** The version whose head
  spanned the full 15 px looked like a downward `V` balanced on a stub; pulling
  the head in one pixel each side and one row up, and spending the pixels on a
  LONGER, WIDER stem, is what made it read as an arrow.
- **The gap under the point is the whole "does it point at that" question.** 30
  px of clear air over the car's 26-high shell read as a glyph floating in the
  sky; 24 put the point almost on the roof and the relationship became obvious.

So: judge a mark on a real screenshot with its subject in frame, not on the
sprite preview — and when it does not read, try moving mass from the head to
the stem before making the whole thing bigger.
