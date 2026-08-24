// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S NUMBERS — the climb out of Earth's junk-choked orbit and the
// landing on the moon, and everything floating in between.
//
// THE ONE RULE THIS FILE IS BUILT ON: the rocket is an INVERTED PENDULUM, and
// the whole minigame is that fact. A rocket balancing on its own thrust never
// tends upright — every degree of lean grows the next degree faster, and
// opening the throttle feeds the flip as surely as it feeds the climb. So the
// player is never done steering: the game is holding a thing that wants to
// fall over while making it go faster, and every knob below is priced against
// that trade. Nothing here fakes it with a "wobble timer" — the tilt is real
// dynamics (`tipPerS` is the divergence rate), which is what makes the third
// attempt feel learnable instead of random.
//
// THE SECOND RULE is the drive's: nothing here is spent from `state.rng()`,
// because there is no run under a flight at all — the sky is its own little
// world with its own seeded stream (`FlightState.rng`), so a flight can be
// replayed, tested headlessly and A/B'd without ever shifting a loot roll.

/**
 * WHY THE SKY IS FULL — the fiction the field spawner is authored against.
 *
 * GOODCO makes the Earth clean. Nobody down there knows how; up here it is
 * obvious — everything the company "recycles" is fired into orbit on a
 * government disposal contract, and thirty years of that is a shell of garbage
 * around the planet. The billionaires left before the shell closed. Everybody
 * else is trapped under the company's trash, which is why the junk THICKENS
 * with altitude (`bandFloorFrac`): the low sky is merely dirty and the top of
 * the climb is a wall of it. The satellites are GOODCO's other business up
 * here, and the only things in the field that move with any purpose.
 */
export const FLIGHT = {
  /**
   * HOW HIGH SAFETY IS (world px of climb) — the top of the ascent, and the
   * distance every density below is laid against.
   *
   * THE FINISH IS A PLACE, NOT A CLOCK: the climb is over when the ship has
   * punched out of the company's junk shell and flown the clear stretch above
   * it (`field.shellTopFrac`), because "safe from the garbage" is the whole
   * win condition — the trip merely HAPPENS to take about a minute at the
   * ~210 px/s a decent pilot averages, which is the drive's own length. A slow
   * careful climb takes longer and still gets there; only the board cares.
   */
  coursePx: 13500,
  /** The attract loop's short climb — same sky, same junk, the top brought
   * down, for the same reason the drive's demo leg is short: a title screen
   * has fifteen seconds to show somebody what this minigame is. */
  attractCoursePx: 4600,
  /** How wide the sky is (world px). Wider than the reference viewport's ~422
   * so there is somewhere to steer TO, narrow enough that the whole field is
   * never more than a lean away. */
  fieldW: 560,

  opening: {
    /**
     * MS THE ROCKET FLIES ITSELF before the controls are handed over — the
     * launch is the cutscene's beat, so the minigame opens already climbing,
     * steady, with the GET READY card over it. While it holds, the tilt is
     * damped flat and every input is IGNORED rather than merely unread — a
     * thumb resting on the pad during the hand-over must not pre-load a lean.
     */
    handsOffMs: 1600,
    /** …and the same courtesy on the landing's first beat: the module is
     * dropped into frame falling, and the player gets a breath to see where
     * the ground is before the throttle is theirs. */
    landingHandsOffMs: 900,
  },

  ascent: {
    /**
     * WHERE THE HAND-OVER FINDS THE SHIP (world px of altitude) — barely off
     * the lawn. The course is ~100 km of climb (`coursePx` reads as 62 miles
     * on the dial), so a world px is ~7.4 m and this is about 100 m up: the
     * liftoff the cutscene just played, still over its own back garden, with
     * the burnt house right below. The minigame must OPEN low — the whole
     * trip is leaving Earth, and a first frame that already reads as the
     * stratosphere spends the entire story before the player has the stick.
     */
    launchAltPx: 14,
    /** Surface gravity (px/s²), and the floor it fades to at orbit — leaving
     * Earth is the whole plot, so the climb genuinely gets easier as the
     * planet lets go. */
    gravityPx: 150,
    gravityFloorFrac: 0.22,
    /** The engine that is ALWAYS burning (px/s²). There is no brake and no
     * idle on this ship: the burn slightly beats surface gravity, so hands-off
     * is a slow climb, never a hover. */
    burnPx: 178,
    /** …and what holding the throttle adds (px/s²). Boost is the game — the
     * clock and the speed bonus are both bought here — and its price is the
     * flip (`boostTipFrac`). */
    boostPx: 215,
    /**
     * Aerodynamic drag at sea level, as k in `k · v²` (per px). Thins with the
     * air (`airFloorFrac`), so the same burn that tops out near 520 px/s in
     * the soup low down runs away toward `topSpeedPx` where the sky goes
     * black — "we need to keep going faster to leave Earth" is this curve.
     */
    dragK: 0.0009,
    airFloorFrac: 0.06,
    /**
     * THE INSTABILITY (rad/s² at a full right-angle lean) — the inverted
     * pendulum's spring. Near upright the divergence rate is √tip = 1/s: a
     * neglected lean doubles in about seven tenths of a second — long enough
     * to catch, short enough to punish a player watching the junk instead of
     * the ship.
     */
    tipPerS: 1.0,
    /** How much the throttle feeds the flip — boost multiplies the instability
     * by `1 + boostTipFrac`, which is the minigame's one trade: more speed IS
     * less balance, and the player's thumb is the exchange rate. */
    boostTipFrac: 0.85,
    /** The steering poofs (rad/s² at full deflection) — comfortably stronger
     * than the instability, so a caught lean is always recoverable and a lost
     * one was lost seconds ago. */
    steerPerS: 2.9,
    /** A whisper of damping (per s) — the poofs' own automatic trim. Keeps the
     * hands-off opening from diverging during GET READY; far too weak to hold
     * the ship for the player. */
    tiltDampPerS: 0.5,
    /**
     * THE WANDERING BIAS (rad/s² amplitude, wandering over `gustPeriodMs`) —
     * why the rocket NEVER tends straight up. A garage-built ship has a bent
     * fin and an off-centre tank: the torque it flies with drifts from one
     * shoulder to the other on a slow seeded sinusoid, so "balanced" is a spot
     * that keeps moving and the player's thumb never gets to rest.
     */
    gustPerS: 0.16,
    gustPeriodMs: 5200,
    /** The lean the ship leaves the pad with (rad, seeded ±) — the first thing
     * the hand-over hands over is a problem. */
    launchTiltRad: 0.055,
    /** PAST THIS LEAN THE SHIP IS GONE (rad, ~64°): the flip has won, the nose
     * is below the thrust line, and the next beat is the explosion. */
    flipRad: 1.12,
    /** …and the lean the dashboard starts shouting at (rad). */
    warnRad: 0.72,
    /** Falling faster than this (px/s, downward) is falling, not settling —
     * the climb has stalled past saving and the ship is wrecked. */
    fallLimitPx: 90,
    /** Lateral drag (per s) — space is not soup, but a leaning burn is, and
     * without a little bleed the ship skates to the edge and lives there. */
    lateralDragPerS: 0.6,
    /** How close to the field's edge the ship may drift (px) before the sky
     * simply refuses — there is nothing out there but more junk. */
    edgeMarginPx: 26,
    /** The hull as the collision model holds it (px): a capsule this wide and
     * this tall around the ship's centre — the `ship_*` art's own hull (24×32
     * with the fins outside the capsule; a bag brushing a fin is a miss, which
     * is the forgiving side to round on). */
    shipHalfW: 6,
    shipHalfH: 15,
  },

  /**
   * WHAT STICKS AND WHAT IT COSTS. Trash does not hole the hull — it LANDS on
   * it and rides along, which is the joke ("making it trashy") and the
   * handling penalty in one: every stuck bag adds inertia the poofs have to
   * shove, so a filthy ship answers the stick like a barge.
   */
  trash: {
    /** Each stuck piece's share of the ship's handling — the poofs' authority
     * is divided by `1 + count · massFrac`, so eight bags is roughly half the
     * steering it launched with. */
    massFrac: 0.09,
    /** Climb speed kept on the thud (a fraction — the bag costs a nudge, not a
     * crash). */
    speedKeep: 0.985,
    /** The lean it knocks in (rad/s, signed by which side it hit). */
    kickPerS: 0.22,
    /** How many pieces the hull has room to WEAR (the renderer's cap — past
     * this the count still climbs, the ship just has no clean panel left). */
    maxWorn: 12,
  },

  /**
   * WHAT DOES NOT STICK. A GOODCO satellite is a van-sized machine on its own
   * orbit and a rock never asked anybody; both of them HOLE the ship, and both
   * knock it off its balance — which on this ship is the worse half of the
   * bill.
   */
  hazard: {
    /** Hull taken by a satellite (fraction of the whole ship). Three of these
     * is a short flight. */
    satelliteHullFrac: 0.34,
    /** …and by a rock. */
    rockHullFrac: 0.2,
    /** The lean a hit knocks in (rad/s, signed by side) — the reason a hit at
     * a hard lean is usually the last one. */
    kickPerS: 0.55,
    /** Climb speed kept on impact. */
    speedKeep: 0.9,
  },

  /**
   * THE FIELD — how thick the sky is with GOODCO's disposal business, laid
   * down by altitude as the climb unrolls (one spawn mark per kind, exactly
   * the drive's crowd marks). Densities are per 1000 px of climb at the band's
   * PEAK; the rung multiplies them (`DifficultyDef.flight`).
   */
  field: {
    /** Nothing in the first stretch — the low sky is the cutscene's, and the
     * player gets the controls before the first bag arrives. */
    startAltPx: 900,
    junkPerKPx: 9,
    satellitePerKPx: 1.6,
    rockPerKPx: 1.1,
    /** The band's floor: density at the bottom of the sky as a fraction of the
     * top. The shell THICKENS with altitude — leaving is the hard part. */
    bandFloorFrac: 0.35,
    /**
     * WHERE THE SHELL ENDS, as a fraction of the course — and the whole shape
     * of the ending. The density climbs to its peak just under this line and
     * CUTS OFF at it, so the climb's last beat is the sky going suddenly,
     * conspicuously empty: the player has exited the garbage, knows it at a
     * glance, and flies the clear stretch to the top with nothing left to hit.
     * "Safe from the floating garbage" is the finish; the line is where safe
     * begins.
     */
    shellTopFrac: 0.85,
    /** How far above the ship the field is laid and how far below it is swept
     * (px) — the sky only exists around the climb. */
    aheadPx: 900,
    behindPx: 320,
    /** Sideways drift a junk piece floats with (px/s, ±). */
    junkDriftPx: 9,
    /** …a satellite crosses with (px/s, the one purposeful mover up here). */
    satellitePx: [62, 130] as const,
    /** …and a rock falls diagonally with (px/s, each axis its own roll). */
    rockPx: [22, 55] as const,
  },

  landing: {
    /** Where the drop starts (px above the regolith) and how fast it is already
     * falling (px/s, downward) when the module comes into frame. */
    startAltPx: 640,
    startVyPx: 55,
    /** The moon's pull (px/s²) — a sixth of home, and the whole reason this
     * half is the gentle half. */
    gravityPx: 44,
    /** The descent engine (px/s², along the module's own axis). Comfortably
     * above gravity: hover is cheap, and the game is patience. */
    mainPx: 96,
    /** The module's poofs (rad/s²) — the same steering, on a craft with no
     * instability to fight: tilt goes where it is put and stays there. */
    steerPerS: 2.2,
    tiltDampPerS: 1.4,
    /** The module's own capsule (px) — the `orbit_lander` art's. */
    shipHalfW: 10,
    shipHalfH: 9,
    /** THE THREE GATES A TOUCHDOWN PASSES OR PAYS FOR: falling no faster than
     * this (px/s), drifting no faster than this (px/s), leaning no further
     * than this (rad). Miss any one and the module is wreckage and the flight
     * restarts from the top of the DROP — never the whole climb. */
    safeVyPx: 50,
    safeVxPx: 32,
    safeTiltRad: 0.35,
    /** The marked pad (half-width px, position seeded per flight) — landing is
     * legal anywhere flat, the pad just pays (`score.pad`). */
    padHalfW: 34,
    /** Sideways drift the module starts with (px/s, seeded ±). */
    startVxPx: 20,
  },

  /**
   * WHAT AN EXPLOSION DOES TO THE SKY AROUND IT — the blast is SIM, not
   * presentation, for the drive's shockwave reason: the ring the player sees
   * is drawn app-side, but what it does on the way out is scatter the field
   * (junk within `pushR` is shoved away, anything inside `coreR` comes apart),
   * and where a bag ends up is a fact the renderer must not invent.
   *
   * …AND A SATELLITE CAUGHT IN ONE GOES UP ITSELF, after a beat proportional
   * to its distance (`chainDelayMsPerPx`) — the company parked its hardware in
   * its own landfill, and the chain reaction is the flight's best sight. Every
   * blast the chain spawns pushes and destroys exactly like the one that lit
   * it, so one bad satellite can take a whole shelf of the sky with it.
   */
  blast: {
    /** The ship (or the module) going up. */
    big: { coreR: 70, pushR: 200, maxMs: 900, powerPx: 340 },
    /** A satellite going up — struck by the ship, or caught in a chain. */
    small: { coreR: 36, pushR: 130, maxMs: 700, powerPx: 220 },
    /** Ms of fuse per px of distance from the blast that lit it — the chain
     * reads as a chain because the far end goes last. */
    chainDelayMsPerPx: 3,
    /** What a nearby small blast does to a still-flying ship: a shove (px/s,
     * scaled by closeness) and a knock to the lean (rad/s) — hitting a
     * satellite is an explosion at arm's length, and the balance pays for it. */
    craftPushPx: 90,
    craftKickPerS: 0.5,
  },

  /** How long each terminal beat holds before the screen acts on it (ms):
   * the wreck's smoke, the orbit-reached breath, and the landed module's
   * moment of being looked at. */
  wreckHoldMs: 2400,
  orbitHoldMs: 2600,
  landedHoldMs: 3200,

  /** The speed the dashboard says out loud: `topSpeedPx` px/s reads as
   * `topSpeedMph` mph. Escape velocity is 25 000 mph and the dial says so —
   * the one instrument in the game allowed five digits. */
  topSpeedPx: 640,
  topSpeedMph: 25020,

  score: {
    /** Flat, for getting there at all — only a LANDING scores; every wreck on
     * the way restarted its own half instead. */
    arrival: 2000,
    /** The time bonus, per second under par — the biggest term, because the
     * clock is the thing the throttle is for. */
    perSecondUnderPar: 250,
    /** The pace ascent par is set at (px/s of climb) — beatable by boosting
     * well, comfortably missed by climbing on the base burn. */
    parSpeedPx: 260,
    /** …and the landing's share of par (ms): a patient, safe drop fits inside
     * it with a little to spare. */
    landingParMs: 26000,
    /** Per mph of the fastest the ship went. The dial reads five digits, so
     * the rate is small — flat out for a moment is worth ~6300. */
    perTopMph: 0.25,
    /** The whole of it, for reaching orbit without a hole in the ship — scaled
     * by the hull actually left. */
    hull: 8000,
    /** The touchdown bonus, scaled by how gently the pads met the ground —
     * a feather is the whole of it, the legal limit is nothing. */
    touchdown: 3000,
    /** …and flat, for putting it ON the marked pad. */
    pad: 1000,
    /** Scores are rounded to this, the way an arcade cabinet's are. */
    round: 10,
  },
} as const;

/** How the flight ended — read by the app to decide what happens next. */
export const FLIGHT_OUTCOME = {
  /** Still going — either half. */
  flying: "flying",
  /** The climb is done: hold the beat, then the drop (`beginDescent`). */
  toOrbit: "toOrbit",
  /** The ship (or the module) is gone: restart the half that killed it. */
  wrecked: "wrecked",
  /** Down, intact, on the moon: hand on to the destination. */
  landed: "landed",
} as const;

export type FlightOutcome =
  (typeof FLIGHT_OUTCOME)[keyof typeof FLIGHT_OUTCOME];

/** WHY the ship is wreckage — picked once when the outcome turns, so the app's
 * card can say what happened rather than that something did. */
export const FLIGHT_WRECKS = {
  /** The flip won: past `flipRad` the nose is under the thrust line. */
  flipped: "flipped",
  /** The hull gave out — one GOODCO satellite too many. */
  holed: "holed",
  /** The climb stalled and the ship fell back into the soup. */
  fell: "fell",
  /** The module met the moon harder than the legs allow. */
  crashed: "crashed",
} as const;

export type FlightWreck = (typeof FLIGHT_WRECKS)[keyof typeof FLIGHT_WRECKS];

/** The ascent's course for these params — the attract loop brings the top
 * down, every played flight climbs the whole way. */
export function flightCoursePx(params: { coursePx?: number }): number {
  return params.coursePx ?? FLIGHT.coursePx;
}

/** Air density at this altitude (0–1): the soup the drag and the gusts both
 * live in, gone by the top of the climb. */
export function airFrac(alt: number, coursePx: number): number {
  const thin = 1 - alt / coursePx;
  return Math.max(FLIGHT.ascent.airFloorFrac, thin);
}

/** Earth's pull at this altitude (px/s²) — fading toward the floor as the
 * planet lets go, which is what "leaving" feels like on the climb dial. */
export function gravityAt(alt: number, coursePx: number): number {
  const a = FLIGHT.ascent;
  const fade = Math.max(a.gravityFloorFrac, 1 - (alt / coursePx) * 0.9);
  return a.gravityPx * fade;
}
