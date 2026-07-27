# Game library roadmap

The working plan for **the library** — a generated companion site for the game,
in the tradition of Arreat Summit for Diablo II: a bestiary, an arsenal, and a
mission guide, built from the same YAML the game itself compiles.

It exists for one reason. The deployed site is **382 indexable words on a single
page**, because the game is a canvas and there is nothing else for a crawler to
read. Meta tags decide how a page appears once it ranks; they do not make it
rank. Meanwhile the repository already holds ~31,000 words of story and content
prose and a 370-file content catalog, none of it published. Turning that into
pages is the highest-leverage discovery work available, and the content is
already written.

Status legend: `[ ]` not started · `[x]` done.

---

## A note on how this document is used

The phases below are a **sequencing device for this document only**. They are
not a label to carry into the work.

Nothing in the implementation may mention them: not commit messages, not PR
titles or descriptions, not code comments, not the changelog, not the docs the
work produces. A reader of the repository should never encounter "Phase 2" —
they should encounter a bestiary, or an arsenal, described on its own terms. A
PR that adds item pages is "the arsenal", not "Phase 2 of the library plan".

The phases exist so the work can be sequenced and stopped between chunks. Each
one is a shippable PR on its own; each leaves the site whole.

---

## Goals

- **Real pages for real queries.** A player searching "gone in space armstrong"
  or "excalibur stats" should land on a page that answers them. That is ~400
  pages, one per enemy, item, and mission, plus the index pages that link them.
- **Generated, never authored.** Every page is compiled from the same
  `content/**.yaml` the game reads. A new enemy file gets a page on the next
  build; a rebalanced item updates its page automatically. The library cannot
  drift from the game because it has no separate copy of anything.
- **Weightless.** A library page is a document. It must not load the game.
- **A crawlable graph.** An enemy links to what it drops, an item links to what
  drops it, a mission links to both. Internal links are what let a crawler find
  400 pages from one entry point, and what makes the library useful to a reader
  rather than a pile of stat tables.

## Grounded in truth

Every number on a library page has to be the number the game actually uses. A
reference site that quietly disagrees with the game is worse than no reference
site — it is confidently wrong, and it stays wrong for as long as nobody
notices. There are two kinds of fact on these pages, and they are reached in
opposite ways.

**Authored facts** — a weapon's base damage, an enemy's hp, a level's foes — are
read from the **compiled catalogs** (`src/generated/*.ts`), not from the raw
YAML. The compiled form is what the game itself reads: schema-validated,
cross-references resolved, grade variants expanded, ladder rungs stamped in. The
YAML is the source of truth for AUTHORING; the generated catalog is the source
of truth for what the game is running.

**Derived facts** — what a PERFECT roll of this base actually swings for, this
weapon's dps, an enemy's hp on nightmare after menace scaling, the odds of a
tier dropping — are obtained by **calling the engine**. Never by reimplementing
the maths in the generator. This is already how the repo's calculators work:
`weapon-budget.mjs` imports `WEAPON_DEFS`, `weaponAssumedTargets` and
`baseCritMult` from the live engine, `drop-rate.mjs` and `progression-sim.mjs`
do the same, and `scripts/game-alias-loader.mjs` exists precisely so a plain
`node` script can import engine modules that use the `@game/lib` alias. The
library is another consumer of that seam, not a special case.

So the rule is simple: **no gameplay number is ever typed into the generator.**
If a fact cannot be reached by reading a catalog or calling the engine, that is
a finding, not an excuse to hardcode it.

And this is where content sometimes has to move. When the library wants to
explain a number that is currently a literal buried in `src/game/config/`, that
number was probably content all along and should be lifted into an authored
`content/*.yaml` with a schema and a snapshot guard — the migration the items,
enemies, levels, powerups, ladder, leveling curve and bot tuning have each
already been through. The library is a good forcing function for it: anything it
struggles to explain is usually something the game struggles to tune. What must
NOT happen is the reverse — copying engine _logic_ into YAML so the generator
can read it more easily. That creates a second implementation that drifts
silently, which is the exact failure this whole section exists to prevent.

A test in `tests/content/` spot-checks generated pages against the engine, so a
page that starts lying fails the build rather than the reader.

## Non-goals

- **Not a wiki.** No accounts, no edits, no comments. It is generated output.
- **Not a second app.** No React route, no client-side router, no shared bundle
  with the game (see the constraints below).
- **Not a marketing site.** The game's own page stays the front door; the
  library is reference material that links back to it.

---

## Decisions already made

- **Spoilers are published, behind blurred reveal panels.** Story text — boss
  dialogue, last words, found lore, thought beats — goes on the page inside a
  `<details>`-style panel that renders blurred until the reader clicks it. This
  gets both halves right: a player arriving cold is not spoiled by a search
  result, and the text is still **fully present in the DOM**, so it is indexed
  normally. The blur must be CSS over real markup — never `display: none`,
  never injected by JavaScript — or the content stops counting. The same panel
  covers spoiler IMAGES (the mission maps); their `alt` text should describe the
  picture without giving away what the panel is hiding.
- **Static HTML, generated at build time.** Same family as `/privacy/` and
  `/contact/`, which are already prerendered documents rather than app routes.
- **It lives at `/library/` on the same origin.** It inherits the domain's
  authority and ships in the existing Pages artifact, rather than starting a
  second property from zero.
- **Art comes from the existing pipeline.** `make assets` already emits 1,254
  per-sprite preview PNGs at 8×. The library sources its images from there —
  no new art work, and the pictures cannot drift from the game's own sprites.
- **Every item base gets its own page, plain ones included.** The first
  instinct was to fold the 132 `regular`/`trash` bases into per-slot tables and
  spend the page budget on the named chase items. That was wrong, because a
  plain base is not one row of numbers — it is the _centre_ of a spread. Each
  carries authored lore prose, and each is the anchor for two systems a reader
  actually wants explained: the **make-quality axis**, where BROKEN through
  PERFECT multiply the base's damage through overlapping bands whose odds shift
  with the killer's monster level, and its **grade variants**, the exceptional
  and elite identities it upgrades into. "What does a PERFECT gladius actually
  swing for, and what does it become later?" is a real question with a real
  answer, and no table of one-liners can hold it. Arreat Summit's base-item
  tables were among its most-visited pages for exactly this reason.
- **Mission pages carry the map, behind the same spoiler panel as the story.**
  A level's layout is a spoiler in the same way its plot is, so it gets the
  same treatment rather than being withheld.

## Open questions

- Which map render the mission pages use. `make map-layout` exists and is
  excellent, but it is a DEVELOPER diagnostic: a labelled coordinate grid, con
  circles sized by mob count and coloured by difficulty ramp, and a decode key
  down the side. A reader wants the shape of the place — walls, gaps, the route,
  the landmarks — without the tuning instrumentation. Likely a reader-facing
  mode on the existing renderer rather than a second one, so the two cannot
  drift.

---

## The look

The reference is **Arreat Summit**, and what made it good is worth being precise
about, because it was not the styling. It was that the site felt like it came
from inside the game rather than about it: the same typeface, the same panel
dressing, the same item cards a player already knew how to read. You arrived
from the game and nothing jarred. The information was dense and unapologetic —
tables of real numbers, not marketing — and it was **fast**, because it was
static pages.

So the library wears the game's own skin:

- **Its own font, as real text.** Titles and headings set in the game's pixel
  font — see the constraint below for how, because it is not free.
- **A tiled sprite background**, quiet enough to read over. Per-section
  theming is nearly free and worth it: a moon enemy's page on lunar ground, a
  bunker page on its carpet. The biome art already exists per venue.
- **Item cards that ARE the in-game item cards.** `ItemCard.tsx` styles itself
  with plain CSS classes in `styles.css` (`item-card-set`, `tooltip-row`,
  `card-foot`, `tier-set`, `pixel-img`, the tier glow classes) rather than
  inline or generated styles — so static markup wearing those same class names
  gets the identical card, tier colours and glow, from the same stylesheet.
  **Share the stylesheet, never copy the component.** The moment the library
  has its own hand-rolled approximation of a card, the two drift.
- **Sprites at 8×, pixelated.** `image-rendering: pixelated` and integer
  scaling, or the art turns to mush.

### Two things the in-game look does not hand over for free

1. **The pixel font is canvas, not a webfont.** `PixelText` tints a generated
   white atlas and blits glyphs — it is JavaScript, and the library pages have
   none. The answer is to emit a real **WOFF2 from the same `GLYPHS` map** in
   `scripts/asset-tools/font.mjs` that the atlas is packed from, so both come
   from one source and cannot drift. That keeps headings as real text —
   selectable, translatable, and indexed — where pre-rendered heading images
   would throw away the very words these pages exist to rank for.
2. **The ground plane is drawn, not a file.** The game tiles its ground in the
   renderer. The library needs a seamless image per biome; deriving it from the
   same sprites the renderer uses keeps it honest.

## Constraints that must hold

These are the ways this work could go wrong. Each is cheap to honour up front
and expensive to retrofit.

1. **A library page must not load the game bundle.** The doc-page mechanism in
   `pwa-plugin.ts` works by copying the built `index.html` and rewriting its
   head and body — which means it inherits every `modulepreload` and the entry
   script. That is right for two pages that sit beside the app, and badly wrong
   for four hundred: it would make every reference page download 150 KB of game
   to render a stat table, and tank the Core Web Vitals of the pages we are
   building precisely to be found. The library needs its **own minimal
   template** — HTML plus one small stylesheet, no JavaScript.
2. **The critical-path budget is not affected, and must be seen not to be.**
   The library ships no JS into the game's entry chunk. `check-seo`'s budget
   should keep measuring the game's own preload set, not the library's.
3. **Every catalog entry has a page, enforced by a test.** A content test in
   `tests/content/` that walks the catalogs and fails when an entry has no
   generated page — the same guard style as the effects gallery, which fails the
   build when a new weapon has no exhibit.
4. **Every page is in the sitemap.** `generate-seo.mjs` currently hard-codes
   three URLs. It has to learn to enumerate the generated set, and its
   `lastmod` should keep coming from the git history of the source YAML, so an
   item page's date reflects when that item last actually changed.
5. **The deploy slots stay noindexed.** `/preview/library/` must not compete
   with `/library/`. The existing per-slot robots meta covers this as long as
   the library uses it.

---

## Phase 1 — the machinery, proven on the bestiary

The whole pipeline end to end, shipped with one catalog behind it. Deliberately
the enemy roster: it is the most searchable content (players look up bosses),
it carries story text so the spoiler treatment gets exercised immediately, and
104 pages is enough to prove the approach without committing to all four
hundred.

- [ ] The generator: a build step that reads the compiled catalogs and emits
      static HTML into `dist/library/`.
- [ ] Its engine seam — importing the live engine for every derived number, via
      `scripts/game-alias-loader.mjs` the way the existing calculators do — plus
      the test that holds generated pages to what the engine says.
- [ ] The page template and stylesheet — the game's pixel-art dressing, no
      JavaScript, responsive down to the reference phone. Shares the game's own
      `styles.css` card/panel classes rather than restating them.
- [ ] The pixel font as a real WOFF2, generated from the same `GLYPHS` map the
      atlas is packed from.
- [ ] Per-biome tiled backgrounds derived from the renderer's own ground
      sprites.
- [ ] The blurred spoiler panel, as CSS over real markup.
- [ ] Sprite images sourced from the generated 8× previews, with `width`,
      `height`, `alt`, and `loading` on every one (`check-seo` already fails a
      build for an `<img>` missing them).
- [ ] 104 enemy pages: art, role, hp and damage, where it spawns, what it drops,
      its mechanics, and its dialogue behind the reveal.
- [ ] A bestiary index, grouped by biome, linking every entry.
- [ ] Per-page `<title>`, description, canonical, OG tags, and a JSON-LD node.
- [ ] Sitemap enumeration and the coverage test.
- [ ] `/library/` landing page linking the sections, and a link to it from the
      game's own prerendered shell — without which nothing here is reachable.

## Phase 2 — the arsenal and the missions

The same machinery pointed at two more catalogs, plus the cross-links that turn
a set of pages into a graph.

- [ ] Pages for the 128 named chase items (73 unique, 24 artifact, 20 set,
      11 legendary): art, slot, level requirement, rolled stat ranges, lore.
- [ ] Pages for the 132 plain bases: stats, lore, the make-quality table
      (what BROKEN through PERFECT do to this base's numbers), and the grade
      variants it upgrades into.
- [ ] An arsenal index, by rarity and by slot.
- [ ] 6 mission pages: the venue, its foes, its loot pool, its powers, the map
      behind a reveal, and the story beat behind another.
- [ ] The cross-link pass — enemy → drops, item → dropped by, mission → both —
      which is what makes the library crawlable and worth reading.

## Phase 3 — the story layer, and measuring whether any of it worked

- [ ] Story pages built from `docs/story.md` and the manuscript, chapter per
      mission, spoiler panels throughout.
- [ ] Cross-links from the story into the bestiary and arsenal.
- [ ] A review of what Search Console actually indexed: coverage, impressions,
      which titles and descriptions earn clicks, which pages were crawled and
      dropped.
- [ ] Iterate on the basis of that data — the first pass at 400 titles will be
      wrong somewhere, and this is the only phase that can tell us where.

---

## What success looks like

Indexed pages in the hundreds rather than three, and impressions against
long-tail queries naming this game's own bosses and items. Not traffic to the
library for its own sake — every page links to the game, and the library exists
to be the road there.
