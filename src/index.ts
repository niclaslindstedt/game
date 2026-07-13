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
export {
  canDropNuke,
  crowdBombChance,
  enemyKillXp,
  grantXp,
  hitEnemy,
  killEnemy,
  staminaDrinkChance,
} from "./game/loot.ts";
export { mercyRescueWaiting, type MercyRescue } from "./game/items.ts";

// Loadout carry-over between levels: snapshot a finished run's progress,
// dress the next run in it (via createGame's `loadout` parameter), or derive
// a realistic stand-in for dev jumps with nothing banked.
export {
  applyLoadout,
  deriveArrivalLoadout,
  extractLoadout,
} from "./game/arrival.ts";

// Test scenarios: mutate a fresh run into an exact situation (hero at the
// boss, 2 hp, no weapon, a ring of 60 mobs…) for bug repros and performance
// probes. Fed by the `?scenario=` URL param and the test-scenario skill.
export {
  applyScenario,
  type ScenarioDrop,
  type ScenarioSpawn,
  type ScenarioSpec,
} from "./game/scenario.ts";

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
  adoptEquipment,
  allocateStat,
  baseDefId,
  beginRespec,
  deallocateStat,
  confirmRespec,
  DAMAGE_STAT,
  SPEED_STAT,
  CRIT_STAT,
  REQ_STAT,
  statRequirement,
  meetsStatReq,
  canEquip,
  rawStat,
  canOpenInventory,
  closeInventory,
  addToInventory,
  canCollectEquipment,
  advanceIntro,
  skipIntro,
  dismissIntro,
  advanceOutro,
  skipOutro,
  skipCutscene,
  skipStoryOpening,
  tapCutscene,
  ARMOR_SLOTS,
  armorReduction,
  armorValueOf,
  autoEquipBest,
  autoEquipUpgradeCount,
  bankMedkit,
  bankStaminaPotion,
  bestMedkitTier,
  computeMaxHp,
  computeMaxStamina,
  consumeMedkit,
  consumeStaminaPotion,
  dropChance,
  desperationRamp,
  lowHealthDesperation,
  lowDurabilityDesperation,
  discardFromInventory,
  discardEquipped,
  effectiveStat,
  enemyDodgeChance,
  equipFromInventory,
  gateKeyTarget,
  spendGateKey,
  equipmentMaxDurability,
  equipmentName,
  equippedBagSlots,
  inventoryCapacity,
  syncInventoryCapacity,
  gearScore,
  isBetterEquipment,
  setAutoEquipEnabled,
  isAutoEquipEnabled,
  isPassiveItem,
  isScrappableLoot,
  isArmorBroken,
  isSpecialItem,
  magicFindBonus,
  itemLevelReq,
  medkitTierIndex,
  meetsLevelReq,
  scrapInferiorLoot,
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
  qualityMult,
  qualityOf,
  rollQuality,
  repairEquippedWeapon,
  repairWornArmor,
  restoreStamina,
  totalArmor,
  rollEquipment,
  mintUnique,
  unequipToInventory,
  weaponCooldownFor,
  weaponCritMult,
  weaponDamage,
  weaponDamageFor,
  weaponDamageRange,
  weaponDps,
  weaponRangeFor,
  rollWeaponDamage,
  rollWeaponHit,
  weaponScore,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
  wearWornArmor,
  wouldUpgradeSlot,
} from "./game/items.ts";

// Companions: the SPARE-or-KILL verdict, the recruited party's equip screen
// mutators, and the derived numbers the UI reads (see companions.ts).
export {
  COMPANION_SLOTS,
  closeCompanionPanel,
  companionArmorReduction,
  companionById,
  companionMaxHp,
  companionWeaponCooldown,
  companionWeaponDamage,
  equipCompanionFromInventory,
  openCompanionPanel,
  recruitCompanion,
  resolveChoice,
  unequipCompanionToInventory,
} from "./game/companions.ts";

// The level map: fog-of-war queries, the map pause phase, and the grid
// helpers the map overlay draws from (`state.explored` + MAP.cellSize).
export { closeMap, isExplored, mapCols, mapRows, openMap } from "./game/map.ts";

// The wandering merchant and his coin economy: the shop pause phase, the
// buy/sell mutators the shop UI calls, and the valuation every price tag
// reads (see merchant.ts / config MERCHANT + ECONOMY).
export {
  buyStock,
  canBuyStock,
  closeShop,
  merchantName,
  openShop,
  sellItem,
  sellValue,
} from "./game/merchant.ts";

// The menace meter: the escalation the app reads to draw the rampage gauge
// and mark evolved mobs (the mechanics live in step()/loot()).
export {
  enemyPowerLevelTerm,
  enemyPowerScale,
  currentMobLevel,
  mobContactScaleFor,
  heroDamageLevel,
  heroGearLevel,
  heroPowerLevel,
  menaceFloorStage,
  menaceSensitivity,
  menaceStage,
  menaceWarmup,
  mobHpScaleFor,
  mobLevelScale,
  overkillEfficiency,
} from "./game/menace.ts";

// Set-piece mechanics (telegraphed charge/slam, enrage, summons, phases):
// the app reads the active set to draw windup tells and danger circles.
export { activeMechanics } from "./game/mechanics.ts";
export type { EnemyMechanics, EnemyPhase } from "./game/defs/enemies/types.ts";

// Automatic per-level base-attribute growth (the WoW-style ding gains): the
// derived bonuses the app can read to break "base + chosen" apart, and the
// power curve the horde's hp scaling mirrors.
export {
  arrowColdXp,
  arrowXpShareAt,
  autoGainAt,
  autoPowerScale,
  baseStatBonus,
  chosenStatPointsThrough,
  diminishStat,
  levelStatGains,
  referenceMobXp,
  setAutoStatGainsEnabled,
  statPointsAt,
  xpCapMultiplier,
  xpLevelCap,
  xpToLevelUp,
} from "./game/leveling.ts";

// Developer balance tuning: the runtime multipliers the hidden DEVELOPER →
// BALANCE menu applies over the shipped config (see tuning.ts).
export {
  BALANCE_TUNING_DEFAULTS,
  getBalanceTuning,
  resetBalanceTuning,
  setBalanceTuning,
} from "./game/tuning.ts";
export type { BalanceTuning } from "./game/tuning.ts";

// Time-limited abilities: activation and the helpers the renderer shares.
export {
  abilityPowerScale,
  canBankAbility,
  discardHeldAbility,
  grantAbility,
  magnetRadius,
  orbPositions,
  stasisFactorAt,
  stasisRadius,
} from "./game/abilities.ts";

// Granted forever spells & procs (the `spell`/`proc`/`sureStrike` affixes):
// the renderer draws the orbit ring and stasis field off the same params the
// engine ticks with; the item card names ranks and procs off the config.
export {
  boltProcDamage,
  equippedProcs,
  grantedSpellRanks,
  itemSpellOrbPositions,
  novaProcParams,
  orbitSpellParams,
  spellIntervalScale,
  stasisSpellParams,
  stormSpellParams,
} from "./game/spells.ts";

// In-world dialogue (elite ambushes, boss confrontations, story-item lore):
// `advanceDialogue` is the player's tap; `dialogueContent` is what the app
// draws while `phase === "dialogue"`.
export {
  advanceDialogue,
  collectStoryItem,
  dialogueContent,
  markThoughtsSeen,
} from "./game/story.ts";

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
  DIFFICULTY_UNLOCK_PREREQS,
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
  STARTING_DIFFICULTIES,
  type DifficultyDef,
} from "./game/defs/difficulties.ts";
export {
  LEVEL_ORDER,
  LEVELS,
  SECRET_LEVEL_ORDER,
  levelDef,
  levelPosition,
  levelsBefore,
  type LevelDef,
  type PackMember,
  type PackSpec,
  type SpawnSpec,
  type WaveBudget,
  type WaveSpec,
} from "./game/defs/levels/index.ts";
export {
  ENEMY_DEFS,
  enemyDef,
  type DialoguePage,
  type EnemyDef,
  type EnemyRole,
  type MobRarity,
} from "./game/defs/enemies/index.ts";
export {
  AFFIX_POOLS,
  equipmentBaseName,
  equipmentIcon,
  equipmentLevelReq,
  baseCritMult,
  weaponAssumedTargets,
  GEAR_DEFS,
  gearDef,
  isWeaponDef,
  QUALITY_ORDER,
  QUALITY_PREFIX,
  STAT_NAMES,
  TIER_ROLL_ORDER,
  TIERS,
  WEAPON_DEFS,
  weaponDef,
  type AffixBracket,
  type AffixDef,
  type GearDef,
  type WeaponDef,
} from "./game/defs/equipment.ts";
export {
  UNIQUE_DEFS,
  UNIQUE_IDS,
  uniqueDef,
  setUniqueDefs,
  type UniqueDef,
} from "./game/defs/uniques.ts";
export {
  gradeLevelReq,
  gradeVariantIds,
  type Grade,
} from "./game/defs/grades.ts";
export {
  COMPANION_DEFS,
  companionDef,
  isCompanionDef,
  type CompanionDef,
} from "./game/defs/companions.ts";
export {
  STORY_ITEM_DEFS,
  storyItemDef,
  type StoryItemDef,
} from "./game/defs/story.ts";
export {
  CAP_THOUGHT_IDS,
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
  ABILITY,
  APPARITION,
  ARMOR,
  ARRIVAL,
  ASTEROIDS,
  CAMPING,
  COMPANIONS,
  CONSUMABLES,
  DIALOGUE,
  DODGE,
  DOORS,
  ECONOMY,
  ENEMY_AI,
  GATES,
  HELD_ITEMS,
  JUMP,
  LAST_STAND,
  LEVELING,
  LOOT,
  MAGIC_CRIT,
  MAP,
  MEDKIT,
  MENACE,
  MERCHANT,
  MERCY,
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  QUALITY,
  RARE_MOBS,
  RUN,
  SPELL,
  STAMINA,
  STATS,
  STAT_REQ,
  UNIQUE,
  WEAPON,
  WELLS,
  WORLD_DROP,
  WOUNDS,
  XP_CAP,
} from "./game/config.ts";

export type {
  ActiveAbility,
  Affix,
  ArmorSlot,
  Asteroid,
  ChoiceState,
  Companion,
  CompanionSlot,
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
  GateState,
  GravityWell,
  Item,
  ItemSpell,
  Landmark,
  LevelInfo,
  Loadout,
  MapMarker,
  MapMarkerKind,
  Merchant,
  MerchantStock,
  Obstacle,
  PackState,
  PendingProc,
  Player,
  ProcSpell,
  ProcTrigger,
  Projectile,
  Quality,
  SpellKind,
  StatName,
  Tier,
  TileSpec,
  WeaponClass,
} from "./game/types.ts";
export type { Vec2 } from "@game/lib/vec.ts";
