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
  ABILITY_DEFS,
  CUTSCENE_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  LEVEL_ORDER,
  NUKE_DEF_ID,
  QUALITY,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  STORY_ITEM_DEFS,
  TALENT_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  abilityDef,
  enemyDef,
  pickAbility,
  questXpReward,
  createGame,
  qualityOdds,
  talentCrippling,
  talentDef,
} from "@game/core";
import { mobContactScaleFor, hardMobHpScale } from "../../src/game/menace.ts";

import { escapeHtml } from "../../pwa/scripts/library/escape.mjs";
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
import { POWER_FIELDS } from "../../pwa/scripts/library/model-powers.mjs";
import { TALENT_FIELDS } from "../../pwa/scripts/library/model-talents.mjs";
import {
  CONJURE_NOUN,
  PROC_NOUN,
  SLOPE_NOUN,
} from "../../pwa/scripts/library/prose-talents.mjs";
import {
  talentPage,
  talentsIndex,
} from "../../pwa/scripts/library/render-talents.mjs";
import {
  powerPage,
  powersIndex,
} from "../../pwa/scripts/library/render-powers.mjs";
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
  QUEST_FIELDS,
  QUEST_GIVER_FIELDS,
} from "../../pwa/scripts/library/model-quests.mjs";
import {
  giverPage,
  questPage,
  questsIndex,
} from "../../pwa/scripts/library/render-quests.mjs";
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

const talentById = (id: string) => {
  const talent = model.talents.talents.find((t: { id: string }) => t.id === id);
  if (!talent) throw new Error(`no library model for talent "${id}"`);
  return talent;
};

const powerById = (id: string) => {
  const power = model.powers.powers.find((p: { id: string }) => p.id === id);
  if (!power) throw new Error(`no library model for power "${id}"`);
  return power;
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

  it("gives every ERRAND and every person who hands one out a page", () => {
    // Two catalogs, two routes: an errand is one job and a giver is a whole
    // chain, and the section is built on both being addressable (a mission page
    // links the people, a chain link links the errands).
    const questPages = new Set(
      model.quests.quests.map((quest: { id: string }) => quest.id),
    );
    expect(Object.keys(QUEST_DEFS).filter((id) => !questPages.has(id))).toEqual(
      [],
    );
    const giverPages = new Set(
      model.quests.givers.map((giver: { id: string }) => giver.id),
    );
    expect(
      Object.keys(QUEST_GIVER_DEFS).filter((id) => !giverPages.has(id)),
    ).toEqual([]);
  });

  it("files every errand under exactly one venue, with its giver's chain", () => {
    // Nothing may fall out of the index: an errand belongs to one map, and its
    // giver stands on that same map — the rule the compiler enforces and the
    // rule the index's whole shape rests on.
    const grouped = model.quests.groups.flatMap(
      (group: { quests: { id: string }[] }) =>
        group.quests.map((quest) => quest.id),
    );
    expect(grouped.sort()).toEqual(
      model.quests.quests.map((quest: { id: string }) => quest.id).sort(),
    );
    for (const giver of model.quests.givers) {
      expect(giver.quests.length, giver.id).toBeGreaterThan(0);
      for (const quest of giver.quests) {
        expect(QUEST_DEFS[quest.id]?.giver, quest.id).toBe(giver.id);
      }
    }
  });

  it("reads a chain forwards as well as backwards", () => {
    // `requires` is authored backwards, which is right for the offer gate and
    // useless to a reader: "what does turning this in open" only exists once
    // the whole catalog has been walked, and every page needs it.
    for (const quest of model.quests.quests) {
      for (const prior of quest.requires) {
        const before = model.quests.quests.find(
          (q: { id: string }) => q.id === prior.id,
        );
        expect(before, prior.id).toBeDefined();
        expect(
          before!.unlocks.map((next: { id: string }) => next.id),
          prior.id,
        ).toContain(quest.id);
      }
    }
  });

  it("gives every POWER in the catalog a page", () => {
    const paged = new Set(
      model.powers.powers.map((power: { id: string }) => power.id),
    );
    expect(Object.keys(ABILITY_DEFS).filter((id) => !paged.has(id))).toEqual(
      [],
    );
  });

  it("puts every power in exactly one group on the index", () => {
    // The index is grouped by the venue that introduces each power, with an
    // off-the-pools shelf so nothing can fall out of it — the screen-nuke is in
    // no venue's pool at all, and silently dropping the most familiar power in
    // the game would be the quietest failure this section has.
    const grouped = model.powers.groups.flatMap(
      (group: { entries: { id: string }[] }) =>
        group.entries.map((entry) => entry.id),
    );
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.length).toBe(model.powers.powers.length);
    expect(grouped).toContain(NUKE_DEF_ID);
  });

  it("gives every TALENT a page, in exactly one tree", () => {
    const paged = new Set(
      model.talents.talents.map((talent: { id: string }) => talent.id),
    );
    expect(Object.keys(TALENT_DEFS).filter((id) => !paged.has(id))).toEqual([]);
    // The index is three tree panels and nothing else, so a talent whose tree
    // the engine grew a fourth value for would vanish from it without a word.
    const grouped = model.talents.trees.flatMap(
      (tree: { entries: { id: string }[] }) =>
        tree.entries.map((entry) => entry.id),
    );
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.length).toBe(model.talents.talents.length);
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
    for (const index of [
      "",
      "bestiary",
      "arsenal",
      "talents",
      "powers",
      "missions",
      "errands",
      "story",
    ]) {
      expect(routes).toContain(index);
    }
    expect(routes.length).toBe(
      Object.keys(ENEMY_DEFS).length +
        model.items.length +
        model.powers.powers.length +
        model.talents.talents.length +
        model.missions.length +
        model.quests.quests.length +
        model.quests.givers.length +
        model.story.chapters.length +
        8,
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
    ["powerup", ABILITY_DEFS, POWER_FIELDS],
    ["talent", TALENT_DEFS, TALENT_FIELDS],
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

  it("refuses to build a page for an errand whose OBJECTIVE grew a field", () => {
    // An errand is authored in six nested shapes, and the nested ones are where
    // this rots quietly: a field added to an objective, a quest item, an escort
    // or a reward would be dropped from the one section of the page whose whole
    // subject is what the errand asks for.
    const objective = QUEST_DEFS.hq_night_log!
      .objectives[0] as unknown as Record<string, unknown>;
    objective.somethingNobodyRenders = true;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete objective.somethingNobodyRenders;
    }
  });

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
    ["quest", QUEST_DEFS, QUEST_FIELDS],
    ["quest giver", QUEST_GIVER_DEFS, QUEST_GIVER_FIELDS],
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

  it("refuses to build a page for a power carrying an unknown EFFECT field", () => {
    // The top-level walk only proves that `orbit` exists. A power is a
    // COMPOSITION of effect blocks and the catalog is designed to grow new
    // fields inside them, so the coverage has to reach INSIDE — otherwise a new
    // knob on `AbilityDef.orbit` is applied by the engine and missing from
    // every page that draws one, silently.
    const block = abilityDef("fire_orbs").orbit as unknown as Record<
      string,
      unknown
    >;
    block.somethingNobodyRenders = 1;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete block.somethingNobodyRenders;
    }
  });

  it("refuses to build a page for a talent carrying an unknown PROC field", () => {
    // Same reach-inside contract the powers have, for the same reason: a talent
    // is a composition, and a new knob on a proc block would be applied by the
    // engine and missing from the one page that describes it.
    const block = talentDef("frost_nova").frostNova as unknown as Record<
      string,
      unknown
    >;
    block.somethingNobodyRenders = 1;
    try {
      expect(() => libraryModel()).toThrow(/no library page renders/);
    } finally {
      delete block.somethingNobodyRenders;
    }
  });

  it("has a plain-words clause for every talent effect the catalog carries", () => {
    // The rank TABLE is covered by `TALENT_FIELDS`; the opening SENTENCE is not,
    // and a talent whose effect nobody wrote a clause for would introduce itself
    // as "a damage talent in the WARLORD tree." and stop — complete-looking, and
    // silent about the only thing the reader came for.
    const missing: string[] = [];
    for (const talent of model.talents.talents) {
      for (const readout of talent.readouts) {
        if (readout.id === "slopes") {
          for (const measure of readout.measures) {
            if (!(measure.key in SLOPE_NOUN)) missing.push(measure.key);
          }
        } else if (!(readout.id in PROC_NOUN)) missing.push(readout.id);
      }
      if (talent.conjure && !(talent.conjure.spell in CONJURE_NOUN)) {
        missing.push(talent.conjure.spell);
      }
    }
    expect(missing).toEqual([]);
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
        Math.round(
          enemyDef("wisp").hp *
            hardMobHpScale(level, rung.heroLevel, rung.difficulty),
        ),
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

  it("publishes the pool odds `pickAbility` actually obeys", () => {
    // The powers section's best table is "what share of this venue's pool is
    // this power", and it is the one figure on those pages the model works out
    // for itself rather than calling the engine for. So it is checked against
    // the engine's own picker: the band the model publishes is rolled at both
    // ends, and `pickAbility` has to hand back this very power for the whole of
    // it. A weight the model read wrong, or a share it divided by the wrong
    // total, fails here rather than misinforming a reader.
    for (const power of model.powers.powers) {
      for (const entry of power.pools) {
        const pool = LEVELS[entry.venue.id]!.loot!.abilityPool!;
        const [lo, hi] = entry.band as [number, number];
        expect(hi - lo).toBeCloseTo(entry.odds, 12);
        // Just inside each end of the band — the half-open interval this id owns.
        for (const roll of [lo + 1e-9, hi - 1e-9]) {
          expect(
            pickAbility(pool, roll),
            `${power.id} @ ${entry.venue.id}`,
          ).toBe(power.id);
        }
      }
    }
  });

  it("says where the ONE power no pool carries actually comes from", () => {
    // The bomb is in no venue's `abilityPool`, so the pool-driven model would
    // have filed it as unobtainable — a page stating something plainly untrue
    // about the commonest bailout in the game. Its two engine-side channels are
    // read from the very knobs the loot rules read.
    const nuke = powerById(NUKE_DEF_ID);
    expect(nuke.pools).toEqual([]);
    expect(nuke.bomb).toBeTruthy();
    expect(nuke.bomb.share).toBeGreaterThan(0);
    expect(nuke.bomb.crowd.threshold).toBeLessThan(nuke.bomb.crowd.full);
    // …and the ladder it publishes is the difficulty defs' own, JESUS's zero
    // included — the rung that is never rescued from a swarm.
    const jesus = nuke.bomb.crowd.rungs.find(
      (rung: { difficulty: string }) => rung.difficulty === "jesus",
    );
    expect(jesus.max).toBe(0);
    // Every other power is measured against its pools and carries no channels.
    for (const power of model.powers.powers) {
      if (power.id !== NUKE_DEF_ID) expect(power.bomb).toBeNull();
    }
  });

  it("prints the talent numbers a trained hero actually gets", () => {
    // The whole risk of this section is publishing an authored slope: a page
    // reading `chancePerRank: 0.16` off the YAML would say 80% at rank 5, where
    // the talent's own ceiling holds a real hero at 75%. So the tables are
    // checked against a REAL hero with the rank spent, through the very
    // accessor the run reads in a fight.
    const talent = talentById("crippling_shot");
    const hobble = talent.readouts.find(
      (readout: { id: string }) => readout.id === "crippling",
    );
    const state = createGame(1, LEVEL_ORDER[0] as string);
    for (const row of hobble.ranks) {
      state.player.talents = { crippling_shot: row.rank };
      const live = talentCrippling(state);
      expect(row.values.chance, `rank ${row.rank}`).toBeCloseTo(
        live!.chance,
        12,
      );
      expect(row.values.slowMs, `rank ${row.rank}`).toBe(live!.slowMs);
    }
    // …and the ceiling really does bite at the top, which is exactly the case
    // the authored slope would have got wrong.
    const top = hobble.ranks[hobble.ranks.length - 1];
    expect(hobble.cap.reached).toBe(true);
    expect(top.values.chance).toBe(hobble.cap.value);
    expect(top.values.chance).toBeLessThan(
      top.rank * talentDef("crippling_shot").crippling!.chancePerRank,
    );
  });

  it("says nothing at the ranks where a mastery kicker does not exist", () => {
    // EVASION's speed burst is armed only from its top rank, but the accessor
    // that reports the multiplier answers at every rank — reading it alone
    // would print a 1.35x against four ranks where no dodge ever opens a window
    // for it.
    const burst = talentById("evasion").readouts.find(
      (readout: { id: string }) => readout.id === "evasionBurst",
    );
    const rank = talentDef("evasion").evasionBurst!.rank;
    for (const row of burst.ranks) {
      if (row.rank < rank) expect(row.values.ms, `rank ${row.rank}`).toBeNull();
      else expect(row.values.ms).toBeGreaterThan(0);
    }
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
  // A composed power (two effect blocks), a power with authored art, and the
  // one the pools do not carry.
  const power = powerPage(powerById("sentry_grid"), model.powers, context);
  const nuke = powerPage(powerById(NUKE_DEF_ID), model.powers, context);
  const powers = powersIndex(model.powers, context);
  // One of every SHAPE of talent — a pure slope bag, a proc with a mastery rank
  // that does nothing until the top, and a conjuration tabled as a spell block.
  const slopeTalent = talentPage(
    talentById("executioner"),
    model.talents,
    context,
  );
  const procTalent = talentPage(talentById("evasion"), model.talents, context);
  const conjureTalent = talentPage(
    talentById("orbiting_flames"),
    model.talents,
    context,
  );
  const talents = talentsIndex(model.talents, context);
  // One of every SHAPE of errand — a fetch (the pieces and who carries them), an
  // escort (the follower's own numbers), and a chain link gated on two others —
  // plus the person handing three of them out.
  const questById = (id: string) => {
    const quest = model.quests.quests.find((q: { id: string }) => q.id === id);
    if (!quest) throw new Error(`no library model for quest "${id}"`);
    return quest;
  };
  const fetchQuest = questPage(
    questById("hq_night_log"),
    model.quests,
    context,
  );
  const escortQuest = questPage(
    questById("rift_thomas"),
    model.quests,
    context,
  );
  const giverById = (id: string) => {
    const found = model.quests.givers.find((g: { id: string }) => g.id === id);
    if (!found) throw new Error(`no library model for quest giver "${id}"`);
    return found;
  };
  const giver = giverPage(giverById("hq_intern"), model.quests, context);
  const errands = questsIndex(model.quests, context);
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
    power,
    nuke,
    powers,
    slopeTalent,
    procTalent,
    conjureTalent,
    talents,
    fetchQuest,
    escortQuest,
    giver,
    errands,
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

  it("prints what a monster IS, in the open, on every page", () => {
    // The lore is not a spoiler and must not sit behind the reveal: a boss's
    // scene is something a player earns, but what the thing standing in front
    // of them is is the reason they opened the page. And a MINION carries it
    // too — the rank and file are the only monsters that never get to explain
    // themselves in the game itself, which is the whole reason the field is
    // required rather than reserved for the named cast.
    for (const [name, html] of [
      ["boss", boss],
      ["minion", minion],
    ] as const) {
      const id = name === "boss" ? "armstrong" : "wisp";
      const lore = enemyDef(id).lore;
      expect(lore.length).toBeGreaterThan(0);
      const at = html.indexOf(escapeHtml(lore));
      expect(at, `${name} page omits its lore`).toBeGreaterThan(-1);
      const reveal = html.indexOf('class="reveal"');
      if (reveal >= 0) expect(at).toBeLessThan(reveal);
    }
  });

  it("keeps a monster with no story out of the reveal entirely", () => {
    // No empty sections: a minion with nothing to say has no heading for it.
    expect(minion).not.toContain('class="reveal"');
    expect(minion).not.toContain("What it says");
  });

  it("opens every rack on the rank and file and covers the names", () => {
    // WHO guards a venue is the biggest spoiler this site holds, and both racks
    // used to lead with it. The rank and file are what a run walks into, so
    // they are what is in the open; every elite and boss sits behind a cover —
    // still in the DOM, still indexed, just not read by accident.
    const outside = (html: string) =>
      html.replace(/<div class="reveal">[\s\S]*?\n<\/div>/g, "");
    for (const [name, html] of [
      ["index", index],
      ["front", front],
    ] as const) {
      const open = outside(html);
      // Every rack row is a link to a monster's page, so the roles in the open
      // can be read straight off the classes the rows wear.
      expect(open, name).toContain('class="role-minion"');
      expect(open, name).not.toContain('class="role-boss"');
      expect(open, name).not.toContain('class="role-elite"');
      // …and the covered half is really there rather than dropped.
      expect(html, name).toContain('class="role-boss"');
    }
    // Every venue's section carries its own switch, plus one that lifts them all.
    expect(index).toContain('class="reveal-all-toggle"');
    for (const venue of model.venues) {
      expect(index).toContain(`id="reveal-${venue.slug}"`);
    }
  });

  it("says which of three same-named monsters a rack row means", () => {
    // ELON MOSQUE is three different bosses on three different maps. Inside a
    // venue's own section the heading has already said which; anywhere the name
    // travels alone — a flat rack, a `<title>`, a drop line — it has to say so
    // itself, or the row is a coin toss.
    const mosques = model.enemies.filter(
      (e: { name: string }) => e.name === "ELON MOSQUE",
    );
    expect(mosques.length).toBeGreaterThan(1);
    for (const mosque of mosques) {
      const venue = mosque.home?.name;
      expect(venue).toBeTruthy();
      expect(mosque.nameQualifier).toBe(venue);
      expect(mosque.distinctName).toBe(`ELON MOSQUE (${venue})`);
      // The front door's rack is flat, so it prints the qualifier…
      expect(front).toContain(`<span class="where">${venue}</span></span>`);
    }
    // …and the bestiary's, which sits under the venue's own heading, does not.
    expect(index).not.toContain('<span class="where">MARS</span>');
    // Two that share a venue as well fall back to what their ids don't share.
    expect(byId("vanguard_scientist").nameQualifier).toBe("VANGUARD");
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

  it("prints what a power IS, and every block it actually carries", () => {
    // A power's authored `lore` is the only place in the whole product that
    // says what the thing is — the game never gets a chance to. And a page must
    // describe every effect block on the def rather than the one its `kind`
    // names, or a composed power is half-reported with nothing saying so.
    for (const model_ of [powerById("sentry_grid"), powerById("ion_wake")]) {
      expect(model_.lore.length).toBeGreaterThan(0);
    }
    expect(power).toContain(escapeHtml(abilityDef("sentry_grid").lore));
    const blocks = powerById("sentry_grid").effects.map(
      (effect: { block: string }) => effect.block,
    );
    for (const block of blocks) expect(power).toContain(`id="effect-${block}"`);
    // Its numbers are the catalog's, in the unit the page declares.
    expect(power).toContain(`${abilityDef("sentry_grid").turret!.count}`);
  });

  it("shows a power's own sprites — the pickup and what it puts on the field", () => {
    // Two different pictures for half the catalog: the SENTRY GRID is a red
    // panel lying on the floor and four guns once spent. A page showing only
    // the pickup leaves a reader unable to recognise what they are looking at.
    expect(power).toContain(`sprites/${abilityDef("sentry_grid").icon}.png`);
    expect(power).toContain(
      `sprites/${abilityDef("sentry_grid").turret!.sprite}.png`,
    );
  });

  it("keeps the powers in the open — a power is not a spoiler", () => {
    // Every player meets every one of them by picking it up off a floor, so
    // nothing here earns a cover the way a boss's speech does.
    for (const html of [power, nuke, powers]) {
      expect(html).not.toContain('class="reveal"');
    }
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
    // …a mission's pool leads to each power it hands out, and each power leads
    // back to every venue that carries it.
    expect(mission).toContain('href="/library/powers/moonfall/"');
    expect(powers).toContain('href="/library/powers/sentry-grid/"');
    expect(power).toContain('href="/library/missions/the-bunker/"');
    for (const front of [landing(model, context)]) {
      for (const section of ["bestiary", "arsenal", "powers", "missions"]) {
        expect(front).toContain(`href="/library/${section}/"`);
      }
    }
  });
  it("prices an errand's XP share with the engine's own reward function", () => {
    // `xpShare: 0.35` is a third of a level BAR, so the only publishable form
    // of it is what it comes to for a hero — and that has to be the figure the
    // offer box quotes and the handover pays, not a formula copied into a
    // build script.
    const quest = questById("hq_night_log");
    const reward = QUEST_DEFS.hq_night_log!.reward;
    expect(quest.reward.xp.length).toBeGreaterThan(0);
    for (const rung of quest.reward.xp) {
      const state = {
        player: { level: rung.heroLevel },
        difficulty: rung.difficulty,
      } as unknown as Parameters<typeof questXpReward>[0];
      expect(rung.xp, rung.difficulty).toBe(questXpReward(state, reward));
    }
    // JESUS scales to the hero rather than to an authored level, so it has no
    // reference hero to price against and is left off rather than guessed at.
    expect(
      quest.reward.xp.map((rung: { difficulty: string }) => rung.difficulty),
    ).not.toContain("jesus");
  });

  it("covers an errand's conversation without dropping it from the page", () => {
    // The ask, the nag and the handover are spoken lines, and a spoiler in the
    // way a boss's arrival scene is — so they sit behind the blur. Behind it,
    // not out of the document: the whole point of publishing them is that they
    // are indexed.
    const def = QUEST_DEFS.hq_night_log!;
    expect(fetchQuest).toContain(def.offer[0]![0]!);
    expect(fetchQuest).toContain(def.complete[0]![0]!);
    expect(fetchQuest).toContain(def.incomplete![0]!);
    expect(fetchQuest).toContain('class="reveal-body"');
    expect(fetchQuest).not.toContain("display:none");
    // An escort's two lines are spoken too, and go behind the same cover.
    const escort = QUEST_DEFS.rift_thomas!.escorts![0]!;
    const outside = escortQuest.replace(
      /<div class="reveal">[\s\S]*?\n<\/div>/g,
      "",
    );
    expect(escortQuest).toContain(escort.arrived!);
    expect(outside).not.toContain(escort.arrived!);
    // …and the description a search result shows must not hand any of it over.
    const description = fetchQuest.match(
      /<meta name="description" content="([^"]+)"/,
    )?.[1];
    expect(description).toBeTruthy();
    expect(description).not.toContain(def.offer[0]![0]!);
  });

  it("prints what an errand and its giver ARE, in the open", () => {
    // The same rule the bestiary's lore follows: what the thing IS is the
    // reason the page was opened, and is not something the reader earns.
    for (const [name, html, lore] of [
      ["errand", fetchQuest, QUEST_DEFS.hq_night_log!.lore],
      ["giver", giver, QUEST_GIVER_DEFS.hq_intern!.lore],
    ] as const) {
      const at = html.indexOf(escapeHtml(lore.trim()));
      expect(at, `${name} page omits its lore`).toBeGreaterThan(-1);
      const covered = html.indexOf('class="reveal"');
      if (covered >= 0) expect(at, name).toBeLessThan(covered);
    }
  });

  it("links an errand to everything it names", () => {
    // The section is only worth having as a graph: the breed a cull sends you
    // at, the person who asked, the venue it is on, and the next link of the
    // chain are all pages, and all of them are one click away.
    expect(fetchQuest).toContain("/library/bestiary/intern/");
    expect(fetchQuest).toContain("/library/errands/who/hq-intern/");
    expect(fetchQuest).toContain("/library/missions/spacez-hq/");
    expect(fetchQuest).toContain("/library/errands/hq-walk-out/");
    // …and the mission page names the people standing on it.
    expect(mission).toContain("/library/errands/who/moon-radio/");
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
