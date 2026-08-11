---
title: A line that says the hero's NAME is a token, and every text overlay has to resolve it
date: 2026-08-06
scope: engine/game/hero-name.ts
concepts: [hero-name, tokens, overlays]
---

The hero is called whatever the player named him, and a line that says it
writes `{HERO}` (`engine/game/hero-name.ts`). Three things about that are easy to
get wrong on a story pass:

**The token is resolved at the DRAW, not in the data.** A name changes no tick,
so it is deliberately not `RunParams`, not state, and not on the wire — each
viewer resolves it against the hero THEY are playing, which is the only answer
that works in a party. `dialogueContent(dialogue, heroName)` does it for the
in-world box; the intro/outro monologue, the cutscene box, the conversation box
and the errand box each call `withHeroName`/`withHeroNameLines` themselves. **A
new overlay that prints authored text and forgets is not a silent bug** — the
pixel font has no brace glyph, so it prints `?HERO?` — but it is still a bug
you only find by looking at the screen.

**The published library has no player to ask.** It resolves the token once, on
the finished HTML, in `writePage` (`pwa/scripts/library/build.mjs`) rather than
in each of the four renderers that can meet it. Anything that writes a page by
another route would leak the braces onto a public page; grep
`dist/library/` for `{HERO}` after a story pass that adds one.

**Spending the token is a STORY decision with a test attached.** A name lands
because almost nobody uses it: the campaign spends it on the four people who
genuinely know the man plus one self-address, and
`tests/content/hero_name_test.ts` asserts that exact list by def-path. Giving a
fifth character his name therefore fails a content test on purpose — take the
failure as the question it is ("does this person really know him?") rather than
as a list to update reflexively.
