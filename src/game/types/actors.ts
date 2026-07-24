// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The live actors: the Player, companions (and the spare-or-kill choice),
// and the Enemy with its scripted mechanics.

import type { Vec2 } from "@game/lib/vec.ts";

import type { ActiveAbility, Equipment, ItemSpell, StatName } from "./core.ts";

export type Player = {
  pos: Vec2;
  /** Height above the ground (world px) and vertical speed while jumping. */
  z: number;
  vz: number;
  hp: number;
  maxHp: number;
  /**
   * Current stamina — the sprint pool. Any movement spends it (in proportion
   * to pace); only standing still refills it. An empty pool caps the top speed
   * (see config `STAMINA`).
   */
  stamina: number;
  /** Max stamina, from the base pool + STAMINA stat (see `computeMaxStamina`). */
  maxStamina: number;
  /**
   * Ms until health regen resumes — set to `REGEN.hpDelayMs` whenever the hero
   * takes a hit and counted down each tick. Gates the SPIRIT-driven hp trickle
   * so it only mends out of the line of fire. 0 = regenerating.
   */
  hpRegenMs: number;
  /** Unit vector of the last movement direction; drives sprite facing. */
  facing: Vec2;
  /**
   * Realized velocity this tick (world px/s; zero while standing). Distinct
   * from `facing`, which persists while idle — this is what the smarter
   * shooters LEAD with on the hard rungs (see stepRangedAttacks), so a
   * standing hero is aimed at dead-on and a running one ahead of his path.
   */
  vel: Vec2;
  /**
   * Which way the sprite mirrors. Updated with hysteresis (see
   * PLAYER.faceFlipMinX) so near-vertical movement doesn't flicker the flip.
   */
  faceLeft: boolean;
  /** Time-limited powers currently running (spent ability pickups). */
  abilities: ActiveAbility[];
  /**
   * GRANTED SPELLS from worn equipment (`spell` affixes) — the forever
   * powers, alive as long as the piece is worn. Re-derived from the loadout
   * each tick (`syncItemSpells`), preserving each spell's sweep/cooldown
   * scratch state across the sync.
   */
  itemSpells: ItemSpell[];
  /**
   * The powerup dock (ABILITY_DEFS ids, oldest first, HELD_ITEMS.cap deep). A
   * slot holds a pickup from the moment it is scooped: first as a banked power
   * the `useItem` input can spend, then — once spent — as the running copy,
   * which keeps its slot and counts down in place until it lapses. Only then is
   * the slot freed and the rest shift down (`ActiveAbility.slot` links a running
   * copy back to its slot). A slot occupied by a running power can neither be
   * re-spent nor banked over, so the dock stays full while a power runs.
   */
  heldAbilities: string[];
  /**
   * Stacked medkits, one count per MEDKIT tier (index i is the tally of
   * `MEDKIT.tiers[i]` kits held), each capped at `CONSUMABLES.stackCap`.
   * Medkits stack only within their own quality — a LIGHT MEDKIT never
   * merges with a SUPERIOR one — so the array is a per-quality inventory the
   * HUD's single medkit slot shows the best-quality entry of. Spent
   * best-first by `consumeMedkit`; carried between levels via the loadout.
   */
  medkits: number[];
  /**
   * Stacked stamina potions (the energy-drink consumable), capped at
   * `CONSUMABLES.stackCap`. Spent by `consumeStaminaPotion` to refill the
   * sprint pool; carried between levels via the loadout.
   */
  staminaPotions: number;
  /**
   * Stacked weapon repair kits (capped at `CONSUMABLES.stackCap`). A touched
   * kit now banks into the consumable dock rather than firing on contact;
   * `useRepairKit` spends one on the player's call to mend the WHOLE kit — the
   * held weapon, every weapon in the bag (waking any that broke), and the worn
   * armor — then re-equips the weapons durability booted from the hand. Carried
   * between levels via the loadout.
   */
  repairKits: number;
  /** True while the player moved this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until the weapon may fire again. */
  weaponCooldownMs: number;
  /**
   * True while the hero's weapon is holstered — set on levels with a scripted
   * `openingStrike` (SpaceZ HQ). The auto-attack sits out entirely until the
   * vanguard's soft first swing arms him (see story.ts `tryOpeningStrike`);
   * cleared for good once armed. Absent/false everywhere else — the hero opens
   * ready to fight.
   */
  disarmed?: boolean;
  /** Remaining ms of post-hit invulnerability flash (visual only). */
  hurtFlashMs: number;
  /**
   * KNOCKED OUT: ms the hero lies prone and HELPLESS on the floor (config
   * SANDSTORMS.knockoutMs, landed by a sand storm). While `> 0` he can't move,
   * jump, attack, or use an item — every player-driven pass is gated on
   * it (`stepPlayer` freezes him; `stepWeapon`/consumables sit out) —
   * yet he stays fully vulnerable to the horde. Ticked down in `stepPlayer`;
   * 0 = up and in control. Not carried between levels (a fresh run starts up).
   */
  knockoutMs: number;
  /**
   * KNOCKBACK impulse (an asteroid blast flung him — see `stepKnockback` in
   * hazards.ts). While `knockMs > 0` the hero coasts along `knockVel` (world
   * px/s) on top of whatever he steers, so the shockwave shoves him to the
   * side; the velocity bleeds down as the fling settles. `knockMs` 0 and
   * `knockVel` zero at rest. Not carried between levels.
   */
  knockMs: number;
  knockVel: Vec2;
  level: number;
  xp: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** Stat points awarded but not yet spent (spent via `allocateStat`). */
  pendingStatPoints: number;
  /**
   * COINS — the merchant economy's currency (see merchant.ts / config
   * ECONOMY). Earned by selling loot to a discovered merchant, spent on his
   * stall; carried between levels via the loadout.
   */
  coins: number;
  stats: Record<StatName, number>;
  /**
   * The stat points the PLAYER personally spent on the level-up/respec
   * chooser — a display-only tally the two overlays show so the chooser
   * reflects only the player's own picks. Distinct from `stats`, which also
   * carries the difficulty head-start (create.ts) and, through
   * `effectiveStat`, folds in the automatic per-level growth and gear; none
   * of those are "spent" by the player. Incremented by `allocateStat`,
   * decremented by `deallocateStat`, zeroed by `beginRespec` (a respec
   * re-places the whole refunded pool from scratch). Carried between levels
   * via the loadout.
   */
  spentStats: Record<StatName, number>;
  /**
   * PASSIVE TALENTS the hero has trained — a map from talent id (see
   * `defs/talents/`) to its owned RANK (1..maxRank). An absent id is untrained
   * (rank 0). Earned one point per 10 CHOSEN points in a tree stat and spent via
   * the level-up picker (`spendTalentPoint`); always on, no mana or cooldown.
   * Carried between levels via the loadout.
   */
  talents: Record<string, number>;
  /**
   * FROST NOVA's internal cooldown (ms) — the magic-tree defensive talent that
   * freezes nearby foes when the hero is struck fires at most once per this
   * window (`TALENTS.frostNova.cooldownMs`, shortened by rank). Counts down in
   * `stepRegen`; absent/0 means ready. Kept as the talent's own tiny field per
   * the plan (only Mage Armor and Frost Nova carry state). */
  frostNovaCooldownMs?: number;
  /**
   * EVASION's rank-5 speed-BURST window (ms): a dodge arms it, and while it
   * counts down (in `stepRegen`) the hero darts at `TALENTS.evasionBurst.speedMult`
   * (see `talentEvasionBurstMult`, read in `playerSpeed`). Absent/0 = no burst.
   * A transient runtime field — not persisted; the talent itself is. */
  evasionBurstMs?: number;
  equipment: {
    /** Never empty — the character always fights with something. */
    weapon: Equipment;
    /** The four armor slots. Broken pieces stay worn but count for nothing
     * until repaired (see `isArmorBroken`). */
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    charm: Equipment | null;
    /**
     * A worn BAG that widens the carry (its `GearDef.bagSlots` add cells on
     * top of the STRENGTH-scaled floor — see `inventoryCapacity`). Null = no
     * bag; the base bag is all the hero has. More bag types arrive later.
     */
    bag: Equipment | null;
  };
  /** Fixed-size bag; `null` cells are empty. */
  inventory: (Equipment | null)[];
};

/** The three slots a companion can be equipped in: a weapon, a helmet, and a
 * chest piece — never legs or feet (their own boots carried them through
 * whatever they fell out of). */
export type CompanionSlot = "weapon" | "head" | "chest";

/**
 * A recruited COMPANION (see companions.ts): a spareable unique the player
 * chose to SPARE joins the party, follows the hero, and fights with whatever
 * is in its weapon slot. `defId` keys COMPANION_DEFS (name, sprite, starting
 * weapon, aura, kill quotes). Companions are never killed — at 0 hp one goes
 * DOWN (kneels out of the fight, aura silent) and stands back up on its own
 * after `COMPANIONS.reviveMs`.
 */
export type Companion = {
  id: number;
  /** Key into COMPANION_DEFS. */
  defId: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  /**
   * The companion's OWN level, earned by fighting (config
   * `COMPANIONS.levelKills`) and decoupled from the hero: hp, damage, and its
   * signature POWER all grow with it (`companion-stats.ts`). It starts trained
   * to the hero's level on recruit and climbs from there forever — the level
   * rides the loadout, so it persists across every level and difficulty.
   */
  level: number;
  /** XP banked toward the next level, from this companion's OWN kills. */
  xp: number;
  /** XP needed to cross out of the current level (`companionXpToLevelUp`). */
  xpToNext: number;
  /** Sprite mirror, following the walk direction like the player's. */
  faceLeft: boolean;
  /** True while it walked this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until its weapon may strike again. */
  weaponCooldownMs: number;
  /** Combat-heat timer (ms): set to `COMPANIONS.regenCalmMs` whenever the
   * companion has a live target or takes a hit, counting down otherwise. Out-of-
   * combat regen (see stepCompanion) kicks in only once it reaches 0. */
  combatMs?: number;
  /** Ms left kneeling; undefined while up and fighting. See COMPANIONS. */
  downedMs?: number;
  /**
   * True while the companion is in screen-edge FOLLOW mode: the hero moved far
   * enough that it drifted to the camera's edge, so it drops the fight and
   * moves WITH him until he stops (config `COMPANIONS.screenEdgeMargin`, logic
   * in `stepCompanion`). Absent/false when it is free to hold formation and
   * engage the horde around the hero.
   */
  following?: boolean;
  /** Ms until this companion may float another kill quote. */
  quoteCooldownMs: number;
  /**
   * Ms until this companion's FROST NOVA may pulse again (companions with a
   * `CompanionDef.nova` — see `companionNova`). Held at 0 while there is no
   * foe in reach, so the ring goes off the instant one drifts into it, then
   * counts down `nova.everyMs` between pulses. Undefined on companions with no
   * nova.
   */
  novaCooldownMs?: number;
  equipment: {
    /** Never empty — a companion always fights with something. */
    weapon: Equipment;
    head: Equipment | null;
    chest: Equipment | null;
  };
};

/**
 * The pending SPARE-or-KILL verdict while `phase === "choice"`: a spareable
 * unique (`EnemyDef.spareable`) was beaten to 0 hp and kneels awaiting the
 * player's call (`resolveChoice`). `damage`/`crit` remember the withheld
 * killing blow so an execution books it exactly as it landed.
 */
export type ChoiceState = {
  enemyId: number;
  defId: string;
  damage: number;
  crit: boolean;
  /** The withheld blow's damage-variance roll (crits only) — carried so an
   * execution's popup sizes exactly as the blow would have. */
  critPower?: number;
};

export type Enemy = {
  id: number;
  /** Key into ENEMY_DEFS (hp/speed/damage/AI live on the def). */
  defId: string;
  pos: Vec2;
  /** Spawn point: monsters return here when the player escapes their aggro. */
  home: Vec2;
  hp: number;
  maxHp: number;
  /**
   * MONSTER LEVEL, stamped at spawn: the player's level plus the difficulty's
   * `mobLevelOffset` (plus the def's own `levelBonus` — elites and bosses run
   * a few levels hot). Loot reads it for everything Diablo-shaped: which base
   * items may drop (`levelReq` gate), which tiers are unlocked
   * (`LOOT.tierUnlockMlvl`), and the dropped item's own level (see
   * `rollItemLevel`). Elites/bosses re-stamp it when their fight engages
   * (maybePowerScale), so their loot matches the hero who actually beat them.
   */
  mlvl: number;
  /** Snapshot of def speed × per-instance jitter. */
  speed: number;
  /** Remaining ms until this enemy may deal contact damage again. */
  contactCooldownMs: number;
  /**
   * Remaining ms of the "that was a CRIT" flash — the renderer blinks the
   * sprite while this runs. Visual only, set by critical player hits.
   */
  critFlashMs?: number;
  /**
   * Elites sleep at their post until the player wanders close (or wounds
   * them); once true they hunt forever — no drifting back home. Minions use
   * it as their aggro latch: waking needs line of sight (some minions
   * excepted),
   * the chase then holds even through walls, and escaping the aggro radius
   * puts them back to sleep. Unused by bosses, whose wakefulness is derived
   * per tick.
   */
  awake?: boolean;
  /**
   * Elite/boss combat-engagement latch, set true the first time this set piece
   * actually TRADES BLOWS with the hero — it lands a contact hit on him (see
   * stepEnemies) — and stays true for the rest of the fight. Together with a
   * wound (`hp < maxHp`, the hero's own strike landing) this is what the gentle
   * rungs read to ease the horde off (`setPieceEngaged`): the mercy keys off a
   * real fight, never mere proximity, so it can't be farmed by loitering inside
   * a boss's aggro radius without committing. Unset until the fight is joined.
   */
  engaged?: boolean;
  /**
   * True once this enemy's dialogue has played (or been skipped by killing
   * the speaker mid-rush). Speakers only ever get one scene.
   */
  spoke?: boolean;
  /**
   * Evolution stage stamped on a minion when the menace meter was high at its
   * spawn (see config MENACE). Its extra hp is already baked into `hp`/`maxHp`;
   * this field is what the loot roll reads to sweeten an evolved mob's drop,
   * and the renderer reads to mark it as evolved. 0/undefined = un-evolved.
   */
  evo?: number;
  /**
   * Elite/boss power-match bookkeeping. `powerScaled` latches true the first
   * time the fight engages so the scale is applied exactly once;
   * `contactMult` is the (softened) multiplier its contact damage carries
   * afterwards. See maybePowerScale in menace.ts.
   */
  powerScaled?: boolean;
  contactMult?: number;
  /**
   * A HARD-CODED monster level from the level spec (an elite/boss's authored
   * per-difficulty `level`, or a regular mob's rolled `mobLevels` band). When
   * set, `maybePowerScale` keeps this as the mob's `mlvl` instead of re-stamping
   * it from the player-relative `currentMobLevel` — the level spec owns the
   * number, not the difficulty offset. Unset on JESUS and on any spawn that
   * still runs player-relative.
   */
  authoredMlvl?: number;
  /**
   * FROST CHILL bookkeeping (a companion's frost nova — see `companionNova`):
   * `chillMs` counts down the slow's remaining life, and `chillFactor` is the
   * movement multiplier (0..1) applied while it runs — `moveEnemy` folds it in
   * alongside a stasis field, so a chilled mob crawls. Both absent once the
   * chill lapses.
   */
  chillMs?: number;
  chillFactor?: number;
  /**
   * The scripted opening striker (a level's `openingStrike`): a lone vanguard
   * that rushes ahead of the pack, and whose first contact — harmless — draws
   * the hero's holstered weapon. Set at creation; only this mob can arm him.
   */
  vanguard?: boolean;
  /**
   * The DORMANT "at work" stroll's bookkeeping (`EnemyDef.ai.idle === "work"`
   * — see working.ts; absent on everything else, and until the mob's first
   * dormant tick). `workRng` parks the mob's private rng stream (seeded off
   * its id, a plain number so a saved run resumes the exact stroll);
   * `workTarget` is the current leg's destination (absent = standing a beat),
   * `workLegMs` the leg's give-up budget, `workPauseMs` the between-legs
   * stand-still countdown.
   */
  workRng?: number;
  workTarget?: Vec2;
  workLegMs?: number;
  workPauseMs?: number;
  /**
   * PATROL ROUTE (a pinned spawn's `patrol` — see working.ts `stepPatrol`,
   * config `ENEMY_AI.patrol`): the waypoints (`[at, ...patrol]`, world px)
   * this mob walks back and forth while DORMANT, WoW-style, instead of
   * standing at a post. `patrolIndex` is the waypoint it is walking toward,
   * `patrolDir` the traversal direction (+1 outbound, -1 returning);
   * `patrolBestDist`/`patrolStuckMs` are the wedge detector (no net progress
   * for `stuckMs` → skip to the next waypoint). Absent on non-patrollers.
   */
  patrol?: Vec2[];
  patrolIndex?: number;
  patrolDir?: 1 | -1;
  patrolBestDist?: number;
  patrolStuckMs?: number;
  /**
   * ALARM LINK (a pinned spawn's `alarms`): the id of the spawn point this
   * mob RAISES when it wakes — the worker who sees the intruder and calls
   * the floor (see `raiseAlarm` in spawners.ts, config
   * `SPAWNERS.alarmWindowMs`). One-shot: cleared once raised.
   */
  alarms?: string;
  /**
   * SUMMON RUN-IN (config SPAWNERS): a mob summoned by a spawn point appears
   * just OFF-SCREEN and SPRINTS toward the hero (`runInSpeedMult` × its speed)
   * until it crosses the APPROACH CIRCLE of this radius (world px) around him —
   * the shorter viewport dimension, stamped at summon time so the chase needs no
   * live camera. On crossing it, the field is cleared and the mob drops into its
   * normal AI at its own pace. Absent on every mob placed or woken the old way.
   */
  approachRadius?: number;
  /**
   * An apparition's dissolve countdown (config APPARITION.lingerMs), armed on
   * the first playing tick after its scene ends. At 0 the figure leaves the
   * board with an `apparitionVanished` event. Absent on everything else.
   */
  vanishMs?: number;
  /**
   * A SHOOTER's reload clock (enemies with `EnemyDef.ranged`): ms until it
   * may fire again. Counts down every tick; firing resets it to the def's
   * `ranged.cooldownMs`. The cover AI also reads it — a freshly-fired
   * shooter scrambles behind a rock and only peeks back out as the clock
   * runs down (see moveRangedEnemy in ranged.ts). Absent on melee mobs.
   */
  rangedCooldownMs?: number;
  /**
   * Set-piece MECHANICS bookkeeping (elites/bosses with `EnemyDef.mechanics`
   * or `phases` — see src/game/mechanics.ts; absent on everything else).
   * The renderer reads `telegraph` to sell the windup (the freeze + flash)
   * and `dashMs` for the charge streak; everything else is clocks.
   */
  mech?: EnemyMech;
  /**
   * KNOCKBACK impulse bookkeeping (an asteroid blast flung it — see
   * `stepKnockback` in hazards.ts). While `knockMs > 0` the mob is owned by
   * the launch: `moveEnemy` sits its AI out and the body coasts along
   * `knockVel` (world px/s), which bleeds down as the fling settles. Both
   * absent once the launch has spent itself.
   */
  knockMs?: number;
  knockVel?: Vec2;
};

/** Runtime state of one enemy's set-piece mechanics (see `Enemy.mech`). */
export type EnemyMech = {
  /** The windup in progress: which move, ms left, and the LOCKED bearing
   * (charge only). While set the mob is rooted — the readable tell. */
  telegraph?: { kind: "charge" | "slam"; remainingMs: number; dir?: Vec2 };
  /** Ms of dash left, and the locked unit bearing it rides. */
  dashMs?: number;
  dashDir?: Vec2;
  /** Contact-damage multiplier while `dashMs` runs (the charge's impact). */
  dashDamageMult?: number;
  /** Cooldown clocks (ms) per mechanic. */
  chargeCooldownMs?: number;
  slamCooldownMs?: number;
  summonCooldownMs?: number;
  /** Latched true when the enrage threshold is crossed (fires the event and
   * the multipliers once — an enrage never calms back down). */
  enraged?: boolean;
  /** Live ids of this mob's summoned adds (pruned as they die), holding the
   * summon's `maxAlive` cap. */
  summons?: number[];
};
