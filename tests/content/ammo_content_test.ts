// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The AMMUNITION side of the shipped catalog: the either/or every ranged
// weapon owes (it eats a kind, and therefore never wears out), that every kind
// a weapon names is one the pouch and the drop ladder actually know about, and
// that the art for each kind is in the shipped atlas.
//
// The item SCHEMA already refuses a bad pairing at compile time
// (scripts/asset-tools/item-schema.mjs), but the schema only sees the YAML
// tree — the GENERATED grade variants (`match_pistol`, `siege_bow`, …) are
// minted at load from a `grades:` block and never pass through it. Those are
// exactly the defs a file grep will tell you do not exist, and exactly where
// this pairing quietly broke when `durability` was optional.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AMMO,
  AMMO_KINDS,
  AMMO_TYPES,
  DIFFICULTY_DEFS,
  startingAmmo,
  WEAPON_DEFS,
} from "@game/core";

const WEAPONS = Object.values(WEAPON_DEFS);

describe("every ranged weapon in the catalog", () => {
  const ranged = WEAPONS.filter((def) => def.class === "ranged");

  it("there are some (a catalog with none would pass everything below)", () => {
    expect(ranged.length).toBeGreaterThan(10);
  });

  it("names an ammunition kind — including the generated grade variants", () => {
    const mute = ranged
      .filter((def) => def.ammo === undefined)
      .map((d) => d.id);
    expect(mute).toEqual([]);
  });

  it("names a kind the engine actually knows", () => {
    const unknown = ranged
      .filter((def) => !AMMO_TYPES.includes(def.ammo!))
      .map((d) => `${d.id}:${d.ammo}`);
    expect(unknown).toEqual([]);
  });

  it("carries NO durability — a gun runs dry, it does not wear out", () => {
    const wearing = ranged
      .filter((def) => def.durability !== undefined)
      .map((d) => d.id);
    expect(wearing).toEqual([]);
  });
});

describe("every melee and magic weapon", () => {
  const swung = WEAPONS.filter((def) => def.class !== "ranged");

  it("eats nothing — the other half of the same trade", () => {
    const eaters = swung
      .filter((def) => def.ammo !== undefined)
      .map((d) => d.id);
    expect(eaters).toEqual([]);
  });

  it("still carries a wear budget", () => {
    const free = swung
      .filter((def) => def.durability === undefined)
      .map((d) => d.id);
    expect(free).toEqual([]);
  });
});

describe("the built-in sidearm", () => {
  it("eats a kind, so the opening holster has something to stock", () => {
    // `startingAmmo` reads the sidearm's own def to fill the run's opening
    // pouch. A sidearm that ate nothing would silently leave that half empty.
    expect(WEAPON_DEFS.blaster!.ammo).toBeDefined();
    expect(WEAPON_DEFS.blaster!.durability).toBeUndefined();
  });
});

describe("the opening holster, against the shipped difficulty ladder", () => {
  const sidearm = WEAPON_DEFS.blaster!.ammo!;

  it.each(Object.values(DIFFICULTY_DEFS).map((d) => [d.id, d.startingWeapon]))(
    "%s opens loaded for the weapon it actually hands out",
    (_id, startingWeapon) => {
      const pouch = startingAmmo(startingWeapon);
      const held = WEAPON_DEFS[startingWeapon]?.ammo;
      if (held !== undefined) {
        expect(pouch[held]).toBe(AMMO.starting);
      }
      // A MELEE or MAGIC opening leaves the sidearm as the hero's only gun, so
      // it gets the full stock; a RANGED opening leaves it a fallback, and a
      // fallback gets the reserve. The bug this pins is EASY's sawed-off
      // shotgun opening beside a full hundred rounds of CELLS — a kind nothing
      // the hero carries can fire, reading in the bag's foot rail as though it
      // mattered as much as his bullets.
      expect(pouch[sidearm]).toBe(
        held === undefined || held === sidearm
          ? AMMO.starting
          : AMMO.sidearmReserve,
      );
    },
  );

  it("never opens a kind nothing in the run can fire", () => {
    // Every kind the opening pouch carries must be one SOME weapon eats — the
    // sidearm's or the starting weapon's, never a third.
    for (const diff of Object.values(DIFFICULTY_DEFS)) {
      const pouch = startingAmmo(diff.startingWeapon);
      const wanted = new Set(
        [WEAPON_DEFS[diff.startingWeapon]?.ammo, sidearm].filter(
          (kind) => kind !== undefined,
        ),
      );
      expect(Object.keys(pouch).sort()).toEqual([...wanted].sort());
    }
  });
});

describe("each kind's art is in the shipped atlas", () => {
  const atlas = JSON.parse(
    readFileSync(
      new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

  it.each([...AMMO_TYPES])(
    "%s has a ground sprite and a pouch icon",
    (type) => {
      const kind = AMMO_KINDS[type];
      // Both halves matter and they are drawn by different surfaces: the
      // GROUND sprite is what a box looks like lying on the floor
      // (render/items.ts) and the ICON is what the pouch and the HUD show.
      expect(atlas[kind.sprite], `${kind.sprite} missing`).toBeDefined();
      expect(atlas[kind.icon], `${kind.icon} missing`).toBeDefined();
    },
  );
});

describe("the economy's own shape", () => {
  it("a single box is a top-up, never a whole pouch", () => {
    // The bands exist so "find a box" and "you are stocked for the level" stay
    // different events. A pickup worth half a stack would collapse them.
    for (const type of AMMO_TYPES) {
      const [min, max] = AMMO_KINDS[type].pickup;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(max).toBeLessThan(AMMO.stackCap / 4);
    }
  });

  it("the opening holster is a real opening, well inside the cap", () => {
    expect(AMMO.starting).toBeGreaterThan(0);
    expect(AMMO.starting).toBeLessThanOrEqual(AMMO.stackCap);
  });
});
