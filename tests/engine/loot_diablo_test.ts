// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Diablo loot rules: monster level gates on tiers (LOOT.tierUnlockMlvl),
// base-item level requirements gating both the drop pool and the hero's own
// hands, the dropped item's LEVEL (mlvl minus a weighted deficit; tighter for
// rare+), ilvl-scaled affix magnitudes, and the per-tier chance payouts on
// elite/boss kills that can exceed 100%.

import { describe, expect, it } from "vitest";

import {
  difficultyDef,
  equipFromInventory,
  isBetterEquipment,
  LOOT,
  meetsLevelReq,
  registerDefs,
  rollEquipment,
} from "@game/core";
import type { Difficulty, Equipment, GameState, Tier } from "@game/core";
// Engine-internal kill funnel — not public API, but the one door every drop
// walks through, so the tierDrops rules are asserted right at it.
import { hitEnemy } from "../../src/game/loot.ts";

import {
  FIX_ABILITIES,
  FIX_DIFFICULTIES,
  FIX_ENEMIES,
  FIX_GEAR,
  FIX_LEVEL,
  FIX_STORY_ITEMS,
  FIX_WEAPONS,
} from "./fixtures.ts";
import { makeEnemy, startGame } from "./helpers.ts";

// A high-requirement base for the levelReq gates: the drop side (mobs under
// level 10 never drop it) and the wear side (heroes under level 10 bank it).
const RELIC = {
  id: "test_relic",
  name: "TEST RELIC",
  class: "melee" as const,
  levelReq: 10,
  damage: 40,
  cooldownMs: 400,
  range: 44,
  durability: 200,
  icon: "icon_medieval_sword",
};

// Fixture UNIQUES on the relic base (req 10) so the D2 rarity FOLD has eligible
// named items to mint when a weapon drop rolls unique/legendary. Registering
// them REPLACES the active unique catalog (setUniqueDefs), so the fold sees
// only these — no shipped ids leak into the gate assertions.
const UNIQ_WPN = {
  id: "test_uniq_wpn",
  name: "TEST UNIQUE BLADE",
  base: "test_relic",
  slot: "weapon" as const,
  ilvl: 12,
  bonuses: [{ kind: "stat" as const, stat: "strength" as const, value: 3 }],
  lore: "A TEST UNIQUE FOLDED FROM THE RARITY ROLL.",
};
const LEG_WPN = {
  id: "test_leg_wpn",
  name: "TEST LEGENDARY BLADE",
  base: "test_relic",
  slot: "weapon" as const,
  tier: "legendary" as const,
  ilvl: 42,
  bonuses: [{ kind: "stat" as const, stat: "strength" as const, value: 5 }],
  lore: "A TEST LEGENDARY FOLDED FROM THE RARITY ROLL.",
};

/** Re-register the fixture catalogs with the relic added and `test_level`'s
 * weapon pool reduced to sidearm-vs-relic, so pool-gate assertions are
 * unambiguous. Vitest isolates modules per file — this never leaks. */
function installLootFixtures(): void {
  registerDefs({
    levels: {
      test_level: {
        ...FIX_LEVEL,
        loot: { ...FIX_LEVEL.loot, weaponPool: ["blaster", "test_relic"] },
      },
    },
    enemies: {
      ...FIX_ENEMIES,
      test_boss: {
        ...FIX_ENEMIES.test_boss!,
        loot: {
          ...FIX_ENEMIES.test_boss!.loot!,
          // The over-100% pledge under test: 2 guaranteed magic + a coin
          // flip for a third, and a coin flip for a rare on top.
          tierDrops: { magic: 2.5, rare: 0.5 },
        },
      },
    },
    weapons: { ...FIX_WEAPONS, test_relic: RELIC },
    gear: FIX_GEAR,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
    uniques: { test_uniq_wpn: UNIQ_WPN, test_leg_wpn: LEG_WPN },
  });
}

// rollEquipment strips the difficulty's `mobLevelOffset` from every LOOT gate
// (the offset-strip: easy drops richer relative to its mobs). So a kill's LOOT
// level is `mlvl − offset`; to target a loot level directly, back out the
// offset. startGame runs on MEDIUM (offset −2) unless a test overrides it.
function mobForLoot(state: GameState, lootLevel: number): number {
  return lootLevel + difficultyDef(state.difficulty).mobLevelOffset;
}

installLootFixtures();

/** Roll `n` WEAPON pieces whose LOOT level is `lootLevel` and collect their
 * tiers. Weapon slot so a unique/legendary roll folds one of the fixture
 * weapon uniques (see UNIQ_WPN/LEG_WPN) rather than falling back to a rare. */
function weaponTiersAtLoot(
  state: GameState,
  lootLevel: number,
  n = 200,
): Set<Tier> {
  const tiers = new Set<Tier>();
  const mlvl = mobForLoot(state, lootLevel);
  for (let i = 0; i < n; i++) {
    tiers.add(rollEquipment(state, { slot: "weapon", mlvl }).tier);
  }
  return tiers;
}

describe("tier gates by loot level", () => {
  it("drops only regular below the magic gate, whatever the luck", () => {
    const state = startGame();
    state.player.stats.luck = 100; // heavy Magic Find, still gated out
    expect(weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.magic - 1)).toEqual(
      new Set(["regular"]),
    );
  });

  it("opens magic at its gate and rare at its own, in order", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    const atMagic = weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.magic);
    expect(atMagic.has("magic")).toBe(true);
    expect(atMagic.has("rare")).toBe(false);
    const atRare = weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.rare);
    expect(atRare.has("rare")).toBe(true);
    expect(atRare.has("unique")).toBe(false);
  });

  it("holds unique/legendary behind their gates, then folds a named item", () => {
    // The fixture JESUS rung carries unique+legendary tier bonuses, so the
    // rarity roll is live — only the loot-level gate stands in the way, and a
    // roll that lands the tier folds one of the fixture weapon uniques.
    const state = startGame(42, "test_level");
    state.difficulty = "jesus" as Difficulty;
    state.player.stats.luck = 100;
    const below = weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.unique - 1);
    expect(below.has("unique")).toBe(false);
    const at = weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.unique);
    expect(at.has("unique")).toBe(true);
    expect(at.has("legendary")).toBe(false);
    expect(
      weaponTiersAtLoot(state, LOOT.tierUnlockMlvl.legendary).has("legendary"),
    ).toBe(true);
  });
});

describe("item level", () => {
  it("lands 0–3 below the loot level, weighted toward the bottom", () => {
    const state = startGame();
    // A kill at monster level 20 gates loot at 22 on medium (offset −2).
    const lootLevel = 22;
    const counts = new Map<number, number>();
    for (let i = 0; i < 400; i++) {
      // Force regular so the sample measures the ilvl DEFICIT band, not a
      // folded unique's static ilvl (rare+ also uses the tighter band).
      const ilvl = rollEquipment(state, {
        mlvl: mobForLoot(state, lootLevel),
        tier: "regular",
      }).ilvl;
      counts.set(ilvl, (counts.get(ilvl) ?? 0) + 1);
    }
    const band = LOOT.ilvlDeltaWeights.length; // deltas 0..band-1
    for (const ilvl of counts.keys()) {
      expect(ilvl).toBeGreaterThanOrEqual(lootLevel - (band - 1));
      expect(ilvl).toBeLessThanOrEqual(lootLevel);
    }
    // −3 is authored 4× likelier than −0; 400 samples put the expected split
    // near 160 vs 40 — a strict greater-than can't realistically flake.
    expect(counts.get(lootLevel - 3) ?? 0).toBeGreaterThan(
      counts.get(lootLevel) ?? 0,
    );
  });

  it("floors at 1 on the shallowest kills", () => {
    const state = startGame();
    // A kill shallower than the offset floors the loot level (and ilvl) at 1.
    for (let i = 0; i < 50; i++) {
      expect(rollEquipment(state, { mlvl: mobForLoot(state, 1) }).ilvl).toBe(1);
    }
  });

  it("keeps rare finds within a level of the loot level", () => {
    const state = startGame();
    const lootLevel = 22;
    for (let i = 0; i < 100; i++) {
      const ilvl = rollEquipment(state, {
        mlvl: mobForLoot(state, lootLevel),
        tier: "rare",
      }).ilvl;
      expect(ilvl).toBeGreaterThanOrEqual(lootLevel - 1);
      expect(ilvl).toBeLessThanOrEqual(lootLevel);
    }
  });
});

describe("ilvl-gated affix brackets", () => {
  it("rolls inside the unlocked generation (top or one under, never lower)", () => {
    const state = startGame();
    let statSeen = 0;
    let damageSeen = 0;
    for (let i = 0; i < 300; i++) {
      // mlvl 30 → ilvl 27–30: the ilvl-22 generation is the top unlocked
      // (stat 8–12, damagePct 0.19–0.28); the roll may also pay the ilvl-10
      // generation under it (stat 4–7, damagePct 0.11–0.18) — never the
      // ilvl-36 one above, and never the ilvl-1 floor two rungs down.
      const piece = rollEquipment(state, { mlvl: 30, tier: "magic" });
      for (const affix of piece.affixes) {
        if (affix.kind === "stat") {
          statSeen++;
          expect(affix.value).toBeGreaterThanOrEqual(4);
          expect(affix.value).toBeLessThanOrEqual(12);
        }
        if (affix.kind === "damagePct") {
          damageSeen++;
          expect(affix.value).toBeGreaterThanOrEqual(0.11);
          expect(affix.value).toBeLessThanOrEqual(0.28);
        }
      }
    }
    expect(statSeen).toBeGreaterThan(0);
    expect(damageSeen).toBeGreaterThan(0);
  });

  it("deep drops unlock the top generation, shallow ones stay small", () => {
    const state = startGame();
    for (let i = 0; i < 200; i++) {
      // ilvl 1 items only know the first generation.
      const shallow = rollEquipment(state, { mlvl: 1, tier: "magic" });
      for (const affix of shallow.affixes) {
        if (affix.kind === "stat") expect(affix.value).toBeLessThanOrEqual(3);
        if (affix.kind === "maxHp") expect(affix.value).toBeLessThanOrEqual(12);
      }
    }
    // A deep rare (mlvl 60 → ilvl 59–60) reaches the ilvl-52 generation.
    let sawTopStat = false;
    for (let i = 0; i < 400 && !sawTopStat; i++) {
      const deep = rollEquipment(state, { mlvl: 60, tier: "rare" });
      for (const affix of deep.affixes) {
        if (affix.kind === "stat" && affix.value >= 19) sawTopStat = true;
        // The ceiling rule: no stat affix ever exceeds the top band (25).
        if (affix.kind === "stat") expect(affix.value).toBeLessThanOrEqual(25);
      }
    }
    expect(sawTopStat).toBe(true);
  });
});

describe("level requirements", () => {
  it("keeps a base out of the pool until the loot level reaches it", () => {
    const state = startGame();
    for (let i = 0; i < 60; i++) {
      const piece = rollEquipment(state, {
        slot: "weapon",
        mlvl: mobForLoot(state, RELIC.levelReq - 1),
      });
      expect(piece.defId).not.toBe("test_relic");
    }
    const deep = new Set<string>();
    for (let i = 0; i < 60; i++) {
      deep.add(
        rollEquipment(state, {
          slot: "weapon",
          mlvl: mobForLoot(state, RELIC.levelReq),
        }).defId,
      );
    }
    expect(deep.has("test_relic")).toBe(true);
  });

  it("falls back to the lowest-requirement bases when the whole pool outranks the mob", () => {
    // A pool of nothing but the relic must still drop something.
    registerDefs({
      levels: {
        test_level: {
          ...FIX_LEVEL,
          loot: { ...FIX_LEVEL.loot, weaponPool: ["test_relic"] },
        },
      },
      weapons: { ...FIX_WEAPONS, test_relic: RELIC },
      gear: FIX_GEAR,
    });
    const state = startGame();
    expect(rollEquipment(state, { slot: "weapon", mlvl: 1 }).defId).toBe(
      "test_relic",
    );
    installLootFixtures(); // restore this suite's catalogs
  });

  it("banks an under-leveled find instead of wielding it", () => {
    const state = startGame();
    const relic: Equipment = {
      id: 500,
      defId: "test_relic",
      slot: "weapon",
      tier: "regular",
      ilvl: 10,
      affixes: [],
      durability: 200,
    };
    // Level 1: never auto-equipped (despite out-damaging everything), never
    // equippable from the bag.
    expect(meetsLevelReq(state, relic)).toBe(false);
    expect(isBetterEquipment(state, relic)).toBe(false);
    state.player.inventory[0] = relic;
    expect(equipFromInventory(state, 0)).toBe(false);
    expect(state.player.equipment.weapon.defId).not.toBe("test_relic");

    // Grown into it: at the required level AND with the STRENGTH the melee
    // relic demands, the same find equips.
    state.player.level = RELIC.levelReq;
    state.player.stats.strength = 40;
    expect(meetsLevelReq(state, relic)).toBe(true);
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.weapon.defId).toBe("test_relic");
  });
});

describe("unique/legendary build quality", () => {
  it("mints unique and legendary weapons without durability — they never break", () => {
    const state = startGame();
    const uniquePiece = rollEquipment(state, {
      slot: "weapon",
      tier: "unique",
      mlvl: 20,
    });
    const legendaryPiece = rollEquipment(state, {
      slot: "weapon",
      tier: "legendary",
      mlvl: 30,
    });
    const rarePiece = rollEquipment(state, {
      slot: "weapon",
      tier: "rare",
      mlvl: 20,
    });
    expect(uniquePiece.durability).toBeUndefined();
    expect(legendaryPiece.durability).toBeUndefined();
    expect(rarePiece.durability).toBeGreaterThan(0); // lesser tiers still wear
  });
});

describe("elite/boss tierDrops", () => {
  /** Stage the fixture boss for a one-blow kill with a pinned rng, past
   * (or below) the tier gates via `mlvl`. */
  function killPledgedBoss(
    state: GameState,
    mlvl: number,
    rng: () => number,
  ): void {
    const boss = makeEnemy(
      { pos: { x: 500, y: 500 }, hp: 1, mlvl },
      "test_boss",
    );
    boss.powerScaled = true; // keep the staged mlvl — no re-stamp on engage
    state.enemies = [boss];
    state.items = [];
    state.rng = rng;
    hitEnemy(state, boss, 99_999);
  }

  function tierCounts(state: GameState): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of state.items) {
      if (item.kind !== "equipment") continue;
      counts[item.equipment.tier] = (counts[item.equipment.tier] ?? 0) + 1;
    }
    return counts;
  }

  it("pays the guaranteed whole drops and loses the coin flips on a cold rng", () => {
    const state = startGame();
    // rng 0.99: both 0.5 fractions fail, tier-rolled pieces stay regular.
    killPledgedBoss(state, 40, () => 0.99);
    const counts = tierCounts(state);
    expect(counts.magic ?? 0).toBe(2); // floor(2.5)
    expect(counts.rare ?? 0).toBe(0);
  });

  it("pays the extra drops on a hot rng — over 100% means several", () => {
    const state = startGame();
    // rng 0.01: the .5 magic fraction and the .5 rare both land.
    killPledgedBoss(state, 40, () => 0.01);
    const counts = tierCounts(state);
    expect(counts.magic ?? 0).toBeGreaterThanOrEqual(3); // 2 pledged + the flip
    expect(counts.rare ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("still honors the loot-level gates — a shallow boss pays nothing fancy", () => {
    const state = startGame();
    killPledgedBoss(
      state,
      mobForLoot(state, LOOT.tierUnlockMlvl.magic - 1),
      () => 0.01,
    );
    const counts = tierCounts(state);
    expect(counts.magic ?? 0).toBe(0);
    expect(counts.rare ?? 0).toBe(0);
  });
});
