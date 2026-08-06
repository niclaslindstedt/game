// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE'S NUMBERS — the road between the garage and GOODCO, and everything
// on it.
//
// THE ONE RULE THIS FILE IS BUILT ON: the collision is REAL PHYSICS in REAL
// UNITS, and the game's feel is bought with the SCALE knobs beside it, never by
// fudging the physics. A body meeting a wagon is a momentum problem with a
// known answer, and the answer is what makes the minigame legible — a hit taken
// square on the nose at 120 costs a fifth of your speed and a fifth of the car,
// and the same body clipped on the wing costs almost nothing. A player learns
// that in three hits without being told, and no amount of hand-tuned "speed
// penalty per pedestrian" reproduces it. So `mPerPx`, `carMassKg` and
// `pedestrianMassKg` are the world's actual units and `impact.js`/`wearJoules`
// are the dials; move the dials.
//
// THE SECOND RULE: nothing here is spent from `state.rng()`, because there is
// no run under a drive at all — the road is its own little world with its own
// seeded stream (see `DriveState.rng`), so a drive can be replayed, tested
// headlessly and A/B'd without ever shifting a loot roll.

/**
 * How the drive's world units meet the real ones, and what the wagon and the
 * people on the road weigh. Every collision number below is derived from these
 * three and nothing else.
 *
 * THE TWO ROAD MASSES ARE THE DIFFICULTY LADDER'S ONE HANDLE on the minigame:
 * a drive multiplies them by its rung's `DifficultyDef.drive` before it solves
 * anything (`impactMasses`), which is why the numbers here are the MEDIUM road
 * rather than the only road. Nothing else about a drive changes with the rung —
 * same course, same crowd, same traffic, same car.
 */
export const DRIVE_UNITS = {
  /**
   * METRES PER WORLD PIXEL — the conversion the whole impact model rests on.
   *
   * Pinned from the top end rather than measured off a sprite: 120 mph is
   * 53.6 m/s and the car does that at `DRIVE.topSpeedPx` px/s, so a world pixel
   * is 53.6/624 of a metre. Read the other way it is a sanity check on the art
   * — the 48-px car comes out at 4.1 m long, which is a real estate wagon, and
   * the 26-px lane at 2.2 m, which is a real (narrow, town) lane.
   */
  mPerPx: 53.6 / 624,
  /** The wagon, kerb weight (kg). A thirty-year-old estate with a boot full of
   * somebody's tools. The one mass no rung touches: it is the hero's own car. */
  carMassKg: 1600,
  /** A person (kg), on MEDIUM — laddered per rung, see above. */
  pedestrianMassKg: 78,
  /** Another car on the road (kg), on MEDIUM — a bit lighter than the hero's
   * barge, which is why they get shoved and he does not. Laddered per rung. */
  trafficMassKg: 1300,
} as const;

export const DRIVE = {
  // ── THE THROTTLE ──────────────────────────────────────────────────────────
  /** Top speed, world px/s — the 120 mph the whole minigame is scaled to. */
  topSpeedPx: 624,
  /** …and the same number in the unit the HUD says out loud, so the dial and
   * the physics can never drift apart. */
  topSpeedMph: 120,
  /**
   * How hard the car pulls (px/s²) and how hard it stops.
   *
   * The pull is deliberately LONG — nought to 120 takes about five seconds,
   * which is both what a tired estate does and what makes speed feel like
   * something you spend a run building rather than a button you hold. It is
   * also the whole cost of a hit: the second of throttle it takes to win back
   * what a body just took off you is the punishment, and it lands without a
   * single point of damage having to be explained.
   */
  accelPx: 132,
  brakePx: 300,
  /** What the car sheds per second with nothing held — engine braking and the
   * drag of a shape that was never wind-tunnelled. */
  coastPx: 60,
  /**
   * HOW FAST A BROKEN CAR GOES. Top speed is scaled by `1 - wear * this`, so a
   * half-dead wagon tops out around 85 and a car on the point of failing barely
   * breaks 65. It is the damage the player FEELS long before the breakdown —
   * without it, wear is an invisible number that ends the run without warning.
   */
  wearTopSpeedLoss: 0.45,

  // ── THE ROAD ──────────────────────────────────────────────────────────────
  /** How many lanes the road carries. FOUR: the near pair runs the hero's way
   * and the far pair comes at him, so overtaking and oncoming are both live
   * hazards and switching lanes is a real decision rather than a dodge. */
  laneCount: 4,
  /** A lane's width in world px (≈2.2 m — a narrow town lane). Wide enough that
   * the 26-px-tall car sits in one with daylight either side under the shipped
   * pitch, tight enough that four of them fit the reference viewport with room
   * for the houses above and below. */
  laneWidth: 26,
  /** How fast the car crosses lanes (world px/s of lateral travel) at full
   * tilt. Scaled by how fast it is actually going — see `laneRefSpeedPx` —
   * because a car parked in the road cannot change lanes. */
  lateralPx: 150,
  /** The ground speed at which the car gains its full lateral authority. */
  laneRefSpeedPx: 220,
  /** How far past the outer lane markings the car may stray before the verge
   * shoves it back — the gutter, in world px. */
  vergePx: 10,
  /**
   * THE COURSE, in world px. About a minute, and the whole reward structure of
   * the minigame in one number: it is a DISTANCE, not a timer, so driving fast
   * genuinely ends it sooner and driving scared genuinely drags.
   *
   * MEASURED, driving in a dead straight line and never dodging once (the
   * pessimal case — a real player steers, so both columns come down):
   *
   *   throttle   trip      bodies   ending wear
   *   1.00       39–54 s   13–24    breaks about half the time
   *   0.80       58–66 s   23–25    survives, badly bent
   *   0.55       74–78 s   35–39    survives comfortably
   *
   * Which is the shape the whole thing wants: flat out is genuinely faster and
   * genuinely might not get there, and the safe pace costs you twenty seconds
   * and hits MORE people, because you are on the road longer.
   */
  coursePx: 24000,
  /** How far ahead of the car the world is populated, and how far behind it is
   * forgotten (world px). Both a comfortable screen and a half. */
  spawnAheadPx: 700,
  despawnBehindPx: 420,

  // ── THE CROWD ─────────────────────────────────────────────────────────────
  /**
   * How thickly the road is peopled — pedestrians per 1000 px of course, and
   * the knob that makes the joke land. It is high on purpose: the hero is
   * meant to arrive unable to claim it was avoidable, and a road you can thread
   * clean is a road that makes him a monster rather than a man who did not
   * look. "Impossible to not hit people" is the design, so this number is
   * tuned until a good driver still arrives with bodies on the count.
   */
  pedestriansPerKPx: 3.4,
  /** How fast somebody out on the road walks, and how fast they move once they
   * have seen a car worth stepping in front of (world px/s). */
  walkPx: 22,
  lungePx: 54,
  /** How far off a pedestrian notices the car and starts working toward it
   * (world px) — about a screen, so the lunge is visible rather than a
   * teleport into the wing. */
  noticePx: 190,
  /** How far AHEAD of the car's nose a lunging pedestrian aims (seconds of the
   * car's own travel). They lead the target — which is what makes them feel
   * like people trying to flag you down rather than obstacles drifting into
   * you, and what makes swerving actually work. */
  leadSeconds: 0.55,
  /** A person's radius on the ground (world px) — the collision circle. */
  pedestrianRadiusPx: 5,
  /**
   * THE CROSSINGS — how far apart the painted crossings are (world px), how
   * wide the paint is, and what share of the crowd is standing on one.
   *
   * THEY ARE WHAT MAKES THE ROAD A STREET RATHER THAN A CORRIDOR. A crowd
   * strewn evenly down a mile of tarmac is a texture: it has no rhythm, so
   * there is nothing to read ahead and nothing to plan for, and the wheel ends
   * up being used as a nervous twitch. Clumping half of the same crowd onto
   * crossings turns the trip into a series of DECISIONS — a knot of people
   * visible a screen ahead, a gap to pick, a lane to be in before it arrives —
   * without adding one body to the road or changing what a body costs.
   *
   * The crossings are laid on WORLD X (multiples of the pitch) rather than on
   * course distance, so the same paint is in the same place on the way home as
   * on the way out. The people standing on them are placed by a HASH of the
   * spawn mark, never a fresh `rng()` draw: a road's bodies, their variants and
   * their wander phases all come off the seeded stream in a fixed order, and
   * spending a draw here would have moved every one of them.
   */
  crossingPitchPx: 760,
  crossingWidthPx: 30,
  crossingCrowdShare: 0.5,
  /**
   * THE PAVEMENT either side of the road (world px deep), and a WORLD fact
   * rather than a painted one — which is the whole reason it lives here beside
   * the lane width instead of in the renderer's palette.
   *
   * People STAND on it. The crowd's band is the tarmac plus these two strips
   * (`crowdEdges`), so somebody waiting at a crossing is genuinely on the
   * pavement and steps OFF it into the road, rather than hugging an invisible
   * line at the kerb because that was as far out as the sim would let them go.
   * The car is still held to the tarmac and its gutter (`roadEdges`) — mounting
   * the kerb is not something this wagon does.
   */
  pavementPx: 16,

  // ── THE TRAFFIC ───────────────────────────────────────────────────────────
  /**
   * Other cars per 1000 px of course, on MEDIUM — laddered per rung by
   * `DifficultyDef.drive.trafficDensity`.
   *
   * SPARSE, AND THE NUMBER IS SMALLER THAN IT LOOKS. A screenful of road is
   * about 420 px, so this is roughly one other car in view at a time: traffic
   * is the thing that makes a LANE unavailable, and its job is to take a
   * choice away for a moment, not to fill the road. Nose-to-tail traffic
   * removes the steering decision rather than sharpening it — with every lane
   * occupied there is nothing to decide and the crowd cannot be threaded at
   * all, which is the one way this minigame can actually become unfair.
   */
  trafficPerKPx: 1,
  /** What the other traffic does, world px/s. The near lanes dawdle (the hero
   * overtakes them), the far lanes come the other way. */
  trafficSpeedPx: { min: 150, max: 300 },
  /** How far a shunted car is shoved sideways per unit of impulse it takes,
   * and the most it can be shoved in one hit (world px/s of lateral speed).
   * A shunt is a SHOVE, not a wreck: it slews out of the lane, scrubs off and
   * settles — the dramatic version is a later job. */
  shuntPx: 130,
  shuntMaxPx: 240,
  /** How fast a shunted car bleeds its slew off (1/s) — a couple of seconds of
   * fishtailing and it is straight again. */
  shuntDampPerSec: 1.4,
  /** How far a shunted car is moved clear ON THE SPOT (world px). Two car
   * bodies that touch keep touching for dozens of ticks, and every one of them
   * is another collision — so a shunt separates them itself rather than waiting
   * for the slew to do it. See `shunt`. */
  separationPx: 22,
  /** …and how long it cannot be hit again for (ms), which closes the rest of
   * the same hole. One contact is one impact. */
  shuntImmuneMs: 450,

  // ── THE IMPACT ────────────────────────────────────────────────────────────
  impact: {
    /**
     * RESTITUTION for a body against a bumper. Nearly zero: people are not
     * springs. The little that is left is what throws them up the bonnet
     * instead of straight down under the wheels.
     */
    restitution: 0.12,
    /**
     * THE ONE FUDGE, AND IT IS HONEST ABOUT ITSELF — how much of the physically
     * correct speed loss the car actually takes.
     *
     * The real number is small: a 78 kg body against 1600 kg of wagon is a
     * 4.5% momentum transfer, so a square hit at 120 costs about 6 mph. That is
     * correct and it is nearly unreadable in a minigame that lasts a minute —
     * the player cannot tell a hit from a bump in the road. At 2.2 the same hit
     * costs about 13 mph, which is a fifth of the top end: plainly felt, still
     * recoverable, and still perfectly ordered — glancing blows stay cheap,
     * square ones stay expensive, and speed still costs more than caution
     * saves. The RATIOS are the physics; this is the volume knob.
     */
    speedLossScale: 1.6,
    /**
     * How much of the car's own speed a struck body carries away along the
     * road, on top of the impulse it takes square in the chest. A person hit at
     * 120 does not drop where they stood — they go up the road with the car,
     * which is what makes the gore at speed read as horrifying rather than
     * comic.
     */
    carryFraction: 0.75,
    /** How much of the impact's energy goes up rather than along — the pop over
     * the bonnet, as a fraction of the launch speed. */
    liftFraction: 0.35,
    /**
     * ABSORBED ENERGY THAT TOTALS THE CAR (joules). The wear a hit does is
     * `½ μ v² (1-e²) / this`, so damage goes as the SQUARE of the closing
     * speed — which is the whole of "it breaks down eventually, especially at
     * high speed" in one line, and it is real physics rather than a rule
     * somebody wrote. In practice: about thirty square hits at the top end
     * finish the car, and about a hundred and twenty at half that.
     */
    wearJoules: 2.9e6,
    /** A shunted car is a much bigger lump than a person, so it does its damage
     * on the same curve at this multiple. Trading paint hurts. */
    trafficWearScale: 2.6,
    /** How hard a hit shoves the suspension (px/s per unit of wear dealt) —
     * `nudgeCar`'s own units, so the body visibly takes the blow. */
    nudgePerWear: 900,
  },

  // ── THE CAR'S HEALTH ──────────────────────────────────────────────────────
  /**
   * The panel damage ladder. A panel climbs a rung each time the energy it has
   * personally absorbed crosses the next of these (as a fraction of
   * `wearJoules`), so the bumper on a car that has only ever hit things square
   * is broken while its doors are still straight — the damage tells you how
   * you have been driving.
   */
  panelRungs: [0.06, 0.16, 0.3],
  /** Total wear at which a detachable part works loose, hangs, and goes. The
   * bumper is first because the bumper is what has been doing the work. */
  fixRungs: [0.45, 0.68, 0.86],
  /** Wear past which the car is finished: the engine dies, it rolls to a stop,
   * and the drive is lost (`DRIVE_OUTCOME.broken`). */
  breakdownWear: 1,
  /** How hard a dead car brakes as it coasts in (px/s²) — it does not stop
   * dead, it dies and rolls. */
  breakdownCoastPx: 90,
  /** How long the wreck sits before the minigame restarts (ms) — long enough
   * to read what happened, short enough not to be a punishment on top of a
   * punishment. */
  breakdownHoldMs: 2200,

  // ── THE BEATS ─────────────────────────────────────────────────────────────
  /**
   * How far into the course the hero thinks about the people he is about to
   * start hitting (world px). Deliberately BEFORE the first pedestrian: the
   * monologue is a promise to himself to avoid them, and it only works as a
   * joke if the player hears it while the road is still empty and then finds
   * out what the road is actually like.
   */
  monologuePx: 1500,
  /** Where the crowd starts. A clear opening stretch to learn the wheel on. */
  crowdStartPx: 2600,
  /** How long the arrival beat holds at the end of the course before the drive
   * hands back (ms). */
  arrivalHoldMs: 1400,
  /** The body count that separates the hero's two readings of the trip. Under
   * it the ride was "fine"; at or over it, it was "a bit bumpy". */
  bumpyRideBodies: 10,
} as const;

/** How the drive ended — read by the app to decide what happens next. */
export const DRIVE_OUTCOME = {
  /** Still going. */
  driving: "driving",
  /** The course is behind him: hand on to the destination. */
  arrived: "arrived",
  /** The car died on the road: restart the minigame from the top. */
  broken: "broken",
} as const;

export type DriveOutcome = (typeof DRIVE_OUTCOME)[keyof typeof DRIVE_OUTCOME];
