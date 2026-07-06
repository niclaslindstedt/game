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
  CLASS_STAT,
  closeInventory,
  dismissIntro,
  dropChance,
  effectiveStat,
  equipFromInventory,
  equipmentName,
  gearScore,
  isBetterEquipment,
  moveInventoryItem,
  openInventory,
  playerCritChance,
  playerSpeed,
  repairEquippedWeapon,
  rollEquipment,
  unequipToInventory,
  weaponDamage,
  weaponScore,
  wearEquippedWeapon,
} from "./game/items.ts";

// Time-limited abilities: activation and the helpers the renderer shares.
export {
  grantAbility,
  magnetRadius,
  orbPositions,
  stasisFactorAt,
} from "./game/abilities.ts";

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
} from "./game/defs/levels.ts";
export {
  ENEMY_DEFS,
  enemyDef,
  type EnemyDef,
  type EnemyRole,
} from "./game/defs/enemies.ts";
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

// Global tuning.
export {
  ENEMY_AI,
  HELD_ITEMS,
  JUMP,
  LEVELING,
  LOOT,
  MEDKIT,
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  RUN,
  STATS,
} from "./game/config.ts";

export type {
  ActiveAbility,
  Affix,
  Decor,
  Difficulty,
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
  WeaponClass,
} from "./game/types.ts";
export type { Vec2 } from "@game/lib/vec.ts";
