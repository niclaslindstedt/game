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
 * the climb is a wall of it.
 *
 * UNDER IT THE SKY IS STILL SOMEBODY'S. The climb passes through the birds,
 * the parcel quads, a hobbyist's canopy, the light-aircraft lanes, the
 * airliners at cruise and the solar-winged machines watching everybody from 20
 * km — and above all of that the internet constellation and the military's own
 * orbits over it. Each of those is an authored band of altitude in
 * `layers.ts`; this file prices what a collision with one costs.
 */
/**
 * WHAT A WORLD PX IS WORTH (m) — the one exchange rate every instrument reads.
 * The climb tops out at a 100-mile orbit (low LEO — the bottom of where a junk
 * shell actually lives), so `coursePx` is 160 934 m and a px is this.
 */
const METERS_PER_PX = 11.9;

/**
 * HOW MUCH FASTER THE SKY RUNS THAN THE SKY. A real ascent takes the better
 * part of ten minutes and this one takes half of one, so the whole minigame is
 * played at this compression — which the speed dial already knows about
 * (`climbMph` divides by it, or the hand-over would read thousands of mph a
 * second off the lawn).
 */
const TELEMETRY_LAPSE = 8;

/**
 * A REAL SPEED, IN THE SKY'S OWN UNITS: km/h → world px/s, through the scale
 * and the same compression the dial reads. It is what makes the tables below
 * CHECKABLE — an airliner is authored at 900 km/h rather than at 168, and
 * anybody can tell whether 900 is right.
 *
 * AND EVERY ONE OF THEM IS RELATIVE TO THE SHIP. Down in the air that is the
 * same as a ground speed, because the ship is climbing rather than travelling;
 * up in orbit it is not, and it is the only honest frame there — a satellite's
 * 27 000 km/h and the ship's are very nearly the same 27 000 km/h, and what
 * crosses the frame is the difference their orbits' angle leaves.
 */
export function kphPx(v: number): number {
  return (v / 3.6) * (TELEMETRY_LAPSE / METERS_PER_PX);
}

export const FLIGHT = {
  /**
   * HOW HIGH SAFETY IS (world px of climb) — the top of the ascent, and the
   * distance every density below is laid against.
   *
   * THE FINISH IS A PLACE, NOT A CLOCK: the climb is over when the ship has
   * punched out of the company's junk shell and flown the clear stretch above
   * it (`field.shellTopFrac`), because "safe from the garbage" is the whole
   * win condition — the trip merely HAPPENS to take under a minute (about 27 s
   * of climb flown flat out, twice that nursing the base burn), which is the
   * drive's own length. A slow careful climb takes longer and still gets
   * there; only the board cares.
   */
  coursePx: 13500,
  /** The attract loop's short climb — same sky, same junk, the top brought
   * down, for the same reason the drive's demo leg is short: a title screen
   * has fifteen seconds to show somebody what this minigame is. */
  attractCoursePx: 4600,
  /** The world's scale — see `METERS_PER_PX`. The altitude dial, the speed
   * telemetry, every band in `layers.ts` and every speed in the tables below
   * derive from it; a second, disagreeing scale is the bug it exists to
   * prevent. */
  metersPerPx: METERS_PER_PX,
  /**
   * HOW WIDE ONE SCREENFUL OF SKY IS (world px) — the window the shell is
   * laid across, centred on the SHIP. It is not a wall: the sky has no edges
   * and the ship drifts as far sideways as its lean carries it (`course`
   * below is what that costs). Wider than the reference viewport's ~422 so
   * there is somewhere to steer TO.
   */
  fieldW: 560,

  /**
   * THE LAUNCH CORRIDOR — the column of closed airspace over the pad, and the
   * price of leaving it. Inside `halfPx` of the pad's line the sky is only as
   * busy as the sky is; drift further and the ship is over somebody else's,
   * ramping to fully OFF COURSE over `rampPx`, where every layer of air
   * traffic thickens by its own `offCourseMult` (`layers.ts`). The notice was
   * filed and the corridor was closed; nobody reads GOODCO's notices, so the
   * corridor is a discount rather than a wall. The dashboard's OFF COURSE lamp
   * reads the same ramp.
   */
  course: {
    halfPx: 320,
    rampPx: 900,
  },

  /**
   * THE WIND — real weather, in layers, with a real lever on the ship.
   *
   * Speed GROWS with altitude the way it does out a window: near the lawn a
   * breeze, ramping to the jet stream around `jetAltPx` (which at
   * `metersPerPx` is ~11 km — where the actual jet stream lives) and staying
   * strong above it. Direction and strength come in LAYERS a few hundred px
   * thick, hashed off the flight's seed (`windAt`) — winds aloft genuinely
   * reverse between layers, and a seeded profile is one more thing a restart
   * lets you learn.
   *
   * What the wind can DO is bought with AIR: the push (`pullPerS`, toward the
   * wind's own speed) and the weathervane torque (`tipPerS`) are both scaled
   * by `airFrac`, so the jet stream shoves a ship that is still in the soup
   * and the same wind over the shell moves nothing — a wind meter in vacuum
   * is a dead instrument, and the HUD's says so.
   */
  wind: {
    /** The fastest layer the profile ever deals (± by layer) — a jet core at
     * its worst, which is what the dashboard's SHEAR rung is naming. */
    maxPx: kphPx(400),
    /** Where the profile reaches full strength (world px of altitude). */
    jetAltPx: 900,
    /** How thick one layer of sky is (px) — samples are lerped between. */
    layerPx: 500,
    /** How hard the air drags the hull toward the wind's own speed (per s). */
    pullPerS: 1.3,
    /** The weathervane torque at the reference wind (rad/s² at `maxPx`,
     * before the air scales it) — the tail catching the crosswind, and the
     * half of the weather the player has to FLY rather than ride. Set against
     * the poofs (`steerPerS`): a jet core is about a fifth of full deflection,
     * so it is held off with the thumb and never with a shrug. */
    tipPerS: 0.62,
  },

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
     * the lawn. At `metersPerPx` this is ~170 m up: the liftoff the cutscene
     * just played, still over its own back garden, with the burnt house right
     * below. The minigame must OPEN low — the whole trip is leaving Earth, and
     * a first frame that already reads as the stratosphere spends the entire
     * story before the player has the stick.
     */
    launchAltPx: 14,
    /** Surface gravity (px/s²). The pull FADES on the way up by the only law
     * it has — inverse square (`gravityAt`) — with the planet's radius
     * compressed to the sky's own scale (`gravityRadiusPx`), so the fade the
     * plot wants ("the planet lets go") keeps a physical shape instead of a
     * hand-drawn ramp: ~22% of surface pull at the top of the course. */
    gravityPx: 150,
    gravityRadiusPx: 22000,
    /**
     * THE ENGINE THAT IS ALWAYS BURNING — thrust as the acceleration it buys
     * ON FULL TANKS (px/s²). There is no brake and no idle on this ship: off
     * the pad the burn barely beats surface gravity (thrust-to-weight ~1.17,
     * which is what a real first stage leaves the ground on), so hands-off is
     * a slow climb, never a hover — and the same thrust pushes harder as the
     * tanks drain (`massDryFrac`), which is the honest reason a climb gets
     * easier: the ship is throwing most of itself overboard.
     */
    burnPx: 165,
    /** …and what holding the throttle adds, on the same full-tank scale
     * (px/s²). Boost is the game — the clock and the speed bonus are both
     * bought here — and its price is the flip (`boostTipFrac`). */
    boostPx: 200,
    /**
     * THE WEIGHT OF THE ROCKET, as what is LEFT when the tanks run dry —
     * dry mass over wet, so ~59% of the ship on the pad is propellant (a
     * garage build hauling its own fuel shed; a real orbital stage is nearer
     * 10%, but a real stage also is not wearing a shed). Thrust is constant,
     * so acceleration is divided by the mass of the moment: the pad hand-over
     * answers the stick like a loaded truck and the last clear stretch like an
     * empty one.
     */
    massDryFrac: 0.59,
    /** How fast the tanks drain (fraction of the full load per second): the
     * base burn's share, and what full boost adds. Sized so a boosted flight
     * arrives nearly dry — the mass curve is spent across the whole trip
     * rather than in its first act. */
    burnFuelPerS: 1 / 75,
    boostFuelPerS: 1 / 110,
    /**
     * Drag, as k in `k · medium · v²` (per px). The MEDIUM is two things laid
     * end to end: the ATMOSPHERE (`airFrac`, thinning to `airFloorFrac` over
     * the course) and the JUNK SHELL'S OWN DUST — thirty years of fired
     * garbage grinding itself to grit, so it follows the shell's density
     * profile (`bandFrac` × `dustK`) and PEAKS just under the shell's top.
     * Together they are the minigame's speed governor: the dodge stays
     * playable because the sky has a terminal velocity everywhere the sky has
     * things in it — and ABOVE the shell both are gone, so the clear stretch
     * is the one place the burn genuinely runs away toward orbital speed.
     * "We need to keep going faster to leave Earth" is this curve.
     */
    dragK: 0.0012,
    airFloorFrac: 0.06,
    dustK: 0.6,
    /**
     * THE INSTABILITY (rad/s² at a full right-angle lean) — the inverted
     * pendulum's spring. Near upright the divergence rate is √tip = 1/s: a
     * neglected lean doubles in about seven tenths of a second — long enough
     * to catch, short enough to punish a player watching the junk instead of
     * the ship.
     */
    tipPerS: 1.0,
    /**
     * HOW MUCH THE THROTTLE FEEDS THE FLIP — boost multiplies the instability
     * by `1 + boostTipFrac`, which is the minigame's one trade: more speed IS
     * less balance, and the player's thumb is the exchange rate.
     *
     * It is only HALF the price of speed, and the smaller half — the other is
     * the air's (`aeroTipPerS`), which bills the speed itself rather than the
     * thumb holding the throttle.
     */
    boostTipFrac: 1.25,
    /**
     * THE OVERTURNING MOMENT (rad/s² at the reference airspeed in thick air) —
     * the AIR's own vote on the lean, and the honest reason a real ascent
     * throttles DOWN through max-Q.
     *
     * A rocket flying fast at an angle to its own airflow is a weathercock
     * held the wrong way round: the push on the flank acts ahead of where the
     * ship pivots, so it does not straighten the lean, it feeds it — and by
     * the SQUARE of the airspeed. That is the difference between the two
     * halves of the climb, and the whole shape of the decision the player is
     * being asked for: down in the soup, going fast is what tips you over and
     * the answer is to ease off; up where the air has gone the same speed
     * costs nothing and the throttle is free.
     *
     * Bought with air like everything the weather does, so it is GONE above
     * the shell — the clear stretch is the one place a ship can run away.
     */
    aeroTipPerS: 1.35,
    /** The airspeed the figure above is quoted at (px/s) — a brisk climb. */
    aeroRefPx: 420,
    /** …and the most of it the arithmetic honours, as a multiple. A ship in
     * vacuum at five times the reference is not five times as unstable; it is
     * in vacuum. The cap is what stops the term running away before the air
     * has finished thinning. */
    aeroCap: 2.6,
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
    /** Lateral drag (per s) — the sideways bleed the air takes off a leaning
     * burn. There is no wall to lean on out there: a held lean carries the
     * ship off course for real, and the corridor (`course`) prices it. */
    lateralDragPerS: 0.6,
    /** The hull as the collision model holds it (px): a capsule this wide and
     * this tall around the ship's centre — the `ship_*` art's own hull (24×32
     * with the fins outside the capsule; a bag brushing a fin is a miss, which
     * is the forgiving side to round on). */
    shipHalfW: 6,
    shipHalfH: 15,
  },

  /**
   * WHAT BOUNCES AND WHAT IT COSTS. Trash never holes the hull — it comes
   * apart against it, leaves its mark on the paintwork, and SHOVES the ship
   * by its own weight: every junk variant carries a defined mass (`JUNK_KG`,
   * field.ts), and the bill below is priced per `refKg` of it. A crushed can
   * is a tap the dials barely notice; a couch is a wallop that puts the whole
   * climb on the wrong shoulder. WHERE it lands matters as much as what it
   * weighs — the twist is a lever about the ship's centre, so a bag off the
   * nose wrenches where the same bag amidships only shoves.
   */
  trash: {
    /** The reference mass the three rates below are quoted at (kg) — a
     * couch-class hit is one whole unit of each. */
    refKg: 60,
    /** The sideways shove at `refKg` (px/s, away from the side it hit). */
    pushPx: 66,
    /** The twist at `refKg` for a hit at the very nose or tail (rad/s) —
     * scaled by the lever arm, so an amidships hit twists nothing. A
     * couch off the nose is most of the way to the warning line on its own,
     * which is the point: the garbage is harmless to the HULL and is still
     * the thing that ends most climbs. */
    kickPerS: 0.8,
    /** …and the knock every hit gives regardless of where it lands (rad/s at
     * `refKg`, signed by side) — the thud's own share, so even an amidships
     * couch is FELT on the balance. */
    baseKickPerS: 0.22,
    /** Climb speed lost at `refKg` (fraction of `vy`). */
    speedLossFrac: 0.07,
    /** The heaviest hit the arithmetic honours, as a multiple of `refKg` —
     * a clamp, so no future variant can be authored into a one-hit flip. */
    maxKgFrac: 1.5,
    /** How many scuffs the hull has room to WEAR (the renderer's cap — past
     * this the count still climbs, the ship just has no clean panel left). */
    maxWorn: 12,
  },

  /**
   * WHAT DOES NOT STICK. Anything BUILT holes the ship, and knocks it off its
   * balance — which on this ship is the worse half of the bill. What each one
   * costs the skin is what it weighs and how fast it was going: a delivery
   * quad is a lithium firecracker, a comms box is a van at orbital speed, a
   * military bird is a bus, and an aircraft met in its own lane is very nearly
   * the end of any ship.
   */
  hazard: {
    /** Hull taken by a satellite off the constellation (fraction of the whole
     * ship). Three of these is a short flight. */
    satelliteHullFrac: 0.34,
    /** …and by a military bird: bigger, heavier, and nobody's product. */
    milsatHullFrac: 0.46,
    /** …and by a rock. */
    rockHullFrac: 0.2,
    /** …and by a drone: cheap, and there are always more. */
    droneHullFrac: 0.12,
    /** The lean a hit knocks in (rad/s, signed by side) — the reason a hit at
     * a hard lean is usually the last one. */
    kickPerS: 0.55,
    /** Climb speed kept on impact. */
    speedKeep: 0.9,
  },

  /**
   * WHAT COMES APART ON THE HULL — the sky's soft bodies: birds low down,
   * skydivers and paragliders under them (somebody is always having a hobby
   * off the corridor). None of them holes a rocket; they BURST across it, the
   * drive's crowd met a thousand feet up, and what that leaves riding the
   * paintwork is the app's business (the gore gate decides red or fairy
   * dust — `FlightParams.gib`/`dust`). The sim's bill is a knock and a smear
   * on the speed, plus the tally the scorecard prints and pays nothing for.
   */
  soft: {
    /** The lean a body knocks in (rad/s, signed by side) — a thud, not a
     * hazard's wallop. */
    kickPerS: 0.12,
    /** Climb speed kept on the thud. */
    speedKeep: 0.995,
  },

  /**
   * HOW THE SKY'S TRAFFIC MOVES — the speeds and the entry geometry every
   * flying thing is minted with, authored in km/h so the table can be
   * ARGUED WITH. WHERE each of them flies is not here: the bands are in
   * `layers.ts`, because the altitude of an airliner is a fact about the
   * world and a crossing speed is a fact about the machine.
   *
   * AND HOW IT MOVES IS ITS OWN FACT TOO. An aircraft cruises LEVEL; a bird
   * flies level and bobs; a canopy is the only thing in the sky that is
   * genuinely coming DOWN; a quad holds station. What is in orbit does not
   * fall at all — that is what an orbit is — so the shell and its rocks drift
   * ALONG-TRACK with barely any vertical to them at all.
   */
  traffic: {
    /** How far to the side of the ship a crosser enters (px). */
    entryPx: 420,
    /** Airliner cruise. */
    planeKph: [850, 950] as const,
    /** …and a high-wing single, which is a quarter of it. */
    lightPlaneKph: [180, 260] as const,
    /** A gull crossing. Next to a climbing rocket this is standing still,
     * which is exactly what it looks like out of the window. */
    birdKph: [40, 80] as const,
    /** …and how much it rises and falls doing it. */
    birdBobKph: [0, 25] as const,
    /** A parcel quad on its route. */
    droneKph: [40, 90] as const,
    /** …and a solar-winged watchkeeper, which flies fast up there because the
     * air is thin, and is never in a hurry to be anywhere. */
    watchDroneKph: [90, 160] as const,
    /** A canopy's sink rate, and how much of a forward drive it is flying
     * with — the two numbers a parachute actually has. */
    diverSinkKph: [14, 25] as const,
    diverDriveKph: [0, 40] as const,
    /** A paraglider's: faster across, and barely sinking at all. */
    gliderKph: [25, 45] as const,
    gliderSinkKph: [3, 8] as const,
  },

  /**
   * THE SHELL — how thick the sky is with GOODCO's disposal business, laid
   * down by altitude as the climb unrolls on its own running mark, exactly the
   * drive's crowd marks.
   *
   * IT IS THE ONE POPULATION THAT IS NOT A NEIGHBOURHOOD. Everything else that
   * flies owns a band of sky (`layers.ts`); the garbage is a CEILING the whole
   * upper climb is under, so it keeps its own thickening profile here rather
   * than a from/to. The density is per 1000 px of climb at the band's PEAK;
   * the rung multiplies it (`DifficultyDef.flight.junkMult`).
   */
  field: {
    /**
     * WHERE THE GARBAGE STARTS (world px of altitude) — above the airways, at
     * about 31 km. Nothing the company fired up there came back down this far,
     * and keeping the shell off the bottom of the sky is what lets the low
     * climb be the neighbourhoods it is: birds, parcel quads, somebody's
     * canopy and the lanes, with the first bag arriving only once the ship is
     * genuinely out of the weather. The mission strip's JUNK SHELL station
     * reads the same line (`missionProgress`).
     */
    startAltPx: 2600,
    /** Pieces per 1000 px of climb at the band's PEAK. Sized so the last
     * stretch under the shell's top is a WALL rather than a scatter — which is
     * the whole fiction, and the reason leaving is the hard part. */
    junkPerKPx: 16,
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
     * begins. Nothing in `layers.ts` is laid above it either.
     */
    shellTopFrac: 0.85,
    /** How far above the ship the field is laid and how far below it is swept
     * (px) — the sky only exists around the climb. */
    aheadPx: 900,
    behindPx: 320,
    /**
     * HOW THE GARBAGE MOVES — along-track drift relative to the ship (km/h,
     * ±). It is in ORBIT: it is not falling, and it is not going anywhere the
     * ship is not already going. What is left after the two orbits cancel is
     * this, a few tens of km/h of nothing much, which is why a bag hangs in
     * the frame long enough to be steered around.
     */
    junkKph: [20, 130] as const,
    /** …and how much of that is vertical: almost none. An orbit that fell
     * would not be an orbit. */
    junkRiseFrac: 0.18,
    /**
     * A SATELLITE CROSSING (km/h, relative). Both orbits are doing about
     * 27 000 km/h and the difference is the ANGLE between them, so a few
     * degrees of inclination is the whole of this figure — and it is still
     * the fastest thing the climb meets by a factor of ten.
     */
    satelliteKph: [900, 2000] as const,
    /** …and a military bird's, which is steeper: those orbits go over the
     * poles, and the ship's does not. */
    milsatKph: [1400, 2600] as const,
    /** …and a loose piece of orbital rock, somewhere between the two. */
    rockKph: [500, 1500] as const,
    /** How much of a rock's speed is vertical — a different orbit is a
     * different PLANE, not a fall. */
    rockRiseFrac: 0.22,
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
    /** Sideways drift the module starts with (px/s, seeded ±), and the lean it
     * is handed with it (rad, seeded ±). Both are scaled by the rung
     * (`DifficultyDef.flight.driftMult`) — the mess the drop opens on is half
     * of what makes one rung's drop harder than another's. */
    startVxPx: 20,
    startTiltRad: 0.12,
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

  /**
   * THE ORBIT BEAT — what the ship does with the win, staged over the hold:
   * the planet lets go, the climb bleeds off to a FLOAT (the first stillness
   * the trip has had), the spent booster is dropped, and the upper stage
   * lights and pulls away toward the moon. The sim integrates all of it —
   * where the hull is remains a sim fact even mid-celebration — and raises
   * `separation` once, on the hinge.
   */
  orbit: {
    /** Ms of SETTLE: lean and climb both worked toward the float. */
    settleMs: 1100,
    /** Ms of FLOAT after the settle — adrift, engine quiet, the breath. */
    floatMs: 1500,
    /** The drift the settle eases the climb down to (px/s, up). */
    floatVy: 24,
    /** The departure burn once the booster is away (px/s²) — the stage
     * pulling out of frame is the beat's last picture. */
    awayPx: 320,
  },

  /** How long each terminal beat holds before the screen acts on it (ms):
   * the wreck's smoke, the orbit sequence (settle, float, separation, the
   * departure — see `orbit`), and the landed module's moment of being looked
   * at. */
  wreckHoldMs: 2400,
  orbitHoldMs: 5400,
  landedHoldMs: 3200,

  /**
   * THE SPEED THE DASHBOARD SAYS OUT LOUD — a launch webcast's telemetry, and
   * the one instrument in the game allowed five digits.
   *
   * A webcast's speed figure is mostly SIDEWAYS: a ship does not reach orbit
   * by climbing but by going 17 000 mph across, and the picture stays a
   * close-up of a rocket pointing up while the dial runs away — which is
   * exactly this minigame's situation. So the figure is two components in
   * quadrature (`flightMph`): the CLIMB the player is actually flying, and the
   * DOWNRANGE speed of the gravity turn the camera never shows, ramped with
   * altitude (`downrangeExp`) to `orbitalMph` — 17 060 mph, which IS low-orbit
   * speed, and the figure the dial pegs at.
   *
   * `telemetryLapse` divides the climb component: the minute-long minigame
   * compresses an ascent that takes the better part of ten, so a raw px/s
   * conversion would read thousands of mph seconds off the lawn. Divided by
   * the compression, the hand-over reads a few hundred — a rocket a few
   * seconds into its burn — and the ramp to five digits is the trip's.
   */
  orbitalMph: 17060,
  telemetryLapse: TELEMETRY_LAPSE,
  downrangeExp: 1.6,

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
    /** Per mph of the fastest the dial ever said. The dial reads five digits,
     * so the rate is small — pegged at orbital speed it is worth ~6000. */
    perTopMph: 0.35,
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
 * live in, mostly gone by the top of the climb. Linear on purpose — this
 * curve is the minigame's speed governor (see `dragK`). */
export function airFrac(alt: number, coursePx: number): number {
  const thin = 1 - alt / coursePx;
  return Math.max(FLIGHT.ascent.airFloorFrac, thin);
}

/** Earth's pull at this altitude (px/s²) — inverse square, on the compressed
 * radius `gravityRadiusPx`: ~22% of surface pull at the top of the course,
 * which is what "leaving" feels like on the climb dial. */
export function gravityAt(alt: number): number {
  const a = FLIGHT.ascent;
  const r = 1 + Math.max(0, alt) / a.gravityRadiusPx;
  return a.gravityPx / (r * r);
}

/**
 * HOW MUCH HARDER THE SAME THRUST PUSHES with this much propellant left —
 * the acceleration multiplier against the full-tank figures (`burnPx`,
 * `boostPx`): 1 on the pad, `1 / massDryFrac` (~1.7) with the tanks dry.
 * Constant thrust over a shrinking ship is the whole honest physics of a
 * climb that gets easier.
 */
export function fuelMassMult(fuel: number): number {
  const dry = FLIGHT.ascent.massDryFrac;
  const f = Math.max(0, Math.min(1, fuel));
  return 1 / (dry + (1 - dry) * f);
}

/** Px/s of climb → the mph the telemetry prints for it — through the world
 * scale and the broadcast's time compression (`telemetryLapse`). */
export function climbMph(vPx: number): number {
  const MPH_PER_MPS = 2.23694;
  return (
    (Math.abs(vPx) * FLIGHT.metersPerPx * MPH_PER_MPS) / FLIGHT.telemetryLapse
  );
}

/** The gravity turn's downrange speed at this point of the climb (mph) — the
 * sideways half of orbit the camera never shows, ramped to `orbitalMph` at
 * the top of the course. */
export function downrangeMph(altFrac: number): number {
  const t = Math.max(0, Math.min(1, altFrac));
  return FLIGHT.orbitalMph * Math.pow(t, FLIGHT.downrangeExp);
}

/** HOW FAR OFF COURSE this x is, 0–1: nothing inside the corridor, ramping
 * over `course.rampPx` beyond its edge. The stray spawner's throttle and the
 * dashboard's lamp both read this one ramp. */
export function offCourseFrac(x: number): number {
  const away = Math.abs(x - FLIGHT.fieldW / 2) - FLIGHT.course.halfPx;
  return Math.max(0, Math.min(1, away / FLIGHT.course.rampPx));
}

/** A cheap integer hash → 0..1 — the wind's layers must not spend anybody's
 * stream (the same rule the sky's stars follow). */
function windHash(seed: number, n: number): number {
  let h = Math.imul((seed ^ n) >>> 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * THE WIND AT THIS ALTITUDE (px/s, signed) — the flight's weather report,
 * derived rather than stored: layers `layerPx` thick, each dealt its own
 * speed and direction off the seed, lerped so a climb feels the wind VEER
 * rather than snap. The envelope grows toward `jetAltPx` and holds — how
 * much of it the SHIP feels is the air's business (`stepAscent` scales the
 * push and the torque by `airFrac`), not this function's.
 */
export function windAt(seed: number, alt: number): number {
  const w = FLIGHT.wind;
  const layer = Math.max(0, alt) / w.layerPx;
  const i = Math.floor(layer);
  const t = layer - i;
  // Smoothstep between the two neighbouring layers' deals.
  const ease = t * t * (3 - 2 * t);
  const deal = (n: number) => {
    const speed = 0.35 + 0.65 * windHash(seed, n * 2 + 1);
    const dir = windHash(seed, n * 2) < 0.5 ? -1 : 1;
    return dir * speed;
  };
  const mixed = deal(i) * (1 - ease) + deal(i + 1) * ease;
  const envelope = Math.min(1, Math.max(0, alt) / w.jetAltPx) ** 0.7;
  return w.maxPx * envelope * mixed;
}
