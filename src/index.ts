// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Public entry point for the game engine core. The engine is framework-free:
// the browser app under `pwa/` consumes this module via the `@game/core`
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

// GENERATED MAPS (see game/mapgen/): the blueprint catalog, the carve, and the
// seam `createGame` resolves a level through. Read by the map tooling and the
// content tests; never by the app's startup path, which reaches levels through
// `defs/levels/summary.ts` and must not pull the generator's bytes.
// The engine's runtime toggles reach the app through `@game/menu`. The CAMERA'S
// YAW is re-exported here too, because it is the one number the simulation takes
// from the projection (a machine's blockers lie under its picture — see
// `vehicleFootprint`): a render test or a headless probe that turns the camera
// has to be able to tell the engine about it without importing the menu entry
// point.
export { billboardBearing, setCameraYaw } from "./game/flags.ts";

// The autopilot's global pathfinder. Exported so the map tooling and the
// generated-map guard can ask the engine's OWN router whether a carved map is
// walkable, instead of re-deriving reachability and drifting from it.
export {
  buildNavGrid,
  findPath,
  NAV_CELL,
  type NavGrid,
} from "./game/pathfind.ts";

export {
  generateLevel,
  hasMapBlueprint,
  MAP_BLUEPRINTS,
  mapBlueprint,
  parseRegion,
  regionRect,
  resolveLevelDef,
  setMapBlueprints,
  type MapBlueprint,
  type MapObject,
  type MapObjectType,
} from "./game/mapgen/index.ts";
export { IDLE_INPUT, step, type PartyInput } from "./game/step/index.ts";
// CLIENT-SIDE MOVEMENT PREDICTION — the engine's own movement pass with combat
// and shared-state side effects neutralized, for the net client's local-hero
// prediction/replay (see `game/predict.ts` and `docs/multiplayer.md`).
export { predictHeroMovement } from "./game/predict.ts";
// THE PARTY — the run's heroes, and the questions the simulation may ask about
// them as a group (see `game/party.ts` and `docs/multiplayer.md`). A hero's
// own reads are
// a PARAMETER rather than a lookup and are deliberately absent from this list.
export {
  anyHeroWithin,
  distanceToParty,
  heroInPlay,
  heroAt,
  heroes,
  heroesWithin,
  livingHeroes,
  nearestHero,
  nearestHeroWhere,
  partyBlocked,
  partyCentroid,
  partyLevel,
  partyWiped,
  primaryHero,
  seatOf,
} from "./game/party.ts";
export { quarryFor, quarryOf } from "./game/aggro.ts";
// PARTY XP — how a kill's payout is divided (`docs/multiplayer.md`). The rule
// is a leaf so the wire, the tests and the headless simulator can all read it.
export { partyXpBonus, splitXp, type XpCut } from "./game/xp-share.ts";
export {
  departHero,
  ensureSeats,
  isPartyRun,
  nextFreeSeat,
  releaseSeat,
  resumeHero,
  seatHero,
  type DepartOptions,
  type SeatOptions,
} from "./game/seating.ts";
export { validateLoadout, type LoadoutCheck } from "./game/loadout-check.ts";
// PER-PLAYER DEATH (`game/downed.ts`): the fall, the corpse,
// the respawn. `respawnHero` is reached through the `respawn` run command;
// these are exported for the tests and the headless harnesses.
export {
  downHero,
  foldCorpseGear,
  respawnHero,
  stepCorpseRecovery,
} from "./game/downed.ts";
// TRADE (`game/trade.ts`) — the one place a piece of gear leaves one private
// bag and arrives in another, which is why every rule about it lives in one
// module and the swap is a single transaction.
export {
  acceptTrade,
  acceptTradeRequest,
  cancelTrade,
  declineTradeRequest,
  endTradesFor,
  isOfferedInTrade,
  offerCoins,
  offerItem,
  openTrade,
  requestTrade,
  stepTradeRequests,
  tradeOf,
  tradePartner,
  tradeRequestMsLeft,
  tradeRequestsTo,
  type Trade,
  type TradeRefusal,
  type TradeRequest,
} from "./game/trade.ts";
export { requestSoloTravel, requestTravel } from "./game/travel.ts";
// The death scene's tap-to-skip: raise the YOU DIED modal straight away
// instead of waiting out the tableau (see death-scene.ts).
export { areDeathScenesEnabled, setDeathScenesEnabled } from "./game/flags.ts";
export { skipDeathScene } from "./game/death-scene.ts";
// The BOSS DEATH RITE (boss-death.ts): its skip, the executioner accessor the
// app's camera and pose passes read, and how long a rite runs so the push-in
// can be shaped against it.
export {
  bossDeathExecutioner,
  bossRiteDurationMs,
  enterBossDeath,
  skipBossDeath,
} from "./game/boss-death.ts";
export { deathRite, deathRites, riteFor } from "./game/death-rites/catalog.ts";
export type {
  DeathRiteBeat,
  DeathRiteDef,
  DeathRiteId,
} from "./game/death-rites/types.ts";
// ?debug FX preview only — set off a screen-nuke at the hero (see GameScreen's
// `window.__nuke()` hook); not a gameplay entry point.
export { debugDetonateNuke } from "./game/step/player.ts";
/** Developer hook: call a boss-style herd in right now (the EFFECTS GALLERY's
 * CALL OF INCELS exhibit stages the real hazard rather than faking one). */
export { spawnCalledHerd as debugCallHorde } from "./game/hazards.ts";

// MERCY DROP queries — exposed so the app can surface "the swarm is about to
// cough up a bomb" / "a drink is coming" and tests can assert the ramps.
export {
  applyDeathXpPenalty,
  applyHeroDeathToll,
  canDropNuke,
  crowdBombChance,
  debugLevelUpFx,
  enemyKillXp,
  grantXp,
  levelUpShockwave,
  hitEnemy,
  killEnemy,
  mobArmorMult,
  mobArmorReduction,
  shareXp,
  staminaDrinkChance,
} from "./game/loot.ts";
export {
  mercyRescueWaiting,
  outOfAmmoDesperation,
  type MercyRescue,
} from "./game/items/index.ts";
// GOLD (items/gold.ts): who carries a purse, what one is worth, and which pile
// sprite a heap of coins wears. The app reads `goldSprite` to draw a drop; the
// balance suites and the simulator read the other two to price a run's takings
// without sampling a roll.
export {
  carriesGold,
  dropGold,
  expectedGold,
  goldSprite,
  goldValue,
} from "./game/items/index.ts";

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
  BOT_POSTURES,
  BOT_PROFILES,
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  botPickTalent,
  botTuningFor,
  createBot,
  setBotWaypoint,
  type Bot,
  type BotProfile,
  type BotStrategy,
} from "./game/bot/index.ts";
export {
  BOT_TUNING_DEFAULTS,
  resolveBotTuning,
  type BotTuning,
  type BotTuningOverrides,
  type BotTuningPatch,
  type PostureTuning,
} from "./game/bot/tuning.ts";

// Stat-distribution builds — the one source of truth the balance tooling
// compares builds against (melee/ranged/magic/balanced): how a hero spends
// level-up points, and through the stat-aware auto-equip the gear that follows.
export {
  BUILD_ROTATION,
  buildStats,
  buildStatWeights,
  buildWeaponLane,
  isStatBuild,
  metaLane,
  META_MAGIC_MIN_LEVEL,
  META_MELEE_ENDGAME_LEVEL,
  STAT_BUILDS,
  type StatBuild,
} from "./game/builds.ts";

// Player-driven mutations (level-up chooser, inventory UI, phase toggles).
export {
  adoptEquipment,
  allocateStat,
  baseDefId,
  beginRespec,
  grantCleanSlate,
  spendCleanSlate,
  deallocateStat,
  confirmRespec,
  captureBuildSnapshot,
  refundAutopilotBuild,
  promptPendingPoints,
  hasPendingPoints,
  closeLevelup,
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
  introPages,
  skipIntro,
  dismissIntro,
  advanceOutro,
  skipOutro,
  skipCutscene,
  skipStoryOpening,
  tapCutscene,
  ARMOR_SLOTS,
  armorReduction,
  armorTypeOf,
  armorValueOf,
  autoEquipBest,
  autoEquipGear,
  autoEquipUpgradeCount,
  clearVault,
  isVaultWorthy,
  reclaimCost,
  reclaimVaultItem,
  vaultContents,
  vaultItem,
  vaultWorth,
  absorbPlayerDamage,
  ammoCount,
  ammoKindFor,
  ammoName,
  bankAmmo,
  bankMedkit,
  bankRepairKit,
  bankStaminaPotion,
  bestMedkitTier,
  committedLane,
  computeMaxHp,
  computeMaxStamina,
  staminaEmptyLockMs,
  staminaRegenPerSec,
  consumeMedkit,
  consumeStaminaPotion,
  consumeRepairKit,
  dropChance,
  desperationRamp,
  lowHealthDesperation,
  lowDurabilityDesperation,
  discardFromInventory,
  discardEquipped,
  effectiveStat,
  statBreakdown,
  activeEquippedAffixes,
  setBonusAffixes,
  wornSetCount,
  enemyDodgeChance,
  equipFromInventory,
  equipFromInventoryInto,
  bankSpareItem,
  inventoryNeedsSort,
  planAutoEquipGear,
  sortInventory,
  swapHand,
  fitsEquipSlot,
  equipSlotForItem,
  isOffhandItem,
  isBareHands,
  isTwoHandedWeapon,
  isLiveItemSlot,
  carriedTrinkets,
  isTrinket,
  wearSlotFor,
  ringSlotFor,
  wornCounterpart,
  gateKeyTarget,
  spendGateKey,
  isUnidentified,
  identifyCost,
  identifyItem,
  spendLookupTicket,
  markIdentified,
  mintsUnidentified,
  lookupTicketIndex,
  stackCapOf,
  hasStackRoom,
  inventoryRoomFor,
  equipmentMaxDurability,
  equipmentName,
  itemQuote,
  equippedBagSlots,
  inventoryCapacity,
  syncInventoryCapacity,
  gearScore,
  heroArmorPen,
  heroHasKnockback,
  isBetterEquipment,
  setAutoEquipEnabled,
  isAutoEquipEnabled,
  isPassiveItem,
  isScrappableLoot,
  isTrashLoot,
  isArmorBroken,
  isWeaponBroken,
  isSpecialItem,
  magicFindBonus,
  overCapChaseMult,
  itemLevelReq,
  medkitTierIndex,
  meetsLevelReq,
  hasAmmoFor,
  startingAmmo,
  weaponAmmoLeft,
  weaponAmmoType,
  scrapInferiorLoot,
  moveInventoryItem,
  openInventory,
  canPauseGame,
  pauseGame,
  resumeGame,
  stayOnField,
  reopenVictoryChoice,
  playerAppearance,
  playerCritChance,
  playerDodgeChance,
  saturateToward,
  playerMissChance,
  playerSpeed,
  playerSuited,
  previewEquipped,
  qualityMult,
  qualityOdds,
  qualityOf,
  rollQuality,
  rollQualityMult,
  repairEquippedWeapon,
  repairWornArmor,
  restoreStamina,
  totalArmor,
  rollEquipment,
  mintUnique,
  dropItem,
  itemVoice,
  isEdgedWeapon,
  weaponEdge,
  weaponBurns,
  canExecute,
  contactRange,
  weaponExecuteBars,
  tossDurationMs,
  unequipToInventory,
  weaponCooldownFor,
  weaponCritMult,
  weaponDamage,
  weaponDamageFor,
  weaponDamageRange,
  weaponDps,
  maxMeleeTargets,
  weaponFiringRange,
  weaponRangeFor,
  rollWeaponDamage,
  rollWeaponHit,
  weaponScore,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
  wearWornArmor,
  wouldUpgradeSlot,
  type BuildSnapshot,
  type StatBreakdown,
  type VaultRefusal,
} from "./game/items/index.ts";

// Companions: the SPARE-or-KILL verdict, the recruited party's equip screen
// mutators, the merchant revival, and the derived numbers the UI reads (see
// companions.ts).
export {
  COMPANION_SLOTS,
  canHealCompanion,
  closeCompanionPanel,
  companionArmorReduction,
  companionById,
  companionNovaDamage,
  companionWeaponCooldown,
  companionWeaponDamage,
  equipCompanionFromInventory,
  healCompanionWithMedkit,
  openCompanionPanel,
  recruitCompanion,
  resolveChoice,
  reviveTarget,
  spendReviveItem,
  unequipCompanionToInventory,
} from "./game/companions.ts";

// Companion stat / level / power math (pure, config-derived — the UI reads the
// level curve and the power rank; see companion-stats.ts).
export {
  companionAuraMagicFind,
  companionMaxHp,
  companionNovaRadius,
  companionPowerRank,
  companionProjectileBonus,
  companionXpToLevelUp,
} from "./game/companion-stats.ts";

// The level map: fog-of-war queries, the map pause phase, and the grid
// helpers the map overlay draws from (`state.explored` + MAP.cellSize).
export { closeMap, isExplored, mapCols, mapRows, openMap } from "./game/map.ts";

// Is a spot somewhere the player can SEE? TWO halves, and every automatic
// target pick in the game runs the pair through `visibleTo`: out of the fog and
// out of its frontier band (`clearOfFog`), and inside the rect that hero's own
// camera is showing them (`heroView`). Kept off map.ts because that module is
// on the app's startup path (see fog.ts).
export { clearOfFog } from "./game/fog.ts";
export { heroView, insideView, visibleTo } from "./game/sight.ts";

// TIME OF DAY — how dark the venue this run stands in has gone, and the curve
// the app maps its wall clock onto before it hands a run its `daylight` (see
// daylight.ts: the sky is the mission's, the hour is the app's, and the look of
// the dark is the renderer's).
export { daylightAtHour, nightAmount, SKY_KINDS } from "./game/daylight.ts";

// Obstacle sight queries: the swept "does this line clear the level's solid
// features?" test — walls, buildings, ranks of machinery, big rocks. Jumpable
// low ones never occlude, and NEITHER DOES A LONE narrow piece: it takes two
// obstacles in line, or one wider than a unit of ground, to stop the eye (see
// obstacles.ts). The renderer reuses `lineOfSight` to cull mobs the hero can't
// actually see (hidden behind cover).
export { lineOfSight } from "./game/obstacles.ts";

// Design zones — the safe/quiet region geometry LevelDefs carve maps with.
export {
  anyZoneContains,
  repelFromZones,
  zoneContains,
  type Zone,
  type ZoneCircle,
  type ZoneRect,
} from "./game/zones.ts";

// The intended path — the authored waypoint route the autopilot follows and the
// app points its guidance arrow at (see path.ts).
export {
  advancePath,
  nextPathWaypoint,
  onPathLevel,
  pathWalked,
} from "./game/path.ts";

// The wandering merchant and his coin economy: the shop pause phase, the
// buy/sell mutators the shop UI calls, and the valuation every price tag
// reads (see merchant.ts / config MERCHANT + ECONOMY).
export {
  buybackContents,
  buybackItem,
  buyStock,
  canBuyStock,
  closeShop,
  hailMerchant,
  killMerchant,
  merchantLine,
  merchantName,
  openShop,
  repairGear,
  sellItem,
  sellValue,
  stockBuyableCount,
  stockName,
  type BuybackRefusal,
} from "./game/merchant.ts";
// THE CACHE — the antique chest in the garage, and the game's one stash (see
// cache.ts). The verbs are the app's to call through `applyRunCommand` like
// every other bag verb; `cacheStanding` is what the renderer and the tap test
// ask before drawing or opening anything.
export {
  CACHE_TOKEN,
  cacheNameFor,
  cacheRungFor,
  cacheSlotsFor,
  cacheStanding,
  closeCache,
  emptyCache,
  grantCache,
  normalizeCache,
  openCache,
  resolveCacheLine,
  stashItem,
  takeFromCache,
} from "./game/cache.ts";
export {
  CAR,
  DEPARTURE,
  SHIP,
  WHEEL_DEBRIS,
  nudgeCar,
  carSkidding,
  enterCar,
  exitCar,
  shedPart,
  detachWheel,
  stepVehicles,
  createVehicles,
  vehicleFootprint,
} from "./game/vehicles.ts";
// QUESTS — the errands the field's non-combatants ask of the hero (see
// quests/). The conversation is a pause phase like the shop, and so is the LOG
// (`openQuestLog`, raised from the HUD's own `!` button, exactly as the map
// is); everything else here is a READ the tracker, the head marks and the offer
// modal make of the run's quest log.
export {
  acceptQuest,
  activeQuests,
  advanceQuestDialogue,
  bankCampaignQuests,
  buyQuestPiece,
  canAffordStallRow,
  emptyCampaignQuests,
  mergeCampaignQuests,
  questStallRows,
  seedCampaignQuests,
  sellQuestPiece,
  type CampaignQuestSave,
  closeQuestDialogue,
  closeQuestLog,
  completableQuest,
  conversationPages,
  createQuestGivers,
  declineQuest,
  escortArrivedLine,
  escortDestination,
  escortName,
  escortSetOffLine,
  escortSprite,
  failQuest,
  giverMark,
  objectiveNeed,
  chooseQuestReward,
  giverTopics,
  offerableQuests,
  openQuestLog,
  pickQuestTopic,
  pickedQuestReward,
  questGiverName,
  questRewardChoices,
  questXpReward,
  stepQuests,
  talkToQuestGiver,
  trackedQuests,
  turnInQuest,
  type QuestPayout,
} from "./game/quests/index.ts";
export {
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  giversForLevel,
  hasQuest,
  questDef,
  questEscortDef,
  questGiverDef,
  questItemDef,
  questsForLevel,
  type QuestDef,
  type QuestEscortDef,
  type QuestGiverDef,
  type QuestItemDef,
  type QuestMerchantDeal,
  type QuestObjective,
  type QuestReward,
} from "./game/defs/quests.ts";

// CONVERSATIONS — the talks the hero STEERS (see conversation.ts). A tree of
// what a bystander says and what the hero may say back; the branch the player
// picks is the mechanic. `talk` is a pause phase like the shop, and the FLAGS
// are the one thing a branch leaves behind for the rest of the game to read.
export {
  advanceTalk,
  closeTalk,
  hasAllFlags,
  hasQuestFlag,
  pickTalkChoice,
  setQuestFlag,
  talkChoices,
  talkNode,
  talkPrompt,
  talkToEnemy,
  talkToGiverTree,
} from "./game/conversation.ts";
export {
  CONVERSATION_DEFS,
  conversationDef,
  conversationNode,
  hasConversation,
  type ConversationChoice,
  type ConversationDef,
  type ConversationNode,
} from "./game/defs/conversations.ts";

// NEUTRAL MOBS — who on the field is actually in the fight (see
// disposition.ts). `inert` is the one predicate every damage pass asks;
// `provokeEnemy` is the only way a bystander ever becomes a monster.
export {
  countsAsFoe,
  inert,
  inertEnemy,
  isNeutral,
  provokeEnemy,
} from "./game/disposition.ts";

// The whole-kit repair quote the shop's REPAIR button reads (the mutator is
// `repairGear` above; this is its price, for the button label / disabled state).
export { repairAllCost, repairCost } from "./game/items/index.ts";

// The autopilot's economy: bag discipline (keep a cell open, drop the worst
// junk) and the merchant errand (sell → buy → mend → powerups). The mutators
// are harness-side actions like `autoEquipBest`; the predicates are pure so
// the bot reads them for movement (see bot/economy.ts).
export {
  botAutoEquip,
  botCompanionToHeal,
  botCullPlan,
  botReviveCell,
  botWantsGearSweep,
  careForCompanion,
  cullWorstLoot,
  sellableJunkCount,
  tradeAtMerchant,
  wantsMerchantVisit,
  weaponStarved,
} from "./game/bot/economy.ts";

// THE AUTOPILOT'S OUTPUT AS AN INTENT — the steer plus the verbs its
// housekeeping travels as, and the three hosts that apply them (in-process, the
// app's command router, a bot client). See bot/intent.ts and
// `docs/multiplayer.md`.
export {
  applyBotCommand,
  botCareCommand,
  botCullCommands,
  botDrawCommand,
  botErrandCommand,
  botIntent,
  botSortCommand,
  botSweepCommand,
  driveBotActions,
  driveBotErrands,
  driveBotUpkeep,
  runBotActions,
  runBotErrands,
  runBotUpkeep,
} from "./game/bot/intent.ts";
export type {
  BotCommand,
  BotCommandSink,
  BotIntent,
} from "./game/bot/intent.ts";

// THE AUTOPILOT AT HOME (bot/hub.ts): the hub's own travel plan — the people
// with a mark over their head, the counter, then the car out — plus the reads
// a host needs to drive it (is this the hub, is the hero at a wheel).
export {
  atHub,
  botScreenCommand,
  driveOutInput,
  heroCar,
  hubCar,
  hubGoal,
  hubTapCommand,
} from "./game/bot/hub.ts";
export type { HubCommand, HubGoal } from "./game/bot/hub.ts";

// THE AUTOPILOT'S QUEST PLAY (bot/errands.ts): the person with a mark over
// their head as a travel goal and a tap, the running errands' own objectives
// (tokens, breeds, spots, and somebody to walk to a door), and the token read
// the pickup detour puts ahead of the floor.
export {
  errandGiver,
  GIVER_REACH,
  giverTapCommand,
  questObjectiveTarget,
  questTokenWanted,
  trackErrandAbandon,
} from "./game/bot/errands.ts";
export type { QuestGoal } from "./game/bot/errands.ts";

// The POCKET ARSENAL: which weapon is in the hand, moment by moment — the
// blade in reach, the boss round at a big body, the spread across a mass —
// plus the bag cells the discipline spares to carry that kit
// (see bot/weapon-swap.ts).
export {
  botPocketKeepIndices,
  botPocketShooterIndex,
  botWeaponSwapTarget,
  hasPocketShooter,
  stepBotWeaponSwap,
} from "./game/bot/weapon-swap.ts";

// The menace meter: the escalation the app reads to draw the rampage gauge
// and mark evolved mobs (the mechanics live in step()/loot()).
export {
  enemyPowerLevelTerm,
  enemyPowerScale,
  currentMobLevel,
  evolutionLevelBonus,
  mobLevelFor,
  mobContactScaleFor,
  heroDamageLevel,
  heroGearLevel,
  heroPowerLevel,
  menaceCeiling,
  menaceClearGate,
  menaceFloorStage,
  menaceLevelHeadroom,
  menaceSensitivity,
  menaceStage,
  menaceStageCap,
  menaceWarmup,
  mobHpLevelFactor,
  mobHpScaleFor,
  mobLevelScale,
  overkillEfficiency,
  tickMenace,
} from "./game/menace.ts";

// Set-piece mechanics (telegraphed charge/slam, enrage, summons, phases):
// the app reads the active set to draw windup tells and danger circles.
export { activeMechanics } from "./game/mechanics/index.ts";
export type { EnemyMechanics, EnemyPhase } from "./game/defs/enemies/types.ts";
// THE ELITE TIER's two shared readings. `orbitMotePositions` is exported so the
// renderer draws the ring from the SAME arithmetic that bites with it — a ring
// whose drawn motes sat anywhere but where the biting ones are would have the
// player dodging a picture. `wardUp` is the question ("is the shell up?")
// without the bookkeeping, asked by the renderer and the bot alike.
export { orbitMotePositions } from "./game/mechanics/orbit-guard.ts";
export { wardUp } from "./game/mechanics/ward-pool.ts";
export type {
  BossAbility,
  BossAbilityId,
} from "./game/defs/enemies/abilities.ts";

// Automatic per-level base-attribute growth (the WoW-style ding gains): the
// derived bonuses the app can read to break "base + chosen" apart, and the
// power curve the horde's hp scaling mirrors.
// The flat mob-priced kill payouts (elite / boss multiples) and the XP
// scroll's dial, authored in content/leveling.yaml, for the calculators and
// tests.
export { XP_TUNING } from "./generated/leveling.ts";
export {
  autoGainAt,
  autoPowerScale,
  baseStatBonus,
  chosenStatPointsThrough,
  diminishStat,
  endgameSteepenMult,
  levelDiffXpMult,
  levelStatGains,
  mobLevelXp,
  referenceMobXp,
  setAutoStatGainsEnabled,
  setXpScrollEnabled,
  statCap,
  statPointsAt,
  tierLevelCostMult,
  xpBoostMultiplier,
  xpCapMultiplier,
  xpLevelCap,
  xpScrollDurationMs,
  xpToLevelUp,
} from "./game/leveling.ts";

// Auto pilot: the coin-metered self-playing mode (see autopilot.ts) — the
// engine bills and routes, the app steers and travels.
export {
  autopilotDrainPerSecond,
  autopilotNextLevel,
  autopilotStepUp,
  creditAutopilotPurse,
  normalizeAutopilotSpeed,
  setAutopilotSpeed,
  startAutopilot,
  stopAutopilot,
} from "./game/autopilot.ts";
export type { AutopilotRoute } from "./game/autopilot.ts";
export type { AutopilotState } from "./game/types/index.ts";

// BUILDING A RUN FROM PARAMETERS — the one function the app, the session server
// and an arriving client all call, so that "the same arguments build the same
// world" is true of a RUN and not merely of `createGame` (see session-setup.ts).
export {
  adoptRun,
  createRunFromParams,
  freezeRun,
} from "./game/session-setup.ts";
export type {
  FrozenRun,
  OpeningSkip,
  RunParams,
} from "./game/session-setup.ts";

// THE RUN'S VERBS — the closed list of everything the app may DO to a run, and
// the one dispatch behind it (see commands.ts). Multiplayer moves the
// simulation into another process, so every act the app performs on the state
// has to be something that can travel; this is that list, and the app reaches
// it through `pwa/src/game/run-commands.ts` rather than calling the verbs by
// hand.
export {
  applyRunCommand,
  checkRunCommandArgs,
  isRunCommand,
  RUN_COMMAND_ARGS,
  RUN_COMMAND_NAMES,
} from "./game/commands.ts";
export type { CommandArg, RunCommandName } from "./game/commands.ts";

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
  abilityBankRoom,
  abilityPowerScale,
  canBankAbility,
  discardHeldAbility,
  grantAbility,
  magnetRadius,
  moveHeldSlot,
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
  immolationSpellBlock,
  itemSpellOrbPositions,
  novaProcParams,
  orbitSpellBlock,
  seekerSpellBlock,
  singularitySpellBlock,
  spellIntervalScale,
  stasisSpellParams,
  stormSpellBlock,
} from "./game/spells.ts";

// THE HERO'S OWN NAME, as authored content asks for it. Every surface that
// draws a line the player wrote a character name for resolves `{HERO}` through
// these — the dialogue box does it for the app (`dialogueContent`), the
// cutscene, intro and conversation overlays do it themselves.
export {
  HERO_NAME_FALLBACK,
  HERO_NAME_TOKEN,
  heroNameOr,
  withHeroName,
  withHeroNameLines,
} from "./game/hero-name.ts";

// In-world dialogue (elite ambushes, boss confrontations, story-item lore):
// `advanceDialogue` is the player's tap; `dialogueContent` is what the app
// draws while `phase === "dialogue"`.
export {
  advanceDialogue,
  areCutscenesEnabled,
  collectStoryItem,
  dialogueContent,
  isDialogueEnabled,
  markThoughtsSeen,
  muteDialogue,
  setCutscenesEnabled,
  setDialogueEnabled,
  unmuteDialogue,
} from "./game/story.ts";

// THE DRIVE — the playable interlude between the garage and GOODCO, and the
// same road home (src/game/drive/). RUN-FACING ONLY: it must never reach
// `src/menu.ts`, because the road drags the crowd, the traffic, the impact
// model and the car behind it, and the startup path's budget has no room for
// any of that. The app imports it from the GAME screen, never from the title.
export {
  coastDecelPx,
  courseLength,
  createDrive,
  createDriveDriver,
  crossingsBetween,
  crowdEdges,
  driveDriverInput,
  driveMph,
  driveThrustPx,
  driveVerdict,
  // THE DRIVETRAIN — the gearbox and the engine curve the road's pull is solved
  // from. The app reads the same functions the physics does, so the tachometer
  // on the dashboard and the note coming out of the speaker are the engine's
  // own revs rather than two guesses at them.
  engineRpm,
  engineTorqueNm,
  gearFor,
  gearRev,
  impactMasses,
  isMastSlot,
  blockadeAt,
  createTraffic,
  laneAt,
  laneCenter,
  remainForce,
  resolveDriveBotTuning,
  restartDrive,
  roadBandEdges,
  roadDragPx,
  roadEdges,
  solveImpact,
  solvedTopSpeedPx,
  splitsBody,
  stepDrive,
  throttleAccelPx,
  trafficMass,
  vehicleDef,
  wreckForce,
  CROWD_VARIANTS,
  FLEET,
  PAVEMENT_SHARE,
  RIDER_VARIANTS,
  DRIVE,
  DRIVE_BOT_DEFAULTS,
  DRIVE_OUTCOME,
  DRIVE_UNITS,
  DRIVETRAIN,
  GEAR_COUNT,
  GLUED_BARKS,
  GLUED_VARIANTS,
  IDLE_DRIVE_INPUT,
  TRAFFIC_VARIANTS,
} from "./game/drive/index.ts";
export type {
  DriveBotPatch,
  DriveBotTuning,
  DriveDirection,
  DriveDriver,
  DriveEvent,
  DriveInput,
  DriveOutcome,
  DriveParams,
  DrivePedestrian,
  DriveProp,
  DrivePropKind,
  DriveRemain,
  DriveState,
  DriveStrike,
  DriveTraffic,
  DriveVehicleClass,
  DriveVehicleDef,
  Impact,
  ImpactMasses,
  PedestrianKind,
  PedestrianMode,
  RemainPart,
} from "./game/drive/index.ts";

// THE PLAYABLE INTERLUDES' own switch. Exported straight off the flag leaf
// rather than through the system it gates (the way the dialogue and cutscene
// flags come through story.ts), because that system is the DRIVE — and having
// `@game/core` re-export a boolean through src/game/drive/ would put the road,
// the crowd, the traffic and the impact model behind an import of the engine's
// front door. The flag leaf has no imports at all, which is the whole point of
// it.
export { areMinigamesEnabled, setMinigamesEnabled } from "./game/flags.ts";

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
  ABILITY_DEFAULT_RARITY,
  ABILITY_DEFS,
  abilityBlocks,
  abilityDef,
  abilityRarity,
  hasAbilityBlock,
  NUKE_DEF_ID,
  pickAbility,
  ABILITY_BLOCKS,
  type AbilityDef,
  type AbilityKind,
  type AbilityLook,
} from "./game/defs/abilities.ts";
// The passive TALENT trees (WoW-style): the catalog, the point economy, and the
// picker the level-up flow raises.
export {
  TALENT_DEFS,
  TALENT_STATS,
  TALENT_STAT_CLASS,
  TALENT_CLASS_STAT,
  TALENT_UNLOCK_STEP,
  TALENT_MAX_RANK,
  TALENT_BLOCKS,
  talentDef,
  talentDefs,
  setTalentDefs,
  talentsForTree,
  talentIcon,
  talentBlocks,
  treeCapacity,
  type TalentDef,
  type TalentClass,
  type TalentKind,
  type TalentEffect,
  type TalentBlockName,
  type TalentBlocks,
} from "./game/defs/talents/index.ts";
export {
  earnedTalentPoints,
  availableTalentPoints,
  reconcileTalentPoints,
  hasPendingTalentPoint,
  spendTalentPoint,
  talentStatFloor,
  talentPointsEarned,
  resumeAfterLevelup,
} from "./game/talents.ts";
export {
  talentRank,
  spentTalentRanks,
  talentCritChanceBonus,
  talentCritDamageBonus,
  talentSpeedMult,
  talentDodgeBonus,
  talentMaxHpPct,
  talentDamageReduction,
  talentBerserkMult,
  talentSpellRanks,
  talentReflectFrac,
  talentFrostNova,
  talentTwinStrike,
  talentCleavingEcho,
  talentParry,
  talentSeismic,
  talentPiercing,
  talentConcussive,
  talentCrippling,
  talentVolley,
  talentJumpMods,
  talentEvasionBurstMult,
  talentEvasionBurstMs,
} from "./game/talent-effects.ts";
// The talent timers — Frost Nova's cooldown, Evasion's burst (timers.ts).
export { stepTimers } from "./game/timers.ts";
export {
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  DIFFICULTY_UNLOCK_PREREQS,
  difficultyDef,
  meetsMinDifficulty,
  scaledAliveCap,
  scaledMobCount,
  STARTING_DIFFICULTIES,
  type DifficultyDef,
} from "./game/defs/difficulties.ts";
export {
  LEVEL_ORDER,
  LEVELS,
  SECRET_LEVEL_ORDER,
  // Whether the ACTIVE catalog carries an id — `LEVELS` is the shipped record
  // and a mod's venues never join it (they arrive through `registerDefs`), so
  // anything asking "is this a real level" has to ask this rather than probe
  // that record. Already on `@game/menu` for the saved-run check; here for the
  // run side, which asks the same question of `?level=`.
  hasLevel,
  levelDef,
  levelPosition,
  levelsBefore,
  runLevelDef,
  type LevelDef,
  type LevelLight,
  type MissionDef,
  type PackMember,
  type PackSpec,
  type SpawnerMember,
  type SpawnerSpec,
  type SpawnSpec,
  type SkyKind,
  type WaveBudget,
  type WaveSpec,
} from "./game/defs/levels/index.ts";
export {
  ENEMY_DEFS,
  enemyDef,
  mobRushSpeed,
  mobSpeed,
  type DialoguePage,
  type EnemyDef,
  type EnemyLocomotion,
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
  UNARMED_DEF_ID,
  STAT_NAMES,
  TIER_LADDER,
  TIER_ROLL_ORDER,
  tierRank,
  TIERS,
  WEAPON_DEFS,
  weaponDef,
  type AffixBracket,
  type AffixDef,
  type GearDef,
  type WeaponDef,
  type WeaponEdge,
  type WeaponMotion,
} from "./game/defs/equipment.ts";
export {
  UNIQUE_DEFS,
  UNIQUE_IDS,
  activeUniqueDefs,
  uniqueDef,
  uniqueDefOrNull,
  setUniqueDefs,
  type UniqueDef,
  type WeaponFx,
} from "./game/defs/uniques.ts";
export {
  SET_DEFS,
  SET_IDS,
  setDef,
  setForItem,
  setMemberSlots,
  setSetDefs,
  activeSetDefs,
  type SetDef,
  type SetBonusTier,
} from "./game/defs/sets.ts";
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
  type CompanionPower,
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
  AMMO,
  AMMO_KINDS,
  AMMO_TYPES,
  APPARITION,
  ARMOR,
  ARRIVAL,
  ASTEROIDS,
  AUTOPILOT,
  CAMPING,
  CHESTS,
  COMPANIONS,
  CONSUMABLES,
  CRATES,
  DIALOGUE,
  DODGE,
  DAYLIGHT,
  DOORS,
  ECONOMY,
  GOLD,
  DEATH_SCENE,
  BOSS_DEATH,
  CORPSE,
  ENEMY_AI,
  GATES,
  HAY_BALLS,
  HELD_ITEMS,
  HELLGATES,
  JUMP,
  KNOCKBACK,
  LAST_STAND,
  LEVELING,
  LOOT,
  MAGIC_CRIT,
  MAP,
  MEDKIT,
  MELEE,
  MENACE,
  MERCHANT,
  CACHE,
  QUESTS,
  MERCY,
  MOB_ARMOR,
  NUKE,
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  QUALITY,
  RARE_MOBS,
  RUN,
  SANDSTORMS,
  SPAWNERS,
  SPELL,
  STAMINA,
  STAMPEDES,
  STATS,
  STAT_REQ,
  TRADE,
  UNIQUE,
  VAULT,
  WEAPON,
  WELLS,
  WORLD_DROP,
  WOUNDS,
  XP_CAP,
  XP_SHARE,
} from "./game/config/index.ts";

export type {
  ActiveAbility,
  Affix,
  AmmoType,
  ArmorSlot,
  Asteroid,
  CanopyPiece,
  ChoiceState,
  Companion,
  CompanionSlot,
  Crater,
  Critter,
  Decor,
  DialogueState,
  Difficulty,
  DoorState,
  ElevatorState,
  BossDeathState,
  Enemy,
  EquipSlot,
  Equipment,
  GameEvent,
  GameInput,
  GamePhase,
  EscortState,
  GameState,
  QuestGiver,
  QuestMark,
  QuestOffer,
  QuestProgress,
  QuestStallRow,
  QuestStatus,
  QuestTopic,
  ActiveTalk,
  TalkSpeaker,
  GameStats,
  GateState,
  GravityWell,
  HayBall,
  Item,
  ItemSpell,
  Landmark,
  LevelInfo,
  Loadout,
  MapMarker,
  MapMarkerKind,
  CarDetachable,
  CarPanelId,
  CarVehicle,
  Merchant,
  MerchantBuyback,
  MerchantConsumable,
  MerchantStock,
  Obstacle,
  ShipVehicle,
  Vehicle,
  WheelDebris,
  PackState,
  PartyStamp,
  PendingProc,
  Player,
  ProcSpell,
  ProcTrigger,
  Projectile,
  Quality,
  SandStorm,
  SpellKind,
  Stampede,
  StampedeRunner,
  StatName,
  Tier,
  TileSpec,
  WeaponClass,
} from "./game/types/index.ts";
// The fix ladder's named rungs (a value, not a type — see `CarVehicle.fixes`).
export { CAR_FIX } from "./game/types/index.ts";
export type { Vec2 } from "@game/lib/vec.ts";
