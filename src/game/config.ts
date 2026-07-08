// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL gameplay tuning — the rules that hold across every level. Per-level
// content (geometry, gravity, spawns, loot pools) lives in defs/levels.ts;
// the enemy and equipment catalogs live in defs/enemies.ts and
// defs/equipment.ts. Units: world pixels (one sprite pixel = one world unit
// at scale 1), milliseconds, hit points.

export const PLAYER = {
  /** Base max hp before equipment bonuses (no stat feeds hp — STAMINA now
   * drives the sprint pool instead; see STAMINA / computeMaxStamina). */
  maxHp: 100,
  /**
   * Base world units per second while the pointer is held (SPEED adds). Kept
   * deliberately low to keep the horde tense — the crowd is a tide to route
   * around, not a footrace the player wins by holding one direction.
   */
  speed: 56,
  /** Collision radius. */
  radius: 10,
  /** Steering closer than this to the pointer target stops jitter. */
  arriveRadius: 4,
  /**
   * The sprite only mirrors when the horizontal share of the move direction
   * exceeds this — near-vertical steering keeps the last facing instead of
   * flip-flickering every step.
   */
  faceFlipMinX: 0.2,
} as const;

/**
 * Global weapon cadence. Every weapon's catalog `cooldownMs` is its cadence at
 * ZERO speed-stat; this multiplier scales all of them at once, the single lever
 * for "how fast does an un-invested build attack". Kept above 1 so the opening
 * loadout swings deliberately slowly — a fresh character is NOT a turret — and
 * the DEX (physical) / INT (magic) speed stat is what earns the fire rate back
 * (see STATS.attackSpeedPerStat, applied in weaponCooldownFor).
 */
export const WEAPON = {
  baseCooldownMult: 1.2,
  /**
   * Global damage scale on every weapon's catalog `damage` — the single lever
   * for "how hard does any weapon hit", the damage counterpart to
   * `baseCooldownMult`. Applied in `weaponDamageFor` (the one source of truth
   * for stat-scaled damage), so it moves combat, auto-equip scoring, and the
   * UI readouts together and preserves every weapon's relative tuning. Kept
   * below 1 so basic weapons no longer melt the horde on their own — the crowd
   * has to be out-fought, not out-DPS'd from the first pickup.
   */
  damageMult: 0.5,
} as const;

/** Projectile rules shared by every weapon (per-weapon numbers in defs). */
export const PROJECTILE = {
  /**
   * Shots fired mid-jump leave from the player's height and sink back to
   * ground level at this rate (world px/s) — purely visual; collisions stay
   * in the ground plane.
   */
  zFallSpeed: 90,
} as const;

/**
 * Jumping. Tap (screen) or space to hop. Takeoff speed is the player's —
 * gravity belongs to the LEVEL, so the same takeoff floats higher under low
 * gravity and snaps back fast under high gravity.
 */
export const JUMP = {
  /** Upward takeoff speed in world px/s. */
  velocity: 240,
  /** While `z` is above this, grounded enemies pass beneath the player: no
   * contact. */
  dodgeHeight: 12,
} as const;

/** Enemy behavior shared by every kind (per-kind numbers sit in their def). */
export const ENEMY_AI = {
  /** Per-enemy speed jitter so a pack spreads out (fraction of speed). */
  speedJitter: 0.25,
  /**
   * Enemies spawn at least this far from the player — just past the
   * phone-landscape screen edge (world half-view ≈ 211×97, see AGENTS.md),
   * so the slow horde is visible arriving within seconds instead of
   * trickling in from far off-screen.
   */
  minSpawnDistance: 150,
  /**
   * Wave spawns land in a ring [minSpawnDistance, minSpawnDistance + width]
   * around the player — just past the screen edge, never on top of them.
   * Keep ring max below the minions' aggro radii so the horde converges
   * the moment it spawns.
   */
  spawnRingWidth: 80,
  /** Pairwise push-apart distance so packs don't stack into one blob. */
  separation: 16,
  /**
   * Fraction of the separation distance mobs may overlap (0 = shoulder to
   * shoulder, 0.2 = bodies squeeze 20% into each other). Looser packing
   * lets a kited horde bunch into one clump the player can finish off
   * together — the single knob to turn if packs feel too loose or too tight.
   */
  overlapFraction: 0.2,
  /**
   * A minion counts toward the wave floor (waves.minAlive) only within this
   * distance of the player — parked spawns on the far side of the map must
   * not satisfy "there's a pack on screen".
   */
  nearRadius: 340,
} as const;

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
  /** XP needed to go from level 1 to 2; each next level costs ×growth. */
  baseXpToLevel: 100,
  xpGrowth: 1.65,
  statPointsPerLevel: 1,
  /**
   * XP granted by a golden arrow pickup, as a fraction of the CURRENT
   * xpToNext — a share of a level, not a flat sum, so arrows stay worth
   * chasing at level 20 exactly as much as at level 2.
   */
  arrowXpShare: 0.25,
} as const;

/**
 * The DERIVED arrival loadout (`deriveArrivalLoadout` in arrival.ts): the
 * realistic stand-in used when a mid-campaign level starts with nothing
 * banked — dev `?level=` jumps, playtest bots, wiped storage. In the real
 * campaign the player's actual progress persists instead: victory banks an
 * `extractLoadout` snapshot the app hands back to `createGame` for the next
 * level. The derivation estimates that snapshot from data alone: a player
 * level from the earlier levels' rosters (mob count × hp through the XP
 * curve), stat points auto-spent, and the previous level's signature kit.
 */
export const ARRIVAL = {
  /**
   * Fraction of the earlier levels' total roster XP the derivation assumes a
   * clear actually banked — nobody kills every last wave mob before the boss
   * falls.
   */
  clearShare: 0.5,
  /** Round-robin order the banked stat points are auto-spent in. */
  statOrder: [
    "strength",
    "dexterity",
    "stamina",
    "speed",
    "intelligence",
    "luck",
  ],
  /** How many of the previous level's abilities ride along as held powerups. */
  heldAbilities: 2,
} as const;

/**
 * Menace — the escalation meter that answers an overpowered player, driven by
 * the player's ACTUAL combat output rather than any single lucky blow. The
 * engine keeps a rolling estimate of the damage-per-second and kills-per-second
 * the player is putting out right now (`state.combatDps` / `state.combatKillRate`,
 * smoothed over `rateWindowSec`); the harder and faster you clear, the faster
 * the meter heats. Standing idle — no damage, no kills — cools it. Menace is
 * read as a stage (0…maxStage) that does three things: it LURES more of the
 * horde toward the player, it EVOLVES freshly-spawned minions (more hp → more
 * xp → better loot), and — folded in with the player's own level — it scales
 * elites and bosses when they engage, so the epic fights keep pace with the
 * player's power instead of melting. Units: raw menace points, world px, hp.
 */
export const MENACE = {
  /**
   * Menace banked per second per point of the player's rolling DPS: sustained
   * damage output is the meter's main fuel, so a hard-hitting build heats it
   * faster than a plinking one — the meter tracks how overpowered you are, not
   * how you happened to land the last blow. Scaled by `menaceSensitivity`
   * (difficulty × early-game warmup) before it lands. Kept deliberately low:
   * raw DPS climbs for every build as the run goes on, so leaning on it would
   * heat the meter for fair late-game play too. The meter leans instead on
   * relative OVERKILL and kill RATE, which single out a genuinely lopsided
   * build; DPS is only a gentle supporting term.
   */
  perDps: 0.07,
  /**
   * Menace banked per second per kill/second of the player's rolling kill rate:
   * a fast clear heats the meter on top of raw damage, so mowing a crowd down
   * escalates faster than grinding a single tank.
   */
  perKillRate: 1.5,
  /**
   * Menace banked instantly per HEALTHBAR of OVERKILL on a killing blow — the
   * blow's damage beyond the mob's FULL health (damage − maxHp), measured as a
   * fraction of its max hp (overkill ÷ maxHp), not raw points. A hit that only
   * finishes a wounded mob isn't overkill at all; one that could have dropped
   * the mob several times over wastes multiple bars — the signature of an
   * overpowered build — and jolts the meter. Measuring it relative to the mob's
   * hp is what keeps early, level-appropriate kills cool while genuinely
   * lopsided ones escalate. Scaled by `menaceSensitivity` like the rolling heat.
   */
  perOverkill: 1.4,
  /**
   * The window (seconds) the DPS/kill-rate estimates smooth over — long enough
   * that one burst doesn't spike the meter, short enough that the heat tracks
   * the last few seconds of fighting rather than the whole run.
   */
  rateWindowSec: 2.5,
  /**
   * Menace bled off per second: stop the slaughter and the horde cools. This is
   * the constant cooler the (sensitivity-scaled) gain must beat to climb, so on
   * a gentle difficulty ordinary fighting trends the meter back to zero.
   */
  decayPerSec: 4,
  /**
   * Early-game warmup. Menace gain (rolling heat AND overkill jolts) is damped
   * by a factor that eases from `warmupFloor` at level 1 up to 1.0 by player
   * level `1 + warmupLevels`, so a fresh hero on a fair difficulty simply cannot
   * rampage in the opening levels — the meter can't build faster than it decays
   * until the player has grown into some real power. The residual `warmupFloor`
   * is deliberately non-zero so a very sensitive difficulty (high `menaceMult`,
   * e.g. JESUS) multiplies through it and still bites from the first few kills.
   */
  warmupLevels: 5,
  warmupFloor: 0.12,
  /** Menace is capped here (also caps the derived stage at maxStage). */
  max: 120,
  /** Raw menace per evolution stage: stage = floor(menace / perStage). */
  perStage: 12,
  /**
   * Hard cap on the evolution stage (perStage × maxStage should equal max).
   * Ten stages of headroom: the first few are the familiar rampage, but a
   * player who keeps pushing their output climbs into stages the old five-step
   * meter never reached — where the lured, evolved horde stacks into a wall.
   */
  maxStage: 10,
  /**
   * Extra minion hp per evolution stage (+35% each), stamped when the mob
   * spawns. Kill XP is hp-proportional, so an evolved mob is worth more xp
   * automatically; its drops are sweetened separately below.
   */
  hpPerStage: 0.35,
  /** Added to an evolved minion's base drop chance per stage. */
  dropBonusPerStage: 0.04,
  /** Added to an evolved minion's drop tier roll per stage (better gear). */
  tierBonusPerStage: 0.06,
  /**
   * The wave spawner's live floor AND cap grow by this fraction per stage —
   * a rampage pulls a denser, bigger crowd onto the screen.
   */
  lurePerStage: 0.25,
  /**
   * Overkill also drags the horde over RIGHT NOW: each point of overkill banks
   * this much of the spawner's move-credit (the same channel walking uses),
   * so a big hit is a dinner bell the nearby horde answers within seconds.
   */
  lureCreditPerOverkill: 0.6,
  /**
   * Elite/boss power-match. When one first engages, its hp (and, softened,
   * its contact damage) scale by `1 + (level-1)·bossLevelWeight +
   * stage·bossMenaceWeight` — a non-decaying floor from the player's LEVEL
   * plus the current menace heat — locked in once so a level-20 hero meets a
   * boss worthy of them instead of one-shotting the set piece.
   */
  bossLevelWeight: 0.12,
  bossMenaceWeight: 0.1,
  /** Share of the hp power-scale that also applies to contact damage (so a
   * scaled boss hits harder, but not as steeply as its health grows). */
  bossContactShare: 0.4,
  /**
   * The rank-and-file's answer to a LEVELLING hero. Every regular minion locks
   * in extra hp at spawn — this fraction per player level above 1 (+8% each) —
   * so the horde keeps pace as the hero grows and leftover levels don't turn
   * the swarm into a walkover. Kill xp is hp-proportional, so a tougher mob is
   * automatically worth more xp; its drops sweeten separately below. This is a
   * NON-DECAYING floor from progression alone, distinct from (and stacking with)
   * the menace EVOLUTION stage that answers moment-to-moment overkill — the two
   * are the "you got stronger" and the "you're steamrolling right now" halves of
   * keeping the fight honest. Gentler than `bossLevelWeight`: a swarm at full
   * boss scaling would be a wall, so the mass of mobs ramps at two-thirds the
   * rate a set-piece does.
   */
  mobHpPerLevel: 0.08,
  /**
   * Better gear as the hero levels: added to a minion's drop tier roll per
   * player level above 1 (+1.5% each), so a higher-level hero's kills yield
   * richer loot to match the tougher mobs they came off — the drop-quality
   * companion to `mobHpPerLevel`, stacking with the menace `tierBonusPerStage`.
   */
  tierBonusPerLevel: 0.015,
} as const;

/**
 * Stat effects. STRENGTH scales physical (melee + ranged) weapon DAMAGE and
 * widens the carry bag; DEXTERITY quickens physical (melee + ranged) ATTACK
 * SPEED, lifts the HIT RATE (fewer weapon MISSES and enemy DODGES — see
 * ACCURACY), lands physical CRITS, and sharpens DODGE; INTELLIGENCE powers magic
 * weapons (their damage AND speed), lands magic CRITS, and for every weapon
 * lengthens RANGE and widens the melee AoE cone (plus the magnet pull, in
 * abilities.ts); SPEED quickens the walk; LUCK finds better items, nudges
 * crits and dodge up MARGINALLY (a quarter of DEX/INT's effect), and shrugs
 * off enemies' critical hits; STAMINA deepens the sprint pool, quickens its
 * recovery (see STAMINA below), AND raises max hp. The class→stat maps live in
 * items.ts (`DAMAGE_STAT`, `SPEED_STAT`, `CRIT_STAT`).
 */
export const STATS = {
  /** Move-speed multiplier added per SPEED point (+8% each). */
  speedPerPoint: 0.08,
  /**
   * Damage multiplier per point of the weapon's DAMAGE stat, keyed by that stat
   * (STRENGTH for melee & ranged, INTELLIGENCE for magic — see `DAMAGE_STAT`).
   * STRENGTH scales harder than INTELLIGENCE on purpose: raw damage is STR's
   * ONE payoff, whereas INT already buys reach (`rangePerInt`), the melee cleave
   * (`aoePerInt`/`aoeTargetsPerInt`), magic attack speed and magic crit — so a
   * gentler damage slope keeps a mage's total package from dwarfing a bruiser.
   * A high STR build is now the honest glass-cannon: it hits the hardest per
   * point, and pays for it with the walk-speed penalty below.
   */
  damageBonusPerPoint: { strength: 0.2, intelligence: 0.12 } as Record<
    "strength" | "intelligence",
    number
  >,
  /**
   * STRENGTH's downside: every point of muscle to haul slows the walk by this
   * fraction (−1% each), floored at `strengthSlowFloor` so even a pure bruiser
   * still moves. It is a gentle tax — a few points are unnoticeable, but a build
   * that dumps everything into STR trades genuine mobility for its firepower,
   * so STR and SPEED pull against each other instead of stacking for free.
   */
  strengthSlowPerPoint: 0.01,
  /** The slowest STRENGTH can drag the walk (a 50% floor on the penalty above),
   * so no amount of muscle roots the hero in place. */
  strengthSlowFloor: 0.5,
  /**
   * STRENGTH also widens the carry bag: each point adds this many inventory
   * slots on top of the small `LOOT.baseInventorySize` floor, so a bruiser
   * hauls more loot between the fights (see `inventoryCapacity`). Whole slots
   * only — the capacity floors the product.
   */
  bagSlotsPerStr: 1,
  /**
   * INTELLIGENCE lengthens EVERY weapon's reach by this fraction of its base
   * range per point (+3% each) — melee, ranged, and magic alike — so a
   * high-INT build reaches out and holds the crowd further back.
   */
  rangePerInt: 0.03,
  /**
   * INTELLIGENCE also widens a melee weapon's AoE cone by this fraction of its
   * base half-angle per point (+4% each): a sword's slash sweeps a broader arc
   * and a spear's thrust a slightly wider lane. Scaling the angle keeps each
   * weapon's shape (a narrow spear stays narrow); a very high-INT wide weapon
   * saturates to a full circle. Melee-only — ranged/magic have no cone.
   */
  aoePerInt: 0.04,
  /**
   * INTELLIGENCE also raises the CAP on how many monsters one melee swing can
   * hit (see MELEE.baseAoeTargets): each point adds one extra foe to the
   * cleave. Widening the cone (aoePerInt) only lets a swing SEE more of the
   * crowd; this is what lets it actually strike them, so horde-clearing melee
   * is an INTELLIGENCE build, not a free STRENGTH perk.
   */
  aoeTargetsPerInt: 1,
  /**
   * Attack-speed gained per point of the weapon's SPEED stat (DEX for melee &
   * ranged, INT for magic — see `SPEED_STAT`): the effective cooldown is
   * divided by `1 + stat * this`, so +2% cadence per point. Base weapons fire
   * deliberately slowly — a build grows the fire rate back by investing in its
   * speed stat, so standing still stops clearing the horde for free. Kept
   * gentle so the speed stat sweetens cadence rather than dominating a build:
   * pumping DEX/INT ramps fire rate roughly half as fast as damage climbs.
   */
  attackSpeedPerStat: 0.02,
  /** Player base crit chance before stats and equipment. */
  baseCritChance: 0.05,
  /**
   * Crit chance gained per point of the weapon's CRIT stat — DEXTERITY for
   * melee & ranged, INTELLIGENCE for magic (see `CRIT_STAT`). This is the main
   * driver of a build's crit rate: a nimble knife-fighter crits with DEX, a
   * mage crits with INT.
   */
  critChancePerStat: 0.04,
  /**
   * LUCK also nudges crit up, but only MARGINALLY — a quarter of a primary
   * point (critChancePerStat), so LUCK sweetens any build's crits without
   * replacing the class stat that actually earns them.
   */
  critChancePerLuck: 0.01,
  /** Reduction of enemy crit chance per LUCK point (floored at 0). */
  critAvoidPerLuck: 0.02,
  /** Extra drop chance per LUCK point. */
  dropChancePerLuck: 0.01,
  /** Extra chance per LUCK point that a drop upgrades its tier roll. */
  tierChancePerLuck: 0.04,
  critMultiplier: 2,
} as const;

/**
 * Dodge — the chance to sidestep an enemy's blow entirely, taking NO damage
 * (and no armor hit) at all. Every hero has a small innate `base` chance;
 * DEXTERITY sharpens the reflexes that drive it (`perDex`), and LUCK nudges it
 * up MARGINALLY (`perLuck`, a quarter of a DEX point — matching LUCK's light
 * touch on crit). Capped at `max` so no build ever becomes untouchable. The
 * roll lives in `playerDodgeChance` (items.ts) and fires in the contact-damage
 * path (step.ts).
 */
export const DODGE = {
  base: 0.05,
  perDex: 0.02,
  perLuck: 0.005,
  max: 0.6,
} as const;

/**
 * Accuracy — the chance the player's WEAPON blow actually lands. A strike comes
 * to nothing two ways: the hero's own MISS (an innate `baseMiss` whiff) or the
 * foe's DODGE (its `EnemyDef.dodgeChance`, defaulting to `enemyDodge`).
 * DEXTERITY is the hero's hit rate — every point trims BOTH the miss chance and
 * the enemy's dodge chance by `perDex`, so a nimble build rarely whiffs and is
 * rarely sidestepped. Miss floors at `minMiss` and dodge at 0, so no build is
 * ever perfectly accurate against an evasive foe. Only WEAPON attacks (melee
 * swings, ranged/magic shots) roll this; conjured abilities (orbit, storm,
 * nuke) bypass it and always connect. The rolls live in `playerMissChance` /
 * `enemyDodgeChance` (items.ts) and fire in `hitEnemy` (loot.ts).
 */
export const ACCURACY = {
  baseMiss: 0.05,
  enemyDodge: 0.05,
  perDex: 0.02,
  minMiss: 0,
} as const;

/**
 * Armor grades a suit can carry. Each grade SOAKS `reduction` of every
 * incoming physical hit — the soaked share comes off the armor bar, the rest
 * off HP — until the pool (`amount`) is spent, after which the suit is bare
 * and every hit lands in full. A 100-damage blow against a full GREEN (100,
 * 25%) suit takes 75 to HP and 25 off the armor, exactly as designed. The
 * three grades are tuned to compare cleanly; retune one line to rebalance.
 */
export const ARMOR: Record<
  "green" | "yellow" | "red",
  { amount: number; reduction: number }
> = {
  green: { amount: 100, reduction: 0.25 },
  yellow: { amount: 150, reduction: 0.5 },
  red: { amount: 200, reduction: 0.75 },
} as const;

/**
 * Stamina — the sprint pool. Running (a decisive push, throttle above
 * `runThreshold`) drains it; walking or standing still lets it recover.
 * While any stamina is left the player runs at full speed; once it hits zero
 * the top speed is capped at `emptySpeedFactor` until it recovers. The
 * STAMINA stat deepens the pool AND — matching "drains slower, regains
 * faster" — cuts the drain rate and quickens the regen. Units: stamina points
 * (pool), points/second (rates).
 */
export const STAMINA = {
  /** Pool at zero STAMINA stat. */
  base: 100,
  /** Extra max stamina per STAMINA point (current rises with it). */
  maxPerPoint: 8,
  /**
   * Extra max HP per STAMINA point (current hp rises with it, like a fresh
   * suit). A hardy sprinter is also a sturdier one, so STAMINA now grows the
   * health bar alongside the sprint pool — see `computeMaxHp`.
   */
  hpPerPoint: 6,
  /** Drained per second at a full run, at zero STAMINA stat. Eased down from
   * 22 so the pool lasts ~33% longer — a fresh hero can sprint noticeably
   * further before the winded jog kicks in. */
  drainPerSec: 16.5,
  /** Each STAMINA point divides the drain by `1 + points·this` (drains slower). */
  drainReductionPerPoint: 0.12,
  /** Regained per second while standing still, at zero STAMINA stat. */
  regenPerSec: 18,
  /** Each STAMINA point multiplies the regen by `1 + points·this` (regains faster). */
  regenPerPoint: 0.12,
  /**
   * Regen multiplier while walking (moving below `runThreshold`). A walk still
   * recovers stamina — it never drains — but only half as fast as standing
   * still, so a stroll is a partial breather rather than a full one.
   */
  walkRegenFactor: 0.5,
  /** Throttle above which movement counts as a run that drains stamina. */
  runThreshold: 0.5,
  /** Top-speed multiplier once the pool is empty (a winded jog). */
  emptySpeedFactor: 0.5,
} as const;

/**
 * Melee area-of-effect. A swing is not a single tap but a sector of effect:
 * every monster within the weapon's reach and inside the cone of the aim
 * takes the blow, so a blade cleaves the crowd it faces instead of one mob.
 * `defaultSweepDeg` is the full cone angle for weapons that don't name their
 * own — a broad slash. Reach weapons (spears, poles) override it in the
 * catalog with a narrow `sweepDeg` and lean on their long `range` instead: a
 * thrust that skewers the line directly ahead rather than sweeping an arc.
 */
export const MELEE = {
  defaultSweepDeg: 120,
  /**
   * How many monsters a single melee swing can strike, before INTELLIGENCE
   * widens it (see STATS.aoeTargetsPerInt). Kept deliberately low — a broad
   * blade cleaving the whole crowd for free made STRENGTH-stacked melee wildly
   * overpowered — so an un-invested swing only ever catches the two nearest
   * foes in its cone; reaching more of the horde is what INT buys. Nearest
   * first, so the locked-on target is always among them.
   */
  baseAoeTargets: 2,
} as const;

/** Loot rules that hold on every level (pools and tier odds are per level). */
export const LOOT = {
  /**
   * Base chance a regular monster drops anything (LUCK adds to it). Tuned
   * for horde scale: hundreds of kills per run, a drop every ~8 of them —
   * the steady rain of upgrades is what keeps the player ahead of the ramp.
   */
  dropChance: 0.09,
  /**
   * The share of drops that is a screen-nuke pickup — checked first, before
   * the ladder below, so it stays rare no matter how the rest is tuned.
   */
  nukeShare: 0.012,
  /** Of the remaining drops, the share that is equipment. */
  equipmentShare: 0.25,
  /** …the share that is a time-limited ability pickup (kept lean so the
   * powerup rain never buries the field — the dock only banks three). */
  abilityShare: 0.06,
  /**
   * …the share that is a medkit (heals on touch). Kept deliberately scarce —
   * a steady medkit rain let a basic loadout tank the horde indefinitely, so
   * healing is now a lucky find, not a crutch. The rest of the ladder (below)
   * is unchanged; only this slice was carved out of what used to be the
   * medkit-heavy remainder.
   */
  medkitShare: 0.07,
  /** …the share that is a weapon repair kit… */
  repairShare: 0.1,
  /**
   * Clearing every regular monster on a level is guaranteed to have dropped
   * at least this much equipment (a pity roll forces the tail end; boss
   * drops come on top of it).
   */
  minEquipmentPerLevel: 2,
  /** Tier-chance bonus on the trophy the last regular monster surrenders. */
  allClearTierBonus: 0.35,
  /**
   * The carry bag's floor — its size at zero STRENGTH. STRENGTH grows it from
   * here (`STATS.bagSlotsPerStr`), so the opening bag is deliberately tight
   * and a STR build is what earns the room to hoard (see `inventoryCapacity`).
   */
  baseInventorySize: 3,
} as const;

/**
 * Solid obstacles. Levels scatter them at creation (see LevelDef.obstacles);
 * nothing walks through one, and only jumpable ones can be cleared mid-air.
 */
export const OBSTACLES = {
  /** A jumpable obstacle is cleared while the player's z exceeds this. */
  clearHeight: 14,
  /** Keep obstacles at least this far from the player spawn (world px). */
  spawnClearance: 140,
  /** Minimum gap between two obstacles' edges, so lanes always exist. */
  spacing: 28,
} as const;

/**
 * In-world dialogue (elite ambushes, boss confrontations, story-item lore).
 * Speakers hold their scene until the player has tapped through every page;
 * the world freezes in the `dialogue` phase meanwhile.
 */
export const DIALOGUE = {
  /**
   * An awake speaker opens its scene once within this distance of the
   * player (world px) — inside the phone-landscape half-view (≈211×97), so
   * the speaker is visibly on screen when the world stops.
   */
  speakRadius: 96,
  /**
   * A level's `firstSightThoughts` fire once a pinned mob is within this
   * distance of the player (world px). Same rationale as `speakRadius`:
   * inside the phone half-view, so the mob the hero is reacting to is
   * actually on screen when his thought stops the world.
   */
  sightRadius: 96,
} as const;

/** Locked doors (LevelDef.doors), opened by story-item keys. */
export const DOORS = {
  /** Carrying the key within this distance of the door slides it open. */
  openRadius: 40,
} as const;

/** The medkit consumable: picked up on touch, never enters the inventory. */
export const MEDKIT = {
  heal: 35,
  radius: 8,
} as const;

/**
 * Ability pickups are carried, not auto-used: touching one banks it, and the
 * `useItem` input (mouse click / the HUD button) spends the
 * oldest banked one. Timing the storm for the flood is the player's call.
 */
export const HELD_ITEMS = {
  /** How many ability pickups the player can carry; extras stay grounded. */
  cap: 3,
} as const;

/**
 * Visible battle damage. Enemy sprites swap to wounded variants as hp falls:
 * every mob shows its "hurt" look at half hp, elites and bosses a heavier
 * "wrecked" look below a quarter. Purely presentational — the renderer picks
 * the sprite — but the thresholds live here so the app and any future engine
 * rule read the same numbers.
 */
export const WOUNDS = {
  /** At or below this hp fraction every mob wears its hurt sprite. */
  hurtAt: 0.5,
  /** At or below this, elites and bosses wear the wrecked sprite. */
  wreckedAt: 0.25,
} as const;

/**
 * The boss's last stand: at or below this hp fraction a boss fights like a
 * cornered animal — contact hits multiply, and the renderer swaps in the
 * "dying" sprite with a warning flicker so the spike is readable.
 */
export const LAST_STAND = {
  /** Hp fraction at or below which the last stand kicks in. */
  hpFraction: 0.1,
  /** Contact-damage multiplier while the last stand runs. */
  damageMultiplier: 1.5,
} as const;

/** Run flow. */
export const RUN = {
  /** Grace period between clearing the objective and the victory splash —
   * time enough to scoop up what the boss dropped. */
  victoryDelayMs: 5000,
} as const;
