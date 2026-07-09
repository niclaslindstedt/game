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
   * Chain lightning (a projectile def's `chain`): how far a bolt leaps from
   * the struck foe to the next (world px), and the fraction of the blow each
   * leap carries. Leaps always connect (no miss/dodge roll — the current has
   * already found its path).
   */
  chainRange: 80,
  chainDamageFrac: 0.6,
  /**
   * CRIT WEIGHT BY CADENCE: a weapon's crit-damage multiplier follows how it
   * swings — a quick blade crits lighter, a slow heavy hitter crits like a
   * truck (`weaponCritMult` in defs/equipment.ts derives it; a def may pin
   * its own `critMult`). This is the crit half of the damage-budget model:
   * effective DPS folds the lift in, so the slow archetypes pay for their
   * spikes with per-hit budget rather than getting them for free.
   */
  critMultByCadence: { fast: 1.6, medium: 2, slow: 2.5 },
  /** Cadence classes: fast below this cooldown… */
  critFastBelowMs: 450,
  /** …slow at/above this one; medium in between. */
  critSlowFromMs: 800,
  /**
   * The AoE side of the damage-budget model — BALANCING assumptions, not
   * gameplay caps (how many foes a swing ACTUALLY hits is INTELLIGENCE's
   * business — see maxMeleeTargets). A melee weapon is classified by its
   * arc: below `aoeConeFromDeg` it is a single-target thrust budgeted at 1
   * target; from there a cone budgeted at `assumedTargets.cone`; from
   * `aoeFullFromDeg` a full-circle sweep budgeted at `assumedTargets.full`.
   * An AoE weapon therefore carries budget ÷ 4 (or ÷ 5) per hit — weaker
   * than a single-target weapon from the start, by design, until INT grows
   * the cleave into the assumption.
   */
  aoeConeFromDeg: 80,
  aoeFullFromDeg: 300,
  assumedTargets: { cone: 4, full: 5 },
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
  /**
   * DAMAGE VARIANCE — every blow rolls its damage inside a band around the
   * weapon's catalog `damage` (the average) rather than landing a fixed
   * number, so combat reads with a little life: a weapon written at 10 hits
   * for 8–12, and a crit off that lands anywhere up to 24. This is the
   * DEFAULT half-width, as a fraction of the average; a def may widen (or
   * tighten) its own swing with `damageVariance` — a wild, chaotic weapon
   * (a blunderbuss, a black-hole gun) rolls a much bigger band for the fun
   * of it. The average is untouched, so the whole damage-budget model
   * (budgets, DPS readouts, auto-equip, grade generation) is unaffected —
   * variance is spread around the same mean. Rolled off the run's `fxRng`
   * flavor stream (not the loot stream), so it never perturbs drop rolls.
   */
  damageVariance: 0.2,
} as const;

/**
 * Desktop mouse aim. The character fights autonomously — it locks onto the
 * nearest visible foe — but a desktop mouse adds a second steering dimension:
 * the pointer nudges that choice toward whatever the cursor is aimed at. Each
 * reachable foe's distance is scaled by `1 + biasStrength · (1 − alignment)/2`,
 * where `alignment` is the dot product of the cursor's bearing (from the hero)
 * and the bearing to the foe: 1 = the foe sits dead along the cursor, −1 =
 * opposite it. So a foe in the pointer's direction outranks a merely-closer one
 * elsewhere — the cursor carries the priority when foes stand in several
 * directions. It is only ever a bias: with no mouse (touch, keyboard-only,
 * bots) or the pointer resting on the hero, targeting falls back to the plain
 * nearest foe, so the hero is never left unable to fire at empty space.
 */
export const AIM = {
  /** At 4 a pointer-aligned foe outranks one up to ~5× closer behind the hero. */
  biasStrength: 4,
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
   * The size of one horde "level" in hp terms. Every monster spawns at the
   * player's level plus the difficulty's `mobLevelOffset` (EASY three under,
   * JESUS two over — see mobHpScaleFor in menace.ts), and each level off the
   * baseline shifts its hp by this fraction (±8% each). Because the offset is
   * RELATIVE, the horde keeps pace as the hero grows and the difficulty gap
   * never closes. Kill xp is hp-proportional, so a tougher mob is
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
   * The floor under `mobHpScaleFor`: no relative-level deficit can scale a
   * monster below half its catalog hp, so a deep negative offset (EASY, level
   * 1) weakens the horde without turning it into paper.
   */
  mobHpScaleFloor: 0.5,
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
 * Armor — the D2/WoW-shaped physical mitigation. Every worn armor piece
 * (head/chest/legs/feet) carries flat armor points; the ACTIVE pieces sum
 * (a broken piece counts zero — see `isArmorBroken`), and the total turns
 * into a damage reduction AGAINST THE ATTACKER'S LEVEL:
 *
 *   reduction = armor / (armor + kBase + kPerLevel × attackerLevel)
 *
 * capped at `maxReduction` (the classic 75% wall). A full set of
 * level-appropriate armor lands around a third off every physical hit; the
 * same set decays as the horde levels past it, which is what keeps armor
 * drops interesting all campaign. `armorPerIlvl` is the drop-side growth:
 * a base's authored armor is its value AT ITS OWN levelReq, and a rolled
 * instance grows by this fraction per item level above that (so deep finds
 * of an old base stay wearable without out-arming native pools).
 */
export const ARMOR = {
  kBase: 40,
  kPerLevel: 12,
  maxReduction: 0.75,
  armorPerIlvl: 0.06,
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
   * …the share that is an ENERGY DRINK (resets the sprint pool on touch). Kept
   * lean — a drink is only worth anything to a winded hero, and the gentle
   * rungs rain them far harder through the stamina-empty MERCY DROP (see
   * `staminaDrinkChance`), so the baseline slice is just a chance for one to
   * turn up in the ordinary rain.
   */
  drinkShare: 0.05,
  /**
   * Clearing every regular monster on a level is guaranteed to have dropped
   * at least this much equipment (a pity roll forces the tail end; boss
   * drops come on top of it).
   */
  minEquipmentPerLevel: 2,
  /** Tier-chance bonus on the trophy the last regular monster surrenders. */
  allClearTierBonus: 0.35,
  /**
   * The MONSTER LEVEL each tier unlocks at — a tier can never drop off a mob
   * below its gate, whatever the chances say. The one dial for "when does the
   * campaign start paying blues/yellows/golds": magic from mlvl 5, rare from
   * 10, unique from 15, legendary from 25. (Monster level = player level +
   * the difficulty's `mobLevelOffset`, so harder rungs reach each tier
   * earlier in the story.)
   */
  tierUnlockMlvl: { magic: 5, rare: 10, unique: 15, legendary: 25 },
  /**
   * Base chance per tier that an equipment drop rolls it, checked best-first
   * (see `rollTier`). Global — the campaign's progression now lives in the
   * mlvl gates above, not in per-level tables. LUCK, the difficulty's
   * `tierChanceBonus`, menace evolution, and per-enemy bonuses all add to
   * each. Unique/legendary sit at 0 until their one-of-a-kind defs ship.
   */
  tierChances: { magic: 0.2, rare: 0.06, unique: 0, legendary: 0 },
  /**
   * How far below the killer's monster level a dropped item's LEVEL lands:
   * index i is the relative weight of dropping exactly i levels short, so
   * `[1, 2, 3, 4]` makes a −3 item four times likelier than a full-level one.
   * Longer/shorter arrays widen/narrow the band. Item level floors at 1.
   */
  ilvlDeltaWeights: [1, 2, 3, 4],
  /**
   * The same weights for RARE-and-better drops: the big finds roll only 0–1
   * below the mob (equal odds), so a yellow is generally a high-level item,
   * not a lucky low roll.
   */
  ilvlDeltaWeightsRare: [1, 1],
  /**
   * The carry bag's floor — its size at zero STRENGTH. STRENGTH grows it from
   * here (`STATS.bagSlotsPerStr`), so the opening bag is deliberately tight
   * and a STR build is what earns the room to hoard (see `inventoryCapacity`).
   */
  baseInventorySize: 3,
  /**
   * Minimum gap between "bags are full" nudges. Loot the player can't pick up
   * stays on the ground, so `stepItems` re-hits the same overlap every frame he
   * stands on it — this throttles the `pickupBlocked` cue (the hero's thought,
   * the bag-button pulse) so it fires once, not once per tick.
   */
  bagFullHintCooldownMs: 2500,
} as const;

/**
 * MAKE QUALITY — the craftsmanship axis every PLAIN (regular-tier) weapon
 * and armor drop rolls at mint (see `rollEquipment`): BROKEN and CRUDE work
 * below the authored numbers, NORMAL at them, SUPERIOR and PERFECT above.
 * `mults` scales the base's damage (weapons), armor points (armor),
 * durability, and merchant value; the roll's odds shift with the killer's
 * MONSTER LEVEL — `weightsLow` are the relative odds at mlvl 1, `weightsHigh`
 * at `highMlvl`, lerped linearly between, so the level-1 rank and file drop
 * mostly shabby make and the deep campaign pays out superior and perfect
 * work. Craftsmanship and magic are exclusive (the D2 rule): MAGIC-or-better
 * finds, charms, and bags never roll one — they are always normal make.
 */
export const QUALITY = {
  mults: { broken: 0.7, crude: 0.85, normal: 1, superior: 1.15, perfect: 1.3 },
  /** Relative quality odds off a monster-level-1 kill… */
  weightsLow: { broken: 20, crude: 25, normal: 52, superior: 3, perfect: 0 },
  /** …and off a monster at/above `highMlvl`; lerped linearly between. */
  weightsHigh: { broken: 0, crude: 6, normal: 54, superior: 28, perfect: 12 },
  /** The monster level at which the odds reach `weightsHigh`. */
  highMlvl: 100,
} as const;

/**
 * MERCY DROPS — the gentle rungs (easy/medium) throw a drowning player a rope,
 * and the fight eases without ever becoming un-losable. Four independent
 * signals feed it: a PACKED FIELD (crowd of on-screen mobs), LOW HEALTH, a
 * near-BROKEN WEAPON, and an EMPTY SPRINT POOL (stamina bone-dry). The first
 * three turn into a 0→1 "desperation" as they worsen — zero at their `*Start`
 * mark, one at their `*Full` mark, linear between (see `desperationRamp`); the
 * stamina rope instead ramps over TIME the pool sits empty (see
 * `staminaDrinkChance`). This namespace owns the RAMP SHAPES (where help begins
 * and maxes); each rung owns its STRENGTH via `DifficultyDef.mercy`
 * (`MercyTuning`), and hard-and-up zero every strength so none of this reaches
 * them. Tune the two together: shape here, per-rung force on the ladder.
 */
export const MERCY = {
  /** On-screen minions before a packed field starts coughing up screen-nukes,
   * and where that per-kill chance tops out — the bomb-in-a-swarm rescue scales
   * linearly between them, capped by the rung's `mercy.crowdBombChanceMax`. */
  crowdBombThreshold: 20,
  crowdBombFull: 45,
  /** HP fraction below which life-saving gear (medkits, plated suits) starts
   * raining harder, and where the boost maxes — the lower the bar, the more of
   * the rung's `mercy.medkitBonus` / `mercy.armorBonus` applies. */
  lowHealthStart: 0.6,
  lowHealthFull: 0.15,
  /** Equipped-weapon durability fraction below which repair kits start dropping
   * more often, and where that boost maxes — scaled by the rung's
   * `mercy.repairBonus`. The unbreakable sidearm never triggers it. */
  lowDurabilityStart: 0.5,
  lowDurabilityFull: 0.1,
  /**
   * How long (ms) the sprint pool must sit BONE-DRY (exactly empty, not merely
   * low) before the stamina-drink drop reaches its full per-kill chance. The
   * boost ramps linearly from zero the instant stamina hits empty up to the
   * rung's `mercy.staminaDrinkChanceMax` at this mark, and resets the moment
   * any stamina returns — so a stranded hero is thrown an energy drink the
   * longer he stays winded, capped at 15% (easy) / 10% (medium). See
   * `staminaDrinkChance` and `GameState.staminaEmptyMs`.
   */
  staminaEmptyDrinkRampMs: 6000,
  /**
   * ONE ROPE AT A TIME — how near (world px) an un-collected rescue pickup
   * must lie for its mercy signal to hold fire. While the medkit, repair kit,
   * drink, screen-nuke, or plated suit a signal already threw is still waiting
   * within this radius, that signal drops nothing more (see
   * `mercyRescueWaiting`) — a hero who parks at low health is not buried under
   * medkits he never picks up. Matches `ENEMY_AI.nearRadius` (the "on screen"
   * yardstick) so a rescue counts as waiting exactly while the player can see
   * it; one left behind out of view stops suppressing, and the rope comes
   * again.
   */
  rescueRadius: 340,
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

/**
 * COMPANIONS — the recruited party (see companions.ts). A spareable unique
 * (`EnemyDef.spareable`) beaten to 0 hp offers the SPARE-or-KILL choice;
 * spared, it joins the hero as a companion: follows him, fights with its own
 * equipped weapon, wears a helmet and chest piece (never legs or feet), and
 * rides the loadout to the next level. Companions are beaten DOWN, never
 * killed — at 0 hp one kneels out of the fight and recovers on its own.
 */
export const COMPANIONS = {
  /** How far behind the hero the formation point sits (world px). */
  followDistance: 34,
  /** Sideways gap between companions in the follow formation (world px). */
  spacing: 24,
  /** Companions only engage foes within this distance of the HERO (world
   * px) — the party fights around him, it never runs off to clear the map. */
  engageRadius: 230,
  /** Beyond this distance from the hero a companion abandons its target and
   * regroups (world px). */
  leashRadius: 320,
  /** Left further behind than this (world px, off-screen at phone zoom), a
   * companion slips through the noise and rejoins the formation outright —
   * a party member, never an escort quest. */
  catchUpDistance: 420,
  /** A companion holds at this share of its weapon's range, like the bots. */
  holdFraction: 0.75,
  /** How many foes a companion's melee swing may cleave at once. */
  meleeTargets: 2,
  /**
   * Global scale on a companion's weapon damage — the party fights at the
   * looted-weapon damper (WEAPON.damageMult's sibling) so a recruited elite
   * supports the hero instead of clearing the field for him.
   */
  damageMult: 0.5,
  /** Companion damage grows with the hero's level (they train together). */
  damagePerLevel: 0.04,
  /** Companion max hp grows with the hero's level, same rationale. */
  hpPerLevel: 0.1,
  /** Ms a downed companion kneels before getting back up on its own. */
  reviveMs: 12_000,
  /** Fraction of max hp a companion stands back up with. */
  reviveHpFraction: 0.5,
  /** Chance a companion's kill floats one of its def's `killQuotes`. */
  quoteChance: 0.35,
  /** Minimum ms between one companion's quotes — banter, not a ticker. */
  quoteCooldownMs: 6_000,
} as const;

/** Locked doors (LevelDef.doors), opened by story-item keys. */
export const DOORS = {
  /** Carrying the key within this distance of the door slides it open. */
  openRadius: 40,
} as const;

/**
 * Gravity wells — black holes placed by a level (LevelDef.wells). Each well
 * drags whatever crosses its pull radius toward the core: the grounded
 * player (a jump sails clean over the pull, same rule as enemy contact),
 * enemies, and loose items — which pile up on the rim instead of being
 * destroyed, a dare to dash in. A MINION dragged into the core is devoured
 * outright: off the board with no kill, no XP and no loot — the hole pays
 * nobody. Elites and bosses are too massive to swallow (their set pieces
 * survive a bad camp spot) and apparitions too immaterial; both only suffer
 * the drag. A player in the core burns hp at `coreDps`, ticked every
 * `tickMs`. These are the per-well DEFAULTS — a level's well spec may
 * override each number. Units: world px, world px/s, hp/s, ms.
 */
export const WELLS = {
  /** Reach of the pull. */
  pullRadius: 130,
  /** Inside this the hole devours minions and burns the player. */
  coreRadius: 16,
  /**
   * Peak pull at the core's edge (px/s), falling off linearly to 0 at
   * `pullRadius`. Deliberately above the hero's base walk (PLAYER.speed 56):
   * the outer band is a lean he can walk out of, the inner third a genuine
   * fight — SPEED, the sprint, or a jump is what gets him clear.
   */
  pullSpeed: 96,
  /** Hp per second burned while the player stands in the core. */
  coreDps: 40,
  /**
   * Core damage lands in ticks of this cadence (one `playerHurt` per tick,
   * not per frame, so the flash and sfx read as a burn, not a buzzer).
   */
  tickMs: 250,
  /**
   * Dragged items park this far from the center — just outside the core, so
   * the loot hoard on the event horizon is grabbable at a price.
   */
  itemRestRadius: 22,
} as const;

/**
 * Asteroids — the flying rocks a level turns on with LevelDef.asteroids.
 * Each spawns on a ring just past the phone screen edge (the enemy-spawn
 * rationale), streaks across the player's surroundings with a little aim
 * scatter, shoves minions out of its path without hurting them, and takes a
 * difficulty-scaled bite of the player's MAX hp once on contact (the fraction
 * is DifficultyDef.asteroidDamageFrac, 20%→75% up the ladder) — jumping (z
 * above JUMP.dodgeHeight) sails over a rock exactly like it clears enemy
 * contact. Rocks ignore obstacles and level bounds (nothing in the void stops
 * one) and despawn once they have left the player's stage. Units: world px,
 * px/s.
 */
export const ASTEROIDS = {
  /** Spawn distance from the player — just past the screen edge. */
  ringDistance: 240,
  /** Aim scatter around the player (px): rocks threaten, they don't home. */
  targetJitter: 110,
  /** Flight speed, rolled per rock (px/s). */
  speed: [110, 190] as [number, number],
  /** Collision radius, rolled per rock (px). */
  radius: [8, 13] as [number, number],
  /** Rocks in flight are capped here; the spawner defers above it. */
  maxAlive: 5,
  /** A rock this far from the player despawns — it has left the stage. */
  despawnDistance: 640,
} as const;

/**
 * Apparitions — dialogue-only figures (EnemyDef.apparition). One seeks the
 * player out for its scene like any elite speaker, but nothing in the world
 * touches it (weapons, abilities, hazards) and its own touch is cold air.
 * Once its scene has played it walks off and dissolves.
 */
export const APPARITION = {
  /**
   * Ms between the scene ending and the figure leaving the board (the
   * renderer reads the enemy's `vanishMs` against this for the fade-out).
   */
  lingerMs: 2600,
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

/**
 * The WANDERING MERCHANT (see merchant.ts): a lone trader who roams every
 * level, ignored by the horde. Until the hero meets him he drifts between
 * short wander legs; the first close-up ENCOUNTER (within `discoverRadius`,
 * in line of sight) roots him to the spot for the rest of the run, pins him
 * on the level map, and stocks his shop against the hero he just met.
 * Tapping him within `tradeRadius` opens the shop (the `shop` phase — the
 * world freezes like the bag). Units: world px, px/s, ms.
 */
export const MERCHANT = {
  /** Body radius (collision vs obstacles, and the tap target's core). */
  radius: 10,
  /** Wander pace — a stroll, well under the hero's walk (PLAYER.speed 56). */
  speed: 26,
  /** Each wander leg heads this far from where he stands, rolled per leg. */
  wanderRange: [50, 150] as [number, number],
  /** Pause between wander legs, rolled per pause. */
  idleMs: [900, 2800] as [number, number],
  /** Spawns at least this far from the player spawn — he is met, not given. */
  minSpawnDistance: 400,
  /**
   * Meeting distance: within this (and in line of sight) the merchant is
   * DISCOVERED — he stops wandering for good and his stall pins the map.
   * Inside the phone half-view (≈211×97), same rationale as speakRadius.
   */
  discoverRadius: 90,
  /** The shop only opens with the hero this close — walk up to trade. */
  tradeRadius: 52,
  /**
   * The merchant's WARD: monsters cannot come closer to him than this —
   * about two mob-widths — so his stall never drowns in the horde and the
   * hero can always reach the counter. Bosses are too massive to shoo and
   * apparitions too immaterial; everything else is pushed out to the rim.
   */
  repelRadius: 40,
  /** Weapons on the stall (rolled at discovery, one-off purchases). */
  stockWeapons: 2,
  /** Powerups on the stall (restocked — buy as many as you can afford). */
  stockAbilities: 3,
  /** Tier-roll bonus on the stall's weapons: merchant stock skews magic+,
   * like Diablo 2's gamble screen. */
  stockTierBonus: 0.35,
} as const;

/**
 * The COIN ECONOMY the merchant trades in. Coins enter the run one way —
 * selling loot to a discovered merchant — and leave it on his powerups and
 * weapons, so the economy is a loot-recycling loop, not a faucet.
 *
 * An item's SELL VALUE is `(itemBase + itemPerIlvl · ilvl) × tier × material`:
 * the item's LEVEL carries the base worth (a deep find genuinely sells
 * higher), the TIER multiplies it by ORDERS OF MAGNITUDE (a magic item is
 * worth 10× a regular, a rare 100×, …), and the MATERIAL sweetens it — METAL
 * items melt down for double, PRECIOUS ones (gold, gems, the genuinely
 * magical) fetch four times. BUY prices hang off the same scale: a stall
 * weapon costs its own sell value × `weaponBuyMarkup` (≈ selling a few magic
 * items, ×10 — the Diablo 2 vendor gap), and powerups are priced off the
 * hero's level so they stay a meaningful spend all campaign.
 */
export const ECONOMY = {
  /** Flat floor of an item's worth, in coins. */
  itemBase: 2,
  /** Coins of worth per point of the item's level (ilvl). */
  itemPerIlvl: 1,
  /** The tier ladder in coin terms — each rung an order of magnitude. */
  tierValueMult: {
    regular: 1,
    magic: 10,
    rare: 100,
    unique: 1_000,
    legendary: 10_000,
  } as Record<"regular" | "magic" | "rare" | "unique" | "legendary", number>,
  /** Metal items melt down: worth double (see EquipmentDef.material). */
  metalMult: 2,
  /** Precious items (gold, gems, true magic) fetch four times. */
  preciousMult: 4,
  /** A stall weapon costs its own sell value × this — the vendor's cut. */
  weaponBuyMarkup: 10,
  /** A stall powerup's price: base + perLevel × the hero's level. */
  abilityBase: 40,
  abilityPerLevel: 12,
} as const;

/** The level map and its fog of war (see map.ts). */
export const MAP = {
  /** Fog-of-war grid cell size (world px). Coarse on purpose: the map reads
   * as chunky pixel terrain, and the whole grid stays a few thousand cells
   * even on the widest level. */
  cellSize: 32,
  /** Radius around the hero uncovered as he moves (world px) — roughly what
   * the phone view shows around him, so "walked past it" ≈ "on the map". */
  revealRadius: 120,
} as const;
