// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHIPPED CAMPAIGN'S ERRANDS.
//
// The compile step (scripts/generate-quests.mjs + asset-tools/quest-schema.mjs)
// already refuses a quest whose ids resolve to nothing. What it CANNOT check is
// whether the errands add up to a campaign: that every map has some, that the
// four kinds are all actually used, that a chain is a chain rather than three
// unrelated jobs, and that nobody has quietly authored a reward that outpaces
// the leveling curve the whole game is tuned on.
//
// A sequel deletes this file and writes its own; the ENGINE rules are pinned on
// synthetic content in tests/engine/quests_test.ts and survive.

import { describe, expect, it } from "vitest";

import {
  LEVEL_ORDER,
  LEVELS,
  MAP_BLUEPRINTS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  // The module-local `QUESTS` below is the CATALOG; this is the tuning block.
  QUESTS as QUEST_TUNING,
  SECRET_LEVEL_ORDER,
  giversForLevel,
  questsForLevel,
  type QuestDef,
  questPageLines,
} from "@game/core";

const QUESTS = Object.values(QUEST_DEFS);
const GIVERS = Object.values(QUEST_GIVER_DEFS);
/** THE VENUES AN ERRAND CAN BE HANDED OUT ON — every level the player can
 * reach. A DISPLAY CASE (`display: true` — the effects gallery's stage) has no
 * cast, no bystanders and nowhere to walk to, so an "every map owes one" rule
 * is not about it. */
const VENUES = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];

describe("the campaign's quest givers", () => {
  it("stand on every map in the game", () => {
    // A venue with nobody on it who isn't trying to kill the hero is a venue
    // that reads as a level rather than as a place — the whole reason these
    // people exist (see content/quest-givers.yaml).
    for (const levelId of VENUES) {
      // The HUB is exempt from the REQUIREMENT: home is a breather first,
      // and whether somebody waits there (RUTH does) is the story's call,
      // not this rule's.
      if (LEVELS[levelId]!.objective.type === "hub") continue;
      expect(
        giversForLevel(levelId).length,
        `${levelId} has nobody with an errand`,
      ).toBeGreaterThan(0);
    }
  });

  it("each stand inside the map they are placed on, at every size", () => {
    // A giver's `at` is a HINT on a carved map — `questSpot` clamps it into the
    // world and rings outward to clear ground (see quests/placement.ts) — so
    // the honest check is against the SMALLEST carve the mission can produce.
    // Inside that, the clamp never has to move anybody on any size.
    for (const giver of GIVERS) {
      const level = LEVELS[giver.level];
      expect(level, `${giver.id} names an unknown level`).toBeDefined();
      const small = MAP_BLUEPRINTS[giver.level]?.size;
      expect(small, `${giver.level} ships no blueprint`).toBeDefined();
      expect(giver.at.x, `${giver.id} x`).toBeGreaterThan(0);
      expect(giver.at.y, `${giver.id} y`).toBeGreaterThan(0);
      expect(giver.at.x, `${giver.id} x`).toBeLessThan(small!.width);
      expect(giver.at.y, `${giver.id} y`).toBeLessThan(small!.height);
    }
  });

  it("each owe a paragraph", () => {
    // The same rule every monster owes (`EnemyDef.lore`): a person the player
    // walks up to and gets no sense of is a vending machine with a face.
    for (const giver of GIVERS) {
      expect(giver.lore.trim().length, giver.id).toBeGreaterThan(80);
    }
  });
});

describe("the campaign's errands", () => {
  it("each owe a paragraph too", () => {
    // The person's paragraph says who is asking; this one says what the job
    // IS, described rather than spoken. Without it an errand's only prose is
    // its offer dialogue — which is written to be heard while standing in
    // front of somebody, and which the library keeps behind a spoiler cover.
    for (const quest of QUESTS) {
      expect(quest.lore.trim().length, quest.id).toBeGreaterThan(80);
    }
  });

  it("are handed out on every map", () => {
    for (const levelId of VENUES) {
      if (LEVELS[levelId]!.objective.type === "hub") continue; // home, not an errand board
      expect(
        questsForLevel(levelId).length,
        `${levelId} hands out no errands`,
      ).toBeGreaterThan(0);
    }
  });

  it("use every kind of objective somewhere", () => {
    // The feature ships eight shapes of errand; one that no shipped quest uses
    // is a shape nobody has ever seen work. The four originals are the side
    // errands' vocabulary; the four the campaign chain brought are a search, a
    // conversation outcome, a sale across the trader's counter, and the level
    // gate on the last link.
    const kinds = new Set(
      QUESTS.flatMap((q) => q.objectives.map((o) => o.kind)),
    );
    expect([...kinds].sort()).toEqual([
      "collect",
      "escort",
      "flag",
      "kill",
      "killNamed",
      "reachLevel",
      "sell",
      "visit",
    ]);
  });

  it("give every map at least one chain", () => {
    // A chain is what turns three jobs into a reason to keep coming back to
    // one person. A map whose errands are all standalone has a to-do list.
    for (const levelId of VENUES) {
      if (LEVELS[levelId]!.objective.type === "hub") continue; // home, not an errand board
      const onMap = questsForLevel(levelId);
      expect(
        onMap.some((q) => (q.requires?.length ?? 0) > 0),
        `${levelId} has no quest chain`,
      ).toBe(true);
    }
  });

  it("pay something, and never more than the curve can absorb", () => {
    for (const quest of QUESTS) {
      expect(quest.reward, `${quest.id} pays nothing`).toBeDefined();
      const share = quest.reward?.xpShare ?? 0;
      // `xpShare` is a fraction of the hero's CURRENT level bar. Errands are
      // deliberately a progression PILLAR on the parts-era maps — the garrison
      // fields fewer bodies per minute than the old knots, and quest pay makes
      // up part of the difference — so the biggest single errand may pay up to
      // a level and a half. Past that a chain out-paces the kills-per-level
      // table entirely.
      expect(share, `${quest.id} xpShare`).toBeLessThanOrEqual(1.5);
    }
  });

  it("send the hero after breeds the map they are on actually spawns", () => {
    // The silent failure this exists for: a `kill` objective naming a breed
    // that never appears on that map is a quest that can never be completed,
    // and it looks exactly like bad luck. The schema checks the id EXISTS; only
    // here can it be checked against the level it is asked for.
    for (const quest of QUESTS) {
      // A HUB errand is the one sanctioned exception: accepted at home,
      // carried across the campaign (`campaign: true`), its carriers live on
      // the maps the trail visits — the engine rolls a collect piece off any
      // ACTIVE errand's carriers wherever the kill happens (see
      // `maybeDropQuestItem`). Home spawns nothing by design, so a hub
      // chain's breeds are checked against the whole game instead.
      const hub = LEVELS[quest.level]!.objective.type === "hub";
      const breeds = hub
        ? VENUES.reduce(
            (all, id) => new Set([...all, ...levelBreeds(id)]),
            new Set<string>(),
          )
        : levelBreeds(quest.level);
      for (const objective of quest.objectives) {
        if (objective.kind !== "kill" && objective.kind !== "killNamed") {
          continue;
        }
        expect(
          breeds.has(objective.enemy),
          `${quest.id} wants "${objective.enemy}", which ${quest.level} never spawns`,
        ).toBe(true);
      }
      for (const item of quest.items ?? []) {
        for (const breed of item.dropFrom ?? []) {
          expect(
            breeds.has(breed),
            `${quest.id} drops off "${breed}", which ${quest.level} never spawns`,
          ).toBe(true);
        }
      }
    }
  });

  it("place every fetch piece and escort destination inside the map", () => {
    for (const quest of QUESTS) {
      // The smallest carve, for the reason the givers' own check uses it.
      const small = MAP_BLUEPRINTS[quest.level]!.size;
      const inside = (p: { x: number; y: number }, what: string) => {
        expect(p.x, `${quest.id} ${what} x`).toBeGreaterThan(0);
        expect(p.y, `${quest.id} ${what} y`).toBeGreaterThan(0);
        expect(p.x, `${quest.id} ${what} x`).toBeLessThan(small.width);
        expect(p.y, `${quest.id} ${what} y`).toBeLessThan(small.height);
      };
      for (const item of quest.items ?? []) {
        for (const at of item.at ?? []) inside(at, "placed piece");
      }
      for (const escort of quest.escorts ?? []) {
        if (escort.at) inside(escort.at, "escort start");
      }
      for (const objective of quest.objectives) {
        if (objective.kind === "escort") inside(objective.to, "escort goal");
      }
    }
  });

  it("ask for a number of kills a map's horde can actually supply", () => {
    // A `kill 400` on a map whose knots queue eighty of that breed is the same
    // impossible-but-silent failure as naming a breed that isn't there — the
    // tracker sits short with nothing left alive to count.
    //
    // The ceiling is FORTY, not the eight and ten the errands opened at: a run
    // of GOODCO HQ kills a hundred and seventy-six monsters in three minutes,
    // so a ten-kill job was over before the offer box had been read twice. What
    // makes forty safe on the scarcer breeds is `quests/restock.ts` — an errand
    // tops the horde up as it is taken when the field can no longer pay for it
    // — and that is a top-up rather than a licence: the field still has to be
    // able to hold the fight, which is what keeps this bounded at all.
    for (const quest of QUESTS) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "kill") continue;
        expect(objective.count, `${quest.id}`).toBeLessThanOrEqual(40);
      }
    }
  });

  it("never let a fetch piece off a horde breed fall out faster than 1 in 8", () => {
    // THE SAME RULE THE BUILD REFUSES (asset-tools/quest-schema.mjs), held here
    // against the COMPILED catalog so it also covers the pieces that name no
    // `dropChance` at all and inherit `QUESTS.dropChance` — the config knob
    // could be raised back past the ceiling without a single YAML file
    // changing, and every fetch errand in the game would quietly become a
    // two-room detour with a counter on it.
    const CEILING = 0.125;
    for (const quest of QUESTS) {
      const hub = LEVELS[quest.level]!.objective.type === "hub";
      const horde = hub ? allHordeBreeds() : hordeBreeds(quest.level);
      for (const item of quest.items ?? []) {
        const farmed = (item.dropFrom ?? []).filter((b) => horde.has(b));
        if (farmed.length === 0) continue; // a one-off carrier — see the schema
        expect(
          item.dropChance ?? QUEST_TUNING.dropChance,
          `${quest.id} drops off ${farmed.join(", ")}`,
        ).toBeLessThanOrEqual(CEILING);
      }
    }
  });
});

/** The breeds the venue's blueprint horde is MADE of — the farmable ones. An
 * elite, a guardian, a bystander or a hellborn is met once and is not here. */
function hordeBreeds(levelId: string): Set<string> {
  const members = MAP_BLUEPRINTS[levelId]?.horde?.members ?? [];
  return new Set(members.map((m) => m.enemy));
}

/** Every map's horde at once — what a HUB errand's carriers are checked
 * against, since a campaign chain is carried wherever the trail goes. */
function allHordeBreeds(): Set<string> {
  return new Set(VENUES.flatMap((id) => [...hordeBreeds(id)]));
}

/** Every enemy id the mission `levelId` can put on the field, from every source
 * it has — the blueprint's horde, its elites, guardians, bystanders, hellborn
 * and boss, plus whatever the mission itself still names (the opening strike's
 * vanguard). Deliberately generous: a false NEGATIVE here fails a working
 * quest, and the check only has to catch a breed that appears nowhere at all. */
function levelBreeds(levelId: string): Set<string> {
  const level = LEVELS[levelId];
  const ids = new Set<string>();
  if (!level) return ids;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "enemy" && typeof value === "string") ids.add(value);
      else walk(value);
    }
  };
  walk(level as unknown as Record<string, unknown>);
  walk(MAP_BLUEPRINTS[levelId] as unknown as Record<string, unknown>);
  return ids;
}

describe("a quest's story", () => {
  it("speaks in pages that fit one screenful of the box", () => {
    // THE BUDGET IS PER PAGE, NOT PER LINE (see asset-tools/quest-schema.mjs).
    // An authored line is a paragraph the box flows into the column it really
    // has, so a row's character count is the renderer's business. What the
    // author still owns is how much thought lands before the box makes the
    // player tap for the rest — three rows of the narrowest box the game
    // supports — and how many EXPLICIT breaks a page spends, which the whole
    // shipped campaign keeps to a handful.
    const PAGE_CHARS = 120;
    const PAGE_LINES = 2;
    const long: string[] = [];
    const check = (lines: readonly string[], what: string) => {
      const page = lines.join(" ");
      if (page.length > PAGE_CHARS) long.push(`${what}: "${page}"`);
      if (lines.length > PAGE_LINES) {
        long.push(`${what} is cut into ${lines.length} lines`);
      }
    };
    for (const quest of QUESTS) {
      quest.offer.forEach((page, i) =>
        check(questPageLines(page), `${quest.id} offer[${i}]`),
      );
      quest.complete.forEach((page, i) =>
        check(questPageLines(page), `${quest.id} complete[${i}]`),
      );
      if (quest.incomplete) check(quest.incomplete, `${quest.id} incomplete`);
    }
    for (const giver of GIVERS) {
      if (giver.greeting) check(giver.greeting, `${giver.id} greeting`);
      if (giver.farewell) check(giver.farewell, `${giver.id} farewell`);
    }
    expect(long).toEqual([]);
  });

  it("gives every errand a name, an ask and a thank-you", () => {
    for (const quest of QUESTS) {
      expect(quest.name.trim(), quest.id).not.toBe("");
      expect(quest.offer.length, `${quest.id} offer`).toBeGreaterThan(0);
      expect(quest.complete.length, `${quest.id} complete`).toBeGreaterThan(0);
    }
  });
});

describe("the quest chains", () => {
  it("each start from a link that waits on nothing", () => {
    // A map whose every errand has a prerequisite offers nothing at all — the
    // gate never opens, and it is invisible: the giver simply has no `!`.
    for (const levelId of VENUES) {
      if (LEVELS[levelId]!.objective.type === "hub") continue; // home, not an errand board
      const onMap = questsForLevel(levelId);
      expect(
        onMap.some((q) => (q.requires?.length ?? 0) === 0),
        `${levelId}: every errand is gated behind another`,
      ).toBe(true);
    }
  });

  it("each start from a link the same PERSON hands out — unless it is a campaign chain", () => {
    // A RUN chain's gate is read while the hero stands on this map, in front of
    // this person; a prerequisite owned by somebody else across the level is a
    // chain the player has no way to see the shape of.
    //
    // A CAMPAIGN chain is the deliberate exception and moving between people is
    // the whole point of one: it is carried on the hero, so its next link is
    // handed out by whoever is standing on the venue the story has reached. The
    // build enforces the other half of that rule — a chain may not MIX the two
    // (see validateQuestCatalog) — which is what keeps the gate readable.
    for (const quest of QUESTS) {
      for (const id of quest.requires ?? []) {
        const prior = QUEST_DEFS[id] as QuestDef | undefined;
        expect(prior, `${quest.id} requires unknown "${id}"`).toBeDefined();
        if (quest.campaign) {
          expect(
            prior!.campaign,
            `${quest.id} is a campaign link but requires the run quest "${id}"`,
          ).toBe(true);
          continue;
        }
        expect(prior!.giver, `${quest.id} requires another giver's quest`).toBe(
          quest.giver,
        );
      }
    }
  });
});
