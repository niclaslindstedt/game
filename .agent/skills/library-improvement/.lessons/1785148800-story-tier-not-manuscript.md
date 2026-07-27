---
title: Publish the tier that OWNS the words, not the tier that transcribes them
date: 2026-07-27
---

The plan said the story pages would be built from `docs/story.md` **and** the
manuscript. Following that literally would have broken the library's one rule.

The story lives in three tiers (CLAUDE.md, "Story & dialogue"): `story.md` (the
gist, in prose), `manuscript.md` (every line, verbatim), and the game data. Only
the first tier OWNS anything the pages need — the narrative prose exists nowhere
else. The manuscript is a **transcription** of lines that already ship in
`CUTSCENE_DEFS`, a level's `intro`/`outro`, an enemy's `dialogue`/`lastWords`,
`THOUGHT_DEFS` and `STORY_ITEM_DEFS`. Quoting a transcription instead of the
thing transcribed hands the library exactly what it exists not to have: a second
copy, free to drift, on the surface where drift is least visible — nobody diffs
a page of dialogue against the game the way they would a damage figure.

So the rule generalises past numbers: **for every fact on a page, find the tier
that owns it, and read that one.** Prose from the doc, lines from the catalogs.
The manuscript keeps its authority through the TEST, the same way the ladder
does.

Two things fell out of it that are worth stealing for any doc-fed page:

- **Parse the document structurally, not by a list of headings.** `## Level N —
  NAME` finds the venue by NAME; `## Travel — … (cutscene)` attaches to the
  chapter it leads into. That makes the two tiers check each other on every
  build: a section nothing can place, a venue written about that no longer
  ships, a venue that ships that nobody wrote about, and — the sharp one — a
  chapter whose travel scenes disagree with the level's own `prelude` chain all
  fail the build. A sixth level added to the campaign gets its chapter for free.
- **Support a tiny markdown subset and THROW on the rest.** Paragraphs, bold,
  italics. A list or a table appearing in a section it cannot render must stop
  the build, because the alternative is literal asterisks on a live page that
  nobody will look at again.

Two smaller things worth remembering:

- **A page that is entirely covered needs ONE switch.** Every other section
  covers a paragraph inside a page of visible numbers; a story chapter is covers
  all the way down, and seven clicks to read one chapter is a toll for nothing.
  One checkbox plus the general sibling combinator (`:checked ~ * .reveal-body`)
  lifts them all — still CSS over real markup, so nothing changes for a crawler.
- **A display name is not a key.** ELON MOSQUE is three separate monsters, one
  per venue he is cornered in, so auto-linking a name in prose picked one at
  random — and on chapter one it picked the Eastworld copy, which spoils where
  he ends up. Build the link dictionary per page with the page's OWN cast first,
  then everything else in first-sighting order.
