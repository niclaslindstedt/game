// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shipped ARTIFACT roster (`src/game/defs/artifacts.ts`) — the level-99
// endgame relics. Locks the roster's intent: every artifact mints at the
// `"artifact"` tier, carries an endgame-grade ilvl, sits on a real high-req
// base (so a cap-gated drop can actually be worn), spreads across every slot,
// and — per the "stats determine rarity" law — is spread across a real power
// ladder whose strongest pieces are the rarest. The ilvl/armor/budget MODEL is
// held by tests/content/uniques_test.ts + weapon-ilvl.mjs; this suite guards
// the shape and coverage of THIS batch.

import {
  equipmentLevelReq,
  gearDef,
  isWeaponDef,
  UNIQUE_DEFS,
  UNIQUE_IDS,
  weaponDef,
  type UniqueDef,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { bonusBudget } from "../../src/game/item-budget.ts";

const artifacts: UniqueDef[] = UNIQUE_IDS.map((id) => UNIQUE_DEFS[id]!).filter(
  (u) => u.tier === "artifact",
);

describe("artifact roster", () => {
  it("ships the level-99 endgame batch, all at the artifact tier", () => {
    // The whole roster (phase 5): a big, distinct chase.
    expect(artifacts.length).toBeGreaterThanOrEqual(24);
    for (const a of artifacts) expect(a.tier).toBe("artifact");
    // Ids are unique across the batch.
    const ids = artifacts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries endgame ilvls on real bases that resolve in the right slot", () => {
    for (const a of artifacts) {
      // Endgame-grade: comfortably above the ilvl floor a cap-level farm keeps.
      expect(a.ilvl).toBeGreaterThanOrEqual(99);
      // The base is a REAL catalog id (weapon or gear), in the artifact's slot.
      const isWeapon = isWeaponDef(a.base);
      expect(isWeapon).toBe(a.slot === "weapon");
      expect(isWeapon ? weaponDef(a.base) : gearDef(a.base)).toBeTruthy();
      // A req-gated drop must be wearable at the cap: base req ≤ 99.
      expect(equipmentLevelReq(a.base)).toBeLessThanOrEqual(99);
    }
  });

  it("covers every equipment slot", () => {
    const slots = new Set(artifacts.map((a) => a.slot));
    for (const slot of ["weapon", "head", "chest", "legs", "feet", "charm", "bag"])
      expect(slots.has(slot as UniqueDef["slot"])).toBe(true);
  });

  it("spreads across a real power ladder (stats determine rarity)", () => {
    // The point of the tier: budgets span from near the rarity reference up to
    // apex god-rolls several times it, so the power-law weight makes the
    // strongest the rarest. Assert the SPREAD is genuinely vast.
    const budgets = artifacts.map((a) => bonusBudget(a.bonuses));
    const min = Math.min(...budgets);
    const max = Math.max(...budgets);
    expect(min).toBeLessThan(45); // a common-band staple exists
    expect(max).toBeGreaterThan(120); // an apex god-roll exists
    // The apex is at least ~3× the commonest — a genuine ladder, not a bump.
    expect(max / min).toBeGreaterThan(3);
  });
});
