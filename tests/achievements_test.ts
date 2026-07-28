// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievements system (pwa/src/game/achievement-*.ts): the lifetime
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
} from "../pwa/src/game/achievement-defs.ts";
import {
  applyEventsToTotals,
  applyRunStart,
  applyWornEquipment,
  emptyTotals,
  EQUIP_SLOTS,
  maxLevelRuns,
  SPEED_CLEAR_MS,
} from "../pwa/src/game/achievement-totals.ts";
import { pendingReports } from "../pwa/src/game/achievement-sync.ts";
import {
  PLATFORM_ACHIEVEMENT_LIMIT,
  PLATFORM_ACHIEVEMENTS,
  PLATFORM_POINT_BUDGET,
  PLATFORM_POINT_MAX,
  platformManifest,
  platformPercent,
  platformPoints,
} from "../pwa/src/game/platform-achievements.ts";
import {
  acknowledgeAchievements,
  getAchievements,
  recordAchievementEvents,
  recordRunStarted,
  recordWornEquipment,
  resetAchievementsForTest,
  unseenAchievements,
} from "../pwa/src/game/achievements.ts";

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
    jumps: 0,
    damageDealt: 0,
    damageTaken: 0,
    itemsCollected: 0,
    xpGained: 0,
    xpLost: 0,
    timeMs: 0,
    combatMs: 0,
    peakMenace: 0,
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
    maxHp: 1,
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
        {
          type: "menaceRose",
          stage: 4,
          pos: { x: 0, y: 0 },
          cause: "overkill",
        },
        { type: "menaceRose", stage: 2, pos: { x: 0, y: 0 }, cause: "heat" },
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
        { slot: "weapon", tier: "regular", defId: "fire_extinguisher" },
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
      tier: slot === "amulet" ? "magic" : "rare",
      defId: "x",
    }));
    applyWornEquipment(totals, fullOutfit);
    expect(totals.outfitRank).toBe(1); // the magic amulet holds it at 1
    // Upgrading the amulet to unique lifts the rank to the rare pieces.
    applyWornEquipment(
      totals,
      EQUIP_SLOTS.map((slot) => ({
        slot,
        tier: slot === "amulet" ? "unique" : "rare",
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
        new URL("../pwa/src/game/assets/atlas.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    for (const def of ACHIEVEMENTS) {
      expect(atlas[def.icon], `${def.id} → ${def.icon}`).toBeDefined();
    }
  });
});

// The badges the platform (Game Center today) carries, and the manifest a human
// fills App Store Connect in from. Both platforms cap what a game may list, and
// an entry that isn't in the portal is a report dropped on the floor — so the
// cap, the point budget, and the committed manifest are all guarded here.
describe("platform achievements", () => {
  it("fits the platform's cap with room for the next badge", () => {
    expect(PLATFORM_ACHIEVEMENTS.length).toBeLessThanOrEqual(
      PLATFORM_ACHIEVEMENT_LIMIT,
    );
    // Headroom is the point of curating rather than filling the list: adding a
    // badge must not mean re-curating the whole thing.
    expect(PLATFORM_ACHIEVEMENTS.length).toBeLessThanOrEqual(
      PLATFORM_ACHIEVEMENT_LIMIT - 10,
    );
  });

  it("carries every badge except the two rolled-up families", () => {
    const carried = new Set(PLATFORM_ACHIEVEMENTS.map((a) => a.id));
    for (const def of ACHIEVEMENTS) {
      const local = def.id.startsWith("unique_") || def.id.startsWith("equip_");
      expect(carried.has(def.id), def.id).toBe(!local);
    }
    // …and each family's roll-up DOES travel, so the climb is still visible.
    expect(carried.has("uniques_all")).toBe(true);
    expect(carried.has("outfit_full")).toBe(true);
  });

  it("uses ids the portals accept", () => {
    for (const def of PLATFORM_ACHIEVEMENTS) {
      expect(def.id, def.id).toMatch(/^[A-Za-z0-9_.]+$/);
      expect(def.id.length).toBeLessThanOrEqual(100);
    }
  });

  it("spends the point budget exactly, within the per-entry range", () => {
    const points = platformPoints();
    let total = 0;
    for (const def of PLATFORM_ACHIEVEMENTS) {
      const value = points[def.id] ?? 0;
      expect(value, def.id).toBeGreaterThanOrEqual(1);
      expect(value, def.id).toBeLessThanOrEqual(PLATFORM_POINT_MAX);
      total += value;
    }
    expect(total).toBe(PLATFORM_POINT_BUDGET);
  });

  it("weights a harder badge no lower than an easier one", () => {
    const points = platformPoints();
    const rank = { beginner: 0, intermediate: 1, pro: 2, expert: 3 };
    for (const a of PLATFORM_ACHIEVEMENTS) {
      for (const b of PLATFORM_ACHIEVEMENTS) {
        if (rank[a.tier] > rank[b.tier]) {
          expect(
            points[a.id] ?? 0,
            `${a.id} vs ${b.id}`,
          ).toBeGreaterThanOrEqual(points[b.id] ?? 0);
        }
      }
    }
  });

  it("mirrors the shelf's own reading, and 100 for anything in the ledger", () => {
    // The platform draws the same bar the shelf does — including the level
    // ladder, which reads a fraction from the hero's very first level rather
    // than a flat zero.
    const blank = { unlocked: {}, totals: emptyTotals() };
    for (const def of PLATFORM_ACHIEVEMENTS) {
      const meter = def.progress?.(blank.totals);
      const expected = meter ? (100 * meter.have) / meter.goal : 0;
      expect(platformPercent(def, blank), def.id).toBeCloseTo(expected);
      expect(platformPercent(def, blank), def.id).toBeLessThan(100);
    }
    const kills = ACHIEVEMENTS_BY_ID.get("kills_1000")!;
    expect(
      platformPercent(kills, {
        unlocked: { kills_1000: 1 },
        totals: blank.totals,
      }),
    ).toBe(100);
  });

  it("reports a ladder's live fraction", () => {
    const totals = emptyTotals();
    totals.kills = 250;
    const kills = ACHIEVEMENTS_BY_ID.get("kills_1000")!;
    expect(platformPercent(kills, { unlocked: {}, totals })).toBeCloseTo(25);
  });

  it("only sends a percentage that climbed a whole step, or hit 100", () => {
    const totals = emptyTotals();
    totals.kills = 10; // kills_1 done; kills_100 at 10%, kills_1000 at 1%
    const save = { unlocked: {}, totals };

    const first = pendingReports(save, {});
    const sent = new Map(first.map((r) => [r.id, r.percent]));
    expect(sent.get("kills_1")).toBe(100);
    expect(sent.get("kills_100")).toBe(10);
    // Under one 5-point step — not worth a network call yet.
    expect(sent.has("kills_1000")).toBe(false);
    // Nothing at zero is ever sent.
    expect(first.every((r) => r.percent > 0)).toBe(true);

    // Delivered once, nothing repeats…
    const marks = Object.fromEntries(sent);
    expect(pendingReports(save, marks)).toEqual([]);
    // …a 4-point climb still waits…
    totals.kills = 14;
    expect(pendingReports(save, marks).some((r) => r.id === "kills_100")).toBe(
      false,
    );
    // …and a 5-point one goes.
    totals.kills = 15;
    expect(pendingReports(save, marks).some((r) => r.id === "kills_100")).toBe(
      true,
    );
  });

  it("never walks a percentage backwards", () => {
    const totals = emptyTotals();
    totals.kills = 10;
    const save = { unlocked: {}, totals };
    expect(pendingReports(save, { kills_100: 100 })).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: "kills_100" }),
      ]),
    );
  });

  it("keeps the committed portal manifest in step with the catalog", () => {
    // The manifest is what App Store Connect was filled in from; a drift here
    // means entries to create in the portal, not a snapshot to bless blindly —
    // regenerate with `node scripts/game-center-achievements.mjs`.
    const committed = JSON.parse(
      readFileSync(
        new URL(
          "../native/store/game-center-achievements.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { count: number; points: number; achievements: unknown[] };
    const rows = platformManifest();
    expect(committed.achievements).toEqual(rows);
    expect(committed.count).toBe(rows.length);
  });
});
