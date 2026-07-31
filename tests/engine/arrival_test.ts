// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loadout carry-over (src/game/arrival.ts): in the campaign the hero's real
// progress persists — victory banks an `extractLoadout` snapshot and
// `createGame(seed, level, difficulty, loadout)` dresses the next run in it.
// For dev jumps with nothing banked, `deriveArrivalLoadout` builds a
// realistic stand-in from the earlier levels' rosters. Both paths share
// `applyLoadout`; with no loadout at all a run starts exactly as authored.

import { describe, expect, it } from "vitest";

import {
  ARRIVAL,
  createGame,
  deriveArrivalLoadout,
  extractLoadout,
  HELD_ITEMS,
  LEVELING,
  PLAYER,
  statPointsAt,
  totalArmor,
  xpToLevelUp,
  type Loadout,
} from "@game/core";
// Importing the helper installs the fixture catalogs as a side effect.
import { SEED } from "./helpers.ts";

// The fixture reference level's total roster XP (spawns + wave budget), the
// number the derivation discounts by ARRIVAL.clearShare:
//   spawns  8×10 + 6×45 + 4×90 + 550(boss) = 1 260
//   waves   500×10 + 400×45 + 300×90       = 50 000
const FIX_LEVEL_XP = 51_260;

/** A hand-built snapshot, as if banked by a previous level's victory. */
function sampleLoadout(): Loadout {
  return {
    level: 7,
    xp: 40,
    stats: {
      stamina: 1,
      strength: 2,
      dexterity: 1,
      intelligence: 1,
      luck: 0,
    },
    equipment: {
      weapon: {
        id: 1,
        defId: "test_wrench",
        slot: "weapon",
        tier: "magic",
        ilvl: 5,
        affixes: [{ kind: "damagePct", value: 0.2 }],
        durability: 77,
      },
      head: null,
      chest: {
        id: 2,
        defId: "test_vest",
        slot: "chest",
        tier: "regular",
        ilvl: 5,
        affixes: [],
        durability: 90,
      },
      legs: null,
      feet: null,
      amulet: null,
      ring1: null,
      ring2: null,
      offhand: null,
    },
    inventory: [
      {
        id: 3,
        defId: "test_pipe",
        slot: "weapon",
        tier: "regular",
        ilvl: 5,
        affixes: [],
        durability: 100,
      },
      null,
    ],
    heldAbilities: ["test_storm"],
  };
}

describe("loadout carry-over", () => {
  it("starts exactly as authored when no loadout is passed", () => {
    const state = createGame(SEED, "test_level_2");
    expect(state.players[0].level).toBe(1);
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
    // The fixture ladder mints no starting clothes, so the body is bare.
    expect(state.players[0].equipment.chest).toBeNull();
    expect(state.players[0].heldAbilities).toEqual([]);
    expect(Object.values(state.players[0].stats).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("dresses the run in a passed loadout, re-minted and rested", () => {
    const state = createGame(SEED, "test_level_2", "medium", sampleLoadout());
    const player = state.players[0];
    expect(player.level).toBe(7);
    expect(player.xp).toBe(40);
    expect(player.stats.strength).toBe(2);
    expect(player.pendingStatPoints).toBe(0);
    // The carried kit, worn wear and affixes included...
    expect(player.equipment.weapon.defId).toBe("test_wrench");
    expect(player.equipment.weapon.tier).toBe("magic");
    expect(player.equipment.weapon.durability).toBe(77);
    expect(player.equipment.chest?.defId).toBe("test_vest");
    // ...with ids re-minted so nothing collides with this run's drops.
    expect(player.equipment.weapon.id).not.toBe(1);
    // The bag survives, the powerups stay pocketed (within the cap).
    expect(player.inventory[0]?.defId).toBe("test_pipe");
    expect(player.heldAbilities).toEqual(
      ["test_storm"].slice(0, HELD_ITEMS.cap),
    );
    // He arrives rested: full (grown) health, full sprint, armor worn.
    expect(player.maxHp).toBeGreaterThan(PLAYER.maxHp);
    expect(player.hp).toBe(player.maxHp);
    expect(totalArmor(state, player)).toBeGreaterThan(0);
  });

  it("refunds points a legacy loadout spent into the retired SPEED stat", () => {
    // A veteran banked before the SPEED stat was removed carries `speed` keys
    // in stats/spentStats. Applying such a loadout must DROP the dead stat but
    // hand its spent points back as pending picks, not silently lose them.
    const legacy = sampleLoadout();
    // Forge the pre-removal shape: 3 chosen points sunk into SPEED.
    (legacy.stats as Record<string, number>).speed = 3;
    legacy.spentStats = {
      stamina: 0,
      strength: 2,
      dexterity: 1,
      intelligence: 1,
      luck: 0,
      speed: 3,
    } as unknown as Loadout["spentStats"];
    const state = createGame(SEED, "test_level_2", "medium", legacy);
    // The dead stat is gone from the live hero...
    expect("speed" in state.players[0].stats).toBe(false);
    expect("speed" in state.players[0].spentStats).toBe(false);
    // ...and its 3 spent points come back for the chooser to re-place.
    expect(state.players[0].pendingStatPoints).toBe(3);
  });

  it("backfills a stat a legacy loadout predates (no undefined stat)", () => {
    // A build banked before a stat shipped carries no key for it; a bare spread
    // would leave that stat undefined, which the level-up chooser renders as
    // "LUCK UNDEFINED". Applying such a loadout must backfill 0.
    const legacy = sampleLoadout();
    // Drop a stat the way a save predating it would have — it never existed.
    delete (legacy.stats as Partial<Record<string, number>>).luck;
    const state = createGame(SEED, "test_level_2", "medium", legacy);
    expect(state.players[0].stats.luck).toBe(0);
    // spentStats backfills too — it falls back to the carried stats here.
    expect(state.players[0].spentStats.luck).toBe(0);
    // Every stat is a real number, none left undefined.
    expect(
      Object.values(state.players[0].stats).every((v) => v === 0 || v > 0),
    ).toBe(true);
  });

  it("drops a legacy loadout's double bomb (uniqueHeld docks once)", () => {
    // Loadouts banked before the one-bomb rule could pocket two nukes; on
    // arrival only the first docks, and the powers around it close ranks.
    const loadout = {
      ...sampleLoadout(),
      heldAbilities: ["test_nuke", "test_nuke", "test_storm"],
    };
    const state = createGame(SEED, "test_level_2", "medium", loadout);
    expect(state.players[0].heldAbilities).toEqual(["test_nuke", "test_storm"]);
  });

  it("round-trips: extractLoadout of one run seeds the next", () => {
    const first = createGame(SEED, "test_level", "medium", sampleLoadout());
    first.players[0].xp = 12; // some progress made during the run
    first.players[0].repairKits = 3; // a hoarded stack of repair kits
    const carried = extractLoadout(first, first.players[0]);
    const next = createGame(SEED + 1, "test_level_2", "medium", carried);
    expect(next.players[0].level).toBe(first.players[0].level);
    expect(next.players[0].stats).toEqual(first.players[0].stats);
    expect(next.players[0].xp).toBe(12);
    expect(next.players[0].repairKits).toBe(3); // the stack rides along
    expect(next.players[0].equipment.weapon.defId).toBe(
      first.players[0].equipment.weapon.defId,
    );
    // The snapshot is a deep copy: mutating the old run can't reach it.
    first.players[0].stats.luck = 99;
    expect(carried.stats.luck).toBe(0);
  });

  it("derives the dev-jump stand-in from the cleared rosters' XP curve", () => {
    const loadout = deriveArrivalLoadout("test_level_2");
    expect(loadout).not.toBeNull();

    // Walk the same curve the derivation walks, from the known roster total.
    let xp = Math.round(FIX_LEVEL_XP * ARRIVAL.clearShare);
    let level = 1;
    let xpToNext: number = xpToLevelUp(level);
    while (xp >= xpToNext && level < LEVELING.maxLevel) {
      xp -= xpToNext;
      level++;
      xpToNext = xpToLevelUp(level);
    }
    expect(loadout!.level).toBe(level);
    expect(loadout!.level).toBeGreaterThan(1); // sanity: cleared, not a rookie
    expect(loadout!.xp).toBe(xp);
    // Every banked point spent, round-robin flat across ARRIVAL.statOrder:
    // no listed stat more than one ahead, unlisted stats untouched. Each
    // ding's grant follows the growing schedule (statPointsAt), exactly as
    // real level-ups would have paid.
    let banked = 0;
    for (let l = 2; l <= level; l++) banked += statPointsAt(l);
    const stats = loadout!.stats;
    const values = Object.values(stats);
    expect(values.reduce((a, b) => a + b, 0)).toBe(banked);
    const order = ARRIVAL.statOrder as readonly (keyof typeof stats)[];
    const spent = order.map((stat) => stats[stat]);
    expect(Math.max(...spent) - Math.min(...spent)).toBeLessThanOrEqual(1);
    for (const [stat, value] of Object.entries(stats)) {
      if (!(order as readonly string[]).includes(stat)) expect(value).toBe(0);
    }
    // The previous level's kit: its scripted early-drop weapon, issue gear,
    // and a couple of its powerups.
    expect(loadout!.equipment.weapon.defId).toBe("test_hammer");
    expect(loadout!.equipment.chest?.defId).toBe("test_vest");
    // Its TRINKET rides in the bag — that is where a trinket pays out, so the
    // stand-in kit hands it over as carried loot rather than wearing it.
    expect(loadout!.inventory[0]?.defId).toBe("test_charm");
    expect(loadout!.heldAbilities).toEqual(
      ["test_orbit", "test_storm"].slice(0, ARRIVAL.heldAbilities),
    );
  });

  it("derives nothing on the campaign opener", () => {
    expect(deriveArrivalLoadout("test_level")).toBeNull();
  });

  it("keeps the derivation deterministic per (level, difficulty)", () => {
    const a = deriveArrivalLoadout("test_level_2");
    const b = deriveArrivalLoadout("test_level_2");
    expect(a).toEqual(b);
  });
});
