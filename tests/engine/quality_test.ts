// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MAKE QUALITY — the craftsmanship axis every weapon and armor drop rolls at
// mint (BROKEN → CRUDE → NORMAL → SUPERIOR → PERFECT): the roll's odds slide
// with the killer's monster level, the rank scales the piece's damage /
// armor / durability / merchant value (config QUALITY), and it leads the
// item's display name. Runs on the synthetic fixture catalog.

import { describe, expect, it } from "vitest";

import {
  equipmentMaxDurability,
  equipmentName,
  qualityMult,
  qualityOf,
  QUALITY,
  QUALITY_ORDER,
  repairEquippedWeapon,
  rollEquipment,
  rollQuality,
  sellValue,
  weaponDamageFor,
  type Equipment,
  type Quality,
} from "@game/core";
import { createRng } from "@game/lib/rng.ts";

import { startGame } from "./helpers.ts";

/** Distribution of many quality rolls at one monster level. */
function rollMany(mlvl: number, n = 600): Set<Quality> {
  const rng = createRng(7);
  const seen = new Set<Quality>();
  for (let i = 0; i < n; i++) seen.add(rollQuality(rng, mlvl));
  return seen;
}

describe("the quality roll", () => {
  it("low-level monsters hand out shabby make, never perfect work", () => {
    const seen = rollMany(1);
    expect(seen.has("broken")).toBe(true);
    expect(seen.has("crude")).toBe(true);
    expect(seen.has("normal")).toBe(true);
    // Perfect work carries zero weight at monster level 1.
    expect(seen.has("perfect")).toBe(false);
  });

  it("deep-campaign monsters pay superior and perfect work, never broken", () => {
    const seen = rollMany(QUALITY.highMlvl);
    expect(seen.has("superior")).toBe(true);
    expect(seen.has("perfect")).toBe(true);
    // Broken make carries zero weight from the high mark up.
    expect(seen.has("broken")).toBe(false);
  });

  it("stamps the rolled quality on plain weapon and armor drops", () => {
    const state = startGame();
    const weapon = rollEquipment(state, {
      defId: "test_pipe",
      tier: "regular",
      mlvl: 20,
    });
    expect(weapon.quality).toBeDefined();
    const vest = rollEquipment(state, {
      defId: "test_vest",
      tier: "regular",
      mlvl: 20,
    });
    expect(vest.quality).toBeDefined();
  });

  it("charms and bags never roll one — nothing to scale", () => {
    const state = startGame();
    const charm = rollEquipment(state, { defId: "test_charm", mlvl: 99 });
    expect(qualityOf(charm)).toBe("normal");
    const bag = rollEquipment(state, { defId: "test_bag", mlvl: 99 });
    expect(qualityOf(bag)).toBe("normal");
  });

  it("craftsmanship and magic are exclusive: every magic+ tier is normal make", () => {
    const state = startGame();
    const tiers = ["magic", "rare", "unique", "legendary"] as const;
    for (let i = 0; i < 80; i++) {
      const piece = rollEquipment(state, {
        defId: "test_pipe",
        tier: tiers[i % tiers.length],
        mlvl: 99,
      });
      expect(qualityOf(piece)).toBe("normal");
    }
  });

  it("a caller can pin the quality (scripted story drops arrive as tuned)", () => {
    const state = startGame();
    const piece = rollEquipment(state, {
      defId: "test_pipe",
      quality: "perfect",
      mlvl: 1,
    });
    expect(piece.quality).toBe("perfect");
  });

  it("pieces from before quality shipped read as normal", () => {
    const state = startGame();
    // The hand-minted starter carries no quality field — the old-save shape.
    const starter = state.player.equipment.weapon;
    expect(starter.quality).toBeUndefined();
    expect(qualityOf(starter)).toBe("normal");
    expect(qualityMult(starter)).toBe(1);
  });
});

describe("what quality is worth", () => {
  function pipeAt(state: ReturnType<typeof startGame>, quality: Quality) {
    // Pin the ilvl draw so every instance shares one item level — the
    // ITEM-LEVEL damage term (WEAPON.damagePerIlvl) is then identical across
    // instances and the test isolates what QUALITY alone is worth. (A pinned
    // draw, not a low mlvl: the offset-strip lifts the loot level off `mlvl`.)
    state.rng = () => 0.5;
    // Pin the flavor stream too: the make-quality range roll is drawn off it,
    // and a 0.5 draw lands on each band's MIDPOINT — i.e. `QUALITY.mults` — so
    // the test reads what a quality is worth on average, not a random copy.
    state.fxRng = () => 0.5;
    return rollEquipment(state, { defId: "test_pipe", quality, mlvl: 1 });
  }

  it("scales a weapon's damage through the one damage source", () => {
    const state = startGame();
    const broken = pipeAt(state, "broken");
    const normal = pipeAt(state, "normal");
    const perfect = pipeAt(state, "perfect");
    const base = weaponDamageFor(state, normal);
    expect(weaponDamageFor(state, broken)).toBeCloseTo(
      base * QUALITY.mults.broken,
      6,
    );
    expect(weaponDamageFor(state, perfect)).toBeCloseTo(
      base * QUALITY.mults.perfect,
      6,
    );
  });

  it("scales an armor piece's rolled points, stamped at mint", () => {
    const state = startGame();
    const opts = { defId: "test_vest", tier: "regular", mlvl: 10 } as const;
    // Pin the ilvl draw so the two instances differ only in make, and the
    // flavor stream so each quality rolls its band MIDPOINT (`QUALITY.mults`).
    state.rng = () => 0.5;
    state.fxRng = () => 0.5;
    const normal = rollEquipment(state, { ...opts, quality: "normal" });
    const perfect = rollEquipment(state, { ...opts, quality: "perfect" });
    expect(normal.ilvl).toBe(perfect.ilvl);
    // Both share one ilvl, so perfect is normal scaled by the make mult —
    // within a point of rounding (each stamps round(raw × mult) independently).
    expect(
      Math.abs(perfect.armor! - normal.armor! * QUALITY.mults.perfect),
    ).toBeLessThanOrEqual(1);
  });

  it("sizes the wear budget, and repair kits refill to it — not past it", () => {
    const state = startGame();
    const crude = rollEquipment(state, {
      defId: "test_pipe",
      quality: "crude",
      mlvl: 10,
    });
    const full = equipmentMaxDurability(crude);
    expect(crude.durability).toBe(full);
    // A CRUDE roll (its qualityRoll < 1) always wears out sooner than a NORMAL
    // piece of the same base — drop the rolled multiplier so the comparison is
    // against the flat-normal midpoint, not the crude copy's own roll.
    expect(full).toBeLessThan(
      equipmentMaxDurability({
        ...crude,
        quality: "normal",
        qualityRoll: undefined,
      }),
    );
    // Wear it, mend it: the kit restores the CRUDE maximum, never the def's.
    state.player.equipment.weapon = crude;
    crude.durability = 1;
    expect(repairEquippedWeapon(state)).toBe(true);
    expect(crude.durability).toBe(full);
  });

  it("carries to the merchant's scales", () => {
    const state = startGame();
    const opts = { defId: "test_pipe", tier: "regular", mlvl: 10 } as const;
    state.rng = () => 0.5;
    const normal = rollEquipment(state, { ...opts, quality: "normal" });
    const perfect = rollEquipment(state, { ...opts, quality: "perfect" });
    expect(sellValue(perfect)).toBeGreaterThan(sellValue(normal));
  });

  it("rolls a base-value multiplier inside the quality's band, stamped at mint", () => {
    const state = startGame();
    for (const quality of QUALITY_ORDER) {
      if (quality === "normal") continue; // covered by the spread below
      const band = QUALITY.ranges[quality];
      for (let i = 0; i < 40; i++) {
        const piece = rollEquipment(state, {
          defId: "test_pipe",
          quality,
          mlvl: 10,
        });
        expect(piece.qualityRoll).toBeDefined();
        expect(piece.qualityRoll!).toBeGreaterThanOrEqual(band.min);
        expect(piece.qualityRoll!).toBeLessThanOrEqual(band.max);
        expect(qualityMult(piece)).toBe(piece.qualityRoll);
      }
    }
  });

  it("gives two SUPERIOR copies of a base different damage", () => {
    const state = startGame();
    // Pin the loot stream so ilvl/quality are identical — only the flavor
    // stream (the base-value roll) is left to vary between the two copies.
    state.rng = () => 0.5;
    const damages = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const copy = rollEquipment(state, {
        defId: "test_pipe",
        quality: "superior",
        mlvl: 10,
      });
      damages.add(Math.round(weaponDamageFor(state, copy) * 1000));
    }
    // The fixed loot stream would collapse to one number under the old flat
    // multiplier; the make-quality range roll spreads it across many.
    expect(damages.size).toBeGreaterThan(1);
  });

  it("keeps the bands overlapping and climbing (a good CRUDE can beat a poor NORMAL)", () => {
    const { crude, normal, superior, perfect } = QUALITY.ranges;
    // Ascending midpoints.
    expect(QUALITY.mults.crude).toBeLessThan(QUALITY.mults.normal);
    expect(QUALITY.mults.normal).toBeLessThan(QUALITY.mults.superior);
    // Adjacent bands OVERLAP…
    expect(crude.max).toBeGreaterThan(normal.min);
    expect(normal.max).toBeGreaterThan(superior.min);
    // …but a PERFECT never rolls under a NORMAL's ceiling (non-adjacent).
    expect(perfect.min).toBeGreaterThan(normal.max);
  });

  it("magic-or-better finds carry no range roll — always flat normal make", () => {
    const state = startGame();
    for (let i = 0; i < 20; i++) {
      const magic = rollEquipment(state, {
        defId: "test_pipe",
        tier: "magic",
        mlvl: 40,
      });
      expect(magic.qualityRoll).toBeUndefined();
      expect(qualityMult(magic)).toBe(1);
    }
  });

  it("leads the item's display name (and normal stays silent)", () => {
    const piece: Equipment = {
      id: 1,
      defId: "test_pipe",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      quality: "broken",
      affixes: [],
    };
    expect(equipmentName(piece)).toBe("BROKEN TEST PIPE");
    expect(equipmentName({ ...piece, quality: "superior" })).toBe(
      "SUPERIOR TEST PIPE",
    );
    expect(equipmentName({ ...piece, quality: "normal" })).toBe("TEST PIPE");
  });
});
