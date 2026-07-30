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
  LEVELS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  giversForLevel,
  questsForLevel,
  type QuestDef,
} from "@game/core";

const QUESTS = Object.values(QUEST_DEFS);
const GIVERS = Object.values(QUEST_GIVER_DEFS);

describe("the campaign's quest givers", () => {
  it("stand on every map in the game", () => {
    // A venue with nobody on it who isn't trying to kill the hero is a venue
    // that reads as a level rather than as a place — the whole reason these
    // people exist (see content/quest-givers.yaml).
    for (const levelId of Object.keys(LEVELS)) {
      expect(
        giversForLevel(levelId).length,
        `${levelId} has nobody with an errand`,
      ).toBeGreaterThan(0);
    }
  });

  it("each stand inside the map they are placed on", () => {
    for (const giver of GIVERS) {
      const level = LEVELS[giver.level];
      expect(level, `${giver.id} names an unknown level`).toBeDefined();
      expect(giver.at.x, `${giver.id} x`).toBeGreaterThan(0);
      expect(giver.at.y, `${giver.id} y`).toBeGreaterThan(0);
      expect(giver.at.x, `${giver.id} x`).toBeLessThan(level!.width);
      expect(giver.at.y, `${giver.id} y`).toBeLessThan(level!.height);
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
  it("are handed out on every map", () => {
    for (const levelId of Object.keys(LEVELS)) {
      expect(
        questsForLevel(levelId).length,
        `${levelId} hands out no errands`,
      ).toBeGreaterThan(0);
    }
  });

  it("use all four kinds somewhere", () => {
    // The feature ships four shapes of errand; one that no shipped quest uses
    // is a shape nobody has ever seen work.
    const kinds = new Set(
      QUESTS.flatMap((q) => q.objectives.map((o) => o.kind)),
    );
    expect([...kinds].sort()).toEqual([
      "collect",
      "escort",
      "kill",
      "killNamed",
    ]);
  });

  it("give every map at least one chain", () => {
    // A chain is what turns three jobs into a reason to keep coming back to
    // one person. A map whose errands are all standalone has a to-do list.
    for (const levelId of Object.keys(LEVELS)) {
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
      // `xpShare` is a fraction of the hero's CURRENT level bar, so a value
      // near 1 is a free level for one errand — which would out-pace the
      // kills-per-level table the whole campaign is tuned against.
      expect(share, `${quest.id} xpShare`).toBeLessThanOrEqual(1);
    }
  });

  it("send the hero after breeds the map they are on actually spawns", () => {
    // The silent failure this exists for: a `kill` objective naming a breed
    // that never appears on that map is a quest that can never be completed,
    // and it looks exactly like bad luck. The schema checks the id EXISTS; only
    // here can it be checked against the level it is asked for.
    for (const quest of QUESTS) {
      const breeds = levelBreeds(quest.level);
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
      const level = LEVELS[quest.level]!;
      const inside = (p: { x: number; y: number }, what: string) => {
        expect(p.x, `${quest.id} ${what} x`).toBeGreaterThan(0);
        expect(p.y, `${quest.id} ${what} y`).toBeGreaterThan(0);
        expect(p.x, `${quest.id} ${what} x`).toBeLessThan(level.width);
        expect(p.y, `${quest.id} ${what} y`).toBeLessThan(level.height);
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
    // A `kill 40` on a map that spawns eight of that breed is the same
    // impossible-but-silent failure as naming a breed that isn't there.
    for (const quest of QUESTS) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "kill") continue;
        expect(objective.count, `${quest.id}`).toBeLessThanOrEqual(20);
      }
    }
  });
});

/** Every enemy id the level `levelId` can put on the field, from every source
 * it has — the pinned spawns, the wave budget, the packs and the spawn points.
 * Deliberately generous: a false NEGATIVE here fails a working quest, and the
 * check only has to catch a breed that appears nowhere at all. */
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
  return ids;
}

describe("a quest's story", () => {
  it("speaks in lines the box does not have to break", () => {
    // The dialogue box's own measure (see asset-tools/quest-schema.mjs): past
    // 34 characters the box wraps for the author, and the authored line break
    // — which is the whole craft of writing for a fixed box — stops being the
    // one the player reads.
    const long: string[] = [];
    const check = (lines: readonly string[], what: string) => {
      for (const line of lines) {
        if (line.length > 34) long.push(`${what}: "${line}"`);
      }
    };
    for (const quest of QUESTS) {
      quest.offer.forEach((page, i) => check(page, `${quest.id} offer[${i}]`));
      quest.complete.forEach((page, i) =>
        check(page, `${quest.id} complete[${i}]`),
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
    for (const levelId of Object.keys(LEVELS)) {
      const onMap = questsForLevel(levelId);
      expect(
        onMap.some((q) => (q.requires?.length ?? 0) === 0),
        `${levelId}: every errand is gated behind another`,
      ).toBe(true);
    }
  });

  it("each start from a link the same PERSON hands out", () => {
    // The gate is read while the hero stands on this map, in front of this
    // person; a prerequisite owned by somebody else across the level is a
    // chain the player has no way to see the shape of.
    for (const quest of QUESTS) {
      for (const id of quest.requires ?? []) {
        const prior = QUEST_DEFS[id] as QuestDef | undefined;
        expect(prior, `${quest.id} requires unknown "${id}"`).toBeDefined();
        expect(prior!.giver, `${quest.id} requires another giver's quest`).toBe(
          quest.giver,
        );
      }
    }
  });
});
