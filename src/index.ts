// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Public entry point for the game engine core. The engine is framework-free:
// the browser app under `website/` consumes this module via the `@game/core`
// alias, drives `step()` from its render loop, and reads the returned state
// to draw. Content lives in data catalogs (levels, enemies, equipment) so
// the same simulation carries every level. See docs/architecture.md for the
// module layout.

export { engineVersion } from "./version.ts";
export {
  status,
  warn,
  info,
  header,
  error,
  debug,
  setDebugEnabled,
  recentLogs,
} from "./output.ts";

// The simulation.
export { createGame } from "./game/create.ts";
export { step } from "./game/step.ts";

// MERCY DROP queries — exposed so the app can surface "the swarm is about to
// cough up a bomb" / "a drink is coming" and tests can assert the ramps.
export { crowdBombChance, staminaDrinkChance } from "./game/loot.ts";

// Loadout carry-over between levels: snapshot a finished run's progress,
// dress the next run in it (via createGame's `loadout` parameter), or derive
// a realistic stand-in for dev jumps with nothing banked.
export {
  applyLoadout,
  deriveArrivalLoadout,
  extractLoadout,
} from "./game/arrival.ts";

// The autopilot: bot strategies producing player input (tests, ?bot=, and
// the future AI second player).
export {
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  createBot,
  type Bot,
  type BotStrategy,
} from "./game/bot.ts";

// Player-driven mutations (level-up chooser, inventory UI, phase toggles).
export {
  allocateStat,
  beginRespec,
  deallocateStat,
  confirmRespec,
  DAMAGE_STAT,
  SPEED_STAT,
  CRIT_STAT,
  closeInventory,
  addToInventory,
  advanceIntro,
  skipIntro,
  dismissIntro,
  skipCutscene,
  tapCutscene,
  armorInfo,
  computeMaxHp,
  computeMaxStamina,
  dropChance,
  desperationRamp,
  lowHealthDesperation,
  lowDurabilityDesperation,
  discardFromInventory,
  discardEquipped,
  effectiveStat,
  enemyDodgeChance,
  equipFromInventory,
  equipmentName,
  equippedBagSlots,
  inventoryCapacity,
  syncInventoryCapacity,
  gearScore,
  isBetterEquipment,
  isPassiveItem,
  meetsLevelReq,
  moveInventoryItem,
  openInventory,
  pauseGame,
  resumeGame,
  playerAppearance,
  playerCritChance,
  playerDodgeChance,
  playerMissChance,
  playerSpeed,
  playerSuited,
  previewEquipped,
  repairEquippedWeapon,
  restoreArmor,
  restoreStamina,
  rollEquipment,
  unequipToInventory,
  weaponCooldownFor,
  weaponDamage,
  weaponDamageFor,
  weaponDps,
  weaponRangeFor,
  weaponScore,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
} from "./game/items.ts";

// The level map: fog-of-war queries, the map pause phase, and the grid
// helpers the map overlay draws from (`state.explored` + MAP.cellSize).
export { closeMap, isExplored, mapCols, mapRows, openMap } from "./game/map.ts";

// The menace meter: the escalation the app reads to draw the rampage gauge
// and mark evolved mobs (the mechanics live in step()/loot()).
export {
  enemyPowerScale,
  menaceSensitivity,
  menaceStage,
  menaceWarmup,
  mobHpScaleFor,
} from "./game/menace.ts";

// Time-limited abilities: activation and the helpers the renderer shares.
export {
  discardHeldAbility,
  grantAbility,
  magnetRadius,
  orbPositions,
  stasisFactorAt,
} from "./game/abilities.ts";

// In-world dialogue (elite ambushes, boss confrontations, story-item lore):
// `advanceDialogue` is the player's tap; `dialogueContent` is what the app
// draws while `phase === "dialogue"`.
export { advanceDialogue, dialogueContent } from "./game/story.ts";

// Cutscenes: the generic player (@game/lib) plus the scene catalog. The app
// renders scenes from CutsceneState + def; `currentLine` is the text on
// screen this frame.
export {
  advanceCutsceneBeat,
  createCutscene,
  currentLine,
  finishCutscene,
  stepCutscene,
  type CutsceneActor,
  type CutsceneActorDef,
  type CutsceneBeat,
  type CutsceneDef,
  type CutsceneProp,
  type CutsceneStage,
  type CutsceneState,
} from "@game/lib/cutscene.ts";
export {
  CUTSCENE_DEFS,
  cutsceneDef,
  cutsceneVariant,
} from "./game/defs/cutscenes.ts";

// Content catalogs: levels, monsters, equipment, tiers, difficulties.
export {
  ABILITY_DEFS,
  abilityDef,
  type AbilityDef,
  type AbilityKind,
} from "./game/defs/abilities.ts";
export {
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
  type DifficultyDef,
} from "./game/defs/difficulties.ts";
export {
  LEVEL_ORDER,
  LEVELS,
  levelDef,
  levelsBefore,
  type LevelDef,
  type SpawnSpec,
  type WaveBudget,
  type WaveSpec,
} from "./game/defs/levels/index.ts";
export {
  ENEMY_DEFS,
  enemyDef,
  type EnemyDef,
  type EnemyRole,
} from "./game/defs/enemies/index.ts";
export {
  AFFIX_POOLS,
  equipmentBaseName,
  equipmentIcon,
  equipmentLevelReq,
  weaponAssumedTargets,
  weaponCritMult,
  GEAR_DEFS,
  gearDef,
  isWeaponDef,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  WEAPON_DEFS,
  weaponDef,
  type AffixDef,
  type GearDef,
  type WeaponDef,
} from "./game/defs/equipment.ts";
export {
  STORY_ITEM_DEFS,
  storyItemDef,
  type StoryItemDef,
} from "./game/defs/story.ts";
export {
  THOUGHT_DEFS,
  thoughtDef,
  type ThoughtDef,
} from "./game/defs/thoughts.ts";

// Test/authoring hook: swap the active content catalogs for synthetic
// fixtures. Production never calls this; the engine test suites use it to run
// against content-agnostic fixtures (see tests/engine).
export { registerDefs, type DefOverrides } from "./game/defs/registry.ts";

// Global tuning.
export {
  ACCURACY,
  AIM,
  APPARITION,
  ARMOR,
  ARRIVAL,
  ASTEROIDS,
  DIALOGUE,
  DODGE,
  DOORS,
  ENEMY_AI,
  HELD_ITEMS,
  JUMP,
  LAST_STAND,
  LEVELING,
  LOOT,
  MAP,
  MEDKIT,
  MENACE,
  MERCY,
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  RUN,
  STAMINA,
  STATS,
  WEAPON,
  WELLS,
  WOUNDS,
} from "./game/config.ts";

export type {
  ActiveAbility,
  Affix,
  ArmorGrade,
  Asteroid,
  Decor,
  DialogueState,
  Difficulty,
  DoorState,
  Enemy,
  EquipSlot,
  Equipment,
  GameEvent,
  GameInput,
  GamePhase,
  GameState,
  GameStats,
  GravityWell,
  Item,
  Landmark,
  LevelInfo,
  Loadout,
  MapMarker,
  MapMarkerKind,
  Obstacle,
  Player,
  Projectile,
  StatName,
  Tier,
  TileSpec,
  WeaponClass,
} from "./game/types.ts";
export type { Vec2 } from "@game/lib/vec.ts";
