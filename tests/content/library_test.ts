// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIBRARY's guard rail (docs/architecture.md). The library is ~400 generated
// pages nobody reads before shipping, so the ways it can rot are all quiet ones,
// and this suite exists to make each of them loud:
//
//   - a monster with no page, because the generator's catalog walk missed it;
//   - a page carrying a number the game does not actually use;
//   - an authored field the generator has never heard of, silently dropped from
//     every page at once;
//   - story text "hidden" in a way that stops a crawler counting it, which
//     defeats the entire point of publishing it;
//   - JavaScript creeping into a document page.
//
// It runs against the SHIPPED catalogs (this-game content, per the tests/
// convention) and calls the generator's own modules, so it checks the thing
// that actually ships rather than a re-derivation of it.

import { describe, expect, it } from "vitest";

import {
  CUTSCENE_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  LEVEL_ORDER,
  QUALITY,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  enemyDef,
  qualityOdds,
} from "@game/core";
import { mobContactScaleFor, hardMobHpScale } from "../../src/game/menace.ts";

import {
  ENEMY_FIELDS,
  libraryModel,
  libraryRoutes,
} from "../../pwa/scripts/library/model.mjs";
import {
  GEAR_FIELDS,
  UNIQUE_FIELDS,
  WEAPON_FIELDS,
} from "../../pwa/scripts/library/model-arsenal.mjs";
import { LEVEL_FIELDS } from "../../pwa/scripts/library/model-missions.mjs";
import {
  bestiaryIndex,
  enemyPage,
  landing,
} from "../../pwa/scripts/library/render-bestiary.mjs";
import {
  arsenalIndex,
  itemPage,
} from "../../pwa/scripts/library/render-arsenal.mjs";
import {
  missionPage,
  missionsIndex,
} from "../../pwa/scripts/library/render-missions.mjs";
import {
  CUTSCENE_BEAT_KINDS,
  STORY_ITEM_FIELDS,
  THOUGHT_FIELDS,
} from "../../pwa/scripts/library/model-story.mjs";
import {
  chapterPage,
  storyIndex,
  storyLinks,
} from "../../pwa/scripts/library/render-story.mjs";

const model = libraryModel();
const context = {
  base: "/",
  groundFor: (id: string | null) => `/library/grounds/${id ?? "moon"}.png`,
  mapFor: (id: string) => ({
    src: `/library/maps/${id}.png`,
    width: 1200,
    height: 600,
  }),
  venueOf: () => LEVEL_ORDER[0] as string,
  venueName: (id: string | null) => `VENUE ${id ?? ""}`.trim(),
  linkGroups: storyLinks(model),
};

const chapterById = (id: string) => {
  const chapter = model.story.chapters.find((c: { id: string }) => c.id === id);
  if (!chapter) throw new Error(`no library chapter for "${id}"`);
  return chapter;
};

const itemById = (id: string) => {
  const item = model.items.find((i: { id: string }) => i.id === id);
  if (!item) throw new Error(`no library model for item "${id}"`);
  return item;
};

const missionById = (id: string) => {
  const mission = model.missions.find((m: { id: string }) => m.id === id);
  if (!mission) throw new Error(`no library model for mission "${id}"`);
  return mission;
};

const byId = (id: string) => {
  const enemy = model.enemies.find((e) => e.id === id);
  if (!enemy) throw new Error(`no library model for "${id}"`);
  return enemy;
};

/** The first sighting of a monster — the venue its page leads with. */
const firstSighting = (id: string) => {
  const sighting = byId(id).sightings[0];
  if (!sighting) throw new Error(`"${id}" is met nowhere`);
  return sighting;
};

describe("library coverage", () => {
  it("gives every monster in the catalog a page", () => {
    const paged = new Set(model.enemies.map((enemy) => enemy.id));
    const missing = Object.keys(ENEMY_DEFS).filter((id) => !paged.has(id));
    expect(missing).toEqual([]);
  });

  it("gives every ITEM in the catalogs a page, or a page that speaks for it", () => {
    // A generated grade variant (the exceptional/elite version of a pool base)
    // deliberately has no route: it is described on its ancestor's page, which
    // is where its numbers actually mean something. Everything else — every
    // hand-authored base, every named relic — is a page of its own, and a new
    // item file must not be able to appear without one.
    const paged = new Set(model.items.map((item: { id: string }) => item.id));
    const missing = [...Object.values(WEAPON_DEFS), ...Object.values(GEAR_DEFS)]
      .filter((def) => def.grade === undefined && !paged.has(def.id))
      .map((def) => def.id);
    expect(missing).toEqual([]);
    expect(Object.keys(UNIQUE_DEFS).filter((id) => !paged.has(id))).toEqual([]);

    const described = new Set(
      model.bases.flatMap((base) =>
        (base.ladder as { id: string }[]).map((rung) => rung.id),
      ),
    );
    const orphanVariants = [
      ...Object.values(WEAPON_DEFS),
      ...Object.values(GEAR_DEFS),
    ]
      .filter((def) => def.grade !== undefined && !described.has(def.id))
      .map((def) => def.id);
    expect(orphanVariants).toEqual([]);
  });

  it("gives every LEVEL a mission page", () => {
    const paged = new Set(model.missions.map((m: { id: string }) => m.id));
    expect(Object.keys(LEVELS).filter((id) => !paged.has(id))).toEqual([]);
  });

  it("gives every LEVEL a chapter of the story, and the hellborn their own", () => {
    // The story is written at the top of the chain (docs/story.md) and the game
    // is written at the bottom, so the two can disagree in both directions: a
    // venue nobody wrote about, or a chapter about a venue that no longer
    // exists. `storyModel` throws on either; this pins that they agree today.
    const paged = new Set(
      model.story.chapters.map((c: { id: string }) => c.id),
    );
    expect(Object.keys(LEVELS).filter((id) => !paged.has(id))).toEqual([]);
    expect(paged.has("the-hellborn")).toBe(true);
  });

  it("routes every page exactly once, and lists the landing and index", () => {
    const routes = libraryRoutes().map((route) => route.path);
    expect(new Set(routes).size).toBe(routes.length);
    for (const index of ["", "bestiary", "arsenal", "missions", "story"]) {
      expect(routes).toContain(index);
    }
    expect(routes.length).toBe(
      Object.keys(ENEMY_DEFS).length +
        model.items.length +
        model.missions.length +
        model.story.chapters.length +
        5,
    );
  });

  it("dates every route from the content it is compiled out of", () => {
    // `lastmod` is only worth publishing while it is verifiably accurate, so a
    // route with no source would be dated from the build clock — the pattern
    // that gets the whole field distrusted.
    for (const route of libraryRoutes()) {
      expect(route.sources.length, route.path).toBeGreaterThan(0);
    }
  });

  it("puts every monster in exactly one group on the index", () => {
    const grouped = model.groups.flatMap((group) =>
      group.entries.map((entry) => entry.id),
    );
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.length).toBe(model.enemies.length);
  });
});

describe("library field coverage", () => {
  // The library has no hand-edited pages — a page only ever changes by changing
  // a generator. The failure that invites is a new field landing in the enemy
  // YAML that no generator knows about: 104 pages go on looking complete while
  // silently omitting it. `libraryModel` throws on one; this pins that it does.
  it("declares every field the shipped roster actually carries", () => {
    const undeclared = new Set<string>();
    for (const def of Object.values(ENEMY_DEFS)) {
      for (const key of Object.keys(def)) {
        if (!(key in ENEMY_FIELDS)) undeclared.add(key);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  it("refuses to build a page for a monster carrying an unknown field", () => {
    const def = enemyDef("wisp") as unknown as Record<string, unknown>;
    def.somethingNobodyRenders = true;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete def.somethingNobodyRenders;
    }
  });

  // The same contract for every catalog the arsenal and the mission guide are
  // compiled from. A field nobody renders is the ONE way these pages can rot
  // without anything breaking, so each catalog declares its own coverage.
  it.each([
    ["weapon", WEAPON_DEFS, WEAPON_FIELDS],
    ["gear", GEAR_DEFS, GEAR_FIELDS],
    ["unique", UNIQUE_DEFS, UNIQUE_FIELDS],
    ["level", LEVELS, LEVEL_FIELDS],
  ])(
    "declares every field the shipped %s catalog carries",
    (_what, defs, fields) => {
      const undeclared = new Set<string>();
      for (const def of Object.values(defs as Record<string, object>)) {
        for (const key of Object.keys(def)) {
          if (!(key in (fields as Record<string, string>))) undeclared.add(key);
        }
      }
      expect([...undeclared]).toEqual([]);
    },
  );

  it("refuses to build a page for an item carrying an unknown field", () => {
    const def = WEAPON_DEFS.gladius as unknown as Record<string, unknown>;
    def.somethingNobodyRenders = true;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete def.somethingNobodyRenders;
    }
  });

  it.each([
    ["story item", STORY_ITEM_DEFS, STORY_ITEM_FIELDS],
    ["thought", THOUGHT_DEFS, THOUGHT_FIELDS],
  ])(
    "declares every field the shipped %s catalog carries",
    (_what, defs, fields) => {
      const undeclared = new Set<string>();
      for (const def of Object.values(defs as Record<string, object>)) {
        for (const key of Object.keys(def)) {
          if (!(key in (fields as Record<string, string>))) undeclared.add(key);
        }
      }
      expect([...undeclared]).toEqual([]);
    },
  );

  it("declares every cutscene beat kind the shipped scenes play", () => {
    // A new beat kind that carries WORDS would otherwise vanish from every
    // chapter at once — the scenes would simply skip it and read as complete.
    const undeclared = new Set<string>();
    for (const def of Object.values(CUTSCENE_DEFS)) {
      for (const beat of def.beats) {
        if (!(beat.kind in CUTSCENE_BEAT_KINDS)) undeclared.add(beat.kind);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  it("refuses to build a page for a level carrying an unknown field", () => {
    const def = LEVELS.moon as unknown as Record<string, unknown>;
    def.somethingNobodyRenders = true;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete def.somethingNobodyRenders;
    }
  });
});

describe("library numbers are the engine's", () => {
  // Spot-checks, not a re-implementation: each asserts that the figure a page
  // prints is the one the engine returns for the same inputs. A page that
  // starts lying fails the build rather than the reader.
  it("scales a monster's health the way a spawn would", () => {
    for (const rung of firstSighting("wisp").rungs) {
      if (rung.authoredHp) continue;
      const expected = rung.level.map((level) =>
        Math.round(enemyDef("wisp").hp * hardMobHpScale(level, rung.heroLevel)),
      );
      expect(rung.hp).toEqual(expected);
    }
  });

  it("ramps contact damage the way a spawn would", () => {
    for (const rung of firstSighting("wisp").rungs) {
      const expected = rung.level.map((level) =>
        Math.round(enemyDef("wisp").contactDamage * mobContactScaleFor(level)),
      );
      expect(rung.contact).toEqual(expected);
    }
  });

  it("uses the level ladder's own health for a hand-placed boss", () => {
    // ARMSTRONG is pinned on the moon with an authored per-rung health curve,
    // which the run uses verbatim — the page must not quietly recompute it from
    // the catalog baseline instead.
    const rungs = firstSighting("armstrong").rungs;
    expect(rungs.every((rung) => rung.authoredHp)).toBe(true);
    expect(rungs[0]!.hp[0]).not.toBe(enemyDef("armstrong").hp);
  });

  it("leaves JESUS off the field tables", () => {
    // It is the one rung that scales to the hero instead of to an authored
    // number, so it has no fixed figure to state.
    for (const enemy of model.enemies) {
      for (const sighting of enemy.sightings) {
        const rungs = sighting.rungs.map((rung) => rung.difficulty);
        expect(rungs).not.toContain("jesus");
      }
    }
  });
});

describe("library pages", () => {
  const boss = enemyPage(byId("armstrong"), context);
  const minion = enemyPage(byId("wisp"), context);
  const index = bestiaryIndex(model, context);
  const front = landing(model, context);
  // One of every SHAPE of page — a plain base (the quality table and the grade
  // ladder), a named relic (the authored bonus block), a set piece (the set
  // block), and a mission (the ladder, the roster, the map and the story).
  const base = itemPage(itemById("gladius"), context);
  const relic = itemPage(itemById("excalibur"), context);
  const arsenal = arsenalIndex(model, context);
  const mission = missionPage(
    missionById("moon"),
    context,
    "/library/sprites/",
  );
  const missions = missionsIndex(model, context);
  const chapter = chapterPage(chapterById("moon"), context, 2, 7);
  const hellborn = chapterPage(chapterById("the-hellborn"), context, 7, 7);
  const story = storyIndex(model, context);
  const pages = {
    boss,
    minion,
    index,
    front,
    base,
    relic,
    arsenal,
    mission,
    missions,
    chapter,
    hellborn,
    story,
  };

  it("runs no JavaScript at all", () => {
    // The constraint the whole exercise rests on: a reference page that
    // downloads a game engine to render a stat table does not get found.
    for (const [name, html] of Object.entries(pages)) {
      expect(html, name).not.toMatch(
        /<script(?![^>]*type="application\/ld\+json")/,
      );
      expect(html, name).not.toContain("modulepreload");
    }
  });

  it("carries the head signals a page has to have", () => {
    for (const [name, html] of Object.entries(pages)) {
      expect(html, name).toMatch(
        /<link rel="canonical" href="https:\/\/[^"]+\/"/,
      );
      // 20 chars or it says nothing; 160 or Google cuts it mid-sentence in the
      // result — which on these pages is where the spoiler warning lives.
      expect(html, name).toMatch(
        /<meta name="description" content="[^"]{20,160}"/,
      );
      expect(html, name).toContain('type="application/ld+json"');
      expect((html.match(/<h1[\s>]/g) ?? []).length, name).toBe(1);
    }
  });

  it("gives every image the attributes that keep the page from reflowing", () => {
    for (const [name, html] of Object.entries(pages)) {
      for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
        expect(tag, `${name}: ${tag}`).toMatch(/\balt="/);
        expect(tag, `${name}: ${tag}`).toMatch(/\bwidth="\d+"/);
        expect(tag, `${name}: ${tag}`).toMatch(/\bheight="\d+"/);
        expect(tag, `${name}: ${tag}`).toMatch(/\bloading="/);
      }
    }
  });

  it("publishes story text behind a blur rather than hiding it", () => {
    // The spoiler panel is CSS over real markup. If the text ever stops being
    // in the DOM it stops being indexed, and publishing it was the whole point.
    const spoken = enemyDef("armstrong").dialogue?.[0];
    const line = Array.isArray(spoken) ? spoken[0] : undefined;
    expect(line).toBeTruthy();
    expect(boss).toContain(line as string);
    expect(boss).toContain(enemyDef("armstrong").lastWords?.[0] as string);
    expect(boss).toContain('class="reveal-body"');
    expect(boss).not.toContain("display: none");
    expect(boss).not.toContain("display:none");
  });

  it("keeps a monster with no story out of the reveal entirely", () => {
    // No empty sections: a minion with nothing to say has no heading for it.
    expect(minion).not.toContain('class="reveal"');
    expect(minion).not.toContain("What it says");
  });

  it("covers a mission's map and story, and leaks neither", () => {
    // Both sit behind the blur — a level's layout is a spoiler in the same way
    // its plot is — but both are really in the document, so both are indexed.
    expect(mission).toContain('class="reveal-body"');
    expect(mission).toContain("/library/maps/moon.png");
    expect(mission).toContain(LEVELS.moon!.intro![0]![0]!);
    expect(mission).not.toContain("display: none");
    expect(mission).not.toContain("display:none");
    // The map's alt text describes the picture without giving away what the
    // panel covers, so a search result can't spoil it either.
    const alt = mission.match(/alt="([^"]*maps[^"]*|[^"]*top-down[^"]*)"/)?.[1];
    expect(alt).toBeTruthy();
    expect(alt).not.toContain("ARMSTRONG");
  });

  it("quotes the item card's own figures, not the catalog's", () => {
    // The authored `damage` is now the blow's AVERAGE — no global damper, no
    // item-level growth — but it is still not what the card prints: every swing
    // rolls inside the weapon's variance band, so the card leads with the RANGE.
    // A page printing the bare catalog number would print a figure the player
    // never actually sees on a hit.
    const item = itemById("gladius");
    const catalog = WEAPON_DEFS.gladius!.damage;
    expect(item.stats.damage.min).toBeLessThan(catalog);
    expect(item.stats.damage.max).toBeGreaterThan(catalog);
    expect(base).toContain(`DAMAGE`);
    expect(base).toContain(
      `${item.stats.damage.min}\u2013${item.stats.damage.max}`,
    );
  });

  it("prints the make-quality odds the roll actually obeys", () => {
    const rows = itemById("gladius").quality.rows;
    const low = qualityOdds(1);
    const high = qualityOdds(QUALITY.highMlvl);
    for (const row of rows) {
      expect(row.oddsLow, row.quality).toBe(low[row.quality as never]);
      expect(row.oddsHigh, row.quality).toBe(high[row.quality as never]);
    }
  });

  it("describes a base's grade variants instead of orphaning them", () => {
    const ladder = itemById("gladius").ladder.map((r: { id: string }) => r.id);
    expect(ladder).toEqual(["spatha", "falcata"]);
    expect(base).toContain("SPATHA");
    expect(base).toContain("FALCATA");
  });

  it("wears the game's own item card rather than a lookalike", () => {
    // The classes come from pwa/src/lib/item-card.css, which the app imports
    // and the library inlines. If a page ever stops using them the card has
    // started drifting from the one the game draws.
    expect(relic).toContain('class="item-card tier-unique"');
    expect(relic).toContain('class="card-foot"');
    expect(base).toContain('class="tooltip-row"');
  });

  it("quotes the game's own script, not the manuscript's copy of it", () => {
    // The chapter pages exist to publish the story, and the one way they could
    // do that dishonestly is by quoting `docs/manuscript.md` — a transcription,
    // free to fall behind what ships. Every line on a chapter page has to be a
    // string the dialogue box will actually put on screen.
    const level = LEVELS.moon!;
    expect(chapter).toContain(level.intro![0]![0]!);
    expect(chapter).toContain(
      CUTSCENE_DEFS.launch!.beats.find((b) => b.kind === "caption")!.text[0]!,
    );
    const spoken = enemyDef("armstrong").dialogue?.[0];
    expect(chapter).toContain(
      (Array.isArray(spoken) ? spoken[0] : undefined) as string,
    );
    expect(chapter).toContain(enemyDef("armstrong").lastWords![0]!);
    expect(chapter).toContain(STORY_ITEM_DEFS.mission_log!.lore[0]![0]!);
    expect(chapter).toContain(
      THOUGHT_DEFS[level.firstSightThoughts![0]!.thought]!.pages[0]![0]!,
    );
  });

  it("covers every word of a chapter without hiding any of it", () => {
    // A chapter is nothing but plot, so the whole of it sits behind covers —
    // and the whole of it is still in the DOM, or publishing it achieved
    // nothing. Both switches are CSS over real markup.
    for (const html of [chapter, hellborn, story]) {
      expect(html).toContain('class="reveal-body"');
      expect(html).not.toContain("display: none");
      expect(html).not.toContain("display:none");
    }
    expect(chapter).toContain('class="reveal-all-toggle"');
    // …and the cover has to actually be over the words: no chapter may print
    // its own plot outside a reveal, where a search result would pick it up.
    const outside = chapter.replace(
      /<div class="reveal">[\s\S]*?\n<\/div>/g,
      "",
    );
    expect(outside).not.toContain(LEVELS.moon!.intro![0]![0]!);
    expect(outside).not.toContain(enemyDef("armstrong").lastWords![0]!);
  });

  it("links the story into the rest of the library, and back", () => {
    // The cross-link pass is what makes the story worth generating rather than
    // linking to a text file: a name in the prose is the reader's way into the
    // bestiary, the arsenal and the mission guide.
    expect(chapter).toContain('href="/library/bestiary/armstrong/"');
    expect(chapter).toContain('href="/library/missions/moon/"');
    expect(story).toContain('href="/library/story/moon/"');
    expect(hellborn).toContain('href="/library/bestiary/dust-pharaoh/"');
    // …and every other section leads back into it.
    expect(front).toContain('href="/library/story/"');
    expect(mission).toContain('href="/library/story/moon/"');
    expect(boss).toContain('href="/library/story/moon/"');
  });

  it("links the copy of a name the chapter is actually about", () => {
    // ELON MOSQUE is three monsters, one per venue he is cornered in. A chapter
    // linking the wrong one is a link that spoils by itself.
    const mars = chapterPage(chapterById("mars"), context, 3, 7);
    expect(mars).toContain('href="/library/bestiary/elon-mosque/"');
    expect(mars).not.toContain(
      'href="/library/bestiary/elon-mosque-eastworld/"',
    );
  });

  it("links the pages to each other", () => {
    expect(index).toContain('href="/library/bestiary/armstrong/"');
    // A monster's venue heading leads to that venue's mission page…
    expect(boss).toContain('href="/library/missions/moon/"');
    // …its drops lead to the arsenal…
    expect(boss).toMatch(/href="\/library\/arsenal\/[a-z0-9-]+\/"/);
    // …an item leads back to where it comes from…
    expect(relic).toContain('href="/library/missions/the-rift/"');
    // …and a mission leads to both.
    expect(mission).toContain('href="/library/bestiary/armstrong/"');
    expect(mission).toMatch(/href="\/library\/arsenal\/[a-z0-9-]+\/"/);
    for (const front of [landing(model, context)]) {
      for (const section of ["bestiary", "arsenal", "missions"]) {
        expect(front).toContain(`href="/library/${section}/"`);
      }
    }
  });
});

// The generated PICTURES — the social card each page unfurls as, and the search
// shot Google Images indexes (pwa/scripts/library/{og-card,drop-shot,spawn-shot}.mjs).
//
// They are a DEPLOY-TIME step, so an ordinary build has none of them and every
// page must render correctly either way. That gives two modes to hold, and the
// interesting failures are all silent: a page that names a card the build never
// wrote 404s its own `og:image`, and a page that omits the figure when the
// pictures ARE there loses the only image Google Images can rank. Neither shows
// up as a broken build, which is why they are pinned here.
describe("library pictures", () => {
  const withImages = { ...context, hasImages: true };
  const relicShot = itemPage(itemById("excalibur"), withImages);
  const bossShot = enemyPage(byId("armstrong"), withImages);
  // The same two pages as an ordinary build renders them — no pictures.
  const relicBare = itemPage(itemById("excalibur"), context);
  const bossBare = enemyPage(byId("armstrong"), context);

  const ogImage = (html: string) =>
    html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

  it("names each page's own card once the pictures exist", () => {
    expect(ogImage(relicShot)).toMatch(
      /\/library\/cards\/arsenal-[a-z0-9-]+\.png$/,
    );
    expect(ogImage(bossShot)).toMatch(
      /\/library\/cards\/bestiary-[a-z0-9-]+\.png$/,
    );
  });

  it("falls back to the shared default card without them", () => {
    // The default is the one card that always exists, so a build with no
    // pictures still unfurls rather than pointing at nothing.
    expect(ogImage(relicBare)).toMatch(/\/og-default\.png$/);
    expect(ogImage(bossBare)).toMatch(/\/og-default\.png$/);
  });

  it("keeps the Article's schema image and og:image identical", () => {
    // check-seo fails the build when these disagree; catching it here says
    // WHICH page and WHY rather than failing a whole deploy on a diff of URLs.
    for (const html of [relicShot, bossShot, relicBare, bossBare]) {
      const schema = html.match(/"image":\s*"([^"]+)"/)?.[1];
      expect(schema).toBe(ogImage(html));
    }
  });

  it("embeds the search shot as a real <img>, as WebP", () => {
    // An <img> in the document, not merely an og:image: Google Images ranks
    // what it finds ON the page and reads the alt text around it.
    for (const html of [relicShot, bossShot]) {
      const figure = html.match(
        /<figure class="drop-shot">[\s\S]*?<\/figure>/,
      )?.[0];
      expect(figure).toBeTruthy();
      expect(figure).toMatch(/<img[^>]+src="[^"]+\/shots\/[a-z0-9-]+\.webp"/);
      // Alt text that names the subject is the whole point of the embed.
      expect(figure).toMatch(/alt="[^"]{20,}"/);
    }
  });

  it("omits the figure entirely when the pictures are absent", () => {
    for (const html of [relicBare, bossBare]) {
      expect(html).not.toContain('class="drop-shot"');
    }
  });

  it("gives every page a breadcrumb trail matching its visible one", () => {
    // Google wants the markup to describe the breadcrumb the reader sees, so
    // the list is built from the very crumbs the page renders.
    const block = relicShot.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(block).toBeTruthy();
    const graph = JSON.parse(block as string);
    const crumbs = graph["@graph"].find(
      (n: { "@type": string }) => n["@type"] === "BreadcrumbList",
    );
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(
      ["LIBRARY", "ARSENAL", "EXCALIBUR"],
    );
    // The last crumb is the page itself and carries no URL — exactly the item
    // Google says to leave without one.
    expect(crumbs.itemListElement.at(-1).item).toBeUndefined();
  });
});
