// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievements system (website/src/game/achievement-*.ts): the lifetime
// totals reducer fed by engine events, the unlock store built on the
// oss-framework ledger, and the catalog's own sanity (stable unique ids, one
// badge per hand-authored unique, icons that exist in the shipped atlas, and
// nothing unlocked on a blank slate). Enemy roles are looked up from the live
// catalog by ROLE, not by hardcoded id, so a content rewrite doesn't break
// the tracking rules asserted here.

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ENEMY_DEFS,
  LEVEL_ORDER,
  UNIQUE_IDS,
  type GameEvent,
  type GameStats,
} from "@game/core";

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
} from "../website/src/game/achievement-defs.ts";
import {
  applyEventsToTotals,
  applyRunStart,
  applyWornEquipment,
  emptyTotals,
  EQUIP_SLOTS,
  maxLevelRuns,
  SPEED_CLEAR_MS,
} from "../website/src/game/achievement-totals.ts";
import {
  acknowledgeAchievements,
  getAchievements,
  recordAchievementEvents,
  recordRunStarted,
  recordWornEquipment,
  resetAchievementsForTest,
  unseenAchievements,
} from "../website/src/game/achievements.ts";

/** Pick a shipped enemy id by role so the suite never hardcodes content. */
function idByRole(role: string): string {
  const def = Object.values(ENEMY_DEFS).find((d) => d.role === role);
  if (!def) throw new Error(`no shipped enemy with role ${role}`);
  return def.id;
}

function stats(overrides: Partial<GameStats> = {}): GameStats {
  return {
    kills: 0,
    totalEnemies: 0,
    shotsFired: 0,
    damageDealt: 0,
    damageTaken: 0,
    itemsCollected: 0,
    xpGained: 0,
    timeMs: 0,
    ...overrides,
  };
}

const CTX = {
  levelId: LEVEL_ORDER[0]!,
  difficulty: "easy",
  stats: stats(),
};

function kill(defId: string): GameEvent {
  return {
    type: "enemyKilled",
    pos: { x: 0, y: 0 },
    defId,
    damage: 1,
    crit: false,
    xp: 1,
  };
}

describe("lifetime totals reducer", () => {
  it("books kills by role, and a fled boss as an escape, not a kill", () => {
    const totals = emptyTotals();
    const changed = applyEventsToTotals(
      totals,
      [
        kill(idByRole("minion")),
        kill(idByRole("elite")),
        kill(idByRole("boss")),
        { type: "bossFled", pos: { x: 0, y: 0 }, defId: idByRole("boss") },
      ],
      CTX,
    );
    expect(changed).toBe(true);
    expect(totals.kills).toBe(3);
    expect(totals.eliteKills).toBe(1);
    expect(totals.bossKills).toBe(1);
    expect(totals.bossFlees).toBe(1);
  });

  it("treats an unknown enemy id as a minion instead of crashing", () => {
    const totals = emptyTotals();
    applyEventsToTotals(totals, [kill("retired_mob_from_v1")], CTX);
    expect(totals.kills).toBe(1);
    expect(totals.eliteKills).toBe(0);
  });

  it("counts equipment finds by tier and dedupes distinct uniques", () => {
    const totals = emptyTotals();
    const events: GameEvent[] = [
      { type: "itemCollected", kind: "equipment", tier: "magic" },
      { type: "itemCollected", kind: "equipment", tier: "rare" },
      {
        type: "itemCollected",
        kind: "equipment",
        tier: "unique",
        uniqueId: "excalibur",
      },
      {
        type: "itemCollected",
        kind: "equipment",
        tier: "unique",
        uniqueId: "excalibur",
      },
      { type: "itemCollected", kind: "equipment", tier: "legendary" },
      // Loose pickups never count toward loot tiers.
      { type: "itemCollected", kind: "medkit", name: "MEDKIT" },
    ];
    applyEventsToTotals(totals, events, CTX);
    expect(totals.magicFound).toBe(1);
    expect(totals.rareFound).toBe(1);
    expect(totals.uniqueFound).toBe(2);
    expect(totals.legendaryFound).toBe(1);
    expect(totals.uniquesFound).toEqual(["excalibur"]);
  });

  it("books a victory as clears, and the last level as a difficulty beaten", () => {
    const totals = emptyTotals();
    const first = LEVEL_ORDER[0]!;
    const last = LEVEL_ORDER[LEVEL_ORDER.length - 1]!;
    applyEventsToTotals(totals, [{ type: "victory" }], {
      levelId: first,
      difficulty: "easy",
      stats: stats({ damageTaken: 10, timeMs: SPEED_CLEAR_MS + 1 }),
    });
    expect(totals.levelClears).toEqual([first]);
    expect(totals.clears).toEqual([`easy:${first}`]);
    expect(totals.difficultiesBeaten).toEqual([]);
    applyEventsToTotals(totals, [{ type: "victory" }], {
      levelId: last,
      difficulty: "easy",
      stats: stats({ damageTaken: 10, timeMs: SPEED_CLEAR_MS + 1 }),
    });
    expect(totals.difficultiesBeaten).toEqual(["easy"]);
  });

  it("flags untouchable and speed clears off the run stats", () => {
    const totals = emptyTotals();
    applyEventsToTotals(totals, [{ type: "victory" }], {
      levelId: LEVEL_ORDER[0]!,
      difficulty: "easy",
      stats: stats({ damageTaken: 0, timeMs: SPEED_CLEAR_MS - 1 }),
    });
    expect(totals.untouchableClears).toBe(1);
    expect(totals.speedClears).toBe(1);
  });

  it("tracks the hero's highest level and the deepest menace stage", () => {
    const totals = emptyTotals();
    applyEventsToTotals(
      totals,
      [
        { type: "levelUp", level: 7, gains: [] },
        { type: "levelUp", level: 5, gains: [] },
        { type: "menaceRose", stage: 4 },
        { type: "menaceRose", stage: 2 },
      ],
      CTX,
    );
    expect(totals.heroLevel).toBe(7);
    expect(totals.maxMenace).toBe(4);
  });

  it("tracks the hardest single hit and the biggest one-strike burst", () => {
    const totals = emptyTotals();
    // One tick: a 40-damage hit plus a 60-damage kill = a 100 burst.
    applyEventsToTotals(
      totals,
      [
        {
          type: "enemyHit",
          pos: { x: 0, y: 0 },
          crit: false,
          damage: 40,
          defId: "retired_mob_from_v1",
        },
        { ...kill("retired_mob_from_v1"), damage: 60 } as GameEvent,
      ],
      CTX,
    );
    expect(totals.maxSingleHit).toBe(60);
    expect(totals.maxBurstDamage).toBe(100);
    expect(totals.totalDamage).toBe(100);
    // A later, smaller tick moves neither record — but still adds up.
    applyEventsToTotals(
      totals,
      [
        {
          type: "enemyHit",
          pos: { x: 0, y: 0 },
          crit: false,
          damage: 50,
          defId: "retired_mob_from_v1",
        },
      ],
      CTX,
    );
    expect(totals.maxSingleHit).toBe(60);
    expect(totals.maxBurstDamage).toBe(100);
    expect(totals.totalDamage).toBe(150);
  });

  it("books worn slots, skipping the built-in sidearm, and ranks outfits", () => {
    const totals = emptyTotals();
    // The spawn loadout — the sidearm (or a wall weapon) plus the issued
    // clothes — books nothing: first-equip feats are for looted pieces.
    expect(
      applyWornEquipment(totals, [
        { slot: "weapon", tier: "regular", defId: "blaster" },
        { slot: "chest", tier: "regular", defId: "t_shirt" },
        { slot: "legs", tier: "regular", defId: "jeans" },
        { slot: "feet", tier: "regular", defId: "leather_boots" },
      ]),
    ).toBe(false);
    expect(
      applyWornEquipment(totals, [
        { slot: "weapon", tier: "regular", defId: "hairy_potters_wand" },
      ]),
    ).toBe(false);
    expect(totals.slotsWorn).toEqual([]);
    // A looted weapon and a helmet book their slots.
    applyWornEquipment(totals, [
      { slot: "weapon", tier: "regular", defId: "box_cutter" },
      { slot: "head", tier: "magic", defId: "hard_hat" },
    ]);
    expect([...totals.slotsWorn].sort()).toEqual(["head", "weapon"]);
    expect(totals.outfitRank).toBe(-1); // not a full outfit yet
    // Every slot filled at once: the outfit ranks by its WORST piece.
    const fullOutfit = EQUIP_SLOTS.map((slot) => ({
      slot,
      tier: slot === "charm" ? "magic" : "rare",
      defId: "x",
    }));
    applyWornEquipment(totals, fullOutfit);
    expect(totals.outfitRank).toBe(1); // the magic charm holds it at 1
    // Upgrading the charm to unique lifts the rank to the rare pieces.
    applyWornEquipment(
      totals,
      EQUIP_SLOTS.map((slot) => ({
        slot,
        tier: slot === "charm" ? "unique" : "rare",
        defId: "x",
      })),
    );
    expect(totals.outfitRank).toBe(2);
  });

  it("counts runs per level for the farming badges", () => {
    const totals = emptyTotals();
    applyRunStart(totals, "a");
    applyRunStart(totals, "a");
    applyRunStart(totals, "b");
    expect(totals.totalRuns).toBe(3);
    expect(maxLevelRuns(totals)).toBe(2);
  });
});

describe("unlock store", () => {
  beforeEach(() => resetAchievementsForTest());

  it("unlocks FIRST BLOOD on the first kill, exactly once", () => {
    const fresh = recordAchievementEvents([kill(idByRole("minion"))], CTX);
    expect(fresh).toContain("kills_1");
    expect(unseenAchievements()).toContain("kills_1");
    // The second kill moves the counter but must not re-fire the badge.
    const again = recordAchievementEvents([kill(idByRole("minion"))], CTX);
    expect(again).not.toContain("kills_1");
    expect(getAchievements().unlocked["kills_1"]).toBeDefined();
  });

  it("stamps each freshly-earned badge with unlock context (meta)", () => {
    recordAchievementEvents([kill(idByRole("minion"))], CTX);
    // A meta entry is written for the badge (the browser reads it for the
    // "earned by NAME" line). No active hero in the test env → character null.
    const meta = getAchievements().meta["kills_1"];
    expect(meta).toBeDefined();
    expect(meta?.character).toBeNull();
  });

  it("returns nothing on a tick with no counted events", () => {
    expect(recordAchievementEvents([{ type: "jump" }], CTX)).toEqual([]);
    expect(recordAchievementEvents([], CTX)).toEqual([]);
  });

  it("acknowledging empties the unseen queue but keeps the unlocks", () => {
    recordAchievementEvents([kill(idByRole("minion"))], CTX);
    expect(unseenAchievements().length).toBeGreaterThan(0);
    acknowledgeAchievements();
    expect(unseenAchievements()).toEqual([]);
    expect(getAchievements().unlocked["kills_1"]).toBeDefined();
  });

  it("books run starts and unlocks the run-count ladder", () => {
    let fresh: string[] = [];
    for (let i = 0; i < 10; i++) fresh = recordRunStarted(LEVEL_ORDER[0]!);
    expect(fresh).toContain("runs_10");
    expect(fresh).toContain("farm_10");
  });

  it("unlocks wardrobe badges through the worn-equipment hook", () => {
    const worn = [
      { slot: "weapon", tier: "regular", defId: "box_cutter" },
      { slot: "head", tier: "regular", defId: "hard_hat" },
    ];
    const fresh = recordWornEquipment(worn);
    expect(fresh).toContain("equip_weapon");
    expect(fresh).toContain("equip_head");
    // The same outfit again is a quiet no-op (the signature guard).
    expect(recordWornEquipment(worn)).toEqual([]);
    // A full unique outfit sweeps the whole outfit ladder.
    const mythic = EQUIP_SLOTS.map((slot) => ({
      slot,
      tier: "unique",
      defId: "x",
    }));
    const outfit = recordWornEquipment(mythic);
    expect(outfit).toContain("outfit_full");
    expect(outfit).toContain("outfit_magic");
    expect(outfit).toContain("outfit_rare");
    expect(outfit).toContain("outfit_unique");
  });

  it("unlocks a unique's own badge alongside the count ladder", () => {
    const fresh = recordAchievementEvents(
      [
        {
          type: "itemCollected",
          kind: "equipment",
          tier: "unique",
          uniqueId: UNIQUE_IDS[0]!,
        },
      ],
      CTX,
    );
    expect(fresh).toContain("uniques_1");
    expect(fresh).toContain(`unique_${UNIQUE_IDS[0]!}`);
  });
});

describe("achievement catalog", () => {
  it("has unique, stable ids", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS_BY_ID.size).toBe(ids.length);
  });

  it("ships one badge per hand-authored unique", () => {
    for (const id of UNIQUE_IDS) {
      expect(ACHIEVEMENTS_BY_ID.has(`unique_${id}`)).toBe(true);
    }
  });

  it("unlocks nothing on a blank slate", () => {
    const totals = emptyTotals();
    for (const def of ACHIEVEMENTS) {
      expect(def.done(totals), def.id).toBe(false);
    }
  });

  it("keeps every progress meter clamped to its goal", () => {
    const totals = emptyTotals();
    totals.kills = 1_000_000;
    totals.heroLevel = 99;
    totals.totalRuns = 10_000;
    totals.totalDamage = 10 ** 9;
    totals.maxSingleHit = 10 ** 6;
    totals.maxBurstDamage = 10 ** 6;
    for (const def of ACHIEVEMENTS) {
      const p = def.progress?.(totals);
      if (!p) continue;
      expect(p.have).toBeLessThanOrEqual(p.goal);
      expect(p.goal).toBeGreaterThan(0);
    }
  });

  it("points every badge icon at a sprite in the shipped atlas", () => {
    const atlas = JSON.parse(
      readFileSync(
        new URL("../website/src/game/assets/atlas.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    for (const def of ACHIEVEMENTS) {
      expect(atlas[def.icon], `${def.id} → ${def.icon}`).toBeDefined();
    }
  });
});
