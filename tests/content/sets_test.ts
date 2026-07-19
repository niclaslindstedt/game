// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Boss SET items (the D2 GREEN tier): the catalog's integrity and the boss
// wiring. Every set is a coherent armor kit themed to one weapon class, its
// pieces are green (`tier: "set"`) uniques, and the boss that owns it drops the
// whole set plus its on-theme signature weapon. Exercised through the SHIPPED
// content (a sequel rewrites this suite wholesale).

import {
  ENEMY_DEFS,
  SET_DEFS,
  SET_IDS,
  UNIQUE_DEFS,
  isWeaponDef,
  setForItem,
  uniqueDef,
  weaponDef,
} from "@game/core";
import { describe, expect, it } from "vitest";

const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];

// Which boss owns each set, and the on-theme SIGNATURE weapon it also drops.
// (Melee first, then ranged, then magic across the campaign — see the request.)
const SET_HOME: Record<string, { boss: string; signature: string }> = {
  scavengers_hide: { boss: "doge_1", signature: "muskrats_tooth" },
  sentinels_vigil: { boss: "armstrong", signature: "the_fallen_standard" },
  mosque_brand: { boss: "elon_mosque", signature: "wrathflame" },
  exiles_flight: { boss: "elon_mosque_rift", signature: "riftmaw" },
  walled_garden_set: { boss: "grok_omega", signature: "the_jailbreak" },
};

/** Every unique id this boss can drop across all its difficulty rungs. */
function bossDrops(bossId: string): Set<string> {
  const table = ENEMY_DEFS[bossId]?.uniquesByDifficulty ?? {};
  const ids = new Set<string>();
  for (const rung of Object.values(table))
    for (const id of rung ?? []) ids.add(id);
  return ids;
}

describe("set catalog integrity", () => {
  it("ships five sets, each a 3–5 piece armor kit of one class", () => {
    expect(SET_IDS.length).toBe(5);
    for (const set of Object.values(SET_DEFS)) {
      expect(set.members.length).toBeGreaterThanOrEqual(3);
      expect(set.members.length).toBeLessThanOrEqual(5);
      expect(["melee", "ranged", "magic"]).toContain(set.weaponClass);
      const slots = new Set<string>();
      for (const id of set.members) {
        const member = uniqueDef(id);
        expect(member.tier).toBe("set");
        expect(member.setId).toBe(set.id);
        expect(ARMOR_SLOTS).toContain(member.slot);
        expect(isWeaponDef(member.base)).toBe(false);
        expect(slots.has(member.slot)).toBe(false); // one piece per slot
        slots.add(member.slot);
      }
    }
  });

  it("every green (set-tier) unique belongs to exactly one set", () => {
    const setUniques = Object.entries(UNIQUE_DEFS).filter(
      ([, u]) => u.tier === "set",
    );
    // 5 sets × 4 armor pieces.
    expect(setUniques.length).toBe(20);
    for (const [id] of setUniques) {
      const owner = setForItem(id);
      expect(owner, `${id} has no owning set`).not.toBeNull();
      expect(owner?.members).toContain(id);
    }
  });

  it("set bonuses ascend and pay a capstone at the full set", () => {
    for (const set of Object.values(SET_DEFS)) {
      let prev = 1;
      for (const tier of set.bonuses) {
        expect(tier.pieces).toBeGreaterThan(prev);
        expect(tier.pieces).toBeLessThanOrEqual(set.members.length);
        expect(tier.bonuses.length).toBeGreaterThan(0);
        prev = tier.pieces;
      }
      // The capstone lands at the full set, and is a signature POWER (a granted
      // spell, a proc, or sure-strike) — not just another stat line.
      const full = set.bonuses.find((t) => t.pieces === set.members.length);
      expect(full, `${set.id} has no full-set bonus`).toBeDefined();
      const capstoneKinds = full!.bonuses.map((b) => b.kind);
      expect(
        capstoneKinds.some(
          (k) => k === "spell" || k === "proc" || k === "sureStrike",
        ),
        `${set.id} full-set bonus is not a capstone power`,
      ).toBe(true);
    }
  });
});

describe("boss set wiring", () => {
  it("each set is fully farmable from its boss, alongside its signature", () => {
    for (const [setId, home] of Object.entries(SET_HOME)) {
      const set = SET_DEFS[setId]!;
      expect(set, `unknown set ${setId}`).toBeDefined();
      const drops = bossDrops(home.boss);
      // The whole set drops from this boss (on the endgame rungs).
      for (const member of set.members) {
        expect(
          drops.has(member),
          `${home.boss} never drops set piece ${member}`,
        ).toBe(true);
      }
      // …and so does the signature weapon.
      expect(
        drops.has(home.signature),
        `${home.boss} never drops signature ${home.signature}`,
      ).toBe(true);
    }
  });

  it("each signature weapon matches its set's class and is a plain unique", () => {
    for (const [setId, home] of Object.entries(SET_HOME)) {
      const sig = uniqueDef(home.signature);
      expect(sig.slot).toBe("weapon");
      // Signatures are the boss's build-defining chase — a gold UNIQUE, not a
      // green set piece.
      expect(sig.tier ?? "unique").toBe("unique");
      expect(weaponDef(sig.base).class).toBe(SET_DEFS[setId]!.weaponClass);
    }
  });
});
