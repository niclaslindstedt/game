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
import { setLevelDefs, type MissionDef } from "./levels/index.ts";
import {
  setQuestDefs,
  setQuestGiverDefs,
  type QuestDef,
  type QuestGiverDef,
} from "./quests.ts";
import { setConversationDefs, type ConversationDef } from "./conversations.ts";
// The import-free blueprint LEAF, never `mapgen/index.ts` — that one reaches
// `generate.ts` and with it the whole carve, which nothing swapping catalogs
// needs to have loaded.
import { setMapBlueprints } from "../mapgen/blueprints.ts";
import type { MapBlueprint } from "../mapgen/types.ts";
// The import-free SCRIPT leaf, never `script/host.ts` — that one reaches the
// Lua VM (lexer, parser, interpreter, stdlib), and this module is reachable
// from the startup path where the 170 KB budget lives. What a mod registers is
// SOURCE TEXT; the compile happens on the first hook call, inside a run.
import { setScriptSources } from "../script/catalog.ts";
import type { ScriptSource } from "../script/catalog.ts";
import { setSetDefs, type SetDef } from "./sets.ts";
import { setStoryItemDefs, type StoryItemDef } from "./story.ts";
import { setTalentDefs, type TalentDef } from "./talents/index.ts";
import { setThoughtDefs, type ThoughtDef } from "./thoughts.ts";
import { setUniqueDefs, type UniqueDef } from "./uniques.ts";
import type { CutsceneDef } from "@game/lib/cutscene.ts";

/** A partial set of catalog overrides; omitted catalogs keep their current
 * (usually shipped) contents. */
export type DefOverrides = {
  levels?: Record<string, MissionDef>;
  /** The MAP recipes, keyed by the level id each one carves. A mission's
   * geometry lives here and nowhere else: a mod ships `maps/<id>.yaml` beside
   * its `levels/<id>.yaml` and its venue is carved per run exactly like a
   * shipped one; omitted, the shipped blueprints stand. */
  blueprints?: Record<string, MapBlueprint>;
  enemies?: Record<string, EnemyDef>;
  companions?: Record<string, CompanionDef>;
  weapons?: Record<string, WeaponDef>;
  gear?: Record<string, GearDef>;
  abilities?: Record<string, AbilityDef>;
  /** The passive TALENT trees (`defs/talents/`). A mod ships its own
   * `talents.yaml` and its trees replace the shipped ones wholesale — the point
   * ECONOMY (how a point is earned, the shared rank ceiling) stays the game's. */
  talents?: Record<string, TalentDef>;
  difficulties?: Record<string, DifficultyDef>;
  storyItems?: Record<string, StoryItemDef>;
  cutscenes?: Record<string, CutsceneDef>;
  thoughts?: Record<string, ThoughtDef>;
  /** The cap-farm mutter rotation that goes with `thoughts` (ids not in it are
   * dropped — see `setThoughtDefs`). Ignored without `thoughts`. */
  capThoughts?: readonly string[];
  uniques?: Record<string, UniqueDef>;
  sets?: Record<string, SetDef>;
  /** The errands a map hands out (`defs/quests.ts`). */
  quests?: Record<string, QuestDef>;
  /** The people who hand them out — a separate catalog, so one person can own
   * a whole chain (see the note at the head of `defs/quests.ts`). */
  questGivers?: Record<string, QuestGiverDef>;
  /** The talks the hero STEERS (`defs/conversations.ts`) — named by a neutral
   * mob or by an errand whose offer is a tree rather than a page. */
  conversations?: Record<string, ConversationDef>;
  /**
   * The RULES (`content/scripts/*.lua`) — the one catalog that is behaviour
   * rather than data. A mod ships `scripts/<id>.lua` and its formulas replace
   * the shipped ones for the length of the run; a file it does not ship keeps
   * the shipped rule, and so does a HOOK it does not implement inside a file it
   * does ship. Keyed by script id, which is the file stem.
   */
  scripts?: Record<string, ScriptSource>;
};

/**
 * Replace the active content catalogs. Weapons and gear are one registry pair
 * (`isWeaponDef` distinguishes them), so pass both together — either defaults
 * to empty when only one is given.
 */
export function registerDefs(defs: DefOverrides): void {
  if (defs.levels) setLevelDefs(defs.levels);
  if (defs.blueprints) setMapBlueprints(defs.blueprints);
  if (defs.enemies) setEnemyDefs(defs.enemies);
  if (defs.companions) setCompanionDefs(defs.companions);
  if (defs.weapons || defs.gear) {
    setEquipmentDefs({ weapons: defs.weapons ?? {}, gear: defs.gear ?? {} });
  }
  if (defs.abilities) setAbilityDefs(defs.abilities);
  if (defs.talents) setTalentDefs(defs.talents);
  if (defs.difficulties) setDifficultyDefs(defs.difficulties);
  if (defs.storyItems) setStoryItemDefs(defs.storyItems);
  if (defs.cutscenes) setCutsceneDefs(defs.cutscenes);
  if (defs.thoughts) setThoughtDefs(defs.thoughts, defs.capThoughts);
  if (defs.uniques) setUniqueDefs(defs.uniques);
  if (defs.sets) setSetDefs(defs.sets);
  if (defs.quests) setQuestDefs(defs.quests);
  if (defs.questGivers) setQuestGiverDefs(defs.questGivers);
  if (defs.conversations) setConversationDefs(defs.conversations);
  // Always assigned when the key is present, INCLUDING an empty record: that is
  // how `restoreBaseDefs()` clears a mod's rules, and how the swap bumps the
  // generation counter the script host throws its compiled chunks away on.
  if (defs.scripts) setScriptSources(defs.scripts);
}
