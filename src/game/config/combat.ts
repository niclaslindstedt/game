// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon combat: global weapon cadence/damage levers, knockback, mouse aim,
// projectiles, the melee cleave, the magic crit blob, and the hit/dodge rolls.

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
   * CRIT WEIGHT BY CLASS: a weapon's crit-damage multiplier is a flat base set
   * by its class — physical (melee & ranged) crit for `STATS.critMultiplier`
   * (×2), magic for the softer `STATS.magicCritMultiplier` (×1.5). Weapons
   * carry NO per-weapon crit stat; the class base is the whole of it at zero
   * stats. STRENGTH then deepens a MELEE crit and INTELLIGENCE a MAGIC one
   * (`STATS.critDamagePerStr` / `critDamagePerInt`) — the crit half of the
   * damage-budget model reads the class base (`baseCritMult`), so a magic
   * weapon's softer base buys it more per-hit budget in exchange, and the
   * stat scaling rides free on top as the build's own payoff. The magic
   * single-target crit BLOB (`MAGIC_CRIT`) is INT's other crit reward.
   */
  /**
   * MELEE AoE TARGET MODEL — CALIBRATED and REACH-AWARE. How many foes a melee
   * swing reaches, as a function of its SWEPT SECTOR AREA (½·arc·reach², world
   * px²) — NOT the cone angle alone:
   *
   *   targets(area) = intercept + gain · (1 − e^(−area / scaleArea))   (clamped ≤ targetCap)
   *
   * The per-hit damage the damage-budget model authors is DIVIDED by this (an
   * AoE weapon spreads its budget across the crowd it reaches), and the
   * auto-equip ranking credits the same count.
   *
   * The FIRST calibration swept only the ARC at a fixed reach and found it
   * barely mattered (~1.2 → ~1.85), because only ~2 bodies fit within a SHORT
   * blade's reach. But once STRENGTH began driving melee REACH (`rangePerStr`),
   * a reach sweep (`scripts/aoe-calibration.mjs --reach`, 20k+ swings across an
   * arc×reach grid) showed reach is the DOMINANT lever: the swept sector's area
   * grows with reach², so a deep high-STR swing threads 6–9 foes where a shallow
   * one hits 1–2. Pricing every melee weapon at the old flat ~1.85 quietly let a
   * high-level long-reach weapon deliver several times its intended budget
   * against a crowd. This model prices a weapon at the crowd it REALLY reaches AT
   * THE REALISTIC BUILD STATS FOR ITS LEVEL (`weaponAssumedTargets` derives the
   * hero's likely STR/INT at the weapon's `levelReq` — see `meleeBudgetTargets`).
   *
   * `intercept` 1.1 (the floor — even a pinpoint cone lands its locked target),
   * `gain` 9 / `scaleArea` 50000 fit the measured sub-cap curve. `targetCap` 4
   * is a DESIGN clamp (the honest curve keeps climbing past it): beyond ~4 we
   * stop crediting extra reach, so endgame melee keeps a viable per-hit blow
   * against a LONE boss instead of becoming a pure crowd-clearer (per-hit ÷9).
   * The clamp binds around level ~60. Both the budget and the ranking read it.
   */
  meleeAoe: { intercept: 1.1, gain: 9, scaleArea: 50000, targetCap: 4 },
  /**
   * RANGED AoE TARGET MODEL — the calibrated realized count for PIERCE and CHAIN
   * (the ranged sibling of `meleeAoe`). The AoE calibration
   * (`scripts/aoe-calibration.mjs --ranged`, 55k+ real volleys) measured how
   * many DISTINCT foes a trigger pull reaches:
   *
   *   pierce:  1 + pierce · piercePerHit   (measured ~0.5 distinct foes/pierce)
   *   chain:   1 + chain  · chainPerHit    (measured ~0.7 distinct foes/leap)
   *
   * A pierce shot threads a LINE and a chain LEAPS between bodies — neither
   * stacks on one foe, so distinct-foes IS their damage value, and the old
   * `1 + pierce` / `1 + chain` over-credited them (a pierce-3 hits ~2.4, not 4).
   * They are still the RELIABLE ranged AoE (60–90% of credit) — far better than
   * a SPREAD, which the calibration found reaches only ~1.8 DISTINCT foes
   * however many pellets it fans. But a spread is NOT re-priced here: its pellets
   * STACK on one body at point-blank (a burst of the full `count` on a lone foe)
   * as readily as they spread across a crowd, so the raw `count` is the honest
   * value credit (distinct-foes undersells the burst). Spread stays `count` (see
   * `rangedShotTargets`); only pierce/chain read this.
   */
  rangedAoe: {
    piercePerHit: 0.5,
    chainPerHit: 0.7,
    /**
     * AUTO-EQUIP RANKING damp for a SPREAD (RANKING only, not the budget). A
     * spread's `count` is its point-blank BURST value, but that burst is
     * SITUATIONAL — against a lone tough foe at range its pellets fan wide and
     * only one or two connect — so the auto-equip credits a spread only
     * `1 + (count − 1) · this` when deciding whether to swap, and never drops a
     * reliable single-target/pierce weapon for a spread on a paper tie it can't
     * cash against a boss. Pierce/chain rank at their full (already realistic)
     * calibrated count.
     */
    spreadRankDamp: 0.5,
  },
  /**
   * LANE AFFINITY — how much the auto-equip ranking (`weaponScore`) favours a
   * weapon of the class the hero has COMMITTED to (his deepest required
   * attribute, `committedLane`). An on-lane weapon's score is multiplied by
   * this; off-lane weapons stay at 1×, so a marginally higher-DPS OFF-lane find
   * can't yank a speccing hero off his blade (or his gun) and thrash the whole
   * build — it must clear the on-lane weapon by this margin to win the slot.
   * Two on-lane weapons compare unchanged (both scaled), and a hero stranded on
   * an off-lane starter still upgrades to his on-lane weapon the moment one
   * drops. 1 = no bias (pure DPS, the old behaviour).
   */
  laneAffinity: 1.3,
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
  /**
   * ITEM-LEVEL damage growth — the weapon half of `ARMOR.armorPerIlvl`: a
   * rolled weapon's damage grows by this fraction per item level ABOVE its
   * base's `levelReq` (a base's catalog damage is its value at its own req).
   * Zero at the req itself, so the catalog and the damage-budget model
   * (`scripts/weapon-budget.mjs`) are untouched; only deep finds grow. Kept
   * at a third of armor's rate — damage compounds with stats, crit, and
   * cadence where armor only sums, so a gentler slope keeps a +20-ilvl find
   * a real edge (~+40%) rather than a doubling. Applied in `weaponDamageFor`
   * (the one source of stat-scaled damage), so combat, auto-equip scoring,
   * the item card, and `heroDamageLevel`'s power read all move together —
   * the menace system automatically prices a hot deep find into the horde.
   */
  damagePerIlvl: 0.02,
} as const;

/**
 * KNOCKBACK — a landing MELEE or RANGED weapon blow of the hero's own shoves
 * the struck mob a little straight back, away from him, so a swing or a shot
 * buys ground and kiting the horde gets that bit easier. It is a RARE weapon
 * SIGNATURE (the `knockback` affix), not a universal rule: only a handful of
 * authored uniques/legendaries/artifacts carry it — an overpowered stat kept
 * scarce — so most weapons never push at all (see `applyKnockback`, gated on
 * `heroHasKnockback`). Magic weapons DON'T knock back whatever they carry (INT
 * keeps its crowd control in the AoE cleave, the crit blob, and granted
 * spells). It only nudges survivors: a killing blow is handled by the corpse
 * launch, and a mob about to die isn't moved. The shove is a flat world-px
 * displacement (not an impulse that decays), so repeated hits keep a chased
 * pack at arm's length without ever launching it. Units: world px. The
 * developer BALANCE › KNOCKBACK knob scales `distance` live (0× off, 1× this
 * shipped baseline, up to 100×).
 */
export const KNOCKBACK = {
  /** World px a struck mob is pushed directly away from the hero per landing
   * melee/ranged blow of a KNOCKBACK weapon, at the neutral (1×) knob. A few
   * px: noticeable over a fight, never a launch — a body slid ~a third of the
   * pack-separation each hit. The single magnitude every knockback weapon
   * shares (the affix is a marker, not a per-weapon value). */
  distance: 10,
  /**
   * The fraction of the shove each ENEMY ROLE actually takes — heavier set
   * pieces plant their feet. A `minion` (the horde) takes the full push; an
   * `elite` half of it; a `boss` is anchored to its post and shrugs it off
   * entirely, so a telegraphed charge or slam is never nudged off its mark by
   * the hero chipping at it.
   */
  roleScale: { minion: 1, elite: 0.5, boss: 0 } as Record<
    "minion" | "elite" | "boss",
    number
  >,
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

/**
 * THE MAGIC CRIT BLOB — a magic weapon's single-target crit doesn't just hit
 * harder, it BURSTS: the struck foe detonates a small arcane blob that splashes
 * the nearest few others for a share of the blow. INTELLIGENCE grows both the
 * blob's reach and how many it can catch, so horde-clearing magic is an INT
 * investment the way the melee cleave is — but the base stays SMALL and firmly
 * capped on purpose. Big screen-shaping AoE is the province of unique and
 * legendary item powers (the granted spells and procs), not this baseline
 * reward. Only the hero's OWN direct weapon crits blob (a chain leap, a proc,
 * a companion's shot never does), and the blob's own splash can't blob again.
 */
export const MAGIC_CRIT = {
  /** Blob radius (world px) at zero INTELLIGENCE. Kept well under the nova
   * proc's 56 — a tight burst around the victim, not a screen-wipe. */
  blobRadius: 18,
  /** Extra radius per INT point, capped at `blobRadiusMax`. */
  blobRadiusPerInt: 0.6,
  blobRadiusMax: 34,
  /** Foes the blob splashes BESIDES the crit victim, at zero INT / added per
   * INT point (fractional — ~1 more per 16 INT), capped at `blobTargetsMax`.
   * The cap is the wall that keeps this from ever clearing a horde. */
  blobTargets: 1,
  blobTargetsPerInt: 0.06,
  blobTargetsMax: 4,
  /** The blob's damage as a fraction of the pre-crit blow that spawned it —
   * a splash, not a second full hit. */
  blobDamageFrac: 0.45,
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
