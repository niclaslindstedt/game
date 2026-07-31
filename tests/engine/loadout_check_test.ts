// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A JOINER'S HERO IS A CLAIM FROM A STRANGER (multiplayer plan §5.3). These
// pin what the check refuses to let through, and — just as importantly — what
// it lets through untouched, because the shape it must never grow is one that
// turns an honest player's old save into an unjoinable one.

import { describe, expect, it } from "vitest";

import {
  LEVELING,
  STAT_NAMES,
  validateLoadout,
  WEAPON_DEFS,
  type Loadout,
  type StatName,
} from "@game/core";

/** A shipped weapon base, so the suite never hardcodes a content id. */
const SOME_WEAPON = Object.keys(WEAPON_DEFS)[0]!;

function stats(value = 0): Record<StatName, number> {
  const block = {} as Record<StatName, number>;
  for (const stat of STAT_NAMES) block[stat] = value;
  return block;
}

function claim(patch: Partial<Loadout> = {}): Loadout {
  return {
    level: 10,
    xp: 0,
    stats: stats(2),
    equipment: {
      weapon: {
        id: 1,
        defId: SOME_WEAPON,
        slot: "weapon",
        tier: "regular",
        ilvl: 5,
        affixes: [],
      },
      head: null,
      chest: null,
      legs: null,
      feet: null,
      amulet: null,
      ring1: null,
      ring2: null,
      offhand: null,
    },
    inventory: [],
    heldAbilities: [],
    ...patch,
  } as Loadout;
}

describe("validating a joiner's loadout", () => {
  it("passes an ordinary hero through unchanged", () => {
    const checked = validateLoadout(claim());
    expect(checked?.problems).toEqual([]);
    expect(checked?.loadout.level).toBe(10);
    expect(checked?.loadout.equipment.weapon.defId).toBe(SOME_WEAPON);
  });

  it("takes no loadout at all as the authored fresh start", () => {
    // A brand-new character joining a friend's game brings nothing, and that
    // is not a failure to correct.
    expect(validateLoadout(null)).toBeNull();
    expect(validateLoadout(undefined)).toBeNull();
  });

  it("holds the level inside the ladder the game actually has", () => {
    const checked = validateLoadout(claim({ level: 4000 }));
    expect(checked?.loadout.level).toBe(LEVELING.maxLevel);
    expect(checked?.problems.join(" ")).toContain("level");
  });

  it("cuts a stat block back to what the level pays for, keeping its shape", () => {
    // Both figures sit under the level's own per-stat ceiling, so it is the
    // TOTAL that bites here — which is the half a per-stat cap cannot catch.
    const raw = stats(0);
    raw.strength = 200;
    raw.luck = 100;
    const checked = validateLoadout(claim({ level: 60, stats: raw }));
    const held = checked!.loadout.stats;
    let total = 0;
    for (const stat of STAT_NAMES) total += held[stat];
    expect(total).toBeLessThan(200 + 100);
    // Proportional rather than blanked: a hero who arrives with nothing in any
    // stat is a hero nobody wants to play, and the build is still theirs.
    expect(held.strength).toBeGreaterThan(held.luck);
    expect(held.luck).toBeGreaterThan(0);
    expect(checked?.problems.join(" ")).toContain("sum");
  });

  it("caps one stat at the level's own ceiling even when the sum fits", () => {
    const raw = stats(0);
    raw.strength = 250;
    const checked = validateLoadout(claim({ level: 3, stats: raw }));
    expect(checked!.loadout.stats.strength).toBeLessThan(250);
  });

  it("drops an item the catalogs cannot mint, worn or carried", () => {
    const bogus = {
      id: 9,
      defId: "not_a_real_base",
      slot: "head",
      tier: "unique",
      ilvl: 99,
      affixes: [],
    };
    const checked = validateLoadout(
      claim({
        equipment: { ...claim().equipment, head: bogus as never },
        inventory: [bogus as never],
      }),
    );
    // Dropping it is the whole point: `gearDef` THROWS on an id it does not
    // hold, and it is called from the damage pass and the paper doll — so one
    // packet would take the host's own process down.
    expect(checked?.loadout.equipment.head).toBeNull();
    expect(checked?.loadout.inventory[0]).toBeNull();
    expect(checked?.problems.join(" ")).toContain("not_a_real_base");
  });

  it("holds an item level inside the ladder", () => {
    // Affix magnitudes scale with ilvl, so an ilvl of a million is every
    // rolled bonus on the piece multiplied by a million.
    const checked = validateLoadout(
      claim({
        equipment: {
          ...claim().equipment,
          weapon: { ...claim().equipment.weapon, ilvl: 1e9 },
        },
      }),
    );
    expect(checked?.loadout.equipment.weapon.ilvl).toBe(LEVELING.maxLevel);
  });

  it("survives a payload that is not a loadout at all", () => {
    // The frame arrived off an open UDP port. Every one of these used to reach
    // `applyLoadout` and half of them would have thrown inside the host's tick.
    for (const junk of [
      claim({ stats: null as never, equipment: null as never }),
      claim({ inventory: "nope" as never }),
      claim({ level: Number.NaN, xp: Number.POSITIVE_INFINITY }),
      claim({ coins: -1e9 }),
    ]) {
      const checked = validateLoadout(junk);
      expect(checked).not.toBeNull();
      expect(Array.isArray(checked!.loadout.inventory)).toBe(true);
      expect(Number.isFinite(checked!.loadout.level)).toBe(true);
      for (const stat of STAT_NAMES) {
        expect(Number.isFinite(checked!.loadout.stats[stat])).toBe(true);
      }
      expect(checked!.loadout.coins ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
