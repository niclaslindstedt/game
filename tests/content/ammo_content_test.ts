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
  UNARMED_DEF_ID,
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
  // THE EMPTY HAND IS NOT A WEAPON and is deliberately outside this trade: it
  // eats nothing AND wears out never, because it is what is left when the hero
  // has no weapon (see the EMPTY HAND suite below). Every AUTHORED melee and
  // magic piece still owes both halves — and the item schema holds the YAML
  // tree to it, which is why the built-in is the only exception there can be.
  const swung = WEAPONS.filter(
    (def) => def.class !== "ranged" && def.id !== UNARMED_DEF_ID,
  );

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

describe("the built-in EMPTY HAND", () => {
  it("eats nothing and never wears out", () => {
    // The engine's built-in weapon is no longer a gun — it is the hero's own
    // hands (`UNARMED_DEF_ID`), and a hand is the one thing in the game that
    // owes the ranged/melee trade NOTHING: it cannot run dry and it cannot
    // snap. This is what lets the dry swap and the on-break swap close
    // unconditionally, so no hero is ever left holding a weapon he cannot use.
    const hand = WEAPON_DEFS[UNARMED_DEF_ID]!;
    expect(hand.ammo).toBeUndefined();
    expect(hand.durability).toBeUndefined();
    expect(hand.class).toBe("melee");
  });
});

describe("the opening holster, against the shipped difficulty ladder", () => {
  it.each(Object.values(DIFFICULTY_DEFS).map((d) => [d.id, d.startingWeapon]))(
    "%s opens loaded for the weapon it actually hands out, and nothing else",
    (_id, startingWeapon) => {
      const pouch = startingAmmo(startingWeapon);
      const held = WEAPON_DEFS[startingWeapon]?.ammo;
      // THE POUCH CARRIES EXACTLY WHAT THE HERO CAN FIRE — one kind for a
      // ranged opening, and NOTHING AT ALL for a melee or magic one.
      //
      // There used to be a second stack: the engine kept an unbreakable sidearm
      // behind every hero, so a sword start opened with a hundred charged cells
      // for a gun it might never draw. The sidearm is gone (an empty hand is
      // now an empty hand), and the rule this pins is the one that replaced it
      // — a hero never opens holding rounds for a weapon he does not carry.
      if (held === undefined) {
        expect(Object.keys(pouch)).toEqual([]);
      } else {
        expect(pouch[held]).toBe(AMMO.starting);
        expect(Object.keys(pouch)).toEqual([held]);
      }
    },
  );
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
