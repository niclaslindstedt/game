// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL gameplay tuning — the rules that hold across every level. Per-level
// content (geometry, gravity, spawns, loot pools) lives in defs/levels.ts;
// the enemy and equipment catalogs live in defs/enemies.ts and
// defs/equipment.ts. Units: world pixels (one sprite pixel = one world unit
// at scale 1), milliseconds, hit points.

import type { ArmorType, Difficulty, StatName, WeaponClass } from "./types.ts";

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
  /**
   * Contact-damage reach as a fraction of the touching distance (the sum of
   * the attacker's and the hero's collision radii). At 1 a blow lands the
   * instant the two bodies' circles graze; below 1 the enemy must press
   * genuinely INTO the hero — the circles have to overlap — before it bites.
   * Kept a touch under 1 so a sidestep at the last moment is a clean escape
   * rather than a graze that still connects; the same tightened reach governs
   * where an elite/boss rush settles (see step.ts) so the closer they must get
   * to hurt is exactly how close they close. Collision, obstacle, projectile,
   * and pickup radii are untouched — this shrinks only the damage hitbox.
   */
  contactReachMult: 0.85,
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
   * AUTO-EQUIP AoE realization: how much of a RANGED multi-projectile weapon's
   * assumed target count (pellets, pierce, chain — see `weaponAssumedTargets`)
   * the auto-equip ranking (`weaponScore`) credits beyond its first, guaranteed
   * hit. Unlike a melee sweep — which reliably strikes everything in its arc in
   * the close press of the horde, and is credited at the count INTELLIGENCE can
   * realize (`maxMeleeTargets`) — a ranged spread is CONDITIONAL: a shotgun's
   * pellets fan across their arc and, in the sparse field that is the common
   * case, overlap on one foe instead of splitting cleanly across four. So its
   * budget-authored 4× is potential, not a promise. `weaponScore` credits
   * `1 + (assumed - 1) * aoeRealization`, so a spread weapon must genuinely
   * out-budget the held one to displace it rather than sidegrade in on a paper
   * tie that its per-target damage — far lower by design — can't cash against a
   * single tough target. Tunes RANKING only; the budget-authoring assumption
   * (`weaponAssumedTargets`, used by the balance scripts) is untouched.
   */
  aoeRealization: 0.5,
  /**
   * The MELEE sibling of `aoeRealization` — the target count a cone / full
   * sweep is credited in the auto-equip ranking (`weaponScore`), damped BELOW
   * the budget-authoring `assumedTargets` (cone 4 / full 5). A sweep does
   * reliably strike its arc in the close press, but crediting the full budget
   * assumption let a light cone cleaver (per-hit damage a quarter of a
   * single-target's, by design) out-rank a heavier weapon it loses to against
   * anything but a packed line — so a low-damage baton would auto-equip over a
   * genuinely stronger single-target starter on a paper tie. The ranking now
   * credits these damped counts instead, still capped by the INT cleave
   * (`maxMeleeTargets`). Tunes RANKING only; the budget assumption
   * (`weaponAssumedTargets`, used by the balance scripts) is untouched.
   */
  meleeAoeRealized: { cone: 2.5, full: 3.5 },
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
   * shoulder, 0.5 = bodies squeeze halfway into each other). Loose packing is
   * a deliberate design choice: a kited horde bunches into one tight clump the
   * player can lure together and finish off with a high-INT AoE weapon —
   * overlapping bodies are the whole point, not a defect. The single knob to
   * turn if packs feel too loose or too tight.
   */
  overlapFraction: 0.5,
  /**
   * A minion counts toward the wave floor (waves.minAlive) only within this
   * distance of the player — parked spawns on the far side of the map must
   * not satisfy "there's a pack on screen".
   */
  nearRadius: 340,
  /**
   * SMARTER MOBS up the ladder — FLANKING: from this difficulty INDEX
   * (hard = 3) a chasing minion steers toward a point rotated off the direct
   * player bearing, each mob to its own deterministic side, so the pack
   * ENVELOPS instead of forming a straight-line conga the hero mows down a
   * rank at a time. The rotation eases out as the mob closes (it converges
   * on the player for the bite) — see `flankTarget` in step.ts.
   */
  flankFromIndex: 3,
  /** The flank rotation at full distance (degrees off the direct bearing). */
  flankAngleDeg: 35,
} as const;

/**
 * CAMPING PRESSURE — the anti-farm rules layered over the wave spawner (see
 * stepSpawner). A player who parks in one spot stops being fed: after a grace
 * period the horde loses interest — the live floor AND the timed budget stream
 * fade out, the field drains, and the only arrivals left are a slow BECKONING
 * trickle walking in from the direction of the objective (the living boss, or
 * the nearest remaining elite), luring the player onward. Moving again resets
 * the camp clock and the flood resumes — the deferred budget was never
 * canceled, only held. And once a killBoss level's wave budget is fully spent,
 * a thin endless STRAGGLER stream keeps arriving from that same objective
 * direction, so the map never goes dead-empty on the walk to the boss
 * (clearAll levels stay finite — they must be clearable). Units: world px, ms.
 */
export const CAMPING = {
  /** The player counts as camped while staying within this radius of where he
   * last settled; stepping outside it re-anchors and resets the clock. Sized
   * to most of a phone screen: kiting a wave around one arena is normal
   * fighting, not camping — only genuinely holding the same ground counts. */
  campRadius: 160,
  /** Camping is free for this long — the fight comes to him as usual. A
   * generous grace: a pitched minute-long battle on one screen is the game
   * working, and the starvation must never bite it. */
  graceMs: 45_000,
  /** …then the floor and the budget stream fade to nothing over this window. */
  fadeMs: 15_000,
  /** While starved, one beckoning mob arrives this often (from the objective
   * direction, drawn from the normal wave budget). */
  beaconEveryMs: 2_800,
  /** Half-angle (deg) of the arrival cone around the objective bearing — the
   * trickle reads as a stream from ONE direction, not a ring. */
  directionSpreadDeg: 60,
  /** Cadence of the endless post-budget straggler stream (killBoss levels). */
  stragglerEveryMs: 4_000,
  /** Stragglers only arrive while fewer minions than this are near the player
   * — a thin stream that keeps the walk alive, never a second flood. */
  stragglerMinAlive: 8,
} as const;

/**
 * NUKE AFTERMATH — the screen-nuke is a PANIC BUTTON, so its blast must buy
 * real breathing room, not just a redrawn screen. Without this the live floor
 * refills the ring the instant the pack dies (see stepSpawner) — the cleared
 * mobs "reset to the outer skirts" and, if a swarm had heated the meter, come
 * back EVOLVED — so the bomb that was meant to save you doomed you instead. The
 * aftermath fixes both halves: `calmMs` holds every spawner refill after a
 * detonation so the field stays clear long enough to break contact and lose the
 * pack, and the transient menace heat is cooled to the earned permanent floor
 * (the ratchet the player's own overkill locked in still stands) so the horde
 * that eventually returns is no denser or tougher than the run's baseline. Then
 * `recoverMs` eases the near-floor back from empty to full so the swarm WALKS
 * back in at the normal rate instead of snapping onto the player in a single
 * frame the instant the calm ends. Ms.
 */
export const NUKE = {
  /** The blast's damage, expressed as a multiple of the MEAN current hp of
   * every monster it catches on screen. At 2 (200%) it wipes the rank and file
   * — anything at or below twice the average — outright while only chunking the
   * far heavier elites and bosses, so a lone set-piece foe still has to be worn
   * down by hand. The blow rolls a crit like any other, so a lucky bomb bites
   * deeper. Applied in `detonateNuke`. */
  meanHpDamageMult: 2,
  /** How long the spawner holds all refills after a nuke — long enough to run
   * out of the cleared screen and shake the pursuit, tuned to the phone view. */
  calmMs: 4_000,
  /** After the calm, the live near-floor ramps 0→1 back to full over this
   * window rather than refilling to `minAlive` in one frame — so the bomb's
   * breather tapers into the normal horde instead of dumping the whole floor's
   * worth of mobs on the player at once. */
  recoverMs: 3_000,
} as const;

/**
 * PLACED PACKS — the level-design counter to the survivors-style horde (see
 * stepPacks). A pack is a fixed cluster of monsters pinned to a spot on the
 * map that sleeps until the player walks near it: closing to `triggerRadius`
 * of the anchor spawns the pack's members in a ring around it and they give
 * chase at once; killing every member CLEARS that patch of ground. Where the
 * wave spawner funnels the whole level to a camper standing still, packs
 * reward MOVEMENT — the map is cleared by walking it, one encounter at a
 * time. Distances are world px. Per-pack overrides live on the LevelDef.
 */
export const PACKS = {
  /** How close (world px) the player must get to a pack's anchor before it
   * wakes. Sized to about a phone screen-width ahead so the cluster boils up
   * as the player advances into it, not while it is still off-screen. A pack
   * may override this with its own `triggerRadius`. */
  triggerRadius: 260,
  /** Members spawn scattered within this radius of the pack anchor — a tight
   * knot the player meets as one group, not a thin ring around himself. A
   * pack may override with its own `spawnRadius`. */
  spawnRadius: 120,
  /** Rejection-sampling attempts per member to find a spawn spot inside the
   * scatter radius that clears obstacles and the map edge before giving up
   * and placing it on the anchor. */
  placeAttempts: 12,
} as const;

/**
 * SPAWN POINTS (`LevelDef.spawners` / spawners.ts): the FINITE, LOCAL horde
 * model — the alternative to the endless `waves` stream. A spawner sleeps at a
 * spot until the hero closes to `triggerRadius`, then EMITS its authored mob
 * count a few at a time (`perEmit` every `intervalMs`) until it DRAINS empty —
 * one readable wave the hero can clear and walk away from. A spawner may CHAIN
 * off another (`after`): it arms `chainDelayMs` after that one drains, but only
 * while the hero is still in range — so pressure follows him without an infinite
 * refill. The design lever for a level that can actually be CLEARED (and, in a
 * maze, traversed without a bottomless bog). Counts scale with difficulty
 * (`scaledMobCount`). These are the defaults; each spawner may override them.
 */
export const SPAWNERS = {
  /** How close (world px) the hero must get to arm a spawner — about a phone
   * screen-width ahead, so a wave boils up as he advances into it. */
  triggerRadius: 300,
  /** Emitted mobs scatter within this radius (world px) of the spawn point. */
  spawnRadius: 110,
  /** Time (ms) between emission ticks while a spawner drains. */
  intervalMs: 650,
  /** Mobs released per emission tick. */
  perEmit: 3,
  /** Per-point CONCURRENT-ALIVE CAP: the most of a point's own live members it
   * lets stand at once. While the field is full it PAUSES, then drips a fresh
   * batch to REPLACE each kill — holding steady local pressure instead of
   * dumping its whole queue in a pile. The queue still drains (and the point's
   * chain still follows) as the hero grinds the cap down. */
  maxAlive: 14,
  /** Default delay (ms) after a spawner drains before a chained one arms —
   * only counted while the hero is in the chained spawner's trigger range. */
  chainDelayMs: 4000,
  /** Rejection-sampling attempts per mob to find a spot clear of obstacles and
   * the map edge before falling back to the anchor. */
  placeAttempts: 12,
} as const;

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
  /**
   * WoW-STYLE LEVEL-DIFFERENCE XP — a kill's base (level-priced) XP is scaled by
   * how the mob's level compares to the HERO's (see `levelDiffXpMult` in
   * leveling.ts, applied inside `mobLevelXp`). A mob ABOVE the hero pays a bonus
   * (`+xpAbovePlayerPerLevel` per level, capped at `xpAboveMaxMult`); a mob
   * BELOW pays a penalty (`−xpBelowPlayerPerLevel` per level) that bottoms out at
   * ZERO (the "grey" mob, `1 / xpBelowPlayerPerLevel` levels under). A mob AT the
   * hero's level is neutral (×1), so the kills-per-level curve — authored against
   * a same-level reference mob (`referenceMobXp`) — is unchanged; the multiplier
   * only bites where the difficulty's mob-level CAPS push the horde off the
   * hero's level (a floored nightmare/jesus mob pays a bonus; an out-levelled,
   * ceiling-stuck easy mob pays a pittance). Tunable at runtime with the
   * BALANCE › REST XP slider (scales both slopes together).
   */
  xpAbovePlayerPerLevel: 0.08,
  xpBelowPlayerPerLevel: 0.07,
  /** Ceiling on the above-level XP bonus multiplier — a mob far above the hero
   * pays richly, but not without bound. */
  xpAboveMaxMult: 1.5,
  /**
   * Elite and boss kills pay XP as a SHARE OF THE HERO'S CURRENT LEVEL BAR —
   * a flat fraction of `xpToLevelUp(player.level)` — rather than the
   * hp-proportional rule the rank and file ride (`xpPerHp`). A set-piece kill
   * is meant to visibly LURCH the bar (the "boss = a real chunk of a level"
   * reward), and only a bar-share does that CONSISTENTLY across every map and
   * difficulty: a flat number tuned for the first easy encounter would collapse
   * to a rounding error by the time the same elite is re-fought fifty levels
   * later, and an hp-proportional reward swings wildly between a squishy moon
   * elite and a bunker bullet-sponge. Reading the live level instead makes the
   * lurch the same 12%/20% wherever and whenever the elite/boss dies — and
   * because it flows through `grantXp`, the per-map XP cap still fades it to
   * nothing on an outgrown replay, so boss farming never over-levels the hero.
   * A def may override its own share with `EnemyDef.xpBarShare` (the shielded
   * grok trio each pay less, being a three-part guardian gauntlet). Elites aim
   * at the 10–15% "noticeable move" band; bosses deliberately reach past it as
   * the campaign's climactic kills.
   */
  eliteXpBarShare: 0.12,
  bossXpBarShare: 0.2,
  /**
   * The hard level cap — a Diablo-style ceiling. Once a hero hits it, XP stops
   * banking levels (the bar pins full) and the endgame becomes the hunt for
   * cap-level gear rather than the next ding. Enforced in `grantXp` (loot.ts).
   */
  maxLevel: 99,
  /**
   * The level curve is authored in KILLS PER LEVEL, not raw XP, so pacing is
   * legible and stays put no matter how the horde's hp scales. `xpToLevelUp`
   * (leveling.ts) sets each level's cost to `killsPerLevel(L) × a reference
   * mob's XP at L`, where the reference mob's toughness mirrors `mobHpScaleFor`
   * (the flat per-level ramp × the auto-stat damage curve). Because the SAME
   * `autoPowerScale` sits in both the cost and the mobs' hp, it cancels: the
   * kills a level takes are invariant to the auto-stat dev flag and to how much
   * the hero's damage grows — only the difficulty's mob-level offset nudges it.
   * The count rises with level on a gentle geometric, so leveling tapers from
   * ~10–20/day early to ~2/day near the cap.
   *
   * The base/growth are tuned against a FULL CLEAR (kill the whole roster, no
   * deaths) so the caps are ceilings the hero lands UNDER, not targets: on the
   * CRITICAL PATH — one bottom lane (easy/medium/hard) → nightmare → jesus,
   * three playthroughs, not five — a full clear leaves the hero at ~33/35/36
   * (easy/medium/hard), ~51 after nightmare (entering at ~34), and ~69 after
   * jesus (entering at ~56), each UNDER that tier's XP cap (40 / 58 / 70), then
   * the steep endgame grind to the cap. The bottom lanes DIFFER on purpose
   * (medium/hard field bigger, higher-level hordes than easy — `mobCountMult` ×
   * the difficulty `mobLevelOffset` — so their clears pay more XP and land a
   * level or two higher). The upper tiers level SLOWER by design: `xpToLevelUp`
   * charges nightmare/jesus `tierLevelCostStep` more per level (compounding per
   * tier), and past level 70 `endgameSteepenRate` walls the curve up — so it
   * takes "longer and longer" the deeper you go. Read the per-map full-clear
   * landings off `node scripts/leveling-curve.mjs --by-level --clear-share 1`
   * (a full clear; the default 0.5 models a half clear; `--tier-entry` sets the
   * nightmare/jesus entry levels). XP_CAP bands, the WORLD_DROP gates, and every
   * level's arrowCapByDifficulty are sized off that table; `--start <lane>`
   * checks each bottom lane. Real play (a PARTIAL clear) lands the hero under
   * these full-clear numbers — under the caps by even more, which is the design
   * intent. Whenever base/growth, the tier knobs, or the roster move, re-run the
   * view and re-read the caps/gates; don't tune by feel.
   */
  killsPerLevelBase: 150,
  killsPerLevelGrowth: 1.041,
  /**
   * PER-TIER LEVELING SLOWDOWN — one of the two "endgame is harder" knobs (both
   * runtime-tunable on the DEVELOPER › BALANCE page). Each difficulty TIER above
   * the three bottom lanes (easy/medium/hard, which share tier 0) makes every
   * level cost this fraction MORE XP, COMPOUNDING per tier: nightmare (tier 1)
   * costs `×(1 + step)`, jesus (tier 2) `×(1 + step)²`. At the shipped 0.15 a
   * level on nightmare takes 15% more time than the same level on a bottom lane,
   * and jesus ~32% more — so it takes "longer and longer" the deeper you go. The
   * tier is `difficultyDef.index − 3` floored at 0; applied in `xpToLevelUp`
   * keyed on the run's difficulty (so the bar, the arrow/boss bar-shares, and
   * the kills-per-level all move together). 0 makes every difficulty level
   * alike. Turn it with the BALANCE › LEVEL SLOWDOWN slider (scales this step).
   */
  tierLevelCostStep: 0.15,
  /**
   * ENDGAME STEEPENING — the second "harder" knob. Past `endgameSteepenFrom`,
   * every level costs an extra `endgameSteepenRate` COMPOUNDING on TOP of the
   * base geometric `killsPerLevelGrowth`, so the last stretch to the cap turns
   * into a wall (Diablo 2's 90→99). At the shipped 5%/level from 70, level 80
   * costs ~1.6× and level 99 ~2.6× what the base curve alone would ask. Applied
   * in `xpToLevelUp` for EVERY difficulty (it is the shared level curve). Set
   * the rate to 0 for a pure geometric tail. Turn it with the BALANCE › ENDGAME
   * WALL slider (scales the rate); the threshold stays config-only.
   */
  endgameSteepenFrom: 70,
  endgameSteepenRate: 0.05,
  /**
   * Onboarding ramp: the opening levels cost only a FRACTION of their curve
   * value so the first ding lands in a handful of kills — the level-up, the
   * stat chooser, the golden burn all get shown off in the first minute — and
   * the cost eases up to full by `earlyRampLevels`. `earlyRampStart` is level
   * 1's fraction (≈a tenth, so ~a dozen kills to level 2); it lerps linearly to
   * 1.0 across the ramp, after which the normal slow curve takes over. This
   * only touches the first few levels — the long-game taper is unchanged.
   */
  earlyRampLevels: 6,
  earlyRampStart: 0.025,
  /**
   * The hp of a "typical" rank-and-file minion — the anchor the kills-per-level
   * accounting is stated against, so `killsPerLevelBase` reads as real kills
   * when the hero fights level-appropriate mobs. Keep it near the common wave
   * minions' catalog hp.
   */
  refMobHp: 45,
  /**
   * Trainable stat points a ding grants — the BASE, plus one bonus point
   * per full `statPointsBonusEvery` levels reached (see `statPointsAt` in
   * leveling.ts): 1/ding through the opening, 2 from level 10, 5 at 40,
   * 10 at 99. Later dings pay MORE points on purpose: the level-scaled stat
   * cap (`statCap` in leveling.ts) rises by exactly this grant each ding, so a
   * hero who keeps their main stat maxed stays right at the linear ceiling —
   * the growing grant is what keeps a full SPEC realizing its raw value deep
   * into the campaign, all the way to the `STATS.statHardCap` (250) roof.
   */
  statPointsPerLevel: 1,
  statPointsBonusEvery: 10,
  /**
   * XP granted by a golden arrow pickup, as a fraction of the CURRENT
   * xpToNext AT LEVEL 1 — a share of a level, not a flat sum, so an arrow
   * still triggers dings deep into a run instead of fading into noise. The
   * share is not flat, though: it TAPERS with level (see `arrowXpShareTaper`
   * and `arrowXpShareAt` in leveling.ts) so arrows carry the early game and
   * then quietly recede, letting the kill grind own the long climb to the cap.
   */
  arrowXpShare: 0.25,
  /**
   * How fast the arrow's share of a level decays as the hero climbs: the
   * effective share is `arrowXpShare / (1 + arrowXpShareTaper × (level − 1))`,
   * a harmonic taper from the full share at level 1 toward a thin sliver near
   * the cap (0.1 → ~13% at L10, ~9% at L20, ~2% at L99). Bigger = arrows fade
   * faster. Zero restores the old flat share. The leveling-curve calculator
   * folds this into its arrow accounting (see scripts/leveling-curve.mjs).
   */
  arrowXpShareTaper: 0.1,
  /**
   * The COLD arrow payout, in reference-mob kills. A golden arrow is a
   * CATCH-UP faucet: while the hero is still under the level a normal run of
   * the current map/difficulty leaves him at (`LevelDef.loot.arrowCapByDifficulty`),
   * it pays the share-of-bar above; ONCE HE HITS THAT CAP the arrow goes cold
   * and pays a flat `arrowColdMobXpMult × referenceMobXp(level)` instead —
   * ~5 mob kills' worth, a rounding error against a whole level, so grinding
   * old content can't arrow-boost the hero past where that content belongs.
   * Levels with no cap entry (test fixtures, un-tuned maps) never go cold.
   */
  arrowColdMobXpMult: 5,
  /**
   * Ms the level-up celebration plays before the stat chooser interrupts:
   * the ding's golden burn wreathes the hero, the fanfare rings, the gains
   * tick into the feed — and only then does the modal open. The reward
   * lands before the bookkeeping (the WoW ding moment). The burn renders
   * off `GameState.levelUpFxMs`, which counts this window down.
   */
  dingCelebrationMs: 1000,
  /**
   * Automatic base-attribute growth (WoW-style): crossing into level L
   * grants `round(rate × L)` points of each stat listed here, on its own,
   * underneath the chosen stat points — so every ding is felt in the body,
   * not just in the chooser, and the gain itself grows with the level.
   * Derived from `player.level` (see leveling.ts), never written into
   * `player.stats`: a respec refunds only the CHOSEN points. The horde's
   * hp scaling multiplies by the damage curve these rates produce
   * (`autoPowerScale` folded into `mobHpScaleFor`/`enemyPowerScale`), so
   * automatic growth alone never turns mobs into one-hit kills — chosen
   * points and gear remain what pushes the player ahead of the curve.
   */
  autoGainsPerLevel: {
    stamina: 0.4,
    strength: 0.25,
    dexterity: 0.2,
  },
} as const;

/**
 * PER-MAP XP CAPS — every (level × difficulty) pair has a hero-level ceiling
 * (see `xpLevelCap` in leveling.ts): XP earned on that map diminishes as the
 * hero closes on the cap (halving per level across the last `fadeLevels`) and,
 * past it, drops to a permanent `floor` TRICKLE — never zero, so re-running an
 * outgrown map still creeps the bar forward while it rains LOOT. This is the
 * Diablo rule softened: outleveling a zone throttles its XP to a trickle rather
 * than retiring it outright, so a determined grinder can still crawl toward the
 * global `LEVELING.maxLevel` on an old map, just achingly slowly. Each rung
 * lists the cap on its FIRST and LAST story level; intermediate maps interpolate
 * linearly. Every cap sits at least `fadeLevels` (3) ABOVE where a single FULL
 * CLEAR of that map leaves the hero (the `--by-level --clear-share 1` exit
 * level), so KILLING EVERYTHING ON A MAP ONCE never reaches — never even touches
 * the fade under — that map's cap: the story never starves and a clean clear
 * forfeits ~nothing. Only the RERUN grind, replaying an outgrown map, hits the
 * trickle. The `last` value on each bottom rung is the tier ceiling the player
 * quotes ("to level 40 / 58 / 70"): the three bottom lanes (easy/medium/hard)
 * SHARE the 40 ceiling — they run the same missions over the same band and only
 * differ in how much XP their hordes pay, so a full clear lands each a level or
 * two apart (33/35/36) but all under 40. NIGHTMARE tops at 58, JESUS's early
 * maps at ~68 rising to the global `LEVELING.maxLevel` on its last map — the
 * 67→99 endgame grind lives there.
 */
export const XP_CAP = {
  capByDifficulty: {
    // The per-map soft cap interpolates first (map 1) → last (map 5). The three
    // bottom lanes share the same 40 CEILING (the "to level 40" tier top): a
    // FULL CLEAR lands the hero at ~34 / 36 / 38 (easy/medium/hard), then the
    // last few levels to 40 are a GRIND — and hitting 40 unlocks nightmare.
    // NIGHTMARE runs 40→56 (a full clear; grind 56→58 unlocks jesus). JESUS is
    // player-relative. The cap sits ABOVE each rung's full-clear finish so the
    // clear itself isn't clamped — the fade only bites in the grind stretch.
    easy: { first: 15, last: 40 },
    medium: { first: 15, last: 40 },
    hard: { first: 16, last: 40 },
    nightmare: { first: 47, last: 60 },
    jesus: { first: 68, last: 99 },
  } as Record<Difficulty, { first: number; last: number }>,
  /**
   * XP starts diminishing this many levels UNDER the (soft) cap: the grant is
   * multiplied by `softCapDecay` for each level past `cap − fadeLevels`,
   * tapering into the wall — not a cliff.
   */
  fadeLevels: 3,
  /**
   * The per-level XP decay through the soft cap: every level past
   * `cap − fadeLevels` multiplies the grant by this (a reverse-exponential
   * fade), so each level over the cap takes far more kills than the one before.
   * Tuned so the fade reaches the `floor` (the ~1/100 trickle) about two levels
   * PAST the cap — the point the climb slows to a pace nobody would sit
   * through, the map's effective soft cap.
   */
  softCapDecay: 0.4,
  /**
   * The never-zero TRICKLE the fade bottoms out at: once `softCapDecay` would
   * sink the multiplier below this, it holds here instead, so an outgrown map
   * keeps paying a sliver of XP forever (the "diminish, don't zero" rule)
   * rather than slamming shut — there is NO hard level wall on a map, only this
   * glacial ~1/100 pace once the hero is a couple of levels past the cap. The
   * global `LEVELING.maxLevel` is the only true ceiling.
   */
  floor: 0.01,
} as const;

/**
 * UNIQUE items — hand-authored named drops (see `defs/uniques.ts`). Their
 * bonuses are fixed, but each drop rolls a small ±band on the BASE damage
 * (weapons) / armor so two copies differ and a better-rolled one is worth
 * chasing; the fixed bonuses are identical on every copy.
 */
export const UNIQUE = {
  /** Half-width of the base-stat roll: a ±10% band around the base value. */
  baseRollBand: 0.1,
  /**
   * Hard ceiling on any SCALING percentage bonus (`statPct` / `maxHpPct`) an
   * item can carry — clamped at mint (`mintUnique`), whatever the catalog
   * says. Scaling bonuses multiply the hero's own grown total, so even small
   * percentages compound into the strongest affixes in the game; 2% is the
   * most any one piece may pay. Deliberately EXCLUDES `damagePct` (a weapon's
   * flat +X% damage) and armor — those scale a single surface and stay
   * catalog-authored.
   */
  scalingPctCap: 0.02,
  /**
   * Boss unique drop chance, scaled by how close the boss's monster level is to
   * the item's ilvl: `dropChance × mlvl/ilvl`, capped at `dropChanceCap`. At the
   * item's home difficulty (mlvl ≈ ilvl) this lands at ~`dropChance`; a deeper
   * (over-ilvl) boss pays a little more, up to the cap. NOT guaranteed — boss
   * runs are the endgame.
   */
  dropChance: 0.05,
  dropChanceCap: 0.1,
  /** Default per-item `rarity` weight for a unique that doesn't set its own —
   * the relative odds it's the chosen named item once a rarity roll lands its
   * tier + slot (see `pickUniqueForDrop`). A flat default so the catalog works
   * un-annotated; hand-weight individual chase items DOWN from here. */
  defaultRarity: 100,
  /**
   * STATS DETERMINE RARITY (legendaries only): the selection weight in
   * `pickUniqueForDrop` falls off as a POWER LAW of the item's priced bonus
   * budget — `weight × (rarityBudgetRef / budget)^rarityBudgetExp` once the
   * budget exceeds the reference. Legendaries are deliberately authored
   * across a VAST power range (they're exempt from the unique budget cap —
   * power is paid for in ODDS instead): a reference-budget legendary keeps
   * its authored/default weight, twice the reference is 2^exp (16×) rarer,
   * five times is ~600× rarer — the god-rolls are astronomically rare by
   * construction. Mechanical, so authoring power IS authoring odds; an
   * explicit `rarity` still multiplies on top.
   */
  rarityBudgetRef: 40,
  rarityBudgetExp: 4,
} as const;

/**
 * WORLD-DROP uniques — level-locked named drops that any enemy on their home
 * level can drop (see `defs/uniques.ts` WORLD_UNIQUES, wired per level in
 * `LevelDef.loot.worldUniques`). Unlike boss uniques (which only a specific
 * boss drops), these rain from the whole roster, but at RANK-scaled odds so a
 * boss run is by far the efficient farm: a trash minion is a lottery ticket, an
 * elite ten times likelier, the boss forty. `minPlayerLevel` gates the whole
 * table shut until the hero out-levels a first campaign pass — PER RUNG, since a
 * later rung's relics sit behind a later, higher first-pass level. A full clear
 * of the critical path (one bottom lane → nightmare → jesus; see
 * `leveling-curve.mjs --by-level --clear-share 1`) leaves the hero at ~36 after a
 * bottom lane, ~53 after nightmare, and ~67 after jesus, so each gate sits a
 * couple levels under its rung's end — the relics can only be farmed by
 * RETURNING for boss runs once the difficulty is beaten.
 * Rolled per unique, per kill, on `maybeDropWorldUnique`.
 */
// Calibrated (with the folded rarity roll and the boss `uniquesByDifficulty`
// tables) so a JESUS farm run drops ≈ ONE named unique — see
// `scripts/drop-rate.mjs`. The relic-dense levels (the rift, and the bunker
// that relists the whole catalog) run a little hotter by design; a typical
// level lands near one. Trimmed from 0.00015: three unique channels stacked
// to ~9 uniques a bunker run, far past "one per run".
const WORLD_DROP_MINION_CHANCE = 0.00004;
// The explicit set-piece boost, as MULTIPLES of the minion base — the one
// place to retune "how much better a set piece is" (also live-scaled by the
// runtime BALANCE › UNIQUE DROPS knob). Elite ×100 → 0.4%, boss ×200 → 0.8%.
const WORLD_DROP_ELITE_MULT = 100;
const WORLD_DROP_BOSS_MULT = 200;

export const WORLD_DROP = {
  /**
   * Per-unique drop chance by the falling enemy's ROLE — the level-locked relic
   * channel, kept ALONGSIDE the folded rarity roll as the explicit set-piece
   * boost. A MINION is a lottery ticket (0.015%, still gated to return-farming);
   * ELITES and BOSSES are magnitudes better (×100 / ×200 the minion base) AND
   * drop during the normal campaign (see the role gate in `maybeDropWorldUnique`),
   * so a set-piece kill is a reliable relic source the first time through. Change
   * the base or the two multipliers above to move the whole channel at once.
   */
  chanceByRole: {
    minion: WORLD_DROP_MINION_CHANCE,
    elite: WORLD_DROP_MINION_CHANCE * WORLD_DROP_ELITE_MULT, // 1.5%
    boss: WORLD_DROP_MINION_CHANCE * WORLD_DROP_BOSS_MULT, //   3%
  },
  /** The MINION-only return-farm gate: trash relics stay shut until the hero
   * reaches this level ON THAT RUNG — sized a few levels above where a first
   * pass of the difficulty ends (bottom lane ~29, nightmare ~49, jesus 60). The
   * three bottom lanes are parallel entry points over the same level band, so
   * they share one gate. ELITES and BOSSES ignore this gate (they drop during
   * the campaign); it holds back only the minion lottery. */
  minPlayerLevel: {
    easy: 34,
    medium: 34,
    hard: 34,
    nightmare: 54,
    jesus: 67,
  } as Record<Difficulty, number>,
} as const;

/**
 * RARE & UNIQUE MOBS — Diablo-style special monsters laced into the levels
 * (see `EnemyDef.rarity` and `LevelDef.rareSpawns`). A RARE mob is a
 * generically-named oddity ("WANDERING TOURIST") that turns up about once per
 * map, solo or as a small pack; a UNIQUE mob is a NAMED, one-of-a-kind figure
 * that only appears on a fraction of runs and is always alone. Both are
 * MINION-role defs authored at ordinary minion numbers — the engine applies
 * the whole tier here at spawn (`spawnEnemy`), so every rare/unique rides the
 * same multipliers: tougher (hp), meaner (contact damage), levels ahead of
 * the horde for the loot gates (`levelBonus`), and far richer drop rolls
 * (`dropMult` multiplies the per-kill drop chance, every whole 1.0 of the
 * product a guaranteed payout — see `dropMinionLoot`). Like elites/bosses
 * they power-match the hero when the fight opens (`maybePowerScale`), so a
 * late-campaign rare is a real fight, not a placed-at-level-1 speed bump.
 */
export const RARE_MOBS = {
  /** The per-tier multipliers over the def's authored minion baseline. */
  tuning: {
    rare: {
      /** Hp multiplier — a rare mob is a genuine fight, not fodder. */
      hpMult: 5,
      /**
       * Kill-XP multiplier over a same-level minion's level-based payout
       * (`mobLevelXp`). Kill XP is now level-based, not hp-proportional, so a
       * rare's reward needs its own lever — set to match the old hp-driven
       * reward (it carried `hpMult`× the xp when xp tracked hp). A rare shows
       * up ~once per map and can't be farmed, so a fat single payout is worth
       * it without making mob-skipping the optimal XP route.
       */
      xpMult: 5,
      /** Contact-damage multiplier (folded into the mob's `contactMult`). */
      damageMult: 1.5,
      /** Multiplies the per-kill drop chance (~20× the rank and file). */
      dropMult: 20,
      /** Monster levels above the horde baseline (reaches tier gates early). */
      levelBonus: 2,
      /** Added to each equipment payout's tier roll. */
      tierBonus: 0.1,
    },
    unique: {
      hpMult: 10,
      xpMult: 10,
      damageMult: 2,
      dropMult: 100,
      levelBonus: 4,
      tierBonus: 0.2,
    },
  },
  /**
   * Chance the level's encounter of each tier exists at all, rolled once at
   * level creation: a rare shows up on most runs ("maybe once per map"), a
   * unique on about one run in five.
   */
  encounterChance: { rare: 0.8, unique: 0.2 },
  /**
   * Distance band the encounter is placed in, as fractions of the spawn→
   * objective axis (same yardstick as `SpawnSpec.band`) — off the doorstep,
   * but not camped on the boss.
   */
  band: [0.25, 0.9] as [number, number],
  /** Pack members scatter this far (world px) around the encounter anchor. */
  packScatter: 26,
  /** Ceiling on one kill's drop payouts, however high the multiplied chance
   * runs (LUCK and the dev drop-rate knob multiply in) — a loot burst, not a
   * carpet. */
  maxDropRolls: 8,
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
 * the meter heats. Standing idle — no damage, no kills — cools it, but never
 * below the PERMANENT floor the evolution ratchet has earned (see
 * `ratchetHealthbars`): a horde that evolved because it was getting one-shot
 * stays evolved — no breaks, up to the difficulty's PEAK (the per-rung
 * `menaceStageCap`: easy 3 … nightmare 100, JESUS uncapped). Menace is read as
 * a stage that does
 * three things: it LURES more of the horde toward the player (the crowd
 * growth alone caps at `lureStageCap`), it EVOLVES freshly-spawned minions
 * (more hp and WORSE loot — a challenge knob, not an xp or loot faucet; kill
 * xp is level-based now), and it scales elites and bosses when they engage
 * (keyed to the hero's CHARACTER level), so the epic fights keep pace with the
 * player instead of melting. Units: raw menace points, world px, hp.
 */
export const MENACE = {
  /**
   * Menace banked per second per REFERENCE HEALTHBAR PER SECOND of rolling
   * output: sustained damage is the meter's supporting fuel, but it is
   * measured RELATIVE to the era — the rolling DPS divided by the level's
   * reference minion bar (`refMobHp` on the `mobHpPerLevel` ramp ×
   * `autoPowerScale`, the same bar the spawner scales hp by) — so "mowing
   * two healthbars a second" heats the meter the same at level 1 and level
   * 60. (A raw-dps term was non-stationary: absolute numbers inflate ~30×
   * over a campaign, and fair mid-game play saturated the meter.) Scaled by
   * `menaceSensitivity` before it lands; 3.2 ≈ the old 0.07/raw-point term
   * at the level-1 bar, so the opening behaves exactly as before. The meter
   * still leans on relative OVERKILL and kill RATE as its main signals.
   */
  perBarDps: 3.2,
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
  /** Raw menace per evolution stage: stage = floor(menace / perStage). */
  perStage: 12,
  /**
   * THE EVOLUTION RATCHET — the "no breaks" rule. Overkill on mobs of the
   * CURRENT evolution stage is proof the horde still lags the player; once
   * this many HEALTHBARS of it are banked (`state.evoProof`, damped by the
   * early-game warmup only — every difficulty ratchets when genuinely
   * one-shot), the PERMANENT menace floor (`state.menaceFloor`) rises one
   * stage and the proof resets. The meter never decays below the floor, so a
   * horde that evolved to stage N because stage N−1 was getting one-shot
   * stays at N — it keeps evolving, stage by stage, until the player's blows
   * stop dropping mobs outright OR the difficulty's PEAK is reached (the
   * per-rung `menaceStageCap` bounds the floor; JESUS is uncapped). The
   * difficulty also sets the SIZE of each step (`menaceEffectMult` scales
   * `hpPerStage`), not just how many there are.
   */
  ratchetHealthbars: 6,
  /**
   * The ratchet's RELIEF: a clean kill of the current crop — one that did
   * NOT overkill (several blows, or a finisher within the bar) — refunds
   * this many healthbars of banked proof (floored at 0). This is what makes
   * the floor an EQUILIBRIUM instead of a runaway: a mixed horde's trash is
   * always one-shot by a healthy build, but as long as its heavies take
   * honest fights, their clean kills cancel the trash overkills and the
   * floor holds. Only when one-shots dominate the WHOLE kill mix — the
   * genuinely overpowered build — does proof outrun relief and the horde
   * evolve another stage.
   */
  ratchetReliefPerKill: 1,
  /**
   * Minimum ms between ratchet stages — the "one evolve per malice round"
   * pacing. However hard a massacre burst banks proof, the permanent floor
   * climbs at most one stage per cooldown, so one early bomb can't wall the
   * run in a single breath. Banked proof is also capped at 2× the threshold,
   * so a burst carries at most one deferred stage past its own moment.
   */
  ratchetCooldownMs: 10_000,
  /**
   * Extra minion hp per evolution stage (+35% each), stamped when the mob
   * spawns. Kill XP is LEVEL-based now (`mobLevelXp`), so evolution does NOT
   * pay more xp — it is purely a challenge knob (more killing for the same
   * reward), and its drops get WORSE per stage (see tierPenaltyPerStage below).
   */
  hpPerStage: 0.35,
  /**
   * Subtracted from an evolved minion's drop TIER roll per stage: malice
   * mobs take more killing but find WORSE gear — magic/rare odds thin out as
   * the horde evolves, so a rampage is a poor way of farming loot. Chances
   * floor at 0 in `rollTier`.
   */
  tierPenaltyPerStage: 0.03,
  /**
   * The wave spawner's live floor AND cap grow by this fraction per stage —
   * a rampage pulls a denser, bigger crowd onto the screen.
   */
  lurePerStage: 0.25,
  /**
   * The lure stops growing past this stage — evolution has no roof, but the
   * CROWD does: past here the horde answers with tougher mobs, not more of
   * them, so a deep rampage can't spawn the framerate to death.
   */
  lureStageCap: 8,
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
  // Trimmed from 0.12 when the set-piece MECHANICS shipped (mechanics.ts):
  // a boss now gets harder via telegraphed moves, enrage turns, and phases —
  // the hp-sponge share of its difficulty gives that much back.
  bossLevelWeight: 0.1,
  bossMenaceWeight: 0.1,
  /** Share of the hp power-scale that also applies to contact damage (so a
   * scaled boss hits harder, but not as steeply as its health grows). */
  bossContactShare: 0.4,
  /**
   * The XP-ANCHOR per-level ramp (NOT the hp curve any more — see
   * `mobHpGrowthPerLevel` below). Kill XP is LEVEL-priced: `mobLevelXp`
   * (leveling.ts) values a mob as a "typical" `refMobHp`-minion of its level on
   * THIS gentle linear ramp (±8%/level), and `referenceMobXp` (the kills-per-
   * level anchor) reads the same, so the two cancel and the leveling PACE stays
   * exactly what the curve authors. A mob's real HP no longer rides this ramp
   * (a tank and a squishy of the same level still pay the SAME xp — see
   * `mobHpGrowthPerLevel`), so tuning the hp curve leaves leveling untouched.
   * Left LINEAR and gentle on purpose: it is the xp yardstick, not the toughness.
   */
  mobHpPerLevel: 0.08,
  /**
   * THE HP CURVE — how a mob's HEALTH grows with its monster level, decoupled
   * from the xp ramp above. GEOMETRIC (compounding `mobHpGrowthPerLevel` per
   * level), because the hero's damage compounds too — gear item-level scaling
   * and chosen stat points push per-hit output up ~10%/level, so a LINEAR mob-hp
   * ramp (the old `mobHpPerLevel`) fell ever further behind and the hero slid
   * into one-shotting the whole horde by mid-game (which pinned the rampage
   * meter at its cap — the "menace 3 on easy" complaint). A compounding ramp
   * keeps HITS-TO-KILL rising with level instead: a reference minion demands a
   * couple of blows early, climbing toward ~10 by level ~60, so out-DPSing the
   * horde is a slow, earned drift rather than the default. Because it is keyed
   * to the mob's LEVEL (not the hero's gear), better-than-average finds
   * (uniques/legendaries) still DIP hits-to-kill below the curve — out-gearing
   * still eases the fight, it just no longer trivialises it. The rate is
   * calibrated against a NORMAL (magic/rare) loadout via
   * `scripts/mob-hp-curve.mjs`; verify there after any change. Applied at every
   * spawn through `mobHpLevelFactor` (menace.ts) — the one chokepoint mob hp,
   * the per-mob spawn band, the menace DPS-normaliser, and ability scaling all
   * read — so they move together. Kill XP does NOT read it (see `mobHpPerLevel`).
   */
  mobHpGrowthPerLevel: 1.1,
  /**
   * The PLATEAU KNEE: past this monster level the hp compounding eases to
   * `mobHpGrowthTailFactor` of its rate, so hits-to-kill rises steadily to
   * ~level 60 then LEVELS OFF into a gentle climb rather than walling to
   * hundreds of hits at the level cap. Below the knee the full
   * `mobHpGrowthPerLevel` applies. Keyed to monster level, so a difficulty's
   * `mobLevelMax` cap already bounds the bottom rungs under it; the knee is what
   * tames the uncapped JESUS tail.
   */
  mobHpGrowthKnee: 60,
  /**
   * Fraction of `mobHpGrowthPerLevel`'s excess-over-1 that still compounds ABOVE
   * the knee (0 = a hard plateau, 1 = no taper at all). At the shipped 0.34 a
   * post-knee level compounds ~3.4% instead of 10%, so the endgame keeps getting
   * a touch tougher without exploding.
   */
  mobHpGrowthTailFactor: 0.34,
  /**
   * The floor under `mobHpScaleFor`: no relative-level deficit can scale a
   * monster below half its catalog hp, so a deep negative offset (EASY, level
   * 1) weakens the horde without turning it into paper.
   */
  mobHpScaleFloor: 0.5,
  /**
   * The PER-MOB SPAWN LEVEL BAND — the random spread each rank-and-file minion
   * rolls on top of the horde baseline (`currentMobLevel` = player level + the
   * difficulty's `mobLevelOffset`). At spawn every plain minion draws a uniform
   * INTEGER offset in `[min, max]` (inclusive), which shifts its monster level
   * — and with it its hp (via the `mobHpPerLevel` ramp), its kill XP
   * (`mobLevelXp`, level-based), and the tier/ilvl gates its drops roll off. So
   * a wave is a MIX: some fodder a few levels under the hero, the odd one a
   * couple over, each worth (and dropping) accordingly, instead of a flat
   * clone army. The band STACKS on the difficulty offset, so a JESUS mob can
   * roll to player+4 and an EASY one to player−6, keeping the ladder's
   * differentiation. Elites, bosses, and rare/unique mobs skip it — set-piece
   * levels are deterministic (they settle their mlvl in `maybePowerScale`).
   */
  mobLevelBand: { min: -3, max: 2 } as { min: number; max: number },
  /**
   * The horde's per-level CONTACT-DAMAGE ramp (+3% per monster level over 1,
   * linear — see `mobContactScaleFor`, stamped at spawn): the damage sibling
   * of `mobHpPerLevel`, kept GENTLE and never multiplied by `autoPowerScale`.
   * The asymmetry is deliberate: hp rides the auto-stat curve because it
   * cancels against the hero's compounding DPS, but his SURVIVABILITY (max
   * hp from STAMINA, armor) grows roughly linearly — so mob damage tracks
   * that instead. Without this ramp a level-60 minion's catalog blow was a
   * tickle against a campaign health bar; with the old auto-scaled boss
   * contact, a set piece was a one-shot. Both read from here now.
   */
  mobDamagePerLevel: 0.03,
  /**
   * Better gear as the hero levels: added to a minion's drop tier roll per
   * player level above 1 (+0.4% each), so a higher-level hero's kills yield
   * richer loot to match the tougher mobs they came off — the drop-quality
   * companion to `mobHpPerLevel` (the menace `tierPenaltyPerStage` pulls the
   * other way on evolved mobs). Kept SMALL and capped (`tierBonusLevelCap`):
   * at the old 1.5% the level term alone hit +0.59 by level 40 — past the
   * magic AND rare base chances combined, so every mid-game drop rolled at
   * least rare and the tier ladder stopped discriminating. Tier quality is
   * the DIFFICULTY ladder's reward (`tierChanceBonus`); the level term only
   * seasons it.
   */
  tierBonusPerLevel: 0.004,
  /** Ceiling on the level term above (+15% at level ~38 and beyond), so the
   * deep endgame still rolls mostly regular/magic and a rare stays an event. */
  tierBonusLevelCap: 0.15,
  /**
   * The DAMAGE→LEVEL mapping's normalization (see `heroDamageLevel` in
   * menace.ts): the equipped weapon's sustained single-target output
   * (`weaponDps` — per-hit damage with `damagePct` affixes, the stat-scaled
   * cadence, and the average crit lift) reads as the power level whose
   * TYPICAL minion (`LEVELING.refMobHp` on the same `mobHpPerLevel` ramp
   * the spawner scales hp by) it would fell in this many SECONDS. DPS, not
   * the raw blow, so a slow crusher and a quick blade with the same true
   * output read the same. DIAGNOSTIC ONLY now: weapon damage no longer
   * toughens the horde (mob hp/level/xp key to the CHARACTER level alone —
   * see `heroPowerLevel`), so this only shapes the analytic damage-level
   * readout, never a spawned mob.
   */
  damageLevelKillSec: 1.5,
  /**
   * The CLEARANCE GATE window (seconds). The rolling heat in `tickMenace` only
   * fires when the player is actually WINNING THE ATTRITION WAR — clearing the
   * horde faster than it spawns — so a strong SLOW weapon that pumps damage (or
   * kill-rate bursts) while the screen keeps FILLING no longer heats the meter.
   * Minion spawns and minion kills are folded into rolling per-second rates
   * (`minionSpawnRate` / `minionKillRate`, EMAs smoothed over this window, ~5 s
   * so a lone burst can't flip the gate), and their balance — net kills over the
   * throughput — is the clearance fraction the gate reads. Kills, not on-screen
   * count, are the signal, so WALKING AWAY from a crowd (which empties the screen
   * without killing anything) never counts as clearing.
   */
  clearanceWindowSec: 5,
  /**
   * The net-clearance fraction the rolling heat needs before it fires: the
   * player must be clearing minions this much FASTER than they spawn — "is the
   * screen getting less crowded, and by more than 10%?" — for the meter to climb
   * from sustained output. Below it (matched by, or swamped by, the spawn rate)
   * only OVERKILL jolts and decay move the meter. The gate ramps from 0 at this
   * threshold to full by twice it. Tunable at runtime via the DEVELOPER →
   * BALANCE `menaceClearance` knob (a multiplier over this shipped 0.1, so 0×
   * heats on any positive clearance and a high value demands a runaway rout).
   */
  clearanceThreshold: 0.1,
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
  /**
   * LEVEL-SCALED STAT CAP (see `statCap`/`diminishStat` in leveling.ts). Every
   * effective-stat read runs through it. The ceiling for a stat is exactly what
   * you'd reach by pouring ALL your chosen points into that one stat
   * (`statCeilingBase + chosenStatPointsThrough(level)`), so a full SPEC realizes
   * its raw value with no diminishing — one stat can truly dominate — and the
   * ceiling RISES as you level, hard-capped at `statHardCap` (250, reached ~L66).
   * CHOSEN points wall at the cap (the chooser blocks placing past it); GEAR (and
   * the auto gains / head-start) push effective PAST the cap through a gentle
   * diminishing tail (`over/(1 + statTaper·over)`), so an ilvl-200 artifact is
   * felt hard and nothing is wasted, but items never get the undiminished linear
   * value a spec'd stat does. `autoPowerScale` rides the same curve so the horde's
   * hp compensation still cancels. The point: specs and endgame gear stay
   * relevant to the cap instead of flattening at a fixed ~90.
   */
  statHardCap: 250,
  statCeilingBase: 10,
  statTaper: 0.01,
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
   * base half-angle per point (+0.8% each): a sword's slash sweeps a broader
   * arc and a spear's thrust a slightly wider lane. Scaling the angle keeps
   * each weapon's shape (a narrow spear stays narrow). It grows GENTLY and
   * saturates at a HALF circle (`aoeMaxHalfAngle`), not a full one — a wide
   * cleaver reaches that half-circle cap only at deep-endgame INT (~100
   * effective), while an ordinary AoE build sweeps roughly a third of the
   * circle. Melee-only — ranged/magic have no cone.
   */
  aoePerInt: 0.008,
  /**
   * The hard ceiling on the INT-widened melee cone: a HALF circle (π/2
   * half-angle → a 180° total sweep). Even extreme INT on the widest weapon
   * saturates here rather than wrapping toward a full 360° disc, so a swing
   * always leaves a back arc uncovered and positioning still matters.
   */
  aoeMaxHalfAngle: Math.PI / 2,
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
   *
   * PHYSICAL lanes only (DEX quickens melee & ranged). Magic uses the lower
   * `magicAttackSpeedPerStat` below, because a caster's SPEED stat is the SAME
   * INTELLIGENCE that already scales its damage AND crit — so a point of INT
   * would otherwise compound cadence ON TOP of damage on the same investment,
   * and a deep-INT mage's DPS ran away from the physical lanes (which must split
   * points between a damage stat and DEX) by ~5× in the late game. The reduced
   * magic value keeps INT sweetening cast cadence without the multiplicative
   * runaway; magic still leads mid/late, just no longer by a blowout.
   */
  attackSpeedPerStat: 0.02,
  /**
   * Attack-speed per point of INTELLIGENCE for MAGIC weapons only (INT is
   * magic's speed stat — see `SPEED_STAT`). Lower than the physical
   * `attackSpeedPerStat` because INT already buys a caster's damage and crit, so
   * its cadence contribution is discounted to stop the DPS compounding (damage ×
   * speed on one stat) from letting a high-INT mage out-scale every other build.
   */
  magicAttackSpeedPerStat: 0.012,
  /** Player base crit chance before stats and equipment. */
  baseCritChance: 0.05,
  /**
   * Crit chance SATURATES toward this ceiling (`saturateToward` in items.ts) —
   * it never reaches 100%. The linear crit budget (base + crit-stat + luck +
   * affixes) reads ~as-is while small, then bends toward `critCap` so the last
   * few percent cost a lot of stat: with the raised stat cap a DEX/INT spec
   * would otherwise blow past 100% (it was un-clamped). Below 1.0 by design.
   */
  critCap: 0.8,
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
  /**
   * The fallback crit-damage multiplier for conjured blows that carry no weapon
   * (nova, storm, bolt, the nuke) and the projectile default. Weapon crits use
   * the per-class `critMultByClass` below instead.
   */
  critMultiplier: 2,
  /**
   * CRIT DAMAGE — how many times the blow a crit deals. It is a CLASS FLOOR
   * (ranged > melee > magic) deepened by DEXTERITY, the precision stat, and NOT
   * a per-item number (the item card shows no crit-damage line). The order is
   * the classes' identity:
   *   - RANGED crits HARDEST — the ranged build maxes DEX (its gate/speed/crit-
   *     chance stat), so DEX-scaled crit weight makes the marksman crit both
   *     OFTEN and HARD: precision is its whole payoff.
   *   - MELEE next — a moderate DEX build lifts its solid physical crit a little.
   *   - MAGIC softest — a caster builds ZERO DEX, so it sits at its floor; its
   *     edge is AoE + spell utility + ignoring armor, not crit weight.
   * DEX (not STR, which the bruiser stacks most, nor INT, which would re-inflate
   * the mage) is what makes RANGED the crit king. The budget model prices crit
   * off the stat-independent floor.
   */
  critMultByClass: {
    melee: 1.9,
    ranged: 2.05,
    magic: 1.6,
  } as Record<WeaponClass, number>,
  /** Crit DAMAGE deepens by this per point of DEXTERITY (all weapon classes) —
   * the precision slope that makes a DEX-max ranged build crit hardest while a
   * DEX-less caster stays at its floor. Deliberately GENTLE: ranged's crit is a
   * clear FLAVOUR edge, not a power gap so wide that the armored endgame (where
   * MELEE's armor piercing is meant to decide it) can never catch up. */
  critDamagePerDex: 0.0015,
  /**
   * MAGIC crit HARD CAP — a magic weapon's crit multiplier can never exceed this,
   * pinned to melee's floor (`critMultByClass.melee`) so a caster that stacks
   * gear DEX still never out-crits a bruiser. The guarantee that crit is a
   * physical-class identity, magic the softest.
   */
  magicCritCap: 1.9,
  /** Crit DAMAGE of a conjured SPELL/ability blow (nova, storm, bolt, the nuke)
   * — a flat static value, low like a magic weapon: a caster's spells hit wide,
   * not crit-hard. Weaponless mob crits still use `critMultiplier`. */
  spellCritMult: 1.5,
  /**
   * ARMOR PIERCING — the fraction of a mob's armor reduction a class's weapon
   * IGNORES (subtracted from `mobArmorReduction` in `mobArmorMult`, floored at
   * 0). Mob armor rises to 50% by the JESUS cap and cuts PHYSICAL blows, which
   * is why the armored mid/late game tilted toward MAGIC (it ignores armor
   * outright). Giving the physical lanes their own penetration is the honest
   * counter, and it is MELEE'S endgame identity: a bruiser sunders armor with
   * raw force, so MELEE pierces most at baseline AND carries the strongest
   * `armorPen` relics — the two together let a decked-out melee hero fully
   * negate the 50%-armored JESUS endgame and reclaim the top. RANGED pierces
   * some (its edge is crit, not sundering, so it still eats a sliver of armor
   * late unless it finds pierce), MAGIC none (it bypasses armor already). So the
   * class order through the armored endgame EMERGES from armor-vs-penetration.
   */
  armorPenByClass: {
    melee: 0.3,
    ranged: 0.25,
    magic: 0,
  } as Record<WeaponClass, number>,
} as const;

/**
 * WEAPON STAT REQUIREMENTS — the Diablo attribute gate that forces a build to
 * pick a lane. On top of a weapon's LEVEL requirement, each class demands a
 * minimum in ITS attribute before the hero can wield it: melee wants STRENGTH,
 * ranged wants DEXTERITY, magic wants INTELLIGENCE (see `REQ_STAT` in items.ts).
 * The number is DERIVED from the weapon's `levelReq`, never authored per item,
 * so the whole arsenal is calibrated by one knob and never needs re-tuning when
 * a base's numbers move — see `statRequirement` / `meetsStatReq` in items.ts.
 *
 * The requirement is `autoFloor + round(investFraction × chosenPoints)`, where
 * `chosenPoints` is the trainable points a hero has banked by that levelReq
 * (`chosenStatPointsThrough`) and `autoFloor` is the automatic per-level growth
 * that stat has accrued by then (`baseStatBonus`, zero for INTELLIGENCE and
 * zero for EVERY stat while the AUTO LEVEL STATS dev flag is off). Adding the
 * auto floor is what makes the gate track the "level auto stats" setting: with
 * auto growth ON the hero is handed those points for free, so the requirement
 * rises by exactly that much and the CHOSEN investment it truly demands —
 * `investFraction` of the hero's trainable points — stays identical whether the
 * flag is on or off. That invariance is the whole point: a developer can toggle
 * WoW-style auto-attributes without recalibrating a single item.
 */
export const STAT_REQ = {
  /**
   * The share of a hero's TRAINABLE (chosen) stat points a focused build is
   * assumed to commit to its class attribute — hence the chosen-point portion
   * of every weapon's requirement. At the shipped 0.4 a melee hero must sink
   * ~40% of their points into STRENGTH to swing the era's heavy weapons, which
   * still leaves the majority for STAMINA (survival), the class's speed/crit
   * stat, and the rest — a realistic focused build, not an all-in dump. Raise
   * it to force a harder commitment, lower it to loosen the lanes. Requirements
   * are checked against the hero's RAW (pre-diminish) attribute so the gate
   * measures points invested, not their diminished combat value.
   */
  investFraction: 0.4,
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

/**
 * MOB ARMOR — the fraction of a PHYSICAL blow (melee/ranged) the horde shrugs
 * off (magic ignores it). It RISES STEADILY with the mob's level, like hp: a
 * LEVEL base that ramps linearly from ~0 at level 1 to `maxLevelReduction` (35%)
 * at `LEVELING.maxLevel`, PLUS the difficulty's flat bonus
 * (`DifficultyDef.mobArmor` — easy 0, medium 2%, hard 5%, nightmare 10%, jesus
 * 15%) stacked on top. The two are tuned so a JESUS mob at the cap lands at 50%
 * (35% level + 15% rung), with the bottom rungs spread below it (easy 35% …), so
 * the jump between rungs is felt and the armored endgame favours magic builds.
 * Realized in `mobArmorReduction`/`mobArmorMult` (loot.ts) off the mob's LEVEL
 * (so a difficulty's mob-level cap also caps its armor), clamped below full
 * immunity by `maxReduction`. A future ARMOR-PIERCING item stat subtracts here.
 */
export const MOB_ARMOR = {
  /** Physical reduction a mob at `LEVELING.maxLevel` reaches from level alone,
   * before any difficulty bonus — the top of the linear per-level ramp. Tuned
   * with jesus's +15% bonus to land the top rung at 50%. */
  maxLevelReduction: 0.35,
  /** Hard ceiling on the total reduction (level ramp + difficulty bonus + …),
   * so armor never fully negates a physical blow. */
  maxReduction: 0.9,
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
  // Damage reduction saturates through `armor/(armor+k)` toward this ceiling.
  // Raised to 0.90 (from 0.75): the top band is deliberately expensive — `k`
  // grows with the attacker's level, so reaching ~0.85–0.90 at the endgame
  // takes a LOT of armor (deep artifact stacking), while 0.85→0.90 is a further
  // 33% cut in damage taken. It never reaches 1.0.
  maxReduction: 0.9,
  armorPerIlvl: 0.06,
} as const;

/**
 * ARMOR MATERIALS — the D2/WoW material classes (see `ArmorType`), the axis
 * that turns the same slot into a light caster robe or a heavy bruiser plate.
 * A base's authored `armor` is its CLOTH-equivalent value (the slot curve the
 * item-forge prices); the material's `armorMult` scales the WORN value
 * (`armorValueOf`), so a mail chest protects far more than the cloth one of the
 * same slot/level. That extra plating is what lets a melee hero stand in the
 * onslaught the design wants (`mail`/`plate`), while a caster in `cloth` stays
 * fragile and kites.
 *
 * Each material also demands STRENGTH to WEAR it — `strReqFraction` is the share
 * of the hero's trainable points it wants in STR, exactly like a weapon's
 * `STAT_REQ.investFraction` (0.4). CLOTH asks nothing (any build wears it);
 * LEATHER a little; MAIL and PLATE a LOT, so heavy armor is a melee-only lane —
 * a caster or archer simply cannot heft it (see `statRequirement`). Worn `+STR`
 * gear (which mail/plate itself rolls, via `statWeights`) counts toward the
 * gate, so a bruiser stacking heavy armor naturally meets the next piece's req.
 *
 * `statWeights` biases which stat a rolled `+stat` affix picks (`rollAffix`):
 * CLOTH leans INTELLIGENCE (a mage's robe) but can still roll DEX/STR; LEATHER
 * leans DEXTERITY (a ranger's kit) and can roll STR; MAIL/PLATE lean STRENGTH
 * but still roll DEX/INT (a bruiser leans on those too). The weights are
 * relative — a bigger number just means that stat rolls more often.
 *
 * `minDifficulty` (PLATE only) gates the material to the hardest rungs: plate
 * bases are filtered out of the random drop pool below it (`rollEquipment`), so
 * the top armor tier is a NIGHTMARE-and-up chase.
 */
export const ARMOR_TYPES: Record<
  ArmorType,
  {
    /** Worn-armor multiplier over the base's cloth-equivalent authored value. */
    armorMult: number;
    /** Share of trainable points demanded in STRENGTH to wear it (0 = ungated,
     * mirrors weapon `STAT_REQ.investFraction`). */
    strReqFraction: number;
    /** Relative odds each stat is the one a rolled `+stat` affix grants. */
    statWeights: Record<StatName, number>;
    /** Lowest difficulty this material may randomly DROP on (index-compared in
     * `rollEquipment`); omitted = drops on every rung. */
    minDifficulty?: Difficulty;
  }
> = {
  cloth: {
    armorMult: 1,
    strReqFraction: 0,
    statWeights: {
      intelligence: 6,
      // CLOTH is the caster material — SPIRIT (mana/regen) leans here alongside
      // INT so a robe rolls the mage's support stat, second only to raw INT.
      spirit: 4,
      dexterity: 3,
      strength: 2,
      stamina: 2,
      speed: 2,
      luck: 1,
    },
  },
  leather: {
    armorMult: 1.15,
    strReqFraction: 0.25,
    statWeights: {
      dexterity: 6,
      strength: 3,
      intelligence: 2,
      stamina: 2,
      speed: 2,
      spirit: 1,
      luck: 1,
    },
  },
  mail: {
    armorMult: 1.6,
    strReqFraction: 0.6,
    statWeights: {
      strength: 6,
      dexterity: 2,
      intelligence: 2,
      stamina: 3,
      speed: 1,
      spirit: 1,
      luck: 1,
    },
  },
  plate: {
    armorMult: 2.2,
    strReqFraction: 0.85,
    statWeights: {
      strength: 7,
      dexterity: 2,
      intelligence: 2,
      stamina: 3,
      speed: 1,
      spirit: 1,
      luck: 0,
    },
    minDifficulty: "nightmare",
  },
} as const;

/**
 * Stamina — the sprint pool. MOVING always SPENDS it, in proportion to PACE
 * (the analogue movement throttle): a bare creep barely dips the pool, a
 * flat-out sprint burns the full `drainPerSec`, and everything between eases
 * linearly from the standstill up to the ring — so the drain tracks the stick
 * from zero, and the moment you push off you are already spending, never
 * refilling. The pool refills ONLY while standing still (not moving), and then
 * takes the full breather. While any stamina is left the player runs at full
 * speed; once it hits zero the top speed is capped at `emptySpeedFactor` until
 * it recovers. The STAMINA stat deepens the pool AND — matching "drains
 * slower, regains faster" — cuts the drain rate and quickens the regen. Units:
 * stamina points (pool), points/second (rates).
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
   * The reduced pace a held WALK / keyboard-walk steers at (see GameScreen
   * `KEYBOARD_WALK_THROTTLE`). A walk still MOVES, so it still spends stamina —
   * just a fraction of a full run's drain (this throttle × `runRateFactor`) —
   * it is a slower, cheaper pace, not a free breather. Only standing still
   * refills the pool.
   */
  walkThrottle: 0.5,
  /**
   * Signed stamina rate factor at full throttle: a negative fraction of
   * `drainPerSec` SPENT, so a flat-out sprint burns the whole base drain
   * (−100%). While moving, the rate runs linearly from 0 at a standstill to
   * this at throttle 1 (`rate = throttle × runRateFactor`), so an analogue push
   * spends the pool strictly in proportion to its pace and never regains it.
   */
  runRateFactor: -1,
  /** Top-speed multiplier once the pool is empty (a winded jog). */
  emptySpeedFactor: 0.5,
  /**
   * Stamina spent per jump takeoff, as a fraction of the MAX pool (so a
   * deeper reserve buys proportionally more hops). Drained on the takeoff
   * frame only; a jump that bottoms the pool out trips the same regen lockout
   * a spent-out run does (see `emptyRegenLockMs`).
   */
  jumpCost: 0.1,
  /**
   * Ms of frozen regen after a RUN or a JUMP empties the pool. Bottoming out
   * mid-sprint (or on a takeoff) locks regen for this long — the pool refills
   * at nothing until it lapses — so the hero can't tap-run/tap-jump on fumes
   * and must walk it off instead. Any run/jump that re-empties the pool
   * re-arms the full window.
   */
  emptyRegenLockMs: 2000,
} as const;

/**
 * MANA — the spell resource (the sprint pool's arcane twin; mirrors STAMINA).
 * The pool is INTELLIGENCE's: a caster's max mana is `base + effectiveINT ×
 * perInt`, so pouring points into INT both UNLOCKS spells (one per 10 effective
 * INT, see defs/spells.ts) AND deepens the pool that fuels them. Spent by
 * casting (each spell's `manaCost`) and refilled by the blue-gatorade mana
 * potion (`potionRestore`) or, after an idle beat, by regen (see REGEN). Units:
 * mana points. Recomputed off INT via `computeMaxMana` (items.ts), the exact
 * shape `computeMaxStamina` takes off STAMINA.
 */
export const MANA = {
  /** Pool at zero INTELLIGENCE — enough that the first unlocked spell (INT 10,
   * pool 45) can be cast a couple of times before regen matters. */
  base: 25,
  /** Extra max mana per point of effective INTELLIGENCE. At INT 250 (the stat
   * hard cap) the pool reaches 525 — deep enough to chain the costly high-tier
   * spells a maxed mage unlocks. */
  perInt: 2,
  /** Fraction of the max pool a blue-gatorade MANA POTION restores on use
   * (1 = a full refill, like the energy drink tops the sprint pool). */
  potionRestore: 1,
} as const;

/**
 * REGEN — the passive trickle SPIRIT drives, on both pools it touches: MANA
 * (every build's spell fuel) and HEALTH (a slow out-of-combat mend). Spirit is
 * the caster-support stat: it grows neither pool's SIZE (INT sizes mana,
 * STAMINA sizes hp) but how fast each refills on its own. Both regens PAUSE
 * briefly after the triggering action — mana after a cast, health after a hit —
 * so regen rewards a lull in the fight, never spilling free resource mid-cast
 * or mid-swarm. Units: points/second, ms. Applied in `stepRegen` (step.ts);
 * the per-second rates are read through `manaRegenPerSec` / `hpRegenPerSec`
 * (items.ts) so the HUD and the sim quote the same numbers the sim measures.
 */
export const REGEN = {
  /**
   * Mana regen idles for this long after the last cast — the "5 seconds of no
   * spell" rule. A fresh cast re-arms the full window, so spamming spells keeps
   * the pool from refilling and the caster must pace their casts (or drink).
   */
  manaDelayMs: 5000,
  /** Mana/sec once regen is active, at zero SPIRIT — a slow drip so a
   * spirit-less caster leans on the pool and the potion, not on waiting. */
  manaBasePerSec: 3,
  /** Extra mana/sec per point of effective SPIRIT: the stat's headline payoff.
   * At SPIRIT 60 (a committed support build) regen reaches ~75/sec — a costly
   * spell's worth every couple of seconds. */
  manaPerSpirit: 1.2,
  /**
   * Health regen pauses this long after the hero takes a hit — a shorter window
   * than mana's, so the mend resumes soon after a clean dodge but never ticks
   * while blows are landing. A hit re-arms the full window.
   */
  hpDelayMs: 4000,
  /** Hp/sec per point of effective SPIRIT once the pause lapses (0 at 0 SPIRIT
   * — health regen is entirely spirit's gift, off by default). Gentle: at
   * SPIRIT 60 the hero mends ~3.6 hp/sec, a real between-fights top-up but never
   * a substitute for a medkit mid-swarm. */
  hpPerSpirit: 0.06,
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
   * STAGE 1 — the drop gate (D2's NoDrop, inverted): the base chance a regular
   * monster drops ANYTHING at all (LUCK adds to it). `1 − dropChance ≈ 91%` is
   * the NoDrop weight. THE one drop-rate lever — raise it for a richer rain,
   * lower it for a leaner one; the runtime BALANCE › DROP RATE knob scales it
   * live. Tuned for horde scale: hundreds of kills per run, a drop every ~11 of
   * them, the steady rain of upgrades that keeps the player ahead of the ramp.
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
   * …the share that is a medkit (banked on touch, spent on the player's call).
   * A generous slice: healing is meant to be a reliable resource the hero
   * finds often and spends deliberately, not a lucky drop he hoards. Paired
   * with the percentage-of-max heals (config MEDKIT), a found kit is always a
   * real top-up. The per-rung `medkitDropMult` and low-health MERCY boost still
   * thin or fatten this slice around the baseline.
   */
  medkitShare: 0.22,
  /**
   * …the share that is a weapon repair kit. A generous slice, like the medkit
   * one: a worn weapon that snaps strands the hero on the sidearm (or sends him
   * running to the merchant), so mending kits are meant to turn up often enough
   * to keep a good weapon alive through a run. Uniform across rungs (no
   * `repairDropMult`) — since medkits thin up the ladder but this doesn't, the
   * repair rain actually stands out MORE on the hard rungs, exactly where a
   * broken weapon hurts most. It sits below the drink/arrow bands on the drop
   * ladder, so widening it just eats the "nothing drops" tail — every other
   * resource's drop rate is untouched.
   */
  repairShare: 0.18,
  /**
   * …the share that is an ENERGY DRINK (resets the sprint pool on touch). Kept
   * lean — a drink is only worth anything to a winded hero, and the gentle
   * rungs rain them far harder through the stamina-empty MERCY DROP (see
   * `staminaDrinkChance`), so the baseline slice is just a chance for one to
   * turn up in the ordinary rain.
   */
  drinkShare: 0.05,
  /**
   * …the share that is a BLUE GATORADE (a MANA POTION — refills the spell pool
   * on the player's call). Sits beside the energy drink on the ladder and, like
   * it, is only worth anything to a caster who has actually spent mana, so the
   * baseline slice is lean; a low-mana MERCY DROP (see `manaEmptyChance`) rains
   * them harder when a spellcaster is genuinely tapped out.
   */
  manaShare: 0.05,
  /**
   * …the share that is a GOLDEN XP ARROW (grants a share of the level bar —
   * see LEVELING.arrowXpShare). Unlike the medkit/repair/drink slices, this
   * is the tail of the ladder rather than the leftover: whatever this slice
   * (thinned further by a difficulty's `arrowDropMult`) leaves unfilled simply
   * doesn't drop, so arrows are a rare prize rather than the ladder's filler.
   * At MEDIUM (mult 1) this lands ~one arrow per 50 kills
   * (`LOOT.dropChance × arrowShare`); harder rungs thin it toward zero and JESUS
   * (mult 0) drops none at all. A found level, not a steady drip.
   */
  arrowShare: 0.225,
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
   * 10, unique from 15, legendary from 40. (Monster level = player level +
   * the difficulty's `mobLevelOffset`, so harder rungs reach each tier
   * earlier in the story.) TRASH is gated at 1 — it never rolls anyway (only
   * scripted drops mint it), the entry just keeps the tier table total.
   */
  tierUnlockMlvl: {
    trash: 1,
    magic: 5,
    rare: 10,
    // SET (green) shares the unique gate — both are AUTHORED boss drops, not
    // random rolls, so `set` is deliberately absent from TIER_ROLL_ORDER and
    // this gate only guards the authored-drop paths that consult it.
    set: 15,
    unique: 15,
    legendary: 40,
    artifact: 40,
  },
  /**
   * BASE-LEVEL drop floor: a base whose `levelReq` is more than this many
   * levels under the killer's monster level is retired from the drop pool, so a
   * high mob stops dropping low-tier bases (a weak base with affixes on it is
   * still a weak item). Kept as a WINDOW, not a hard match, so a band of bases
   * still drops for variety; below it the whole eligible pool stands (the early
   * game, and as a fallback when nothing sits in the band). D2 area-level
   * flooring — the base scales with where you kill, the affixes with the ilvl.
   */
  dropLevelWindow: 15,
  /**
   * NAMED-ITEM drop floor (D2 area-level flooring for uniques/legendaries/
   * artifacts): a named item whose `ilvl` is more than this many levels under
   * the killer's LOOT LEVEL is retired from the `pickUniqueForDrop` pool, so a
   * cap-level (99) farm stops coughing up the campaign's low-ilvl relics —
   * "level-60 crap" — and pays out only near-level gear (~ilvl 85+ at level
   * 99). This is how a named drop's item level DRAGS UP as the hero levels: the
   * eligible band slides with `lootLevel`, so you always find gear around your
   * own level, and the low-tier uniques recede as you outgrow them. Kept as a
   * WINDOW so a band of ilvls stays live; if it would empty a slot's pool the
   * roll simply downgrades to a rare (never a dead drop). The equip CEILING
   * (base `levelReq ≤ lootLevel`) still holds on top. */
  namedIlvlWindow: 15,
  /**
   * STAGE 2 — the D2 RARITY ROLL. Each tier's chance is Diablo 2's shape:
   * a BASE chance at the tier's own qlvl (the `tierUnlockMlvl` gate) plus a
   * SLOPE that sweetens it the deeper OVER that gate the drop rolls — a
   * higher-level kill rolls rarer tiers more often (D2: `ilvl − qlvl` improves
   * rarity). MAGIC FIND then scales it (see `mfSaturation`). The difficulty's
   * `tierChanceBonus`, menace evolution, and per-enemy bonuses still add to the
   * base. Checked best-first in `rollTier`.
   *
   * Unlike the old ladder, unique/legendary are NON-ZERO: named items now fall
   * out of the rarity roll (the D2 way — `rollTier` lands the tier, then
   * `pickUniqueForDrop` chooses WHICH named item by its per-item `rarity`
   * weight). The separate boss/world channels still layer on top as the
   * explicit set-piece boost. The curve is deliberately D2-steep: rarer high
   * tiers, MF carrying the difference.
   */
  rarityBase: {
    magic: 0.16,
    rare: 0.045,
    // UNIQUE is a named CHASE tier too (it also ignores the generic tier
    // bonus — see `rollTier`), so its base+slope are its WHOLE odds. Cut from
    // the old 0.01/0.0016 (which, once the mob-level sweetener stopped
    // inflating it, still rained ~7 uniques a JESUS farm run) to land the
    // aggregate near ONE named unique per farm run (scripts/drop-rate.mjs).
    // Uniques drop on every difficulty (unlike legendary/artifact); the boss
    // `uniquesByDifficulty` tables and level `worldUniques` relics remain the
    // reliable set-collection farm on top of this.
    unique: 0.0036,
    // LEGENDARY and ARTIFACT are the CHASE tiers — the drop-the-hero-chases
    // endgame. Unlike magic/rare/unique they IGNORE the generic per-kill tier
    // bonus (mob-level sweetener, all-clear trophy, dropProfile — see
    // `rollTier`) and drop only from HARD up, so these bases + slopes + the
    // elite/boss set-piece bonus below are their WHOLE odds. Calibrated with
    // `node scripts/drop-rate.mjs` so a JESUS rift/bunker farm run drops a
    // legendary ≈ once per 10 runs and an artifact ≈ once per 100 (aggregate
    // across the tier); the power-law `uniqueDropWeight` then spreads WHICH
    // one — the commonest legendary lands many times before the rarest.
    // Retune here, not by feel; re-run the probe after any change.
    legendary: 0.0008,
    artifact: 0.00008,
  },
  /** How much each mlvl OVER a tier's qlvl gate adds to its base chance (the
   * D2 `(ilvl−qlvl)/divisor` term, as a positive slope). Higher tiers climb
   * slower, so depth favors rares over legendaries. The chase tiers
   * (legendary/artifact) climb very slowly — the deep endgame reaches them,
   * but they never become common. */
  raritySlope: {
    magic: 0.008,
    rare: 0.005,
    unique: 0.00003,
    legendary: 0.00001,
    artifact: 0.000001,
  },
  /**
   * MAGIC FIND saturation ceiling per tier — the MOST that MF can multiply a
   * tier's rarity chance by, approached asymptotically (`1 + cap·mf/(cap+mf)`).
   * MAGIC is uncapped (linear in MF); the top tiers saturate LOWER, so stacking
   * LUCK/aura can't make legendaries common — D2's rule that MF is strong early
   * and gives diminishing returns on the best drops.
   */
  mfSaturation: { rare: 1.2, unique: 0.7, legendary: 0.45, artifact: 0.3 },
  /** The EXPLICIT set-piece boost: an additive bonus to the named-tier rarity
   * BASE when the killer is an elite or a boss (RARE/UNIQUE mobs share the
   * elite bonus — see `rollTier`'s `mobRarity`), so those special fights are a
   * far better legendary/artifact farm than trash — a boss run is the efficient
   * chase, but it still takes a long grind. */
  eliteRarityBonus: { unique: 0.015, legendary: 0.002, artifact: 0.0002 },
  bossRarityBonus: { unique: 0.045, legendary: 0.0065, artifact: 0.00065 },
  /**
   * The PLAIN-MINION named-tier PENALTY: a rank-and-file minion's rolled
   * chance at a NAMED tier (unique/legendary/artifact) is multiplied by this,
   * so trash CAN still cough up a named item but at a fraction of the odds a
   * rare/unique/elite/boss kill carries (which skip the penalty AND add the
   * set-piece bonus above). Combined with the fact that trash also runs a few
   * levels UNDER the horde (the spawn band, lower ilvl), farming regular mobs
   * for chase gear just doesn't pay — the special fights are the loot. The
   * everyday magic/rare rain is untouched (this hits named tiers only), so
   * ordinary kills stay rewarding. 0 would slam the door entirely; keep it a
   * sliver so a lucky trash drop is still possible.
   */
  minionNamedMult: 0.2,
  /** Ceiling on any single tier's rolled chance — keeps deep-campaign magic
   * from reaching 100% so PLAIN whites (and their make-quality roll) still
   * drop. Applied after slope, difficulty, role, and Magic Find. */
  rarityChanceMax: 0.85,
  /**
   * How far below the killer's monster level a dropped item's LEVEL lands:
   * index i is the relative weight of dropping exactly i levels short, so
   * `[1, 2, 3, 4]` makes a −3 item four times likelier than a full-level one.
   * Longer/shorter arrays widen/narrow the band. Item level floors at 1.
   */
  ilvlDeltaWeights: [1, 2, 3, 4],
  /**
   * The same weights for the named tiers' RAW roll (unique/legendary/artifact
   * fold into a hand-authored item whose ilvl OVERRIDES this, so it is moot —
   * kept only so the raw roll has a value): 0–1 below the mob, equal odds.
   */
  ilvlDeltaWeightsRare: [1, 1],
  /**
   * ROLLED-tier UPWARD ilvl margin over the loot level — the D2 rule that the
   * rarer a find, the more its power punches above the mob that dropped it
   * (magic a hair over, rare a clear step over, and the hand-authored
   * unique/legendary/artifact tiers further still via their own ilvls). Index
   * `i` weights an offset of `base + i`, low end likeliest, so the margin tilts
   * toward its floor. MAGIC lands loot+0..2, RARE loot+3..5. (WHITE/regular
   * items still roll AT or just under loot via `ilvlDeltaWeights`, so the ladder
   * reads regular ≤ magic < rare < unique.)
   */
  ilvlMarginMagic: { base: 0, weights: [3, 2, 1] },
  ilvlMarginRare: { base: 3, weights: [3, 2, 1] },
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
 *
 * Each quality is a RANGE, not a single number (D2's superior/low-quality
 * rule): a drop rolls a specific base-value multiplier inside its quality's
 * `ranges` band, stamped on the instance (`Equipment.qualityRoll`) and frozen
 * for life. The bands OVERLAP between adjacent qualities and climb with the
 * rank, so a good CRUDE can out-swing a poor NORMAL, yet a PERFECT always
 * clears a NORMAL — and two SUPERIOR copies of a base carry different damage.
 * `mults` is the MIDPOINT of each band: the representative value a legacy
 * instance (minted before the range roll) or a 0.5 roll reads, so the bands
 * are symmetric around it and the economy's centre of mass is unchanged.
 *
 * The roll's ODDS shift with the killer's MONSTER LEVEL — `weightsLow` are the
 * relative odds at mlvl 1, `weightsHigh` at `highMlvl`, lerped linearly
 * between, so the level-1 rank and file drop mostly shabby make and the deep
 * campaign pays out superior and perfect work. Craftsmanship and magic are
 * exclusive (the D2 rule): MAGIC-or-better finds, charms, and bags never roll
 * one — they are always normal make and carry no range roll.
 */
export const QUALITY = {
  mults: { broken: 0.7, crude: 0.85, normal: 1, superior: 1.15, perfect: 1.3 },
  /**
   * The roll band each make quality drops within — a specific multiplier is
   * drawn uniformly inside it at mint (see `rollQualityMult`). Symmetric around
   * `mults` (the midpoint) and OVERLAPPING between neighbours, so make quality
   * reads as a soft, D2-style gradient rather than five fixed steps. Only
   * adjacent bands overlap: a PERFECT never rolls under a NORMAL's ceiling.
   */
  ranges: {
    broken: { min: 0.58, max: 0.82 },
    crude: { min: 0.73, max: 0.97 },
    normal: { min: 0.9, max: 1.1 },
    superior: { min: 1.03, max: 1.27 },
    perfect: { min: 1.16, max: 1.44 },
  },
  /** Relative quality odds off a monster-level-1 kill… */
  weightsLow: { broken: 20, crude: 25, normal: 52, superior: 3, perfect: 0 },
  /** …and off a monster at/above `highMlvl`; lerped linearly between. */
  weightsHigh: { broken: 0, crude: 6, normal: 54, superior: 28, perfect: 12 },
  /** The monster level at which the odds reach `weightsHigh`. Set to the
   * level a full campaign actually ends at (~60, see LEVELING) so the lerp
   * spans the real game: superior and perfect work is genuinely common on
   * the last rungs instead of parked behind a monster level that never
   * spawns. */
  highMlvl: 60,
} as const;

/**
 * MERCY DROPS — the game throws a drowning player a rope, harder the gentler
 * the rung, and the fight eases without ever becoming un-losable. Four
 * independent signals feed it: a PACKED FIELD (crowd of on-screen mobs), LOW
 * HEALTH, a near-BROKEN WEAPON, and an EMPTY SPRINT POOL (stamina bone-dry).
 * The first three turn into a 0→1 "desperation" as they worsen — zero at
 * their `*Start` mark, one at their `*Full` mark, linear between (see
 * `desperationRamp`); the stamina rope instead ramps over TIME the pool sits
 * empty (see `staminaDrinkChance`). This namespace owns the RAMP SHAPES
 * (where help begins and maxes); each rung owns its STRENGTH via
 * `DifficultyDef.mercy` (`MercyTuning`), TAPERING geometrically down the
 * ladder (~×0.4 per rung: easy → medium → a whisper on hard → a ghost on
 * nightmare → absolute zero on JESUS). Tune the two together: shape here,
 * per-rung force on the ladder.
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
   * THE LOW-MANA ROPE — the blue-gatorade twin of the stamina bailout, but
   * keyed on the POOL FRACTION (mana has no bone-dry timer): a CASTER (a hero
   * with an INT-sized pool past `MANA.base`) whose mana sits at or below
   * `lowManaFraction` of the max has this flat per-kill chance to be thrown a
   * mana potion, so a tapped-out mage isn't stranded unable to cast. Gated by
   * the shared one-rope-at-a-time rule (`mercyRescueWaiting`). See
   * `manaDrinkChance`.
   */
  lowManaFraction: 0.15,
  lowManaDropChance: 0.06,
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
  /**
   * THE ANGEL — how a mercy drop makes its entrance. Rather than blinking onto
   * the ground, a rescue rolled by a mercy path (the crowd-bomb and empty-sprint
   * bailouts, and the desperation-boosted medkit/repair) is flown down by a
   * guardian angel that swoops in from above, cradles the gift, and releases it
   * over the spot the mob died. `angelDeliverMs` is the WHOLE performance —
   * descent, release, and the short fall to the ground — kept under two seconds
   * so a drowning player's lifeline never dawdles. The pickup is uncollectable
   * (and magnet-proof) for exactly this long, then lands and behaves like any
   * drop. Only the renderer knows it is an "angel"; the engine just marks the
   * item's `deliverMs` and counts it down (see `stepItems`, `dropMinionLoot`).
   */
  angelDeliverMs: 1400,
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
 * CRATES — the breakable loot boxes scattered on levels (see crates.ts). A
 * crate is an ordinary jumpable obstacle (cover you can hop) that also carries
 * `hp`: the hero's autonomous weapon SMASHES it — his melee cone and his shots
 * damage it, and with no foe in reach the auto-attack turns on the nearest
 * crate — so a struck crate keels over like a slain mob and bursts, ALWAYS
 * spilling loot. The haul leans on healing and stamina (a reliable field
 * resource), sometimes pays gear, and — its whole point over a plain kill —
 * pays it GUARANTEED and rolls that gear HOTTER than a mob's, so a crate's
 * unique is meaningfully likelier than a regular kill's.
 */
export const CRATES = {
  /**
   * A crate's hp as a fraction of the current REFERENCE minion's bar
   * (`LEVELING.refMobHp` on the menace hp curve — the same anchor mob hp
   * scales against). Since the hero's own damage tracks that same bar all
   * campaign, this keeps a crate smashing open in about as many blows as a
   * weak trash mob takes, early game to endgame — never a chore, never free.
   */
  hpFraction: 0.6,
  /** Floor so an opening-level crate still takes a hit or two (world hp). */
  minHp: 12,
  /**
   * The GUARANTEED drop's category weights — exactly one primary drop is paid
   * every break, picked here. Healing and stamina dominate (the field
   * resource); gear is the rarer prize (rolled via `gearTierBonus`).
   */
  drop: {
    /** A medkit (the best tier the mob level has unlocked — `rollMedkitTier`). */
    health: 5,
    /** An energy drink (refills the sprint pool). */
    stamina: 4,
    /** A full equipment roll (see `gearTierBonus`). */
    gear: 3,
  },
  /**
   * Crate gear rolls HOTTER than a mob's: this tier-chance bonus sweetens the
   * rarity roll so a crate reaches magic/rare/unique more often, and the
   * natural unique FOLD (`rollEquipment`) fires more often — the reason a
   * crate's unique is "more likely than a regular mob". A mob's plain drop
   * gets only the small level-scaled bonus; a crate gets this on top.
   */
  gearTierBonus: 0.6,
  /**
   * After the guaranteed primary drop, the chance of ONE bonus consumable
   * (a second health/stamina pickup) on top, so cracking a crate feels like a
   * small haul rather than a single pickup.
   */
  bonusDropChance: 0.4,
  /** Scatter of a crate's drops around the break point (world px, each axis). */
  lootScatter: 26,
} as const;

/**
 * DESIGN ZONES (see src/game/zones.ts / the `level-design` skill): the shared
 * tuning for `LevelDef.safeZones` (no spawns + repel) and `quietZones` (no
 * ambient spawns). Only the repel margin is a number — the exclusion itself is
 * geometry.
 */
export const ZONES = {
  /**
   * How far past a safe zone's edge the horde is ejected each tick (world px),
   * added to the enemy radius by `repelFromZones`. A touch of slack so a mob
   * pinned at the boundary reads as kept-out, not glued to the line.
   */
  repelMargin: 6,
} as const;

/**
 * TEMPO (see `LevelDef.tempo` / `tempoIntensity` in step.ts): the clamp on the
 * interpolated wave-pressure multiplier, so an authored curve can't drive the
 * horde to zero or to a runaway flood.
 */
export const TEMPO = {
  /** Lowest pressure multiplier a tempo curve can dip to (a genuine lull). */
  min: 0.2,
  /** Highest pressure multiplier a tempo curve can peak at (a hard surge). */
  max: 3,
} as const;

/**
 * SPECIAL CHESTS (see `LevelDef.chests` / crates.ts): a placed reward container
 * — smashed open like a crate, but hardier and with a richer, guaranteed haul.
 * The payoff that makes a `quietZone` dead area worth the detour.
 */
export const CHESTS = {
  /** Break hp as a multiple of a crate's (a chest is a tougher nut). */
  hpMult: 2,
  /** Default sprite when a chest names none (the SpaceZ staff locker). */
  sprite: "locker",
  /**
   * Collision/cover radius (world px). Larger than a crate — a chest is a
   * landmark you can hide behind.
   */
  radius: 9,
  /**
   * The chest's gear tier bonus (hotter than a crate's `gearTierBonus`) — a
   * chest reaches magic/rare/unique and folds a natural unique far more often,
   * so its haul feels like a real find.
   */
  gearTierBonus: 1.1,
  /**
   * Chance the chest spills its MARQUEE equipment item — a Diablo-2 chest: the
   * prize drops most of the time (rolled hot enough to reach rare/unique), and
   * on the rare miss the container still gives up its guaranteed supplies. This
   * is the "80% item guarantee" a SpaceZ locker advertises.
   */
  itemChance: 0.8,
  /**
   * Chance at a SECOND bonus equipment item, rolled only when the marquee item
   * dropped — so a lucky locker occasionally coughs up two pieces of gear.
   */
  bonusItemChance: 0.35,
  /**
   * Guaranteed consumables (health/stamina) spilled regardless of the item
   * rolls — the "some other items" that make cracking a locker always worth it.
   */
  consumables: 2,
} as const;

/**
 * THE INTENDED PATH (`LevelDef.path` / path.ts): the authored waypoint route the
 * hero is meant to walk. A pure navigation aid the autopilot follows and the app
 * points a guidance arrow at.
 */
export const PATH = {
  /**
   * How close (world px) the hero must get to a waypoint to count it reached and
   * advance to the next. Generous — a bit under a phone half-view (≈211×97) — so
   * brushing through a corridor node counts even when the hero cuts the corner,
   * and the arrow flips to the next leg before he's on top of the old one.
   */
  reachRadius: 90,
  /**
   * Keep-clear margin (world px) around the path polyline: no scattered obstacle
   * is placed within this of the route, so the authored legs stay walkable and a
   * no-pathfinding runner marching between waypoints never wedges on furniture.
   * A clear lane ~2× this wide down the whole path.
   */
  clearance: 44,
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
  /**
   * A level's `openingStrike` arms the hero once its scripted vanguard closes
   * to within this distance of the player (world px). This generic fallback is
   * the phone-half-view (as `speakRadius`); a level should override it per-strike
   * via `OpeningStrike.radius` down to a CONTACT gap so the swing lands when the
   * rusher is actually on top of the hero — see spacez_hq, which does exactly
   * that. A contact trigger only avoids a kiting stall when the vanguard's
   * `rushSpeed` outruns PLAYER.speed, so pair the two.
   */
  strikeRadius: 96,
  /**
   * The cooldown (ms, counts down each step) between the hero's recurring
   * "these enemies are getting pathetic — I should hurry and find Ada" thought
   * (see `maybeCapThought` in story.ts). Unlike the pinned one-shot beats this
   * one REPEATS: it fires whenever the hero is farming a map he has already
   * capped (level ≥ the map's `xpLevelCap`), then holds for this long so the
   * grind mutters it every so often rather than on every kill. Sized so a long
   * cap-farm hears it tens of times across the campaign, never back-to-back.
   */
  capThoughtCooldownMs: 60_000,
  /**
   * The menace STAGE above which the "these enemies are pathetic" cap-farm
   * mutter falls silent (see `maybeCapThought` in story.ts). Once the horde has
   * evolved past this stage it is demonstrably NOT pathetic anymore — mobs
   * carry stacked evolution hp and the set pieces power-match the hero — so the
   * self-satisfied grind line would read as flatly wrong. The hero can still be
   * over the map's `xpLevelCap` and hear it at or below this stage; it's the
   * high-menace rampage where the horde has answered his power that mutes it.
   */
  capThoughtMenaceStageCeiling: 10,
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
  /**
   * Screen-edge FOLLOW latch: while the hero is on the move, a companion that
   * drifts within this many world px of the camera's edge (or past it) stops
   * fighting and commits to moving WITH him — the party keeps up with a hero
   * ranging across the map rather than planting to trade shots and sliding
   * off the screen. The latch releases when the hero stops moving (see
   * `stepCompanion`). Only applied when the app hands the engine a `view`
   * (headless/bot runs, with no camera, keep the plain formation behaviour).
   */
  screenEdgeMargin: 32,
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
  /** Companion damage grows with its OWN level (it trains by fighting — see
   * `companion-stats.ts`), NOT the hero's. */
  damagePerLevel: 0.04,
  /** Companion max hp grows with its OWN level, same rationale. */
  hpPerLevel: 0.1,
  /**
   * COMPANION LEVELING (see `companion-stats.ts`). A companion earns its OWN
   * levels from its OWN kills, decoupled from the hero: it starts trained to
   * the hero's level when recruited and climbs from there, forever (the level
   * rides the loadout, so it persists across every level AND difficulty). The
   * curve is authored in KILLS, like the hero's (`xpToLevelUp`): a level costs
   * `levelKills` of a reference-mob's worth of XP, growing gently per level, so
   * a companion levels a handful of times a map early and slows as it climbs.
   * The kill reward is the same figure the hero earns (`enemyKillXp`), so an
   * elite finish lurches a companion's bar the way it does the hero's.
   */
  levelKills: 14,
  /** Geometric growth of the per-level kill cost (mirrors the hero's gentle
   * `killsPerLevelGrowth`). */
  levelKillsGrowth: 1.04,
  /** A companion levels up to here and no further — set high enough to read as
   * "indefinite" without risking an unbounded loop on a colossal XP grant. */
  maxLevel: 999,
  /** Ms a downed companion kneels before getting back up on its own — but only
   * counted down while OUT of combat (see `downedCombatRadius`). */
  reviveMs: 12_000,
  /**
   * A downed companion's revive count only ticks while the field around IT is
   * clear: a live foe within this many world px freezes the count, so a
   * companion beaten down in the middle of a swarm STAYS down until the area
   * clears — or the hero speaks to a merchant, who stands the whole party back
   * up (`reviveDownedCompanions`). A companion downed in a quick scrap still
   * pops back up on its own once the mob is dead.
   */
  downedCombatRadius: 140,
  /** Fraction of max hp a companion stands back up with. */
  reviveHpFraction: 0.5,
  /**
   * Out-of-combat healing: a companion that hasn't swung at a foe or taken a
   * blow for `regenCalmMs` knits itself back up at `regenPerSec` of its max hp
   * each second — the party mends between fights instead of bleeding down over
   * a level with no way to recover short of a full down. Combat (a live target
   * in the hero's engage bubble, or a contact hit) resets the calm timer; a
   * downed companion recovers only via its kneel/revive, never this.
   */
  regenPerSec: 0.08,
  /** Ms of quiet (no swing made, no hit taken) before out-of-combat regen
   * begins — a companion mid-fight is not "out of combat". */
  regenCalmMs: 3_000,
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
 * Travel gates (LevelDef.gates) — doorways to ANOTHER LEVEL, unlocked by a
 * story item (`requires`) the way keycards open doors. The engine only books
 * the crossing (`gateEntered`); the app owns the actual travel, carrying the
 * hero's build into a run of the destination level.
 */
export const GATES = {
  /** Stepping this close to an OPEN gate crosses it (world px). */
  enterRadius: 22,
  /** Default `reachExit` objective radius: standing this close to the exit
   * ends the level (world px) — deliberate contact, not a walk-by graze. */
  exitRadius: 30,
  /** How far ahead of the hero a used key tears its gate open (world px) —
   * past `enterRadius`, so crossing is a deliberate step, never a same-tick
   * surprise. */
  summonDistance: 48,
} as const;

/**
 * Gravity wells — black holes placed by a level (LevelDef.wells). Each well
 * drags whatever crosses its pull radius toward the core: the grounded
 * player and enemies (reach `pullRadius`), and loose loot from much farther
 * out (reach `lootRadius`, about a phone screen away) — which piles up on the
 * rim instead of being destroyed, a dare to dash in. A jump no longer sails
 * clean over a hole: airborne the hero still drifts toward the core
 * (`airPullFraction` of the ground pull) and the hole's gravity fights his
 * hop (`jumpGravity`), so he can't hang over the horizon at full height. A
 * MINION dragged into the core is devoured outright: off the board with no
 * kill, no XP and no loot — the hole pays nobody. Elites and bosses are too
 * massive to swallow (their set pieces survive a bad camp spot) and
 * apparitions too immaterial; both only suffer the drag. A grounded player
 * dragged all the way into the core is DEVOURED too — instant death, the
 * price of a loot dash gone wrong. These are the per-well DEFAULTS — a level's
 * well spec may override each number. Units: world px, world px/s.
 */
export const WELLS = {
  /** Reach of the pull on the player and enemies. */
  pullRadius: 130,
  /** Inside this the hole devours minions and the grounded player alike. */
  coreRadius: 16,
  /**
   * Peak pull at the core's edge (px/s), falling off linearly to 0 at
   * `pullRadius`. Deliberately above the hero's base walk (PLAYER.speed 56):
   * the outer band is a lean he can walk out of, the inner third a genuine
   * fight — SPEED, the sprint, or a jump is what gets him clear.
   */
  pullSpeed: 96,
  /**
   * Reach of the pull on loose LOOT — about a phone screen away, so drops
   * scattered around a hole slide toward it from well beyond the player's own
   * pull. The tug eases in (`1 - d/lootRadius` SQUARED): a crawl at the far
   * edge, quickening as it nears the core — slow from the edges, then faster.
   */
  lootRadius: 300,
  /** Peak loot pull at the core (px/s), eased to ~0 at `lootRadius`. */
  lootPullSpeed: 96,
  /**
   * The share of the ground pull that still tugs the hero HORIZONTALLY while
   * he is airborne over the well: a jump over a hole no longer sails clean —
   * he drifts toward the core, weaker than on the ground but never nothing.
   */
  airPullFraction: 0.6,
  /**
   * Extra downward acceleration (px/s²) the hole heaps on the hero's jump
   * while he is airborne inside the pull radius — peak at the core's edge,
   * linear falloff to 0 at the reach (the same shape as the drag). The hole's
   * gravity fights the hop, so he JUMPS LESS HIGH the nearer the horizon.
   */
  jumpGravity: 900,
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
 * Hay balls — the spinning, bouncing bales a level rolls in with
 * LevelDef.hayBalls (Eastworld's western prop hazard). Each spawns just past
 * the RIGHT screen edge in a lane of its own and rolls straight to the LEFT
 * across the player's surroundings, spinning and hopping (the bounce is a
 * renderer-only sine off `bouncePeriodMs`/`bounceHeight`). Unlike the asteroid
 * rain a bale does NOT take a scaled bite: contact costs a VERY SLIGHT flat hp
 * (`damage`, once per bale) and SHOVES the grounded hero LEFT (`knockback`,
 * every tick it overlaps) — so a bale caught standing in the lane drags him
 * back down the street and he must step OUT of the lane (or jump, z above
 * JUMP.dodgeHeight, like clearing enemy contact) to stop being pushed. Bales
 * plow minions aside unharmed, ignore obstacles and level bounds, and despawn
 * once past the player's stage. Units: world px, px/s, ms.
 */
export const HAY_BALLS = {
  /** Spawn distance to the RIGHT of the player — just past the screen edge. */
  spawnDistance: 260,
  /** Vertical spread of the spawn lane around the player (px), so successive
   * bales roll down different lanes rather than one groove. */
  laneJitter: 150,
  /** Roll speed, rolled per bale (px/s) — slower than an asteroid so the shove
   * reads as a drag, not a flick. */
  speed: [70, 110] as [number, number],
  /** Collision radius, rolled per bale (px) — small, light bales. */
  radius: [6, 9] as [number, number],
  /** Leftward shove speed (px/s) applied every tick the grounded hero overlaps
   * a bale — kept under the roll speed so a bale drags him a stretch before it
   * rolls on past. */
  knockback: 78,
  /** The VERY SLIGHT flat hp a bale costs on contact, once per bale. */
  damage: 3,
  /** Peak of the visual hop (px, renderer only). */
  bounceHeight: 9,
  /** Time for one full bounce (ms, renderer only). */
  bouncePeriodMs: 620,
  /** Bales in flight are capped here; the spawner defers above it. */
  maxAlive: 4,
  /** A bale this far from the player despawns — it has left the stage. */
  despawnDistance: 620,
} as const;

/**
 * Sand storms — small, animated dust squalls a level turns on with
 * LevelDef.sandstorms (Mars). Each spawns on a ring just past the phone screen
 * edge (the asteroid/enemy-spawn rationale) and DRIFTS across the player's
 * surroundings in a straight line, SLOW enough to walk clear of — getting out
 * of the way is the whole defence. A storm shoves minions aside like an
 * asteroid (chaos, no harm). The grounded hero it catches is struck ONCE: a
 * difficulty-scaled bite of his MAX hp (DifficultyDef.sandstormDamageFrac) AND
 * a KNOCKOUT — he drops prone and helpless for `knockoutMs`. Having struck,
 * the storm keeps drifting (passes OVER the fallen hero) and thins out over
 * `fadeMs` before vanishing. A jump (z above JUMP.dodgeHeight) sails clear of
 * the gust exactly like a rock, and a hero already knocked out is never caught
 * a second time. Units: world px, px/s, ms.
 */
export const SANDSTORMS = {
  /** Spawn distance from the player — just past the screen edge. */
  ringDistance: 260,
  /** Aim scatter around the player (px): a storm threatens a swathe, not a
   * homing strike. */
  targetJitter: 90,
  /** Drift speed, rolled per storm (px/s) — a slow rolling wall of dust the
   * hero can stroll out of, well under the asteroid streak. */
  speed: [52, 78] as [number, number],
  /** Body radius, rolled per storm (px) — SMALL squalls, a few strides wide. */
  radius: [26, 40] as [number, number],
  /** Storms in flight are capped here; the spawner defers above it. */
  maxAlive: 2,
  /** A storm this far from the player despawns — it has left the stage. */
  despawnDistance: 700,
  /** How long the caught hero lies prone and helpless (ms). */
  knockoutMs: 2000,
  /** After it strikes, the storm thins out over this window (ms) as it passes
   * over the fallen hero, then vanishes. */
  fadeMs: 1400,
} as const;

/**
 * Ranged enemies (`EnemyDef.ranged`) — shooters that fire hostile projectiles
 * at the player and, with `takesCover`, play hide-and-peek behind the level's
 * solid obstacles between shots (the per-enemy numbers — damage, cooldown,
 * range, projectile — live on the def; this is the shared choreography).
 * Units: world px, ms, fractions.
 */
export const ENEMY_RANGED = {
  /**
   * The share of its firing range a shooter tries to hold from the player:
   * closer than this it backs away (a gunslinger keeps its distance), further
   * it advances until the player is in range and sight.
   */
  holdRangeFraction: 0.7,
  /**
   * With this much (or less) of the reload left, a covering shooter steps
   * back out of hiding to line up the next shot — the "peek" of the
   * hide-and-peek dance. Longer = more brazen, shorter = more cowardly.
   */
  peekWindowMs: 700,
  /**
   * How far around itself a covering shooter looks for a solid (non-jumpable)
   * obstacle to hide behind. Nothing in reach = it just backs off to its hold
   * range instead.
   */
  coverSearchRadius: 260,
  /** Gap kept between the shooter's edge and its cover rock's edge. */
  coverGap: 4,
  /**
   * SMARTER MOBS up the ladder — TARGET LEADING: from `leadFromIndex`
   * (hard = 3) shooters aim ahead of a RUNNING hero by `leadFactor` of the
   * full firing solution (`player.vel × time-of-flight`), and from
   * `leadFullFromIndex` (nightmare = 4) by the whole thing — a standing hero
   * is aimed at dead-on either way. Below the gate shots fly at where the
   * hero WAS: the strafe-to-dodge freebie the gentle rungs keep.
   */
  leadFromIndex: 3,
  leadFullFromIndex: 4,
  leadFactor: 0.5,
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

/**
 * The medkit consumable: picked up on touch, never enters the inventory.
 * D2-style TIERS — each heals a FRACTION OF THE HERO'S MAX HP, and deeper
 * content drops bigger kits: the drop rolls the deepest tier the killer's
 * monster level has unlocked most of the time and the one under it sometimes
 * (3:1, the affix bracket idiom — see `rollMedkitTier` in loot.ts). Percentage
 * heals stay meaningful against a campaign health bar at every level without a
 * static number decaying into a scratch: even the LIGHT kit is a real top-up
 * (30% of the bar), and a SUPERIOR is a full mend. All tiers share one sprite
 * for now; the drop share and the per-rung medkitDropMult stay the balance
 * lever on scarcity.
 */
export const MEDKIT = {
  tiers: [
    { name: "LIGHT MEDKIT", healPct: 0.3, minMlvl: 1 },
    { name: "MEDKIT", healPct: 0.5, minMlvl: 12 },
    { name: "LARGE MEDKIT", healPct: 0.75, minMlvl: 30 },
    { name: "SUPERIOR MEDKIT", healPct: 1, minMlvl: 46 },
  ],
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
 * Stacked consumables (medkits, stamina potions, weapon repair kits): a touched
 * kit banks into the consumable dock rather than firing on contact, and the
 * `useMedkit` / `useStaminaPotion` / `useRepairKit` inputs (a dock-slot tap or
 * its key) spend one on the player's call — so the hero carries a reserve and
 * heals/mends when it matters. Medkits stack per quality (one `stackCap`-deep
 * stack per MEDKIT tier); stamina potions and repair kits each share one stack.
 * A pickup that would overflow its stack stays on the ground.
 */
export const CONSUMABLES = {
  /** How deep one stack goes; a full stack turns away further pickups. */
  stackCap: 5,
} as const;

/**
 * ABILITY POWER SCALING (see `abilityPowerScale` in abilities.ts). The
 * catalog numbers in defs/abilities.ts are authored AT LEVEL 1; without
 * scaling they decayed into noise against a horde whose healthbars grow by
 * `MENACE.mobHpPerLevel × autoPowerScale` every level. The scale is exactly
 * that minion-bar formula — so a FIRE ORB keeps meaning "the same fraction
 * of a level-appropriate healthbar" all campaign — times an INTELLIGENCE
 * term: conjured powers are magic, and INT is what deepens them.
 */
export const ABILITY = {
  /** Extra ability damage per point of effective INTELLIGENCE (+5% each). */
  intDamagePerPoint: 0.05,
  /** Extra STASIS FIELD radius per point of effective INT (world px) —
   * mirrors the magnet's `radiusPerInt`; the slow factor itself never
   * scales (a stronger slow would trivialize kiting). */
  stasisRadiusPerInt: 1.5,
} as const;

/**
 * GRANTED SPELLS & PROCS — the forever powers items carry (the `spell` /
 * `proc` affix kinds, unique/legendary authoring territory). Every damage
 * number here is authored AT LEVEL 1 and rides the SAME `abilityPowerScale`
 * the pickup powers do (level ramp × INT deepening), so a granted spell
 * keeps meaning the same fraction of a level-appropriate healthbar all
 * campaign. Each spell scales linearly with its RANK (worn sources of the
 * same spell add their ranks), and INTELLIGENCE additionally SHORTENS the
 * tick/strike intervals (`intervalPerInt`) — the "improvable by INT" half
 * the timed pickups don't get. A granted spell is deliberately weaker than
 * its pickup twin at rank 1: it never runs out.
 */
export const SPELL = {
  /** Circling flame — the forever FIRE ORBS. Rank adds orbs and per-tick
   * damage; the ring turns at the pickup's pace. */
  orbit: {
    /** Orbs on the ring at rank 1 / added per further rank. */
    count: 1,
    countPerRank: 1,
    /** Damage per tick per orb at rank 1 / added per further rank. */
    damage: 8,
    damagePerRank: 3,
    radius: 36,
    angularSpeed: 2.8,
    hitCooldownMs: 200,
    orbRadius: 8,
    sprite: "fireball",
  },
  /** The forever STORM CELL: a bolt into the nearest foe on an interval.
   * Rank raises the damage and quickens the strikes. */
  storm: {
    intervalMs: 2400,
    /** Each rank past 1 multiplies the interval by this (rank 3 ≈ ×0.72). */
    intervalPerRankMult: 0.85,
    damage: 18,
    damagePerRank: 7,
    range: 200,
  },
  /** The forever STASIS FIELD: foes inside crawl. Rank widens the field and
   * deepens the slow (floored — kiting must stay a skill). INT still widens
   * it further via `ABILITY.stasisRadiusPerInt`, like the pickup. */
  stasis: {
    radius: 46,
    radiusPerRank: 16,
    /** Enemy speed multiplier inside the field at rank 1 (higher = gentler
     * than the pickup's 0.3 — this one never expires). */
    slowFactor: 0.8,
    slowFactorPerRank: -0.07,
    slowFactorMin: 0.5,
  },
  /** The BOLT proc: lightning into the struck/killed enemy (or the nearest
   * foe to the trigger, if it fell). Rank sizes the hit. */
  bolt: {
    damage: 26,
    damagePerRank: 10,
    /** How far from the trigger point a replacement victim may stand. */
    range: 120,
  },
  /** The NOVA proc: a damage ring bursting around the trigger point. */
  nova: {
    radius: 56,
    radiusPerRank: 8,
    damage: 22,
    damagePerRank: 8,
  },
  /**
   * INT's interval lever on GRANTED spells: each point of effective
   * INTELLIGENCE trims orbit tick cooldowns and storm intervals by this
   * fraction, floored at `intervalFloor` of the authored value — a
   * scholar's forever spells genuinely fire faster.
   */
  intervalPerInt: 0.006,
  intervalFloor: 0.5,
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
  /** How long the farm-proof survival clock (`stats.combatMs`) keeps ticking
   * after a kill once the field is otherwise clear — the "combat is still
   * live" tail. A cleared field with no fresh kill inside this window stops
   * the clock, so survival time can't be milked by loitering (see step.ts). */
  combatGraceMs: 2000,
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
  /** The tier ladder in coin terms — each rung an order of magnitude. TRASH
   * sits below 1: joke drops melt down for pocket lint, whatever their ilvl. */
  tierValueMult: {
    trash: 0.1,
    regular: 1,
    magic: 10,
    rare: 100,
    // SET (green) sits between rare and unique on the sell ladder.
    set: 300,
    unique: 1_000,
    legendary: 10_000,
    artifact: 100_000,
  } as Record<
    | "trash"
    | "regular"
    | "magic"
    | "rare"
    | "set"
    | "unique"
    | "legendary"
    | "artifact",
    number
  >,
  /** Metal items melt down: worth double (see EquipmentDef.material). */
  metalMult: 2,
  /** Precious items (gold, gems, true magic) fetch four times. */
  preciousMult: 4,
  /** A stall weapon costs its own sell value × this — the vendor's cut. */
  weaponBuyMarkup: 10,
  /** A stall powerup's price: base + perLevel × the hero's level. */
  abilityBase: 40,
  abilityPerLevel: 12,
  /**
   * REPAIR pricing at the merchant (see items.ts `repairCost`): mending one
   * worn piece to full costs `(base + perReqLevel × the piece's required level)
   * × the rarity multiplier × its make quality × the fraction of durability
   * missing`. So higher required level, rarer tier, and finer make all cost
   * more to keep whole — but the rarity ladder here is GENTLE (single digits),
   * NOT the sell-value ladder's orders of magnitude, so repairing rare gear
   * stays affordable against the coins selling brings in.
   */
  repair: {
    /** Coins to fully mend a worn-out REGULAR piece at required level 1. */
    base: 3,
    /** Extra coins per point of the piece's required level. */
    perReqLevel: 2,
    /** Rarity multiplier — dearer gear costs more to keep whole. */
    tierMult: {
      trash: 0.5,
      regular: 1,
      magic: 2,
      rare: 4,
      // SET (green) — moot in practice (set pieces mint unbreakable), but the
      // record is keyed by every Tier.
      set: 6,
      unique: 8,
      legendary: 12,
      artifact: 16,
    } as Record<
      | "trash"
      | "regular"
      | "magic"
      | "rare"
      | "set"
      | "unique"
      | "legendary"
      | "artifact",
      number
    >,
  },
} as const;

/** The level map and its fog of war (see map.ts). */
export const MAP = {
  /** Fog-of-war grid cell size (world px). Coarse on purpose: the map reads
   * as chunky pixel terrain, and the whole grid stays a few thousand cells
   * even on the widest level. */
  cellSize: 32,
  /** Radius around the hero PERMANENTLY uncovered as he moves (world px) — the
   * fog lifts as a circle sweeping his path (Warcraft-style, no re-fogging), so
   * the map (and minimap) show exactly where he has been, not the whole camera
   * view. Roughly the phone's near view, so "walked past it" ≈ "on the map". */
  revealRadius: 160,
  /**
   * Width (world px) of the Warcraft-2 fog's TRANSITION band — the graded
   * ordered-dither frontier between the CLEAR terrain the hero has uncovered
   * and the solid-black terrain he never has. Everything he has explored reads
   * fully clear; only this thin outer rim of the exploration frontier stipples,
   * dense black against the dark and thinning to nothing as it meets the clear.
   * Mobs standing inside the band (or the dark beyond) are not drawn — the
   * horde only appears on ground the hero can actually see. Roughly a cell and
   * a half so the stipple reads as a soft edge, not a hard line.
   */
  fogBand: 48,
} as const;
