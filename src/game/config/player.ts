// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero's own body and pools: movement, jumping, the sprint (stamina)
// pool, and SPIRIT-driven health regen.

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
 * Stamina — the sprint pool, a strict three-pace ladder:
 *   • RUN (throttle above `walkThrottle`) SPENDS the pool at the FULL
 *     `drainPerSec` — any running pace burns the whole rate, so easing off
 *     the stick buys nothing until the pace drops to a true walk.
 *   • WALK (throttle at or below `walkThrottle`, half the run speed) is a
 *     slow breather on the move — the pool REGAINS at a trickle
 *     (`walkRegenFactor` of the standstill rate).
 *   • STANDING dead still takes the full breather (rate 1, the fastest
 *     refill by far) — catching your breath means actually stopping.
 * While any stamina is left the player runs at full speed; once it hits zero
 * the top speed is capped at `emptySpeedFactor` until it recovers, and regen
 * stays FROZEN until the hero has stood still for `emptyRegenLockMs`
 * uninterrupted (moving restarts the wait — see the lockout below). The
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
   * `KEYBOARD_WALK_THROTTLE`) — half the run speed. A walk is a SLOW BREATHER
   * ON THE MOVE: at or below this throttle the pool REGAINS at
   * `walkRegenFactor` of the standstill rate instead of draining. Above it,
   * the pace is a RUN and spends the pool at the full rate (`runRateFactor`).
   */
  walkThrottle: 0.5,
  /**
   * Fraction of the standstill regen rate a WALK-pace mover (throttle at or
   * below `walkThrottle`) regains. A deliberate trickle: a walk keeps the
   * pool inching back while covering ground, but standing dead still refills
   * TEN times faster (rate 1) — real recovery means stopping. The empty-pool
   * regen lockout (`emptyRegenLockMs`) gates a walk's regen the same way it
   * gates the standstill's.
   */
  walkRegenFactor: 0.1,
  /**
   * Signed stamina rate factor at a RUN — any throttle above `walkThrottle`:
   * a negative fraction of `drainPerSec` SPENT. −1 means every running pace
   * burns the whole base drain: running is running, and only easing all the
   * way down to the walk pace (or stopping) turns the pool around.
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
   * Ms of STANDSTILL required after a RUN or a JUMP empties the pool before
   * regen resumes. Bottoming out locks regen, and the lockout only runs down
   * while the hero stands dead still — ANY movement (even a walk) re-arms
   * the full window, so a spent-out hero must plant his feet for this long
   * uninterrupted before the pool starts coming back. Only then does walking
   * regain again.
   */
  emptyRegenLockMs: 2000,
} as const;

/**
 * REGEN — the passive HEALTH trickle SPIRIT drives (a slow out-of-combat mend).
 * Spirit grows neither pool's SIZE (STAMINA sizes hp) but how fast health mends
 * on its own. The regen PAUSES briefly after the hero takes a hit, so it rewards
 * a lull in the fight and never ticks mid-swarm. Units: points/second, ms.
 * Applied in `stepRegen` (regen.ts); the per-second rate is read through
 * `hpRegenPerSec` (items/derived.ts) so the HUD and the sim quote the same
 * number the sim measures.
 */
export const REGEN = {
  /**
   * Health regen pauses this long after the hero takes a hit, so the mend
   * resumes soon after a clean dodge but never ticks while blows are landing.
   * A hit re-arms the full window.
   */
  hpDelayMs: 4000,
  /** Hp/sec per point of effective SPIRIT once the pause lapses (0 at 0 SPIRIT
   * — health regen is entirely spirit's gift, off by default). Gentle: at
   * SPIRIT 60 the hero mends ~3.6 hp/sec, a real between-fights top-up but never
   * a substitute for a medkit mid-swarm. */
  hpPerSpirit: 0.06,
} as const;
