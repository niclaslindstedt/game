// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LIBRARY's guard rail (docs/library-plan.md). The library is ~100 generated
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

import { ENEMY_DEFS, enemyDef } from "@game/core";
import { mobContactScaleFor, hardMobHpScale } from "../../src/game/menace.ts";

import {
  ENEMY_FIELDS,
  libraryModel,
  libraryRoutes,
} from "../../pwa/scripts/library/model.mjs";
import {
  bestiaryIndex,
  enemyPage,
  landing,
} from "../../pwa/scripts/library/render-bestiary.mjs";

const model = libraryModel();
const context = {
  base: "/",
  groundFor: (id: string) => `/library/grounds/${id}.png`,
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

  it("routes every page exactly once, and lists the landing and index", () => {
    const routes = libraryRoutes().map((route) => route.path);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).toContain("");
    expect(routes).toContain("bestiary");
    expect(routes.length).toBe(Object.keys(ENEMY_DEFS).length + 2);
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
  const pages = { boss, minion, index, front };

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
      expect(html, name).toMatch(
        /<meta name="description" content="[^"]{20,}"/,
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

  it("links the pages to each other", () => {
    expect(index).toContain('href="/library/bestiary/armstrong/"');
    expect(boss).toContain('href="/library/bestiary/#moon"');
    expect(front).toContain('href="/library/bestiary/"');
  });
});
