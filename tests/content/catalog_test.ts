// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Catalog integrity across the whole shipped campaign: every id a level
// references — its spawn/wave monsters, its loot pools, its hand-placed
// pickups, its guaranteed drops — must resolve in the catalog it points at.
// With the levels and rosters split across many files (defs/levels/,
// defs/enemies/), the cross-reference surface is far too large to eyeball, so
// this suite walks it. A typo or a deleted def fails here, loudly, instead of
// throwing mid-run when a wave tries to spawn a monster that no longer exists.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  enemyDef,
  gearDef,
  isWeaponDef,
  LEVEL_ORDER,
  LEVELS,
  storyItemDef,
  weaponDef,
  type LevelDef,
} from "@game/core";

const levels: LevelDef[] = LEVEL_ORDER.map((id) => LEVELS[id]!);

/** Resolve an equipment id whether it is a weapon or a piece of gear. */
function resolveEquipment(id: string): void {
  if (isWeaponDef(id)) weaponDef(id);
  else gearDef(id);
}

describe("campaign catalog integrity", () => {
  it("LEVEL_ORDER lists every level exactly once, in ascending story index", () => {
    expect([...LEVEL_ORDER].sort()).toEqual(Object.keys(LEVELS).sort());
    const indices = levels.map((l) => l.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
  });

  for (const level of levels) {
    describe(`${level.id}`, () => {
      it("resolves every spawn monster in ENEMY_DEFS", () => {
        for (const spawn of level.spawns) {
          expect(() => enemyDef(spawn.enemy)).not.toThrow();
        }
      });

      it("resolves every wave-budget monster in ENEMY_DEFS", () => {
        for (const entry of level.waves?.budget ?? []) {
          expect(() => enemyDef(entry.enemy)).not.toThrow();
        }
      });

      it("resolves every loot-pool id (weapons, gear, abilities)", () => {
        for (const id of level.loot.weaponPool) {
          expect(() => weaponDef(id)).not.toThrow();
        }
        for (const id of level.loot.gearPool) {
          expect(() => gearDef(id)).not.toThrow();
        }
        for (const id of level.loot.abilityPool) {
          expect(() => abilityDef(id)).not.toThrow();
        }
      });

      it("resolves the trophy and early-drop weapons", () => {
        if (level.loot.allClearWeapon) {
          expect(() => weaponDef(level.loot.allClearWeapon!)).not.toThrow();
        }
        if (level.loot.earlyWeapon) {
          expect(() => weaponDef(level.loot.earlyWeapon!.defId)).not.toThrow();
        }
      });

      it("resolves every hand-placed pickup", () => {
        for (const placed of level.placedItems ?? []) {
          if (placed.kind === "equipment") resolveEquipment(placed.defId);
          else if (placed.kind === "story") storyItemDef(placed.defId);
        }
      });

      it("resolves every guaranteed elite/boss drop", () => {
        const uniqueIds = new Set(
          level.spawns.map((s) => s.enemy).filter((id) => enemyDef(id).loot),
        );
        for (const id of uniqueIds) {
          const loot = enemyDef(id).loot!;
          for (const item of loot.items ?? []) {
            resolveEquipment(typeof item === "string" ? item : item.defId);
          }
          for (const storyId of loot.storyItems ?? []) {
            storyItemDef(storyId);
          }
        }
      });
    });
  }
});
