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
  SECRET_LEVEL_ORDER,
  storyItemDef,
  weaponDef,
  type LevelDef,
} from "@game/core";

// The whole shipped catalog: the campaign in story order plus the secret
// venues (gate-only levels outside LEVEL_ORDER — the bunker). Cross-reference
// integrity holds for every level; the ORDER assertions below only bind the
// campaign.
const levels: LevelDef[] = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER].map(
  (id) => LEVELS[id]!,
);

/** Resolve an equipment id whether it is a weapon or a piece of gear. */
function resolveEquipment(id: string): void {
  if (isWeaponDef(id)) weaponDef(id);
  else gearDef(id);
}

describe("campaign catalog integrity", () => {
  it("LEVEL_ORDER + SECRET_LEVEL_ORDER list every level exactly once, campaign in ascending story index", () => {
    expect([...LEVEL_ORDER, ...SECRET_LEVEL_ORDER].sort()).toEqual(
      Object.keys(LEVELS).sort(),
    );
    // The campaign's own indices stay unique and ascending; a secret venue
    // instead SHARES a campaign index on purpose, so levelPosition's
    // interpolation axis (per-map XP caps) never shifts under shipped maps.
    const campaign = LEVEL_ORDER.map((id) => LEVELS[id]!.index);
    expect(campaign).toEqual([...campaign].sort((a, b) => a - b));
    expect(new Set(campaign).size).toBe(campaign.length);
    for (const id of SECRET_LEVEL_ORDER) {
      expect(campaign).toContain(LEVELS[id]!.index);
    }
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

      it("resolves every placed-pack monster in ENEMY_DEFS", () => {
        for (const pack of level.packs ?? []) {
          for (const member of pack.members) {
            expect(() => enemyDef(member.enemy)).not.toThrow();
          }
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

      it("resolves the trophy and scheduled early drops", () => {
        if (level.loot.allClearWeapon) {
          expect(() => weaponDef(level.loot.allClearWeapon!)).not.toThrow();
        }
        const drops = level.loot.earlyDrops ?? [];
        for (const entry of drops) {
          if ("weapon" in entry) {
            expect(() => weaponDef(entry.weapon)).not.toThrow();
          } else if ("ability" in entry) {
            expect(() => abilityDef(entry.ability)).not.toThrow();
          }
        }
        // Entries must be authored in ascending kill order (by the low bound)
        // — the runtime fires them with a single forward cursor.
        const kills = drops.map((d) =>
          Array.isArray(d.atKills) ? d.atKills[0] : d.atKills,
        );
        expect(kills).toEqual([...kills].sort((a, b) => a - b));
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
