// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The engine's MENU-side entry point — everything the app shell needs BEFORE a
// run exists, and nothing more.
//
// `index.ts` (`@game/core`) is the engine's whole public API, simulation
// included. The app's startup path — the title menu, the character roster, the
// settings tree, the difficulty ladder — needs none of that simulation; it
// needs the CATALOGS (levels, difficulties, equipment), the saved-hero math,
// and the engine flags the settings screen applies. But an import is an import:
// a menu module reaching for `levelDef` through the full barrel puts
// `createGame`, the step pipeline, the autopilot, the loot roller, the spawners
// and the hazards in the same chunk as the menu, because they are all one
// module graph away. That is ~150 KB of JavaScript downloaded and parsed before
// the player has pressed anything, on a game whose critical-path budget the SEO
// check (`pwa/scripts/check-seo.mjs` §11.3.9) polices.
//
// So the shell imports `@game/menu` and the game imports `@game/core`. Both
// aliases resolve to the SAME underlying modules — `index.ts` re-exports this
// file, so nothing is duplicated in the bundle and there is one definition of
// every symbol. The split is purely about which modules the startup path can
// REACH.
//
// The rule for adding to this file: an export belongs here when the title
// screen, the roster, or the settings tree needs it AND it does not drag the
// simulation in behind it. When in doubt, add it to `index.ts` only and let the
// importer be lazy — the budget check will tell you if you got it wrong.

export { engineVersion } from "./version.ts";
export { warn } from "./output.ts";

// The catalogs the menus read: which missions and difficulties exist, what a
// piece of gear is called and what it takes to wear it.
export {
  DIFFICULTY_ORDER,
  DIFFICULTY_UNLOCK_PREREQS,
  STARTING_DIFFICULTIES,
  difficultyDef,
} from "./game/defs/difficulties.ts";
// The level catalog as the MENUS see it — order, names, `foes` labels — never
// `levelDef`: the full def carries every wall, spawner and loot table of a map,
// which is ~70% of the compiled catalog and nothing a menu reads.
export {
  hasLevel,
  levelSummary,
  LEVEL_ORDER,
  SECRET_LEVEL_ORDER,
  type LevelSummary,
} from "./game/defs/levels/summary.ts";
export {
  equipmentLevelReq,
  gearDef,
  weaponDef,
} from "./game/defs/equipment.ts";

// The saved-hero math: adopting a banked loadout, what the LOST & FOUND holds,
// and what buying a piece back costs. (The hero's COSTUME is not here — it
// depends on the level and his story items, so a menu portrait is dressed from
// a bare `Loadout` instead; see pwa paper-doll.ts.) Taken
// off the leaf modules rather than the `items/` barrel — that barrel also
// re-exports the loot roller and the pickup flow, which reach the menace curve,
// the enemy catalog and the story system.
export { adoptEquipment } from "./game/items/adopt.ts";
export { isLiveItemSlot } from "./game/items/slots.ts";
export { reclaimCost, vaultContents } from "./game/items/vault.ts";

// The minimap's grid, shared with the title-side map preview.
export { mapCols, mapRows } from "./game/map.ts";

// The engine flags the SETTINGS tree applies on load (see pwa settings.ts).
export {
  setAutoEquipEnabled,
  setAutoStatGainsEnabled,
  setCameraYaw,
  setCutscenesEnabled,
  setMinigamesEnabled,
  setDeathScenesEnabled,
  setDialogueEnabled,
} from "./game/flags.ts";
export {
  BALANCE_TUNING_DEFAULTS,
  setBalanceTuning,
  type BalanceTuning,
} from "./game/tuning.ts";

// THE CAMPAIGN CHAIN'S CARRY — the record the app's ROSTER stores on a hero
// and merges on every save. It is here rather than only in `@game/core`
// because the roster is on the STARTUP path: `quests/campaign-save.ts` is a
// leaf whose one import is a type, so re-exporting it drags neither the quest
// catalog nor a line of the simulation onto the title screen.
export {
  emptyCampaignQuests,
  mergeCampaignQuests,
  type CampaignQuestSave,
} from "./game/quests/campaign-save.ts";

// Types only — erased at build time, so they cost the startup path nothing
// wherever they happen to be declared.
export type { BotProfile, BotStrategy } from "./game/bot/index.ts";
export type { StatBuild } from "./game/builds.ts";
export type {
  Affix,
  ArmorSlot,
  Difficulty,
  Equipment,
  GameEvent,
  GameState,
  Loadout,
  Player,
  PlayerScreen,
  Tier,
  WeaponClass,
} from "./game/types/index.ts";
