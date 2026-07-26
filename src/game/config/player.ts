// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero's own body and pools: movement, jumping, and the sprint (stamina)
// pool.

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
 * stays FROZEN until the hero has stood still for the RUNG's whole lockout
 * uninterrupted (moving restarts the wait — see the lockout below). The
 * STAMINA stat deepens the pool AND — matching "drains slower, regains
 * faster" — cuts the drain rate and quickens the regen. Units: stamina
 * points (pool), points/second (rates).
 *
 * EVERY term of that economy is DIFFICULTY-LADDERED, authored together in
 * `content/ladder.yaml`: `staminaDrain` scales how fast a run spends the pool,
 * `staminaRefill` prices the standstill breather in seconds, and
 * `staminaEmptyLock` the dead-still a dry pool owes before regen resumes. So a
 * harder rung winds the hero faster, stands him still longer, AND punishes the
 * dry-out harder — one dry-out costs 6.5 s on easy and 14.5 s on JESUS. The
 * three are tuned to one target: a build that spends about a fifth of its stat
 * points on STAMINA rides comfortably; one that spends none runs dry, and the
 * higher the rung the more that costs.
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
  /**
   * Drained per second at a full run, at zero STAMINA stat.
   *
   * Sized against the SUSTAINABLE RUN DUTY CYCLE, not against "how long is one
   * sprint": since the pool only regains at a walk or a stand, the share of
   * time a hero can spend running without ever bottoming out is
   * `run / (run + refill + lockout)`. At the old 16.5 a fresh hero
   * (STAMINA 0–2) could sustain only 45–55% — while a real map demands he move
   * at a run more like 80% of the time, so he lived permanently winded: the
   * balance sim measured him at ZERO stamina for 41% of the opening map, with
   * regen locked out 72% of it and a stamina drink swallowed every 30 seconds.
   * Stamina was a movement TAX rather than a resource.
   *
   * This is the BASE rate, at MEDIUM's 1.0 — each rung scales it by its own
   * `staminaDrainMult`, authored in `content/ladder.yaml` (0.8 on easy up to
   * 2.4 on JESUS). The split of responsibility matters: this number decides the
   * EARLY game, where nobody has points to spend yet (20% of a level-5 hero's
   * four points is a single STAMINA), while the ladder's multiplier decides the
   * LATE one, where builds have genuinely diverged and a hero who spent nothing
   * on STAMINA should feel it.
   *
   * At 5 a fresh hero sustains ~77% on medium — the pool is a real budget he
   * can still overspend, not a tax he can never pay — and a level-20+ build
   * with about a fifth of its points in STAMINA sustains ~85–90% while one with
   * none sits at ~66–73% and runs dry. The STAMINA stat both deepens the
   * reserve and slows this drain, so investment compounds (see the duty-cycle
   * note in `content/ladder.yaml` and the `simulate-run` skill).
   */
  drainPerSec: 5,
  /** Each STAMINA point divides the drain by `1 + points·this` (drains slower). */
  drainReductionPerPoint: 0.12,
  /**
   * The standstill breather is NOT a rate here — the DIFFICULTY LADDER prices
   * it, in SECONDS to refill the base pool (`DifficultyDef.staminaRefillSec`,
   * authored in `content/ladder.yaml`), because seconds are what a player
   * feels. `staminaRegenPerSec` (items/derived.ts) turns the rung's seconds
   * into points per second and folds `regenPerPoint` in. Medium's 5.6 s over
   * this 100-point base pool is the engine's historical 18 points/s, so the
   * rung the game was tuned on is unchanged.
   *
   * Each STAMINA point multiplies that rate by `1 + points·this` (regains
   * faster), so investment shortens the breather as well as lengthening the
   * sprint.
   */
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
   * regen lockout gates a walk's regen the same way it gates the
   * standstill's.
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
   * a spent-out run does (the rung's `staminaEmptyLock`).
   */
  jumpCost: 0.1,
  /**
   * The STANDSTILL a spent-out pool owes before regen resumes is laddered too,
   * and lives with the rest of the stamina economy in `content/ladder.yaml`
   * (`staminaEmptyLock`, in seconds — 1.5 s on easy up to 4.5 s on JESUS),
   * reachable through `staminaEmptyLockMs` (items/derived.ts). Bottoming out
   * locks regen, and the lockout only runs down while the hero stands dead
   * still: ANY movement (even a walk) re-arms the full window, so a spent-out
   * hero must plant his feet for the rung's whole window uninterrupted before
   * the pool starts coming back. Only then does walking regain again.
   */
} as const;
