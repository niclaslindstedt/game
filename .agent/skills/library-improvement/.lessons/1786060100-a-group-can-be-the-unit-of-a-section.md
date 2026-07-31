---
title: "\"Every catalog entry has a page\" is a rule about coverage, not about routes"
date: 2026-07-30
---

The quality bar says the library is COMPLETE — every catalog entry reachable,
with a coverage test proving it — and it is easy to read that as "one route per
entry", because six of the eight sections happen to be built that way. Applying
it literally to the achievements catalog would have minted 244 pages whose whole
content is a name, a sprite, a one-line condition and a point value, and 149 of
those would have been `unique_excalibur` saying "FIND EXCALIBUR" one click from
the arsenal page that already describes EXCALIBUR at length. That is textbook
thin, near-duplicate content — the exact thing that makes a crawler consolidate
a set of pages and drop the rest, which the section already has a comment about
for the three monsters named THE FOUNDER.

The precedent for the other answer was already in the repo twice, and both are
worth reaching for before adding a route: a story CHAPTER is the unit of the
story section rather than a page per line, and a generated grade variant gets no
page at all because its numbers only mean something on the ancestor it came
from. So the test to apply is **how many facts does the page have that are not
already on another page** — under about half a screen, the entry belongs ON a
page rather than being one, and the coverage test asserts it is filed exactly
once rather than that it has a route.

Two things follow from picking a group as the unit, and both are what make the
section worth generating rather than a dump of the in-game shelf:

- The page has room for the material that is ABOUT the set rather than about a
  member — here, what each effort tier pays, how the catalog spreads across
  them, and which badges reach a Game Center or Steam profile. None of that is
  visible from inside the game, and none of it would have fitted on a per-entry
  page.
- Repetition inside the group becomes visible, and repetition is a presentation
  decision. A run of entries that is ONE condition with a different subject each
  time is a rack of links, not 149 rows of the same sentence — and that can be
  DERIVED (same one-shot shape, same wording once each subject's own name is
  taken out) rather than declared, so nobody has to keep a list of which
  families are generated.
