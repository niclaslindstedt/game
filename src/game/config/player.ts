// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero's own body and pools: movement, jumping, the sprint (stamina)
// pool, the mana pool, and SPIRIT-driven regen.

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
   * where an elite/boss rush settles (see step/) so the closer they must get
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

/**
 * Stamina — the sprint pool. RUNNING SPENDS it, in proportion to PACE (the
 * analogue movement throttle): a flat-out sprint burns the full
 * `drainPerSec`, and everything above the walk pace eases linearly up to that
 * ring. A WALK (throttle at or below `walkThrottle`) is a breather on the
 * move — the pool REGAINS at `walkRegenFactor` of the standstill rate — and
 * standing dead still takes the full breather (rate 1, the fastest refill).
 * While any stamina is left the player runs at full speed; once it hits zero
 * the top speed is capped at `emptySpeedFactor` until it recovers. The
 * STAMINA stat deepens the pool AND — matching "drains slower, regains
 * faster" — cuts the drain rate and quickens the regen. Units: stamina
 * points (pool), points/second (rates).
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
   * `KEYBOARD_WALK_THROTTLE`). A walk is a BREATHER ON THE MOVE: at or below
   * this throttle the pool REGAINS at `walkRegenFactor` of the standstill
   * rate instead of draining — catching your breath without stopping. Above
   * it, moving spends the pool in proportion to pace (`runRateFactor`).
   */
  walkThrottle: 0.5,
  /**
   * Fraction of the standstill regen rate a WALK-pace mover (throttle at or
   * below `walkThrottle`) regains. Standing dead still is still the fastest
   * refill (rate 1); a walk recovers at half that while covering ground. The
   * empty-pool regen lockout (`emptyRegenLockMs`) gates a walk's regen the
   * same way it gates the standstill's.
   */
  walkRegenFactor: 0.5,
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
 * or mid-swarm. Units: points/second, ms. Applied in `stepRegen` (step/);
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
