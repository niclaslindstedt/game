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
  moveInventoryItem,
  openInventory,
  playerCritChance,
  rollEquipment,
  unequipToInventory,
  weaponDamage,
} from "./game/items.ts";

// Content catalogs: levels, monsters, equipment, tiers.
export {
  LEVEL_ORDER,
  LEVELS,
  levelDef,
  type LevelDef,
  type SpawnSpec,
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
  JUMP,
  LEVELING,
  LOOT,
  MEDKIT,
  PLAYER,
  RUN,
  STATS,
} from "./game/config.ts";

export type {
  Affix,
  Decor,
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
  Player,
  Projectile,
  StatName,
  Tier,
  WeaponClass,
} from "./game/types.ts";
export type { Vec2 } from "@game/lib/vec.ts";
