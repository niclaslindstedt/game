---
name: library-improvement
description: "Use when building or improving THE LIBRARY — the generated companion site at /library/ (bestiary, arsenal, mission guide). Drives the generate → look → judge → improve loop: regenerate the pages, screenshot them at the reference viewports, evaluate every one against the quality bar (does it wear the game's own skin, is every number the engine's own, does it read like Arreat Summit rather than a database dump), fix the worst, and loop until it is genuinely good. Never judge a page from its markup — judge the screenshot."
---

# Library improvement — make the companion site worth reading

The library (`docs/architecture.md`, "/library/") is ~400 generated pages: a bestiary, an
arsenal, and a mission guide, compiled from the same content the game runs on.
Generated pages fail in a specific way — they come out *correct and lifeless*.
Every field is present, every number is right, and nobody wants to read it.

This skill is the loop that fixes that: **generate, look at it, judge it against
the bar below, improve the worst thing, look again.**

The north star is **Arreat Summit**. Be precise about why it worked, because it
was not the styling:

- It felt like it came from **inside** the game, not about it — same typeface,
  same panel dressing, same item cards the player already knew how to read. You
  arrived from the game and nothing jarred.
- It was **dense and unapologetic**. Real tables of real numbers. It respected
  that the reader came for specifics.
- It was **fast**, because it was static pages.
- It was **complete**. Every monster, every base, every rune. Gaps are what send
  a reader to somebody else's site.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs library-improvement --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

## Never judge from source

The failures this skill exists to catch are visual and only appear in pixels: a
background tile that fights the text, a card that *almost* matches the in-game
one, a stat table that wraps into soup on a phone, a spoiler panel whose blur
leaks the first line. Read the screenshot. Every judgement below is made on an
image.

## The loop

1. **Generate** — rebuild the library.
2. **Capture** — screenshot a representative set at the reference viewports.
   Always include: one minion, one boss (spoiler panels), one plain base (the
   quality table), one unique, one mission (the map panel), and every index.
3. **Judge** — walk the quality bar against each shot. Write down what is
   wrong, worst first. Be specific: "the tier glow on the unique card is
   missing" beats "cards look off".
4. **Improve** — fix the worst, in the generator or the stylesheet. Never by
   hand-editing generated output.
5. **Re-capture and compare** — confirm the fix, and that nothing else moved.
6. **Loop** until the bar passes. Then present before/after shots for sign-off
   before shipping.

## Tooling

| Piece                             | Role                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| the library generator             | Emits the pages; the only place a fix ever lands                  |
| `pwa/scripts/ui-shots.mjs`        | The existing capture harness and its viewport set — extend rather than fork |
| Read tool on the PNGs             | The evaluation itself                                             |
| `npx serve pwa/dist` or `vite preview` | Serves the built pages for capture                           |
| `node scripts/weapon-stats.mjs`, `drop-rate.mjs` | The engine's own answer, to check a page against |

Playwright is not a repo dependency: `npm install --no-save playwright`.

## The quality bar

Judge every page against all six. A page fails the bar if it fails any one.

### 1. It wears the game's skin

- Titles and headings in the game's pixel font — as real text, never an image.
- Item cards are **the in-game cards**: same `styles.css` classes, same tier
  colours, same glow. Hold a library card next to an in-game screenshot of the
  same item; any difference is a bug.
- Sprites at integer scale with `image-rendering: pixelated`. No blur, no
  fractional scaling.
- The background tile is present, themed to the section's biome, and **quiet** —
  if it competes with the text for even a second, it is too loud.

### 2. Every number is the engine's

Spot-check against the engine, not against the last render. A page showing a
weapon's dps must agree with `weapon-stats.mjs`; an enemy's nightmare hp must
agree with the engine's scaling. A number that cannot be traced to a catalog
read or an engine call is a defect even when it looks plausible — see
"Grounded in truth" in the plan.

### 3. It reads like a reference, not a dump

- The page leads with what the reader came for. A boss page opens with what it
  is and what it drops, not with a metadata table.
- Related things are linked, not just named — every enemy, item and level
  mentioned anywhere is a link.
- Prose that exists in the content (item lore, level descriptions) is *used*.
  It is the difference between a page and a row.
- No empty sections. If an enemy has no mechanics, that heading is absent, not
  present-and-blank.

### 4. Spoilers are covered, and still indexed

- Story text and mission maps sit behind the blur panel.
- The blur is CSS over real markup — **never** `display: none`, never
  JS-injected. Verify in the built HTML that the text is really there.
- Nothing leaks: check the shot for a first line legible through the blur, and
  check that `alt` text and the meta description do not give away what the
  panel hides.

### 5. It holds up on a phone

The reference viewport is 844×390 (AGENTS.md). Stat tables are the usual
casualty — they must scroll inside their own container, never make the page
scroll sideways. Judge here first; a page that fails here is broken.

### 6. It is fast and complete

- **No JavaScript.** Confirm the page needs none to render.
- The page does not load the game bundle. This is the constraint that decides
  whether these pages rank at all.
- Every catalog entry has a page, and the coverage test proves it.

## Rules

- **Fix the generator, never the output.** Generated files are rewritten on the
  next build; a hand-edit is lost work that looks like progress.
- **Share, never copy.** Reuse the game's stylesheet classes and the compiled
  catalogs. The moment the library has its own copy of a card style or a stat
  table, it starts drifting from the game and every later reader is misinformed.
- **Sample, don't sweep.** Do not screenshot 400 pages. Judge a representative
  set; a fault in the template is a fault everywhere.
- **Before/after for sign-off.** Present paired shots of the pages that changed
  and let a human agree it improved before shipping.

## The architecture it is generated by

The loop above is how to improve a page. This is what a page IS — read it before
changing the generator, because most of these rules are load-bearing and none of
them is visible from a rendered page.

**THE LIBRARY is generated, and its pages are never edited by hand.** The
reference site at `/library/` (`pwa/scripts/library/`, see
`docs/architecture.md`) is nine sections —
**bestiary** (one page per monster), **allies** (one page per companion —
who to spare to recruit it, what it brings, and what every rank of its
signature power comes to), **arsenal** (one per named relic and one
per base item; a generated grade variant has no page of its own, it is
described on the ancestor it was generated from), **talents** (one per passive
talent, plus the three trees and the point economy on the index), **powers**
(one per powerup, grouped by the venue that introduces it), **mission guide**
(one per venue), **errands** (one per quest and one per quest giver, grouped
by the venue they stand on), **achievements** (one page per CATEGORY of badge
— the one section whose unit is a GROUP rather than an entry, because a badge
is four facts and a sprite and 244 pages of that is thin content beside the
arsenal page each relic trophy already points at) and **story** (one chapter
per mission) —
cross-linked so a
monster reaches what it drops, an item reaches
what pays it out, a power reaches the venues whose pools carry it, a
conjuration talent reaches the pickup that puts the same thing on the field, an
errand reaches the breed it sends the hero at and the person who asked, a badge
reaches the relic, mission or ally it is for (off `AchievementDef.subject`,
which the badge catalog states so the library never recovers it by pulling an
id apart), a
mission reaches all of them, and a chapter reaches the rest. It is compiled from the compiled
catalogs plus LIVE ENGINE CALLS for every derived number — the same
`scripts/game-alias-loader.mjs` seam `weapon-budget.mjs` and `drop-rate.mjs`
use. **No gameplay number is ever typed into the generator**; a fact that
can't be reached by reading a catalog or calling the engine is a finding, not
a licence to hardcode. And the question is never "what does the catalog say"
but "what would the game SHOW": a weapon's authored `damage` is halved for
every LOOTED weapon before a player sees it, so the arsenal quotes the item
card by calling the card's own functions against a REFERENCE HERO (a real
`createGame` at level 1, who has spent nothing, so the wielder term is 1).
The TALENTS section is the same discipline one step further: a rank's figures
come back from the accessor that owns the rule with the talent trained
(`withTalent`), never from the authored `…PerRank` slope, because the slope
says 80% at rank 5 where the talent's own ceiling holds a real hero at 75%.
Change a page by changing a generator — and when a catalog gains a field,
DECLARE it in the matching coverage map (`ENEMY_FIELDS`, `WEAPON_FIELDS`,
`GEAR_FIELDS`, `UNIQUE_FIELDS`, `LEVEL_FIELDS`, `POWER_FIELDS`,
`TALENT_FIELDS`, `COMPANION_FIELDS`, `STORY_ITEM_FIELDS`,
`THOUGHT_FIELDS`, `CUTSCENE_BEAT_KINDS`, `ACHIEVEMENT_FIELDS`), because the
build fails on an authored field no page renders (the alternative is hundreds of pages silently
going incomplete). **The STORY section takes its prose from `docs/story.md`
and every quoted line from the GAME** — the cutscenes, level intros/outros,
enemy dialogue and last words, pinned thoughts and story-item lore — never
from `docs/manuscript.md`, which is a transcription of those same lines and
would be exactly the second copy the library exists not to have; the
manuscript still governs, through the test. `docs/story.md` is parsed
structurally (`story-doc.mjs`, `model-story.mjs`), so a section it cannot
place, a venue it writes about that no longer exists, a venue nobody wrote
about, or a chapter whose travel scenes disagree with the level's own
`prelude` chain all FAIL THE BUILD rather than drifting. What the library shares with the game it SHARES rather than
copies: the window skin (`pwa/src/lib/pixel-panel.css`), the item card
(`pwa/src/lib/item-card.css`), an affix's wording (`@ui/lib/affix-line.ts`),
the tier/affix colours (`pwa/src/game/tiers.ts`), the talent trees' personas
and accents (`pwa/src/game/talent-look.ts`), the ground rule
(`render/ground-tiles.ts`), and a mission's MAP (the level drawn whole with
the game's own sprites by `scripts/level-render.mjs --bare --dormant`, shrunk
to fit). Improve it with the `library-improvement` skill: never judge a page
from its markup, judge the screenshot.

## Where the work lands

| Change                       | Goes in                                                  |
| ---------------------------- | -------------------------------------------------------- |
| Page structure or content    | the library generator                                    |
| Look, dressing, layout       | the library stylesheet — reusing `pwa/src/styles.css` classes where a game surface already defines them |
| A number that is wrong       | the engine or the content YAML it comes from, never the generator |
| A missing page               | the generator's catalog walk, plus the coverage test      |

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the quality bar and the loop above.

```sh
node scripts/skill-lessons.mjs library-improvement --list
```
