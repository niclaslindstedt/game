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
  /**
   * THE REFERENCE CAR (kg) — a mid-size saloon, and no longer what every other
   * vehicle on the road weighs.
   *
   * Each vehicle carries its own mass now (`DriveVehicleDef.massKg`,
   * drive/fleet.ts), because the collision is a momentum sum and mass is its
   * only real input: a twelve-tonne bus that answered a bumper the way a 30 kg
   * bicycle does was the physics being told a lie, and the player felt it before
   * he could name it. What is left here is the YARDSTICK — the mass a vehicle's
   * own durability is scaled against, so "hit it hard enough to write it off"
   * means the same thing to a moped and to a lorry.
   */
  trafficMassKg: 1400,
  /**
   * WHAT A CAR LEFT AT THE KERB CARRIES ON TOP OF ITS OWN MASS (kg) — the
   * handbrake, the gear it was left in, and the kerb behind its wheels, all of
   * which have to be shoved too.
   *
   * The mass is the SMALL half of why hitting one hurts. The big half is free:
   * the collision is solved on the SWEEP (the speed the car's surface runs at
   * the thing), and a car parked dead still is met at the hero's WHOLE speed,
   * where one dawdling along in the same direction is met at the difference. At
   * 120 mph that is 624 px/s against about 400 — and the energy the crumple
   * absorbs goes as the SQUARE of it, so the parked one does about two and a
   * half times the damage for the same geometry. Nobody had to write that down;
   * it falls out of `solveImpact`.
   */
  parkedExtraKg: 400,
  /**
   * A lamp post's column (kg) — the mass the car actually has to deal with,
   * which is the POST rather than the installation.
   *
   * A street light is a slip-base column: it is meant to shear off its foot
   * rather than stop a car dead, and the number here is what that leaves the
   * bumper arguing with. MEASURED against the thing it has to feel like: at the
   * top end a clouted post costs about a twentieth of the car and a dozen mph,
   * so one is a bad moment and a gutter-hugging run down the whole street is a
   * breakdown — which is exactly the lesson the kerb is there to teach.
   * Unladdered by difficulty: the ladder is about the ROAD (what traffic and
   * the crowd weigh), and the council's lighting is the same steel on every
   * rung.
   */
  lampPostMassKg: 120,
} as const;

export const DRIVE = {
  // ── THE THROTTLE ──────────────────────────────────────────────────────────
  /** Top speed, world px/s — the 120 mph the whole minigame is scaled to. */
  topSpeedPx: 624,
  /** …and the same number in the unit the HUD says out loud, so the dial and
   * the physics can never drift apart. */
  topSpeedMph: 120,
  //
  // HOW HARD THE CAR PULLS IS NOT A NUMBER HERE ANY MORE. It used to be three
  // of them — `accelPx`, `brakePx`, `coastPx` — and the road read NONE of them:
  // the pedal was taking the GARAGE's constants (`CAR.driveAccel`, 260 px/s²,
  // which is 2.3 g, and `CAR.idleDragPx` for the coast),
  // so the wagon reached sixty in a second and a quarter and the whole minigame
  // was a question of whether the throttle was held. It is solved from the car's
  // own engine, gearbox and frontal area now (`drivetrain.ts`): weakest at
  // idle, strongest in the middle of a gear, dipping at every upshift, and
  // running out against the air somewhere just short of the top of the dial.
  // Nought to sixty takes the better part of ten seconds and the twenty after
  // that takes longer still, which is what a heavy thing with a tired engine
  // does — and it is also the whole cost of a hit, since the seconds of throttle
  // it takes to win back what a body took off you is the punishment, landing
  // without a single point of damage having to be explained.
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
   * MEASURED with `make drive-bench`, 30 seeds a rung on MEDIUM, and RE-TAKEN
   * on the wagon's real drivetrain (`drivetrain.ts`) — every figure below moved
   * when the car stopped accelerating like a dragster. First the PESSIMAL case
   * — a dead straight line, never dodging once:
   *
   *   throttle   trip      bodies   ending wear   arrived
   *   1.00       79 s      79       49%           30/30
   *   0.80       85 s      84       41%           30/30
   *   0.55       94 s      90       31%           30/30
   *
   * And then the same road driven by something that STEERS — the shipped
   * auto-driver (`drive/driver.ts`), which is the bar a decent human clears:
   *
   *   rung        trip    bodies   ending wear   arrived
   *   easy        75 s    61         8%          30/30
   *   medium      83 s    67        23%          30/30
   *   hard        88 s    73        32%          30/30
   *   nightmare   94 s    77        41%          30/30
   *   jesus       99 s    83        46%          30/30
   *
   * TWO THINGS TO READ OUT OF THAT, and the second is a debt rather than a
   * result. The one that still holds is the joke the course length exists to
   * land: the leg cannot be threaded at any pace, because the crowd is laid
   * down thick enough that even a good driver arrives with sixty-odd people on
   * the count — which is why the arrival lines are read off the CAR and the
   * CLOCK rather than off the tally (`DRIVE.verdict`).
   *
   * THE ONE THAT NO LONGER HOLDS is the tension in the top row. A straight line
   * at full throttle used to break forty legs in sixty; now it arrives every
   * time, on half a car. Nothing about the road changed — the CAR did: it tops
   * out around eighty in traffic instead of touching 120, absorbed energy goes
   * as the SQUARE of the closing speed, and a collision at eighty is therefore
   * worth well under half of what the same collision used to cost. The spread
   * between a careful pace and a reckless one narrowed with it. Restoring it is
   * a knob rather than a rewrite (`DRIVE.impact.wearJoules` is what a full car's
   * worth of damage costs, and the ladder's masses sit beside it) — but which
   * way to move it is a DESIGN call about how punishing this interlude should
   * be, and it is deliberately left open rather than guessed at here.
   */
  coursePx: 24000,
  /**
   * THE ATTRACT LOOP'S LEG (world px) — the same road with the finish brought
   * forward, for a demo that is showing somebody the whole game rather than
   * playing one trip of it.
   *
   * About fifteen seconds, which is a long beat in an attract loop and a short
   * one in a minute. It is past `crowdStartPx` with real room to spare, so the
   * demo still shows what the road is FOR — the monologue, the first crossing,
   * a body or six — rather than the empty opening stretch and a fade.
   * `DriveParams.coursePx` is how it gets there; nothing a player drives uses
   * it.
   */
  attractCoursePx: 6200,
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
   *
   * THREE TIMES WHAT IT OPENED WITH, and the reason is the thing the first cut
   * got wrong about its own joke. At a body every three hundred pixels the road
   * had GAPS in it — long enough to relax in, long enough for a careful driver
   * to believe he was being careful — and the whole bit is that there is no
   * such thing as careful out here. A crowd is a CROWD: it stands three deep on
   * the crossings and it is never entirely off the tarmac.
   *
   * WHAT IT DOES TO THE WHEEL, measured (`make drive-bench`, and pinned in
   * `drive_driver_test.ts`): the tarmac is now SATURATED, so per mile of road
   * the shipped auto-driver meets exactly as many people as a car driven in a
   * dead straight line does. The wheel did not stop mattering — steering is
   * still worth the whole of the car (22% ending wear against 92%) — but what
   * it is FOR is the traffic, the kerb and the wagon. The tally is the one
   * thing on this road nobody can drive their way out of, which is precisely
   * the joke the arrival lines are written against.
   *
   * And note what it does NOT change: a body's COST. The gentle rungs weigh a
   * person at a quarter of MEDIUM's (`DifficultyDef.drive.pedestrianMassMult`),
   * so a road this thick is a wall of people to a JESUS driver and a soft
   * snowfall to an EASY one — the crowd is scenery until the difficulty says it
   * is physics.
   */
  pedestriansPerKPx: 10.2,
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

  // ── THE BLOCKADE ──────────────────────────────────────────────────────────
  /**
   * THE GLUED — the one set piece on this road, and the only thing on it that
   * is not a hazard so much as a FACT.
   *
   * Everything else out here can be driven around. The crowd is thick but it is
   * people, and people are 5 px wide with gaps between them; the traffic takes
   * a lane away and leaves three. A demonstration sitting across all four lanes
   * with their hands in the resin takes the whole carriageway, and the wagon
   * meets it at 120 mph with a stopping distance measured in hundreds of
   * pixels. There is no line through it. The player works out what is about to
   * happen roughly a second before it does, and there is nothing whatever they
   * can do with that second, which is the joke and the entire reason the thing
   * exists.
   *
   * IT IS NOT TUNED FOR FAIRNESS AND IT IS NOT TUNED TO KILL YOU EITHER.
   * Measured against `solveImpact` on MEDIUM: a body met square at the top end
   * costs about a fifth of the speed and 0.036 of the car, so ploughing in at
   * 120 scrubs the wagon down to a crawl inside half a dozen bodies and hands it
   * a fifth of a breakdown. That is the shape it wants — the blockade WORKS. It
   * stops the car, exactly as it was meant to. It just does not stop it in time.
   */
  blockade: {
    /**
     * HOW FAR INTO THE COURSE IT SITS, as a fraction of the leg.
     *
     * Past the middle on purpose: the trip has to have taught the player what
     * the road is and what the wheel is worth before it shows them something the
     * wheel cannot answer. It is a FRACTION rather than a world position so the
     * attract loop's short leg (`attractCoursePx`) gets one too — the demo is
     * fifteen seconds of showing somebody what this game is, and this is the
     * fifteen seconds' worth.
     */
    atFrac: 0.55,
    /** How many of them are sitting there. Twenty: enough that it reads as a
     * demonstration rather than as four people, few enough that the car is
     * through it rather than stopped in it. */
    count: 20,
    /** How far apart their rows stand along the road (world px), and how far
     * apart they sit across it. Tight — they are linked. */
    rowPitchPx: 15,
    seatPitchPx: 13,
    /** How far a body may sit off its slot in either direction (world px), so
     * the rows read as people who sat down rather than as a grid. */
    jitterPx: 4,
    /** How many of them have something to say — see `DrivePedestrian.bark`. */
    voices: 4,
    /**
     * HOW FAR BEHIND THE CAR THEY ARE STILL THERE (world px) — far past the
     * `despawnBehindPx` everybody else on this road is forgotten at, and that
     * is the whole point of the number.
     *
     * The wagon physically reaches four to six of the twenty; the other fifteen
     * are unharmed and still sitting exactly where they sat down. Forgetting
     * them at the crowd's own reach deleted them while the blood they were
     * nowhere near stayed on the tarmac, so the aftermath was drawn as gore
     * with nobody in it and read as a massacre of the whole demonstration.
     * Keeping them for the length of the visible road is what makes the picture
     * true — and it is what the fiction says anyway: everybody else out here is
     * walking somewhere, and these people are not going anywhere at all.
     */
    rememberPx: 1400,
    /**
     * WHAT ONE OF THEM WEIGHS, as a multiple of an ordinary pedestrian — and
     * this is the number that makes the set piece a WALL rather than a thicker
     * patch of crowd.
     *
     * IT IS HONEST PHYSICS, not a difficulty knob. A walker met by a bumper is
     * 78 kg standing loose on the tarmac: the collision throws them, and the car
     * hands over a twentieth of its momentum doing it. Somebody SEATED, braced,
     * with their hands set into the resin and their arms through their
     * neighbours' is not a loose 78 kg — they are anchored to the road and
     * coupled to the people either side, and what the wagon has to shift is that
     * whole assembly. Four is a person plus the share of the road and the
     * neighbours they are attached to.
     *
     * WHAT IT BUYS, measured against `solveImpact` on MEDIUM: a square hit at
     * the top end costs about 46 mph instead of 13, so the car is stopped inside
     * roughly THREE bodies rather than sailing through twenty. That is the
     * picture the whole thing was written for and the code did not do — he
     * ploughs into the front row, wrecks it, and grinds to a crawl among the
     * rest, which is what actually happens and is far worse to watch than
     * driving cleanly through a crowd of twenty.
     *
     * The energy goes up with it (damage is the same sum), so the front row is
     * expensive — but only the FIRST hits are, because absorbed energy goes as
     * the SQUARE of the closing speed and the car has already lost most of it by
     * the second body. The blockade costs a leg its bumper, not its engine.
     */
    massMult: 4,
  },

  // ── THE KERB ──────────────────────────────────────────────────────────────
  /**
   * THE STREET FURNITURE — the lamp posts down both pavements and the cars
   * somebody left at the near kerb.
   *
   * IT IS A WORLD FACT, NOT A BACKDROP, and it used to be the other way round:
   * the renderer derived a pretty street from a hash and the sim knew nothing
   * about it, so the wagon drove THROUGH a parked van at 120 and the lamp posts
   * were painted onto a road that could not feel them. A picture the player is
   * asked to read as an obstacle and then cannot hit is worse than no picture
   * at all — he brakes for it once, learns it is a lie, and stops reading the
   * kerb at all. So the furniture is the engine's now (`street.ts`) and the
   * renderer draws what the sim is holding.
   *
   * The placement is DERIVED FROM POSITION rather than rolled, exactly as it
   * was when it was scenery: a hash of the slot index, so the same street is
   * laid out the same way on the way home as on the way out, a restart puts
   * every post back where it was, and none of it costs the road's seeded stream
   * a single draw.
   */
  street: {
    /** How far apart the kerbside slots stand (world px). Sparse: everything
     * here is between the player and the road, and a solid row of it would be
     * a fence to read the crowd through. */
    pitchPx: 104,
    /** What share of the NEAR kerb's slots hold a car rather than a lamp post.
     * One in six: often enough that the near gutter is never a free lane, rare
     * enough that a parked car still reads as a thing rather than as a wall. */
    parkedShare: 0.16,
    /** How far onto the pavement the furniture stands, measured off the
     * tarmac's own edge (world px). */
    kerbOffsetPx: 4,
    /**
     * Every nth slot carries a STREET-LIGHTING MAST, and the slots between
     * carry no lighting at all — the little yard lights that used to stand on
     * them are gone (`street.ts`). Two rather than three, because they were the
     * only thing lighting the stretches BETWEEN the masts: at every third slot
     * the road came out with a pool of light and most of a screen of darkness
     * either side of it.
     *
     * IT IS A SIM KNOB AND NOT A DRAWING ONE, because the two rows are ALIGNED
     * on a mast slot: street lighting comes in pairs facing each other across
     * the carriageway, and the far row's usual half-pitch offset — which is
     * right for yard lights, and there so a lit street does not march past in
     * couples — puts a mast fifty px down the road from its partner. So the
     * offset is dropped on these slots, and it has to be dropped where the
     * furniture is MINTED rather than where it is drawn, or the picture and the
     * thing the bumper hits disagree.
     */
    mastEvery: 2,
    /** A lamp post's collision circle at the ground (world px) — the column,
     * not the hood it carries. */
    lampRadiusPx: 4,
    /** A parked car's collision circle (world px). Its own footprint, so it is
     * exactly as wide standing at the kerb as it was driving. */
    parkedRadiusPx: 9,
    /** How fast a felled post sheds its speed on the tarmac (1/s), and the
     * speed under which it has stopped for good. */
    lampDragPerSec: 1.8,
    lampRestPx: 10,
    /** Gravity for a post in the air (px/s²) and what a bounce keeps — it is
     * steel, so it keeps very little and it does not roll far. */
    lampGravityPx: 640,
    lampBounce: 0.22,
    /** How fast a felled post turns over, in radians per second per px/s of
     * the speed it left at. A post knocked out at 120 cartwheels down the road;
     * one nudged at 20 leans over and drops where it stood. */
    lampSpinPerSpeed: 0.006,
  },

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
  /** What the other traffic does, world px/s, before its own def's `pace`
   * multiplies it. The near lanes dawdle (the hero overtakes them), the far
   * lanes come the other way. */
  trafficSpeedPx: { min: 150, max: 300 },
  /**
   * THE DELIVERY TRADE, WHICH DOES NOT USE THE ROAD.
   *
   * Mopeds and e-bikes ride the PAVEMENT, and that one fact changes the shape
   * of the whole minigame. The gutter has always been the safe line: the crowd
   * thins toward the kerb, the traffic stays inside the lane markings, and the
   * only thing punishing a driver who hugs the edge is the council's lighting.
   * Putting the delivery trade out there means the safe line has traffic on it
   * — and, because the pavement is where the CROWD is, it means the mopeds are
   * threading pedestrians too, which is exactly what they do.
   *
   * They also WEAVE, and cut in. A rider holding a straight line along the
   * footway is scenery; one drifting into the gutter and back out again is the
   * thing you brake for, and the reason the near verge stops being free.
   */
  pavementRiders: {
    /** How far a rider drifts across the footway (world px) and how fast. */
    weavePx: 7,
    weaveHz: 0.28,
    /**
     * …and how far into the carriageway the drift may actually reach (world
     * px), measured in from the tarmac's edge. They do not stay on the
     * pavement, because they do not stay on the pavement.
     */
    cutInPx: 9,
  },
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

  // ── DESTROYING THE OTHER TRAFFIC ──────────────────────────────────────────
  /**
   * WHAT IT TAKES TO FINISH SOMEBODY ELSE'S CAR — the other half of the trade
   * the hero has always been on the losing end of.
   *
   * A shunt used to have no memory. Hit the same van ten times and it was the
   * same van: it slewed, it scrubbed, it settled, and the only thing on this
   * road that ever showed a mark was the hero's own wagon. That is a strange
   * asymmetry in a minigame about driving into things — the player is being
   * shown, ten times, that his car is the only breakable object in the world.
   *
   * So the traffic keeps its own wear (`DriveTraffic.wear`), on exactly the
   * currency everything else here is priced in: absorbed energy over a
   * threshold. Three visible rungs on the way, and then it is done.
   */
  traffic: {
    /**
     * ABSORBED ENERGY THAT FINISHES A 1400 kg CAR (joules) — scaled per vehicle
     * by its own mass, so a bus takes about nine times as much as a saloon and
     * a moped folds up on the first real contact.
     *
     * WELL UNDER `impact.wearJoules`, and that asymmetry is the design rather
     * than a slip: the hero's wagon is the one thing on this road that has to
     * survive a whole minute of collisions, and everything else exists to come
     * apart on camera. A square hit at the top end writes off a hatchback in
     * two; the same two hits cost the hero about a seventh of his own car.
     */
    wreckJoules: 1.1e6,
    /**
     * The wear each visible damage rung is reached at.
     *
     * THREE RUNGS AND THEN THE WRECK, matching the hero's own panel ladder
     * (`panelRungs`) on purpose — it is the same ladder of pictures, derived by
     * the same generator (`asset-tools/wreck.mjs`), so a player who has learnt
     * to read his own bonnet can read a stranger's.
     */
    rungs: [0.25, 0.52, 0.8],
    /** How fast a wrecked vehicle sheds its speed once the engine has died
     * (1/s), and the speed under which it has stopped for good — at which point
     * it is a stationary obstacle in a live lane, which is the whole payoff. */
    wreckDragPerSec: 1.1,
    wreckRestPx: 12,
    /**
     * A TWO-WHEELER GOES DOWN rather than being shunted, past this much wear in
     * one blow. Low: a car meeting a bicycle at any speed at all ends with the
     * bicycle on its side, and a moped that merely slid sideways and carried on
     * upright would be the same lie the parked cars used to tell.
     */
    downWear: 0.12,
    /** How fast a downed machine slides and turns over: drag (1/s), the speed
     * it has stopped at, gravity for one in the air (px/s²), what a bounce
     * keeps, and how fast it cartwheels per px/s it left at. */
    downDragPerSec: 1.6,
    downRestPx: 10,
    downGravityPx: 640,
    downBounce: 0.24,
    downSpinPerSpeed: 0.009,
    /**
     * PAST THIS MUCH FORCE THE MACHINE COMES APART IN THE MIDDLE, in the same
     * wrecks as everything else here.
     *
     * A MOTORCYCLE IS A SPINE WITH A WHEEL AT EACH END, and there is no version
     * of a car meeting one at speed where the spine survives — so past this the
     * vehicle stops existing and becomes two large pieces of itself
     * (`RemainPart`'s `machine_front` / `machine_rear`).
     *
     * The number looks high and is not, because the force is scaled by the
     * vehicle's OWN mass: a bus would need thirty times a fatal collision to
     * reach it and never will, a moped reaches it at about half the top end,
     * and a BICYCLE or a SKATEBOARD clears it on any contact whatsoever. That
     * ladder is the whole of "it's a big difference in weight" and not one rung
     * of it is written down anywhere — it falls out of `wreckForce` dividing by
     * the mass in the def.
     */
    snapForce: 2.2,
    /** How much of the closing speed the FRONT half leaves with, against the
     * back half's — the front is what the bumper is actually pushing, so it
     * goes up the road while the back end is left behind to cartwheel. */
    snapCarry: { front: 1.15, rear: 0.45 },
    /** How hard the two halves are thrown apart across the road, and how high
     * (world px/s). */
    snapSpreadPx: 90,
    snapLiftPx: 210,
    /** How many pieces come off a machine that has been hit — at the wreck
     * line, and per unit of force past it, capped. */
    debris: { base: 1, perForce: 2.4, max: 6 },
    /** How far a torn-off piece of machine carries and how high it hops (world
     * px), at the wreck line and per unit of force past it. Steel goes further
     * and bounces harder than meat does, which is most of what tells the two
     * apart in the air. */
    debrisReachPx: { base: 40, perForce: 44 },
    debrisLiftPx: { base: 150, perForce: 130 },
    /** …and how much of a bounce it keeps when it lands. */
    debrisBounce: 0.34,
  },

  // ── THROWING PEOPLE OUT OF VEHICLES ───────────────────────────────────────
  /**
   * WHO LEAVES, WHEN, AND HOW FAR THEY GO.
   *
   * TWO POPULATIONS AND THEY ARE NOT THE SAME PROBLEM. A RIDER is sitting in
   * the open on a machine that weighs less than they do; there is nothing
   * holding them on and nothing to hold them back, so any real contact takes
   * them off it and the only question is how far they go. An OCCUPANT is
   * belted into a steel box, and the ONLY way out is forward through the screen
   * — which means it takes a SQUARE blow, not merely a hard one, and that is
   * the one condition that makes the sight legible: the player learns that
   * hitting a car head-on empties it and that clipping the same car does not.
   *
   * The squareness is `solveImpact`'s own `alongNose`, so the rule costs
   * nothing to evaluate and cannot disagree with the damage it was booked
   * against.
   */
  eject: {
    /** How square a blow has to be (0 abeam → 1 dead on the nose) before
     * anybody comes out through a windscreen. */
    squareness: 0.62,
    /** …and how much absorbed energy, as a fraction of `traffic.wreckJoules`.
     * Both conditions, not either: a hard sideswipe leaves everybody in their
     * seats, which is what a hard sideswipe does. */
    joules: 0.34,
    /**
     * WHAT AN OPEN CAR NEEDS INSTEAD, as a multiple of both thresholds above.
     *
     * The convertible is the one vehicle on this road with nothing over its
     * people, and the model gets that for free: there is no screen to go
     * through, so the bar is less than half of everybody else's and the sight
     * the whole feature was built for turns up on the car that most deserves
     * it.
     */
    openScale: 0.4,
    /** …and how much a RIDER needs, on the same scale. Nearly nothing: being
     * knocked off is what happens. */
    riderScale: 0.06,
    /**
     * HOW FAR THEY GO. `carry` is the share of the closing speed a thrown body
     * leaves with along the road — over 1 on purpose, because a body that left
     * at the car's own speed would hang exactly in front of the bumper for the
     * whole of its flight and be run over on landing, which is a much duller
     * picture than the one that clears the roof and goes up the road.
     */
    carry: 1.3,
    /** The upward kick (px/s) at the threshold and per unit of force past it,
     * and the cap. THE NUMBERS ARE LARGE AND THAT IS THE POINT: against the
     * tumble's own 620 px/s² a body leaving at the cap reaches about 300 px —
     * most of the frame — and is in the air for two whole seconds, which is
     * long enough for the wagon to pass underneath it and for the player to
     * watch the landing. */
    liftPx: { base: 300, perForce: 240 },
    maxLiftPx: 660,
    /** How much a body thrown out of a vehicle spins (rad/s), base and per unit
     * of force. */
    spin: { base: 4, perForce: 3 },
    /**
     * PAST THIS MUCH FORCE THEY DO NOT LAND IN ONE PIECE — the gib line for a
     * thrown body, in the same units as everything else here.
     *
     * Higher than the crowd's own `gore.splitJoules` relative to its threshold,
     * because a body that leaves a vehicle has already been decelerated by the
     * vehicle: the whole blow did not land on the person. What it buys is the
     * ladder the request asked for out loud — knocked off, thrown far, and then
     * past a line, thrown far in several directions at once.
     */
    gibForce: 1.15,
    /** How much extra lift and along-road carry the PIECES of a gibbed thrown
     * body get over an ordinary burst's. They were already in the air when they
     * came apart, and they read as it. */
    gibBoost: 2.1,
  },

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
    /**
     * …and a LAMP POST, which is a third thing again. A person crumples and a
     * car crumples with you; a galvanized column does neither — it shears off
     * its base and hands the bumper the whole blow back. So the same energy
     * buys more damage than a body's would, and much less than a van's, which
     * is what "it should hurt the car a bit" comes out as: a clout at the top
     * end costs about a tenth of the wagon, and a couple of mph.
     */
    lampWearScale: 1.5,
    /** How hard a hit shoves the suspension (px/s per unit of wear dealt) —
     * `nudgeCar`'s own units, so the body visibly takes the blow. */
    nudgePerWear: 900,
  },

  // ── WHAT IS LEFT OF SOMEBODY ──────────────────────────────────────────────
  /**
   * THE ROAD'S OWN BODY PHYSICS — how a person comes apart under a car, where
   * the pieces go, and how long they travel with the wagon that found them.
   *
   * IT IS NOT THE RUN'S GORE, AND THAT IS THE WHOLE REASON IT IS HERE. Inside a
   * run a body is opened by something SWUNG at it: one blow, one instant, and
   * the pieces are in the air and down again inside a second (`GORE_BURST_MS`).
   * A car is not a blow. It is a four-metre surface travelling at 53 m/s that
   * arrives, stays, and keeps going — so what it does to somebody is a sequence
   * rather than a moment: it goes THROUGH them, CARRIES what it caught, LAYS it
   * back down somewhere else, and then drives over what it laid down. Every
   * number below is one beat of that, and none of them has an equivalent in the
   * run's own gore because the run has nothing that travels.
   *
   * Everything is spent against the collision's own absorbed energy, as a
   * fraction of `impact.wearJoules` — the same currency the sound banks, the
   * panel rungs and the burst are already priced in, so nothing here re-decides
   * what a hard hit is.
   */
  gore: {
    /**
     * ABSORBED ENERGY AT WHICH THE BUMPER GOES THROUGH somebody rather than
     * merely knocking them down, as a fraction of `wearJoules`.
     *
     * DELIBERATELY THE SAME LINE THE HEAVY SOUND BANK SITS ON
     * (`HARD_BODY_JOULES`, pwa/src/game/drive-screen/drive-sounds.ts). What the
     * player hears and what the player sees have to be the same fact about the
     * hit, or the road is telling them two stories: the take that crunches is
     * the take that takes somebody in two. Against `solveImpact`'s own measured
     * shares on MEDIUM (see that file's table), it lands a square hit above
     * about 48 mph and a hard clip at the top end on the split side, and leaves
     * every gentle contact a knock-down.
     */
    splitJoules: 0.009,
    /**
     * WHERE THE BUMPER CATCHES THEM, as a fraction of the body's height from
     * the top of the sprite — the band the cut line is rolled inside.
     *
     * A bumper is at one height and a crowd is not one height: a child, a
     * cyclist and an old man bent over a cane meet the same steel in three
     * different places, which is why this is a band rather than a number. Kept
     * off the extremities at both ends for the reason `CUT_OFFSET_MAX` is
     * (gore-burst.ts): a cut at the very top or the very bottom of a 16 px body
     * draws one whole person and one empty canvas.
     */
    cutBand: { from: 0.3, to: 0.62 },
    /** How many lumps are torn off on the way past — at the split line, and per
     * unit of force beyond it, capped. Small on purpose: the big pieces are the
     * two halves and the shower is the app's own burst; these are the few
     * things solid enough to bounce down the road and be run over. */
    chunks: { base: 1, perForce: 1.6, max: 5 },
    /** How far a chunk carries and how high it hops (world px), at the split
     * line and per unit of force past it. */
    chunkReachPx: { base: 26, perForce: 30 },
    chunkLiftPx: { base: 90, perForce: 70 },
    /**
     * HOW MUCH OF THAT REACH GOES ACROSS THE ROAD rather than along it.
     *
     * A CAR THROWS THINGS FORWARD. It is a surface moving at 53 m/s in one
     * direction, and what comes off a body it meets goes up the road with it —
     * the sideways component is only what the body's own splash contributes,
     * and it is small. Undamped it is not merely wrong, it MISREPORTS THE
     * EVENT: the blockade is twenty people of whom the wagon physically reaches
     * four to six, and a full-width scatter put pieces in all four lanes, so an
     * aftermath in which fifteen of them are still sitting there unharmed read
     * as a massacre of the lot. The damping is what lets the survivors be seen.
     */
    chunkAcross: 0.4,
    /**
     * HOW LONG A PIECE STAYS CAUGHT UNDER THE CAR (ms) — at the split line, and
     * per unit of force past it, capped.
     *
     * This is the number the whole feature is built to buy. At the top end the
     * car covers 624 px a second, so a second of drag is a screen and a half of
     * tarmac with somebody underneath it — which is what puts the long red
     * streak on the road behind a driver who was going too fast, and what makes
     * that streak a record of HIS speed rather than a decal.
     */
    dragMs: { base: 260, perForce: 340, max: 1400 },
    /**
     * WHERE UNDER THE CAR A CAUGHT PIECE RIDES: px along the nose from the car's
     * centre (negative is toward the back) and how far it may sit off the car's
     * own line.
     *
     * AT THE VERY BACK OF THE CAR, AND THAT NUMBER IS PINNED BETWEEN TWO WALLS.
     *
     * Too far FORWARD and the feature is invisible: the wagon's body is 48 px,
     * so a piece riding inside ±20 is drawn entirely underneath it and the drag
     * is a sound and a trail with no visible cause (it shipped at −15 and looked
     * like a bug). Too far BACK and it is worse than invisible — past the car's
     * own half-length the piece is outside the footprint `crushRemains` tests,
     * so when the drag lets go the rear wheels are no longer over it and the
     * body is never run over at all (−26 did exactly that, and the engine suite
     * caught it: not one crush in a whole staged collision).
     *
     * −22 is inside the footprint by two pixels and hangs the piece's own 16-px
     * sprite six px clear of the back bumper. So it SHOWS while it is dragged,
     * and the instant it works free the axle is still on top of it.
     */
    dragAlongPx: -22,
    dragAcrossPx: 5,
    /** What share of the car's own travel a piece keeps as it works free — so
     * it skids out from under the back rather than being dropped dead in the
     * road, which reads as the piece having been deleted and re-created. */
    dragSlip: 0.55,
    /** …and the ground speed under which the car is no longer dragging anything
     * (world px/s). A wagon that has stopped is not dragging. */
    dragMinSpeedPx: 60,
    /**
     * THE HALF THAT GOES OVER THE ROOF — what share of the car's own along-road
     * speed the upper half keeps, and how hard it is thrown up (px/s at the
     * split line, and per unit of force past it).
     *
     * THE CARRY IS BELOW 1 ON PURPOSE and it is the entire trick. A piece
     * thrown FASTER than the car lands in front of it and gets run over again,
     * which is a fine picture and the wrong one; a piece thrown SLOWER is
     * overtaken while it is up there, so the wagon passes underneath it and the
     * eye reads exactly what happened — he went over the roof. Nothing anywhere
     * plays an "over the roof" animation.
     */
    overRoofCarry: 0.62,
    overRoofLiftPx: { base: 190, perForce: 90 },
    /** Gravity for a piece in the air (px/s²), and what a bounce keeps. Meat
     * keeps very little: it lands, it slaps, it stays. */
    gravityPx: 620,
    bounce: 0.22,
    /** How fast a piece on the tarmac sheds its speed (1/s), and the speed under
     * which it has stopped for good. Higher drag than a felled post's — a body
     * does not roll. */
    dragPerSec: 2.6,
    restPx: 9,
    /** How fast a piece turns over, in radians per second per px/s of the speed
     * it is travelling at. */
    spinPerSpeed: 0.014,
    /** WHAT THE WHEELS DO TO A PIECE THEY FIND: how far past the car's own
     * footprint a lump has to be to be missed (world px), how much of the car's
     * speed the crush kicks it along the road with, and how long the car cannot
     * find the same thing again for (ms). */
    crushReachPx: 7,
    crushShove: 0.35,
    crushCooldownMs: 300,
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

  /**
   * WHAT HE MAKES OF THE TRIP — the lines the arrival is read against
   * (`driveVerdict`).
   *
   * THE READING IS THE MINIGAME'S ONLY SCORE, and the joke is what it is a
   * score OF. He arrives having driven through a crowd at a hundred and twenty
   * and remarks on the SUSPENSION, the CLOCK, the OTHER DRIVERS and the
   * COUNCIL'S LIGHTING — the four things a man notices on a commute — and never
   * once on a person. The player does the noticing on his behalf, which is the
   * only way this is funny rather than nasty, and it is why every threshold
   * below is about the CAR, the TIME or the street furniture: the body count is
   * the one number he files under road surface.
   *
   * Ordered by what is most remarkable, not by what is worst.
   */
  verdict: {
    /** Wear past which the car is the only thing he can think about. */
    wreckWear: 0.7,
    /** Street lights taken out before the council becomes the story. */
    posts: 3,
    /** …and cars traded paint with before the other drivers do. MEASURED: a
     * driver who never touches the wheel still collects four down a course and
     * a good one seven on JESUS (they include the cars parked at the kerb), so
     * the line has to sit above what the road hands out for free. */
    cars: 8,
    /** The trip time (ms) under which he made unusually good going, and over
     * which he plainly dawdled. Both sit outside the band the two measured
     * tables in `coursePx` cover — a good driver takes 59–72 s and a reckless
     * straight line 51 s — so neither is the line a player gets by default. */
    quickMs: 52000,
    slowMs: 78000,
    /** The body count that turns "roads are rough out this way" into "bit
     * bumpy tonight". Scaled to the crowd the road actually carries: the
     * shipped auto-driver arrives with fifty on MEDIUM and sixty-five on JESUS
     * (see `coursePx`), so the line has to sit near the middle of that or one
     * of the two lines never plays. */
    bumpyBodies: 45,
  },
} as const;

/** HOW LONG THIS LEG IS — the whole road unless the params shortened it (the
 * attract loop's only difference from a played drive). The ONE accessor: the
 * spawner, the arrival check and the bench all read the finish here, so a
 * shortened leg cannot end up with a crowd laid out for a longer one. */
export function courseLength(params: { coursePx?: number }): number {
  return params.coursePx ?? DRIVE.coursePx;
}

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
