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
  never injected by JavaScript — or the content stops counting.
- **Static HTML, generated at build time.** Same family as `/privacy/` and
  `/contact/`, which are already prerendered documents rather than app routes.
- **It lives at `/library/` on the same origin.** It inherits the domain's
  authority and ships in the existing Pages artifact, rather than starting a
  second property from zero.
- **Art comes from the existing pipeline.** `make assets` already emits 1,254
  per-sprite preview PNGs at 8×. The library sources its images from there —
  no new art work, and the pictures cannot drift from the game's own sprites.

## Open questions

- Whether the plain `regular`/`trash` item bases (132 of the 260 files) deserve
  their own pages or fold into a single table per slot. Leaning: fold them, and
  spend the page budget on the 128 named chase items people actually search for.
- Whether the mission pages carry the authored map layout image
  (`make map-layout`), which is a strong visual but reveals level geometry.

---

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
- [ ] The page template and stylesheet — the game's pixel-art dressing, no
      JavaScript, responsive down to the reference phone.
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

- [ ] Item pages for the 128 named chase items (73 unique, 24 artifact, 20 set,
      11 legendary): art, slot, level requirement, rolled stat ranges, lore.
- [ ] Plain bases presented as per-slot tables rather than pages (pending the
      open question above).
- [ ] An arsenal index, by rarity and by slot.
- [ ] 6 mission pages: the venue, its foes, its loot pool, its powers, and the
      story beat behind the reveal.
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
