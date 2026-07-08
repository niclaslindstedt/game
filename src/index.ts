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
  DAMAGE_STAT,
  SPEED_STAT,
  closeInventory,
  dismissIntro,
  skipCutscene,
  tapCutscene,
  armorInfo,
  computeMaxHp,
  computeMaxStamina,
  dropChance,
  discardFromInventory,
  effectiveStat,
  equipFromInventory,
  equipmentName,
  inventoryCapacity,
  syncInventoryCapacity,
  gearScore,
  isBetterEquipment,
  moveInventoryItem,
  openInventory,
  pauseGame,
  resumeGame,
  playerAppearance,
  playerCritChance,
  playerSpeed,
  playerSuited,
  previewEquipped,
  repairEquippedWeapon,
  rollEquipment,
  unequipToInventory,
  weaponCooldownFor,
  weaponDamage,
  weaponDamageFor,
  weaponRangeFor,
  weaponScore,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
} from "./game/items.ts";

// The menace meter: the escalation the app reads to draw the rampage gauge
// and mark evolved mobs (the mechanics live in step()/loot()).
export {
  enemyPowerScale,
  menaceSensitivity,
  menaceStage,
  menaceWarmup,
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
export { CUTSCENE_DEFS, cutsceneDef } from "./game/defs/cutscenes.ts";

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
  GEAR_DEFS,
  gearDef,
  isWeaponDef,
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
  ARMOR,
  DIALOGUE,
  DOORS,
  ENEMY_AI,
  HELD_ITEMS,
  JUMP,
  LAST_STAND,
  LEVELING,
  LOOT,
  MEDKIT,
  MENACE,
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  RUN,
  STAMINA,
  STATS,
  WEAPON,
  WOUNDS,
} from "./game/config.ts";

export type {
  ActiveAbility,
  Affix,
  ArmorGrade,
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
  Item,
  Landmark,
  LevelInfo,
  Obstacle,
  Player,
  Projectile,
  StatName,
  Tier,
  TileSpec,
  WeaponClass,
} from "./game/types.ts";
export type { Vec2 } from "@game/lib/vec.ts";
