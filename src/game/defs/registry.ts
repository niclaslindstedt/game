// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test/authoring hook: swap the engine's active content catalogs for a custom
// set. Production ships the catalogs statically and never calls this — it
// exists so the engine test suites can run against synthetic fixtures with
// plain ids (`test_level`, `test_minion`, …), independent of any particular
// game's shipped content. See tests/engine/fixtures.ts. Each accessor
// (`levelDef`, `enemyDef`, …) reads the active registry, which defaults to the
// shipped catalog until a call here replaces it.

import { setAbilityDefs, type AbilityDef } from "./abilities.ts";
import { setCompanionDefs, type CompanionDef } from "./companions.ts";
import { setCutsceneDefs } from "./cutscenes.ts";
import { setDifficultyDefs, type DifficultyDef } from "./difficulties.ts";
import { setEnemyDefs, type EnemyDef } from "./enemies/index.ts";
import { setEquipmentDefs, type GearDef, type WeaponDef } from "./equipment.ts";
import { setLevelDefs, type LevelDef } from "./levels/index.ts";
import { setSetDefs, type SetDef } from "./sets.ts";
import { setStoryItemDefs, type StoryItemDef } from "./story.ts";
import { setUniqueDefs, type UniqueDef } from "./uniques.ts";
import type { CutsceneDef } from "@game/lib/cutscene.ts";

/** A partial set of catalog overrides; omitted catalogs keep their current
 * (usually shipped) contents. */
export type DefOverrides = {
  levels?: Record<string, LevelDef>;
  enemies?: Record<string, EnemyDef>;
  companions?: Record<string, CompanionDef>;
  weapons?: Record<string, WeaponDef>;
  gear?: Record<string, GearDef>;
  abilities?: Record<string, AbilityDef>;
  difficulties?: Record<string, DifficultyDef>;
  storyItems?: Record<string, StoryItemDef>;
  cutscenes?: Record<string, CutsceneDef>;
  uniques?: Record<string, UniqueDef>;
  sets?: Record<string, SetDef>;
};

/**
 * Replace the active content catalogs. Weapons and gear are one registry pair
 * (`isWeaponDef` distinguishes them), so pass both together — either defaults
 * to empty when only one is given.
 */
export function registerDefs(defs: DefOverrides): void {
  if (defs.levels) setLevelDefs(defs.levels);
  if (defs.enemies) setEnemyDefs(defs.enemies);
  if (defs.companions) setCompanionDefs(defs.companions);
  if (defs.weapons || defs.gear) {
    setEquipmentDefs({ weapons: defs.weapons ?? {}, gear: defs.gear ?? {} });
  }
  if (defs.abilities) setAbilityDefs(defs.abilities);
  if (defs.difficulties) setDifficultyDefs(defs.difficulties);
  if (defs.storyItems) setStoryItemDefs(defs.storyItems);
  if (defs.cutscenes) setCutsceneDefs(defs.cutscenes);
  if (defs.uniques) setUniqueDefs(defs.uniques);
  if (defs.sets) setSetDefs(defs.sets);
}
