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
   * Pinned from the top end rather than measured off a sprite: 280 km/h is
   * 77.8 m/s and the car does that at `DRIVE.topSpeedPx` px/s, so a world pixel
   * is 77.8/905 of a metre. Read the other way it is a sanity check on the art
   * — the 48-px car comes out at 4.1 m long, which is a real estate wagon, and
   * the 26-px lane at 2.2 m, which is a real (narrow, town) lane.
   *
   * THE NUMBER HAS NOT MOVED, and that is the point of writing it as a ratio.
   * It was pinned at 53.6/624 when the wagon stopped at 120 mph and it is
   * 77.8/905 now that it does not — the same 0.0860 m to the pixel, because
   * what changed is how fast the car goes rather than how big the world is. A
   * scale that moved with the top speed would have quietly restated the length
   * of every car, the width of every lane and the energy of every collision.
   */
  mPerPx: 77.8 / 905,
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
   * the top end that is 905 px/s against about 680 — and the energy the crumple
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
  /**
   * TOP SPEED, world px/s — the 280 km/h the whole minigame is scaled to.
   *
   * IT IS A CEILING RATHER THAN A TARGET, and on an undamaged wagon the AIR
   * gets there first: the drivetrain runs out of pull within a pixel or two of
   * this number (`solvedTopSpeedPx`), so what stops you at the far end of a long
   * empty straight is drag, not a clamp. What the clamp is genuinely for is the
   * damaged car, whose top end is cut by its own wear (`wearTopSpeedLoss`).
   */
  topSpeedPx: 905,
  /**
   * …and the same number in the unit the HUD says out loud, so the dial and the
   * physics can never drift apart.
   *
   * THE DIAL IS IN MILES AN HOUR AND THE CAR WAS BUILT IN KILOMETRES, which is
   * the ordinary state of affairs for an imported estate and is why this is 174
   * rather than a round number: 280 km/h is what the brochure claimed, and 174
   * is what the instrument in front of the driver says about it.
   */
  topSpeedMph: 174,
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
  // Nought to sixty takes five seconds, a hundred takes ten, and the last thirty
  // miles an hour take the better part of a minute — because drag goes as the
  // square of speed and the power to beat it as the CUBE, so the far end of the
  // dial is somewhere you spend a straight getting to rather than somewhere you
  // arrive. That is also the whole cost of a hit: the seconds of throttle it
  // takes to win back what a body took off you is the punishment, landing
  // without a single point of damage having to be explained.
  /**
   * HOW FAST A BROKEN CAR GOES. Top speed is scaled by `1 - wear * this`, so a
   * half-dead wagon tops out around 125 and a car on the point of failing barely
   * breaks 95. It is the damage the player FEELS long before the breakdown —
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
   * because a car parked in the road cannot change lanes.
   *
   * A LANE IS 26 px AND A THUMB IS NOT A STEERING WHEEL. At 150 the wagon
   * crossed the whole four-lane road in under a second at speed, which meant
   * every correction was an overcorrection: the player aimed at the gap in lane
   * two and arrived in lane four, and the only way to hold a line was to tap
   * the pad rather than steer with it. At 105 a full lane still takes a
   * quarter-second — quick enough that the gaps this road opens are genuinely
   * takeable — but the travel is now something a thumb can MEASURE, which is
   * the difference between driving and flicking. */
  lateralPx: 105,
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
   * MEASURED with `make drive-bench`, and RE-TAKEN three times: on the wagon's
   * real drivetrain (`drivetrain.ts`), once every LANE carried traffic
   * (`laneTraffic`), and again when the gearbox was re-geared to read like a
   * tachometer in a real car — a shift at three thousand three instead of at a
   * 5800 redline, through taller ratios and a torquier engine. That last one
   * was DESIGNED to move nothing: the rev axis was squeezed and the torque axis
   * stretched by the same factor, so the force at the tyre at any road speed is
   * what it always was, and every figure below came back within a second or two
   * of where it stood. First the PESSIMAL case — a dead straight line on
   * MEDIUM, never dodging once, 30 seeds a row:
   *
   *   throttle   trip      bodies   ending wear   arrived
   *   1.00       93 s      92       64%           30/30
   *   0.80       98 s      95       53%           30/30
   *   0.55      106 s     103       39%           30/30
   *
   * And then the same road driven by something that STEERS — the shipped
   * auto-driver (`drive/driver.ts`), which is the bar a decent human clears;
   * 40 seeds a rung:
   *
   *   rung        trip    bodies   ending wear   arrived
   *   easy        81 s    72        13%          40/40
   *   medium      91 s    80        32%          40/40
   *   hard        97 s    85        40%          40/40
   *   nightmare  103 s    87        47%          40/40
   *   jesus      109 s    91        51%          40/40
   *
   * TWO THINGS TO READ OUT OF THAT. The first is the joke the course length
   * exists to land: the leg cannot be threaded at any pace, because the crowd
   * is laid down thick enough that even a good driver arrives with seventy-odd
   * people on the count — which is why the arrival lines are read off the CAR
   * and the CLOCK rather than off the tally (`DRIVE.verdict`).
   *
   * The second is the tension between the two tables, which had gone and is
   * partly back. It vanished when the car got its real drivetrain: a collision
   * at the eighty a wagon can actually reach in traffic costs well under half
   * of one at 120 (absorbed energy goes as the SQUARE of the closing speed), so
   * a straight line at full throttle stopped being punished at all — it arrived
   * every time on half a car. Filling the lanes bought some of it back without
   * touching a single damage number: there is simply more out there to hit, so
   * the reckless line now ends the trip on two thirds of a car against the
   * steering one's third, and on the top two rungs it no longer always arrives
   * (27/30 on both NIGHTMARE and JESUS). MEDIUM still gets home every time.
   * Whether it should is a DESIGN call about how punishing this interlude
   * ought to be, and the knob for it is `DRIVE.impact.wearJoules` with the
   * ladder's masses beside it — deliberately left open rather than guessed at.
   *
   * …AND IT GREW BY THE OUTSKIRTS. The number was 24 000 while the leg opened
   * on the town; the opening stretch is `opening.cityPx` of empty road now, so
   * the course carries it on top rather than taking it out of the town — the
   * stretch the player is actually scored on (`cityLength`) is within a few
   * hundred px of what it always was, and every figure in the table above still
   * describes it.
   */
  coursePx: 21100,
  /**
   * THE ATTRACT LOOP'S LEG (world px) — the same road with the finish brought
   * forward, for a demo that is showing somebody the whole game rather than
   * playing one trip of it.
   *
   * About fifteen seconds, which is a long beat in an attract loop and a short
   * one in a minute. It rides with `attractCityPx` below: the demo takes the
   * car's arrival and then goes straight into the town, so what a title screen
   * shows is what the road is FOR — the crowd, a crossing, a body or six —
   * rather than a man on an empty road talking about his evening.
   * `DriveParams.coursePx` is how it gets there; nothing a player drives uses
   * it.
   */
  attractCoursePx: 6200,
  /** …and where the demo's town starts. Long enough for the wagon to slide into
   * frame (`opening.entryPx` / `closePx`) and not one pixel longer. */
  attractCityPx: 1200,
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
   * still worth half the car (32% ending wear against 65%, MEDIUM) — but what
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
   * HOW OFTEN SOMEBODY OUT HERE IS THINKING SOMETHING WHERE IT CAN BE READ
   * (world px of course between one thought and the next).
   *
   * NOT A DENSITY — A PACE. The crowd stands a body every hundred pixels, and a
   * thought over each of them would be a scrolling wall of grey that says one
   * thing ("these people are props with captions"). What is wanted is the
   * opposite: a line comes up out of the traffic, is gone before it is quite
   * read, and there is a stretch of nothing at all before the next one, so the
   * player is left with the sense that he MISSED something rather than that he
   * has been shown a list.
   *
   * It is set against the catalogue rather than picked: about five hundred
   * pixels spreads all forty lines (`CROWD_THOUGHTS`) across the leg's twenty
   * thousand peopled pixels, so a trip runs the whole set almost exactly once
   * and a trip driven fast simply misses the tail of it. At the car's own top
   * speed the reading window is under half a second — which is the joke,
   * measured: the words are there, they are legible, and there is no version of
   * driving this road where he takes them in.
   */
  thoughtPitchPx: 520,
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
   * HOW THICK THE TRAFFIC IS — and it is stated as a GAP IN A LANE rather than
   * as cars per 1000 px, because the old number could not say what it meant.
   *
   * WHAT WENT WRONG WITH A RATE. Traffic was laid down at one vehicle per 1000
   * px of course, a fifth of which rode the pavement, its lane picked at random
   * out of four — so a lane got a car every 6250 px of course, and the road the
   * player actually saw was empty. Worse, a rate cannot be read off the SCREEN
   * at all, because a car's spacing in front of the windscreen is nothing like
   * its spacing on the map: the hero's own side is caught up with at the
   * DIFFERENCE of the two speeds (slowly — so it lingers, and a course pitch
   * looks far denser than it is) and the far side closes at their SUM (fast —
   * so the same pitch looks far sparser). One number could not be right for
   * both, and it was wrong for both in the same direction.
   *
   * SO THE KNOB IS THE PICTURE. `gapPx` is how much road sits between one
   * vehicle and the next IN ITS OWN LANE as the driver sees it, and the spawner
   * converts that to a course pitch per vehicle using the speed it just rolled
   * (`lanePitch`). A SCREEN is `screenPx` below — the ~420 world px of road a
   * desktop window or a phone on its side shows — so the gap is authored in
   * screenfuls and the picture is what the number says.
   *
   * IT IS NOT NOSE-TO-TAIL, and the difference matters: 360 px against a 40-px
   * car is nine car lengths, so every lane is occupied SOMEWHERE and no lane is
   * shut. The thing that would actually break this minigame is a road with no
   * gap to move into — a player who cannot leave the lane he is in has no
   * decision to make and cannot thread the crowd at all. A gap this size keeps
   * the choice on the table and merely stops it being free.
   *
   * Laddered per rung by `DifficultyDef.drive.trafficDensity`, which DIVIDES it:
   * the gentle rungs leave more road between cars, the hard ones less. On EASY
   * (0.85) that lands the picture on ONE SCREEN between the cars running the
   * hero's way and TWO between the ones coming at him — about two cars on his
   * own side and one oncoming in shot at any moment.
   */
  laneTraffic: {
    /** The gap between one vehicle and the next in a lane RUNNING THE HERO'S
     * WAY, in his own frame (world px), on MEDIUM. */
    gapPx: 360,
    /**
     * …and how much more road the ONCOMING lanes get, as a multiple of it.
     *
     * TWO, and it is a statement about DANGER rather than about traffic
     * engineering. A car on the hero's own side is caught up with at the
     * difference of the two speeds, so it sits in the picture for a long moment
     * and can be gone round; one coming the other way closes at their SUM, is
     * in shot for about a second and a half, and takes the lane away with no
     * time to plan for it. Priced the same, the far side is where a leg is
     * actually lost — so the far side is laid down half as thick, and the road
     * reads as two cars his way to one against.
     *
     * It is a MULTIPLE rather than a second `gapPx` so the ladder's own knob
     * still moves both sides together: a harder rung tightens the whole road,
     * and the 2:1 shape survives every rung.
     */
    oncomingGapMult: 2,
    /**
     * A SCREENFUL OF ROAD (world px) — what the gaps above are measured in, and
     * a number the road itself never reads.
     *
     * IT IS THE DESKTOP/LANDSCAPE SCREEN, deliberately the WIDE one. The view
     * rect is the viewport over the zoom (`viewScaleFor`), which lands a
     * landscape phone, a 1440p monitor and a laptop all within a few px of 420
     * world units — but a phone held UPRIGHT is barely half that. Pricing the
     * gap off the narrow screen would make the wide one look empty; pricing it
     * off the wide one leaves the upright phone showing less traffic than it is
     * told about, which is the right way round on the frame that is already the
     * hardest to drive.
     */
    screenPx: 420,
    /**
     * THE PACE THE GAP IS CONVERTED AT (world px/s) — the speed the hero is
     * ASSUMED to be doing when the spawner turns a gap into a course pitch.
     *
     * A reference rather than `car.speed`, and deliberately: the road is minted
     * once at a running mark so a seed always yields the same road, and a pitch
     * that read the live throttle would re-lay the traffic differently every
     * time the same seed was driven differently. Set to what the leg is
     * actually driven at — 24000 px in the 83 s a decent driver takes is about
     * 290 (`coursePx`) — so the picture is right at the pace the player spends
     * the trip at, and merely drifts sparse if he drives flat out.
     */
    refSpeedPx: 300,
    /**
     * …and the most the pitch may be stretched by, as a multiple of the gap.
     *
     * The conversion divides by the CLOSING speed, which goes to nothing for a
     * car pacing the hero exactly — an unclamped pitch would put its lane's
     * next vehicle a mile up the course. Five is generous enough that the
     * clamp never binds on ordinary traffic and finite enough that it cannot
     * run away.
     */
    maxPitchMult: 5,
  },
  /**
   * THE DELIVERY TRADE'S OWN STREAM — pavement riders per 1000 px of course, on
   * MEDIUM, and the one part of the traffic that is still a rate.
   *
   * It has to be its own number now, because it is no longer competing with the
   * lanes for the same slots: a moped on the footway is not a car in lane 2 and
   * a road that filled its lanes by taking mopeds off the pavement would be the
   * same bug in the other direction. HELD AT WHAT THE OLD RATE ACTUALLY
   * DELIVERED (one vehicle per 1000 px × the fleet's 20% pavement share), so
   * the lanes are the only thing this tuning moves — how busy the footway
   * should be beside a road that is now genuinely busy is a separate design
   * call, and one number away.
   */
  pavementPerKPx: 0.2,
  /** What the other traffic does, world px/s, before its own def's `pace`
   * multiplies it. The near lanes dawdle (the hero overtakes them), the far
   * lanes come the other way. */
  trafficSpeedPx: { min: 150, max: 300 },

  /**
   * SOMEBODY IS DRIVING EVERY ONE OF THEM — the other traffic's own driver
   * (`drive/ai.ts`), and the block that turns four conveyor belts into a road.
   *
   * WHAT WAS WRONG WITH THE OLD ROAD, stated plainly: a vehicle was born on a
   * lane centre with a speed and held both until something hit it. Nothing
   * wobbled, nothing pulled out, nothing went round the hatchback somebody left
   * half in the gutter, and — the one that actually costs the player — nothing
   * ever changed its mind. A lane that was clear stayed clear, so the minigame's
   * whole decision reduced to finding the empty belt once and holding it.
   *
   * Five behaviours, and each of them is a thing a real driver in front of you
   * does that you have to read:
   *
   *   IT WOBBLES        Nobody holds a line to the pixel. Derived from the
   *                     vehicle's own `phase` and where it is, so it costs the
   *                     seeded stream nothing — the same rule the footway weave
   *                     and the gore scatter obey.
   *   IT CHANGES LANES  Because the car in front is slower than it wants to go,
   *                     which is the only honest reason anybody does.
   *   IT OVERTAKES      The same behaviour seen from the other side: a fast car
   *                     comes past the hero, not merely at him.
   *   IT GOES ROUND     A parked car, a wreck standing dead in a lane, anything
   *                     stopped — it eases into the neighbouring lane's edge and
   *                     back out, which is what everybody does and what makes
   *                     the kerb read as being ON this road rather than beside
   *                     it.
   *   IT FOLLOWS        It lifts off for the car in front rather than driving
   *                     through it. IMPERFECTLY, on purpose: past its own
   *                     reaction the gap is simply gone, and what happens then
   *                     is the pile-up the player then has to get through.
   */
  drivers: {
    /** How far a driver drifts either side of its lane's centre (world px) and
     * how fast — the small motion that stops a lane reading as a rail. */
    wobblePx: 1.6,
    wobbleHz: 0.55,
    /**
     * HOW FAST IT CROSSES THE ROAD (world px/s) at ordinary urgency — its lane
     * change, and the number that decides whether a change is a thing the
     * player can react to.
     *
     * Well under the hero's own `lateralPx`: a driver going home changes lane
     * over about a second, which is long enough to be READ. Multiplied by
     * `DriveTraffic.urgency`, so somebody being chased crosses in a third of it.
     */
    steerPx: 34,
    /** …and how far out it starts easing off, so a lane change SETTLES instead
     * of arriving with a snap (world px). */
    settlePx: 4,
    /**
     * HOW FAR AHEAD A DRIVER LOOKS (world px), and how far BEHIND it checks
     * before pulling out.
     *
     * The behind figure is the whole of why the traffic does not simply swap
     * lanes into each other: a driver that only looked forward would pull out
     * in front of the car that was overtaking IT. It is generous, because on
     * this road the thing coming up behind is frequently doing forty mph more
     * than you are.
     */
    lookAheadPx: 190,
    lookBehindPx: 130,
    /**
     * HOW MUCH SLOWER THE CAR IN FRONT HAS TO BE before it is worth pulling out
     * for (world px/s). Below this nobody bothers, which is what keeps the road
     * from being a permanent game of musical lanes.
     */
    overtakeGainPx: 22,
    /** …and how long a driver holds a lane before it may reconsider (ms), and
     * how long it holds one it has just changed into. The second is longer: the
     * one thing worse than a driver that never pulls out is one that pulls out
     * and immediately back in. */
    decideMs: 900,
    settledMs: 2200,
    /**
     * GOING ROUND SOMETHING STOPPED — how far out it starts (world px), and how
     * far into the neighbouring lane it is willing to put itself.
     *
     * NOT A LANE CHANGE, and the difference is the point: a driver going round a
     * parked car does not move over, it moves ACROSS a bit and comes back, which
     * is both what people do and — for the player — a car that is suddenly a
     * third of a lane wider than it was.
     */
    dodgeFromPx: 150,
    dodgePx: 13,
    /**
     * FOLLOWING THE CAR IN FRONT — the gap it wants, in SECONDS of its own
     * travel, and the hardest it will lift off to keep it.
     *
     * Seconds rather than pixels because that is how following distance
     * actually works and how it scales: the same driver at twice the speed
     * leaves twice the road. `brakeFrac` is how much of its cruise it will give
     * up — well short of a stop, because a driver that could always avoid the
     * car in front is a road that never has a crash on it.
     */
    followSec: 0.55,
    brakeFrac: 0.55,
    /**
     * WHO IS ACTUALLY DRIVING — the mix of tempers, as a share of the traffic
     * and a band on its own def's pace.
     *
     * MOST PEOPLE DO ROUGHLY THE LIMIT and the interesting part is who does not.
     * A road where everybody moves at one speed has no overtaking in it, no
     * closing speeds worth reading and nothing for a lane change to be FOR — so
     * the tail matters more than the middle. Weights, not probabilities, rolled
     * with ONE draw at the spawn mark (the same discipline the fleet roll
     * follows) so adding a temper cannot move a body laid down after it.
     */
    tempers: [
      /** Dawdling — somebody in no hurry, and the reason anybody overtakes. */
      { weight: 14, pace: { min: 0.62, max: 0.82 } },
      /** With the flow. Most of the road, and it has to be. */
      { weight: 62, pace: { min: 0.94, max: 1.06 } },
      /** In a hurry — late for something, and coming past you. */
      { weight: 20, pace: { min: 1.15, max: 1.35 } },
      /** …and the one in twenty-five who should not have a licence. */
      { weight: 4, pace: { min: 1.55, max: 1.85 } },
    ],
    /**
     * SOMEBODY IS BEING CHASED — how often, and by how many.
     *
     * A chase is not a new kind of traffic: it is a runner with its urgency
     * wound right up and one or two police cars behind it with the same, laid
     * down at one spawn mark instead of one vehicle. Everything that makes it
     * read — the weaving, the overtaking, the pile-up it leaves behind — is the
     * ordinary driver above being asked to try much harder.
     *
     * `chance` is per lane mark, so a rung that lays down less traffic gets
     * proportionally fewer chases without a second knob.
     */
    chase: {
      chance: 0.035,
      /** How many cars are after it. */
      cars: { min: 1, max: 2 },
      /** How far back the first one is, and the gap between them (world px). */
      gapPx: { min: 70, max: 120 },
      /** What the whole procession is doing, as a multiple of the road's own
       * top pace — everybody in a chase is going far faster than the traffic
       * they are threading, which is the entire sight. */
      paceMult: 1.75,
      /** …and how much harder they are trying than everybody else. */
      urgency: 3,
    },
    /**
     * HOW HARD A DRIVER TRIES TO KEEP THE OTHER LANE OPEN — how much road it
     * wants free BESIDE it, in world px, before it will sit abreast of
     * somebody.
     *
     * THIS IS THE EASY RUNG'S OWN LEVER and the reason it is here rather than in
     * the AI: on the gentle rungs the pair of lanes running one way must not
     * BOTH be shut at the same point on the road, or a player with a thumb on a
     * phone has nowhere to put the car and the minigame stops being a decision.
     * A driver that finds itself drawing level with the car in the next lane
     * simply lifts off and tucks in behind it — which is both the courteous
     * thing and, from the driving seat, a gap that keeps opening up just as it
     * is needed.
     *
     * Zero on the hard rungs, where two abreast is exactly the problem the
     * player is there to solve. The number itself is `DifficultyDef.drive`'s
     * (`laneGuardPx`); this is only how hard the lift-off is when it applies.
     */
    courtesyFrac: 0.72,
  },
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
  /**
   * THE LEAST LATERAL SPEED A SHOVE LEAVES A VEHICLE WITH (world px/s) — how it
   * gets clear of the wagon that hit it.
   *
   * IT USED TO BE A TELEPORT, and that was the single most damaging thing about
   * how a collision read. Two car bodies that touch keep touching for dozens of
   * ticks, and every one of them used to be another collision — so the shunt
   * moved the struck car clear ON THE SPOT, twenty-two px sideways, which is
   * most of a lane. Instantly. On the frame of the hit.
   *
   * That jump is what "the car teleports" was: rear-end somebody dead square,
   * where the physics says the answer is entirely ALONG the road, and the model
   * would still snap them most of a lane sideways for no reason the picture
   * could account for — and a car going over would jump half a lane in the
   * instant the roll began, which is why the flip read as something happening
   * NEAR the car rather than TO it.
   *
   * The hole it was plugging is closed twice over now: `shuntImmuneMs` is
   * stamped on every contact at the top of the collision pass, so an overlap
   * cannot fire twice however long it lasts. So the separation is a SPEED, and
   * the car drives itself clear over the following tenth of a second the way
   * anything else on this road moves — which is both correct and, unlike a
   * teleport, something the eye can follow.
   *
   * A FLOOR rather than a fixed push: a blow with real lateral impulse in it
   * already exceeds this and keeps its own answer.
   */
  separationPx: 90,
  /** …and how long it cannot be hit again for (ms). One contact is one impact,
   * and this is now the ONLY thing that guarantees it. */
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
    /**
     * HOW FAST A SHOVED CAR GETS BACK ON ITS PACE (1/s).
     *
     * Slow enough that the punt is a thing the player watches happen — the car
     * he just rear-ended visibly runs away from him for the better part of two
     * seconds — and fast enough that the road is not left full of vehicles
     * travelling at speeds nobody chose. A WRECK never reads it: nobody is
     * driving a wreck, which is why it coasts to a halt instead.
     */
    recoverPerSec: 0.8,
    /** How fast a wrecked vehicle sheds its speed once the engine has died
     * (1/s), and the speed under which it has stopped for good — at which point
     * it is a stationary obstacle in a live lane, which is the whole payoff. */
    wreckDragPerSec: 1.1,
    wreckRestPx: 12,
    /**
     * …AND THE ROLLING RESISTANCE UNDER THAT (px/s²) — small, and the reason it
     * exists at all is the same one `downFrictionPx` does.
     *
     * A wreck is supposed to coast, and that is deliberately not being taken
     * away: a car whose engine has died is still on its wheels, still
     * freewheeling, and the long roll to a stop in a live lane is the whole
     * payoff of finishing one. What a viscous drag cannot do is FINISH the
     * roll — it takes a share of the speed each second and the last stretch is
     * a written-off car ambling down the carriageway at a crawl. Tyres and a
     * dead drivetrain are a constant deceleration, so the coast is now a real
     * coast that genuinely ends. A tenth of what a body sliding on its roof
     * gets, because this one still has wheels turning under it.
     */
    wreckFrictionPx: 45,
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
     * WHAT GOING OVER COSTS A VEHICLE, as the share of its road speed it keeps.
     *
     * THE FIRST HALF OF WHY A ROLLED CAR USED TO CARRY ON DOWN THE ROAD. Tipping
     * was booked as a change of ATTITUDE and nothing else: `tipVehicle` set the
     * slew, the spin and the lift and never touched `speed`, so a saloon doing
     * 300 px/s went onto its roof still doing 300 px/s and slid the better part
     * of a screen looking like it was still driving.
     *
     * A trip is not free. What puts a car over is its outside wheels digging in
     * and stopping while the mass above them keeps going, and the energy that
     * buys the rotation and the lift comes out of the only place it can — the
     * forward motion. So a vehicle that goes over arrives on its roof having
     * already lost about half of what it had.
     */
    downSpeedKeep: 0.55,
    /**
     * …AND THE SECOND HALF: HOW HARD TARMAC SCRUBS SOMETHING SLIDING ON IT
     * (px/s² of deceleration, along whatever direction it is actually
     * travelling).
     *
     * A SLIDE IS COULOMB FRICTION, NOT A VISCOUS DRAG, and that distinction is
     * the whole bug. `downDragPerSec` takes a fixed SHARE of the speed away
     * every second, which is the right shape for something moving through air
     * and exactly the wrong shape for something being ground along a road: it
     * approaches zero and never arrives, so the last stretch of every slide is a
     * two-tonne estate creeping down the carriageway on its roof at walking pace
     * for two full seconds. Sliding friction is a CONSTANT deceleration — it
     * does not care how fast you are going — and a constant deceleration reaches
     * a dead stop in finite time and finite distance, which is what a wreck in
     * the road is.
     *
     * Both terms are kept because they are both real: the viscous one is the
     * initial bite while the thing is still tumbling and shedding, and this is
     * the one that finishes the job. Together with `downSpeedKeep` a saloon
     * rolled at 300 px/s comes to rest inside about 85 px and under a second,
     * against the 200-odd px and better part of three seconds it used to take.
     */
    downFrictionPx: 160,
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
     *
     * IT WAS 2.2 AND THAT WAS A NUMBER NOTHING COULD REACH. Measured against
     * `solveImpact`'s own answers on MEDIUM, a 210 kg motorcycle met DEAD
     * SQUARE AT THE FULL 120 comes out at 1.6 wrecks and a delivery moped at
     * 1.7 — so the two most common machines on this road could not be broken in
     * half by the hardest blow the minigame is capable of, and every one of
     * them politely lay down and slid instead. The reasoning above was right
     * and the arithmetic under it was not. At 0.35 a moped is in two pieces
     * from about 55 mph, which is what a car meeting a moped is; the bicycle
     * and the skateboard still clear it on contact, and the bus would still
     * need thirty fatal collisions and will never see one.
     */
    snapForce: 0.35,
    /**
     * …AND PAST THIS MUCH, IT IS NOT WRECKAGE — IT IS A CLOUD.
     *
     * The top of the same ladder, and the difference between "broken in half"
     * and what the request asked for by name: a machine met at speed does not
     * leave two identifiable halves lying in a lane, it leaves a shower of
     * itself down fifty metres of tarmac. The halves still go (they are the
     * silhouette that says WHAT was destroyed), but the debris count, the
     * spread and the lift are all opened right up.
     */
    obliterateForce: 1.2,
    /** What the debris ladder is multiplied by once a machine has been
     * obliterated rather than merely snapped — pieces, reach and lift alike. */
    obliterateScale: 2.2,
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

  /**
   * WHEN TWO OF THEM HIT EACH OTHER — the road's second collision pass
   * (`between.ts`), which has nothing to do with the hero at all.
   *
   * WHY IT HAS TO EXIST. The moment the traffic had drivers it had drivers who
   * get it wrong: somebody pulls out on somebody, a chase comes through at
   * seventy over, a wreck stands dead in a live lane and the car behind it is
   * looking at the car beside it. Without this pass all of that resolves by the
   * two of them sliding through each other, which reads as the road being a
   * painting — and it takes the best thing about a busy carriageway away from
   * the player, which is that it can go wrong WITHOUT HIM. A pile-up he did not
   * cause and has to get through is the most interesting obstacle this minigame
   * has.
   *
   * It is the same momentum sum `impact.ts` runs, between two masses that both
   * matter, and it hands its answers to the SAME breaking model the hero's blows
   * go through — so a car written off by another car folds, sheds, empties and
   * stands there exactly as one written off by the wagon does.
   */
  between: {
    /**
     * RESTITUTION between two vehicles. Higher than a bumper against a person
     * (people are not springs; car bodies are, a little), low enough that a
     * shunt between two of them is plainly an inelastic mess rather than a
     * break in snooker.
     */
    restitution: 0.2,
    /**
     * THE SLOWEST CLOSING SPEED WORTH BOOKING AS A COLLISION (world px/s).
     *
     * Two cars in adjacent lanes drifting a pixel a second into each other is
     * not a crash and must not sound like one — and without a floor the pass
     * would fire on every pair that ever touches at walking pace, which on a
     * road this busy is constantly.
     */
    minClosePx: 40,
    /** How long the pair are immune to each other afterwards (ms) — one contact
     * is one impact, on its OWN clock so the hero can still hit either of them
     * (`DriveTraffic.crashCooldownMs`). */
    immuneMs: 400,
    /** The least each of them leaves with across the road (world px/s), so a
     * pair that met dead square separates instead of grinding down the lane
     * together — the between-traffic twin of `separationPx`. */
    partPx: 46,
    /** How much of the exchange goes into spinning them, per unit of lateral
     * Δv, and the most one blow may put on. */
    yawPerMs: 0.5,
    maxYawSpin: 3.2,
  },

  // ── BREAKING A VEHICLE, PHYSICALLY ────────────────────────────────────────
  /**
   * HOW A CAR BENDS, WHERE ITS GLASS GOES, AND WHAT PUTS IT ON ITS ROOF.
   *
   * The damage rungs above are a LADDER OF PICTURES: three derived looks a
   * vehicle climbs as it absorbs energy, which is exactly right for "this thing
   * has been hit a lot" and says nothing at all about one collision. What this
   * block is, is the collision itself — the three things that happen to a
   * structure when something arrives at it, each solved rather than staged:
   *
   *   IT FOLDS      A crumple zone is a spring that does not come back: it eats
   *                 energy over a DISTANCE. So the depth an end folds in is the
   *                 absorbed energy over the force the structure can hold, and
   *                 the force a structure can hold goes with its mass. A hatch
   *                 met square at the top end folds four metres, which is more
   *                 hatchback than there is — and that is the correct answer,
   *                 clamped to the end that is doing the folding.
   *   ITS GLASS GOES  Glass is not structure. It is out long before the body has
   *                 finished bending, which is why it has a line of its own well
   *                 under the first damage rung.
   *   IT GOES OVER  A wheeled thing tips when the sideways shove at its centre
   *                 of mass beats what the outside wheels can hold it down with.
   *                 That is a Δv threshold, and the whole of why an estate rolls
   *                 and a low sports car slides: it is scaled by the vehicle's
   *                 own `topHeavy` (`fleet.ts`) and by nothing else.
   */
  crush: {
    /**
     * WHAT A STRUCTURE HOLDS BACK WITH, in newtons per kg of vehicle.
     *
     * Real, and worth keeping real because it is what makes the depths land in
     * the right place: a 1400 kg car absorbs its 50 km/h barrier crash — about
     * 135 kJ — in roughly half a metre of nose, which is 270 kN, which is this
     * number times its mass. So a bus resists nine times as hard as a saloon
     * for the same reason it weighs nine times as much, and neither had to be
     * told.
     */
    forceNPerKg: 190,
    /**
     * …AND THE MOST OF ONE END THAT CAN GO, as a share of its half-length.
     *
     * Something has to stop the sum, because the physics genuinely says a car
     * met at 120 folds past its own windscreen. Past this the vehicle is not
     * bending any more, it is being written off — which the wear ladder is
     * already saying at the same moment.
     */
    maxShare: 0.62,
    /**
     * HOW MUCH OF A FOLDED END THE RENDERER ACTUALLY TAKES OUT, as a share of
     * the crush depth.
     *
     * A view knob and honest about it: the depth is solved in world px and the
     * art is 32 px of car, so a metre of fold is a third of the vehicle gone.
     * That reads as a car being eaten rather than a car being crumpled, and the
     * eye reads a shortened, tilted end as "folded" at a fraction of the true
     * distance. The DAMAGE is the physics' own; this is how much of it is drawn.
     */
    drawShare: 0.8,
    /** Absorbed energy that takes the glass out, in the vehicle's own wrecks
     * (`wreckForce`). Well under the first damage rung: the windows are the
     * first thing to go in any collision worth the name. */
    glassForce: 0.1,
    /**
     * HOW HARD A SIDEWAYS SHOVE HAS TO BE TO PUT A VEHICLE OVER (m/s of lateral
     * Δv, for a vehicle of `topHeavy` 1).
     *
     * The one number in this block picked by feel rather than derived, and the
     * feel it is picked for is scarcity: a rollover is the biggest thing that
     * happens on this road and it has to stay the thing that happens when the
     * hero really means it. At 7 m/s a hatchback clipped square across the
     * flank at the top end goes over, a shunt at half speed does not, and the
     * bus never does — its Δv is its impulse over twelve tonnes.
     *
     * MEASURED against the model's own answers rather than picked: a full-flank
     * clip at 120 hands a hatchback 36 m/s of lateral Δv, the same clip at 72
     * hands it 22, and a bus 7. So at 25 an ordinary car goes over when it is
     * caught hard at the top end, a tall one (`topHeavy` 1.4–1.6) goes over a
     * little sooner, a low sports car never does, and nothing on this road can
     * roll a bus or a box truck — which is the whole point of them.
     */
    tipMs: 25,
    /** How much of its lateral Δv a rolling vehicle actually leaves with —
     * held to the shunt's own ceiling on top of this, so the biggest thing on
     * the road takes long enough crossing it to be watched. */
    rollSlew: 0.25,
    /** How fast a rolling vehicle turns over (rad/s per m/s of the Δv that put
     * it over), and how hard it is thrown into the air (px/s per m/s). */
    rollSpinPerMs: 0.5,
    rollLiftPerMs: 9,
    /** …and the most of either, because a car that has been met by the bumper
     * of another car leaves the ground — it does not leave the frame. */
    maxRollSpin: 6,
    maxRollLiftPx: 120,
    /**
     * HOW MUCH OF THE ALONG-ROAD SHOVE A STRUCK VEHICLE ACTUALLY KEEPS.
     *
     * The momentum sum is the momentum sum, and it is applied whole. What this
     * scales is the fact that a car is not a hockey puck: it is on wheels
     * pointing the way it was going, and a shove up the road is partly spent
     * scrubbing tyres rather than accelerating it. Under 1, so the wagon still
     * closes on what it hit and can hit it again — which is the whole shape of
     * bullying a car down the road in front of you.
     */
    punt: 0.7,
    /** How much YAW a shove off the vehicle's centre puts on it (rad/s per m/s
     * of Δv, at a full half-length of lever arm). A blow dead in the middle
     * spins nothing; one on the corner spins it out, which is the thing every
     * player who has ever seen a police video expects to happen. */
    yawPerMs: 0.42,
    /** …and the most one blow can add, so a corner clip is a spin rather than a
     * top. A car turning faster than this is one that is off its wheels, and
     * that is `tipMs`'s question. */
    maxYawSpin: 3.4,
    /** How fast a spun-out car's yaw bleeds off (1/s), and the rate under which
     * it is straight again. */
    yawDampPerSec: 1.1,
    yawRestRad: 0.25,
    /** How many pieces a CAR sheds when it folds — a car coming apart throws
     * bumper, trim and glass down the road, and it is the same `tearMachine`
     * the two-wheelers use, cut out of the car's own art. Per unit of force,
     * capped, and it only starts once the thing has genuinely folded. */
    shedForce: 0.3,
    shedPerForce: 2.2,
    shedMax: 7,
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
    squareness: 0.52,
    /**
     * …AND WHAT KILLS THE ONES WHO DO NOT GET OUT, in the vehicle's own wrecks.
     *
     * THE OTHER HALF OF THE SAME QUESTION, and until it existed the road only
     * had the happy answer. A car folded up around the people in it is a car
     * that killed them; whether the blow happened to be square enough to post
     * one of them through the screen is a fact about the GEOMETRY, not about
     * whether anybody survived. So a hit this hard settles both seats: square
     * enough and they leave through the glass, and otherwise they die in them —
     * and what the road gets to see of that is the windows
     * (`DriveTraffic.gore`).
     *
     * Under the wreck line rather than at it, because a car does not have to be
     * finished to be fatal — it has to be hit properly once.
     */
    killForce: 0.7,
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
     * MEETING SOMEBODY NOSE TO NOSE — the one collision on this road that has a
     * guaranteed picture rather than a rolled one.
     *
     * WHY IT IS ITS OWN RULE AND NOT A HIGHER RUNG. Everything else in this file
     * is a LADDER: hit it harder and more happens. That is right for the road in
     * general and it is wrong for the one event the player is deliberately
     * aiming at, because a ladder makes the biggest thing he can do come out
     * differently every time he does it. A head-on in the opposing lane is the
     * most expensive mistake and the most deliberate act available out here —
     * it costs the wagon more than anything else that is not a bus — and what it
     * buys has to be the same every single time, or it is not a thing the player
     * can decide to do.
     *
     * SO IT IS TWO FACTS, BOTH REQUIRED. The blow is SQUARE (this is a nose
     * meeting a nose, not a wing catching one) and the other car is COMING THE
     * OTHER WAY, which is what makes it a head-on rather than a rear-ending: the
     * two close at the sum of both speeds and the energy is off the top of every
     * scale here. A parked car answers the first and never the second, which is
     * correct — furniture met square is a shunt, however hard.
     */
    headOn: {
      /** How square, on `Impact.squareness`. Well above the ordinary eject's:
       * this is the nose of one car on the nose of another. */
      squareness: 0.78,
      /** …and how fast the other one has to be coming AT you (world px/s of its
       * own travel, against the hero's heading) before it is oncoming rather
       * than merely stationary. A wreck rolling to a halt is not traffic. */
      closingPx: 40,
      /**
       * HOW MUCH ENERGY IT STILL TAKES, as a fraction of `traffic.wreckJoules`
       * — well under the ordinary bar, because "always" is the whole point of
       * the rule and a head-on is above this before either driver has done
       * anything. It is a floor against the pathological case (nosing into
       * oncoming traffic at a walking pace) rather than a threshold anybody
       * meets on the way up.
       */
      joules: 0.06,
      /**
       * …AND IT IS OVER QUICKLY. The share of the ordinary throw's lift a
       * head-on's pieces leave with.
       *
       * UNDER 1 ON PURPOSE, which reads backwards until you watch one. The
       * hardest blow on the road throwing things the HIGHEST is what the ladder
       * would do and it is the wrong picture entirely: a torso lobbed three
       * hundred pixels into the air hangs there for two seconds, and a body
       * hanging in the air is a body nothing is happening to. What a head-on
       * actually looks like is FLAT AND FAST — everything leaves at the closing
       * speed, along the road, and is gone off the top of the frame before the
       * player has finished flinching. The energy goes into `carry`, where it
       * can be seen.
       */
      liftScale: 0.55,
      /** …and how much MORE of the car's own travel they leave with, on top of
       * `carry`. This is where the lift above went. */
      carryScale: 1.3,
    },
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
     * the player cannot tell a hit from a bump in the road. At 1.6 the same hit
     * costs about 10 mph: plainly felt, still recoverable, and still perfectly
     * ordered — glancing blows stay cheap, square ones stay expensive, and speed
     * still costs more than caution saves. The RATIOS are the physics; this is
     * the volume knob.
     *
     * IT IS THE WHOLE ROAD'S KNOB, which is why the crowd needs one of its own
     * beside it — see `crowdSpeedLossScale`.
     */
    speedLossScale: 1.6,
    /**
     * …AND HOW MUCH MORE OF IT A PERSON TAKES OFF, on top of the road's own
     * scale.
     *
     * THE CROWD IS THE ONE POPULATION THE VOLUME KNOB ABOVE CANNOT SERVE, and
     * the reason is arithmetic rather than taste. A momentum transfer SATURATES
     * against the wagon's own 1600 kg: everything with bodywork out here is
     * within a factor of ten of the car and hands back a third to the whole of
     * its speed, so a shunt is a wall whatever this number says and the ceiling
     * (`speedLoss` is clamped to the speed the car had) is doing the work. A
     * person is 78 kg — five percent of the car — and lands at the bottom of the
     * same scale by a factor of twenty. One number for a road whose collisions
     * span 78 kg to twelve tonnes prices the top end or the bottom, never both,
     * and it was pricing the top: a body met at the pace this leg is actually
     * driven at cost four mph off sixty, under a pixel of suspension travel and
     * a tenth of a pixel of frame shake. It was a statistic rather than an
     * event — the wagon walked through a crowd as though it were fog.
     *
     * So the crowd gets the rest of the volume, and ONLY the crowd: a body
     * arrives as a THUMP the player feels in the wheel, while the traffic, the
     * kerb and the ordering between all of them are exactly where they were.
     * What it does NOT touch is the damage — a body's wear is the collision's
     * own energy and nothing here scales it, because "felt" was the complaint
     * and "the car dies in twenty people" was not.
     *
     * MEASURED (`make drive-bench`, 24 seeds a rung, the leg out, before →
     * after) — the trip pays for the thump in seconds rather than in car, and
     * every rung still arrives:
     *
     *   rung        trip           bodies        ending wear
     *   easy        82 s →  85 s   71 →  76      15% → 19%
     *   medium      93 s →  95 s   81 →  79      38% → 35%
     *   hard        98 s → 102 s   85 →  86      44% → 39%
     *   nightmare  105 s → 112 s   90 →  94      53% → 49%
     *   jesus      110 s → 118 s   92 →  98      56% → 50%
     *
     * (EASY moves furthest because its own rung moved too — see
     * `DifficultyDef.drive.pedestrianMassMult`. The wear column drifting DOWN
     * everywhere is the model being consistent rather than a second change: a
     * leg driven a few mph slower is a leg whose collisions carry less energy,
     * and energy is what breaks the car.)
     *
     * THE ABSOLUTE FIGURES ABOVE ARE HISTORY — they are the before-and-after of
     * THIS knob, on the 120 mph wagon, and are kept because they are what it was
     * set against. The re-engined car's own bench is on `verdict.quickMs`.
     */
    crowdSpeedLossScale: 1.5,
    /**
     * HOW MUCH OF A SIDESWIPE IS ABSORBED — the share of the TANGENTIAL energy
     * two things with bodywork grind out of each other.
     *
     * The complaint this answers, in one number. The collision was a purely
     * NORMAL sum, and a sideswipe's normal runs across the road, which the car
     * is not closing along — so two cars could grind down each other's entire
     * length at the top of the dial and the model booked nothing: no energy, no
     * damage, no noise, no mark. The struck car slid neatly aside and that was
     * the whole event.
     *
     * At 0.12 a full-length clip at 120 costs the hero about a ninth of his
     * wagon and takes the other car's glass out — plainly an event — while
     * still costing a fifth of what centring the same car does, which keeps the
     * ordering the whole minigame teaches. Only things with PANELS pay it: see
     * `solveImpact`'s `scrape` parameter for why flesh does not.
     */
    scrapeFriction: 0.12,
    /**
     * HOW MUCH OF A VEHICLE CAN ACTUALLY MEET ANOTHER VEHICLE — the share of the
     * drawn body, measured across the road, that the collision uses.
     *
     * THE PICTURE IS A SIDE ELEVATION AND THE ROAD IS SEEN FROM ABOVE IT, which
     * is a contradiction the eye happily lives with and the collision model
     * cannot. A car's sprite is drawn standing UP the screen — tyres at its own
     * y, roof line most of a lane above it — while the axis that sprite is
     * standing up is the same axis the lanes are laid across. So a car in the
     * next lane VISIBLY overlaps the one below it by most of its own roof, and
     * two cars whose bodywork could not possibly touch look as though they are
     * scraping down each other's flank.
     *
     * The honest reading is that only the bottom of a body is on the ground at
     * all: from the tyres up to about the waistline is the part that occupies
     * ROAD, and everything above that is occupying AIR over the lane behind.
     * That is what this fraction is — applied to the SUM of the two extents, so
     * it is one statement about both parties rather than a shrink applied twice.
     *
     * IT IS VEHICLE-ON-VEHICLE ONLY. A PERSON is a tall thin thing standing on
     * the tarmac and is met by the whole flank of a car at any height at all; a
     * LAMP POST is a column from the pavement to well above the roof. Both pass
     * 1 and get exactly the collision they always got — the band is about two
     * bodies that are both mostly air above the sills, and nothing else on this
     * road is.
     *
     * It also, deliberately, makes threading traffic possible at a lane's edge:
     * two cars a lane apart have real daylight between them now, and a driver
     * who commits to half a gap gets through it.
     */
    bodyBandFrac: 0.6,
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
    /**
     * HOW HARD A HIT SHOVES THE SUSPENSION — px/s of spring velocity per px/s
     * of GROUND SPEED the car actually lost (`nudgeCar`'s own units).
     *
     * IT USED TO BE PER UNIT OF WEAR, and that was the wrong quantity by the
     * same reasoning `crowdSpeedLossScale` exists for. A car's springs are
     * loaded by DECELERATION — the nose dips because the mass is still going and
     * the wheels are not — so the shove is the Δv, not the share of the wagon's
     * life the blow cost. Read off wear, a body at cruise moved the body work by
     * two thirds of a pixel while a van moved it by nine hundred times as much;
     * both of those are the spring on its stop, and only one of them was
     * supposed to be.
     *
     * Set so the crowd lands in the visible part of three px of travel — a body
     * at the pace this leg is driven at dips the nose about a third of the way
     * and one met at the top end puts it on the bump stop — and everything with
     * bodywork saturates it, which is what a shunt has always done.
     */
    nudgePerLoss: 0.42,
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
     * the take that takes somebody in two. Measured against `solveImpact`'s own
     * answers on MEDIUM, it lands a square hit above about 60 mph and a hard
     * clip at the top end on the split side, and leaves every gentle contact a
     * knock-down — which is a knock-down and not an absence: the wheels behind
     * the bumper still cut what they find (`wheelCutPartPx`).
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
    /**
     * THE FORCE AT WHICH LUMPS START COMING OFF SOMEBODY — the gib line, in the
     * same units as everything else here (1 is the split).
     *
     * IT IS NOT ZERO, AND IT WAS. The chunk ladder below reads "at the split
     * line, and per unit of force beyond it" and always has; the code measured
     * it from a standstill instead, so `base` was paid out at any force at all
     * and a wagon rolling into somebody at walking pace threw a length of gut
     * onto the tarmac. That is the one thing on this road that read as a bug
     * rather than as a collision.
     *
     * AND IT IS ABOVE THE SPLIT RATHER THAN ON IT, which is what turns two rungs
     * into three. A bumper going THROUGH somebody and a bumper taking them APART
     * are different amounts of violence and the road can afford to say so:
     *
     *   under the split (~60 mph)   KNOCKED DOWN. A body in the road and blood
     *                               on the tarmac, and nothing else at all —
     *                               until the WHEELS reach it, which cut it in
     *                               two where it lies (`wheelCutPartPx`) and are
     *                               a different question from this ladder.
     *   the split to here           TAKEN IN TWO BY THE BUMPER. Two halves with
     *                               their cut faces open, dragged and run over —
     *                               still no shower of anybody's insides.
     *   past here (~78 mph)         OPENED UP. The halves, and what was between
     *                               them, all over the road.
     *
     * The middle rung is the one this number buys, and it is the rung a player
     * spends most of a leg in.
     */
    chunkForce: 1.6,
    /**
     * …AND THE CEILING EVERY LADDER IN THIS FILE IS READ AGAINST.
     *
     * The same clamp `wreckForce` carries, for the same reason and against a
     * worse case. `remainForce` prices a collision in a BODY's currency, and a
     * CAR collision priced in it comes out at ten to fifty rather than at one to
     * six — so an occupant posted through a windscreen had every ladder here
     * evaluated a decade past the end of its own scale, left the car at nine
     * thousand pixels a second, and was still climbing when the road forgot him.
     * Nothing that should happen stops happening: eight is comfortably past a
     * person met dead square at the top of the dial, which is the worst thing
     * this road can do to somebody on foot.
     */
    maxForce: 8,
    /**
     * …and the fastest anything torn off a body may be thrown UPWARD (px/s).
     *
     * A SEPARATE CEILING BECAUSE IT IS A SEPARATE FAILURE. Against the tumble's
     * own 620 px/s² a piece leaving at this speed is at the top of its arc in
     * under a second and back on the tarmac inside two, which is a collision;
     * one leaving at three times it spends six seconds off the top of the frame,
     * which is nothing at all — the player watches an empty road and then finds
     * a torso in it. Every burst is over quickly or it is not a burst.
     */
    maxLiftPx: 560,
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
     * car covers 905 px a second, so a second of drag is two screens of
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
    /**
     * HOW FAR THE TWO HALVES PART WHEN A WHEEL CUTS A WHOLE BODY IN TWO (world
     * px) — the OTHER way somebody is taken in two out here, and the one that
     * needs no speed at all.
     *
     * `splitJoules` is a question about the BLOW: did the bumper go THROUGH
     * them, which under about sixty it does not. A wheel is not asking that. A
     * tonne and a half of estate rolling over somebody already lying in the road
     * leaves two pieces of them whatever the speedometer said, and the road used
     * to answer that moment by ERASING the body in favour of its own paste — so
     * every collision under the split line ended as a pool of blood with nobody
     * in it, which is the one thing out here that reads as a bug rather than as
     * a collision.
     *
     * The number is small on purpose: this is a cut, not a burst. Five px is
     * enough that the two halves are legibly two at the 16-px scale a body is
     * drawn at, and little enough that they still read as having been one person
     * a moment ago rather than as two lumps that happen to be near each other.
     */
    wheelCutPartPx: 5,
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
   * THE OUTSKIRTS — the road before the town, and the whole of the opening.
   *
   * THE LEG NO LONGER STARTS IN THE TOWN, and that is the point of this block.
   * It used to open with the wagon already in frame on a street of houses, on a
   * deliberately empty stretch of it, which asked the picture to say two things
   * at once: "this is a road you are on" and "the town has not started yet". It
   * said neither. So the leg opens OUTSIDE the town — no houses at all, one
   * pavement, the far verge empty — and the town ARRIVES, once, in front of the
   * player, which is the one moment on this road that can carry the clock
   * starting.
   *
   * FIVE BEATS, IN ORDER, AND EACH IS A DISTANCE RATHER THAN A TIMER: the road
   * scrolls under nothing at all, the car slides into frame from behind, he says
   * where he is going, he says what he thinks of the people he is going through,
   * and the town comes over the horizon.
   */
  opening: {
    /**
     * HOW FAR BEHIND ITS PLACE IN THE FRAME THE CAR STARTS (world px).
     *
     * The camera is carried this far AHEAD of where it belongs and gives the
     * lead back as the leg runs, so the first thing on screen is a road with
     * nothing on it and the wagon comes into the picture from the left of its
     * own accord. Comfortably more than the ~115 world px between the frame's
     * edge and the car's usual seat (`CAMERA_LEAD_FRAC`), so there is a real
     * beat of empty tarmac before the nose appears.
     */
    entryPx: 300,
    /**
     * …and how fast the camera gives that lead back (px/s). The car closes on
     * its mark over two seconds — the pace of a car being caught up with rather
     * than of one arriving.
     *
     * IT WAS 90, WHICH IS THREE AND A HALF SECONDS, and that was fine on a
     * fourteen-second approach and impossible on a five-second one: the whole
     * opening is `cityPx` of road at a held 300 px/s now, so an arrival that ate
     * two thirds of it would leave the car settled for about a second before the
     * town, and the hero's two lines nowhere to go.
     */
    closePx: 150,
    /** What the wagon is doing while it is still arriving (px/s). Held rather
     * than driven: the player's hands are not on it yet. */
    entrySpeedPx: 300,
    /**
     * THE THROTTLE'S CEILING UNTIL THE TOWN (px/s ≈ 78 mph) — the fallback the
     * pedal is clamped to on any stretch of approach the player IS driving.
     *
     * Nothing on the shipped leg reaches it any more: the whole approach is held
     * at `entrySpeedPx` now (`handsOff`), so the pedal is not connected out there
     * at all. It stays because the clamp is the honest thing to leave in place —
     * an attract loop or a demo course with a longer opening than its hand-over
     * would otherwise be floorable — and because the reasoning has not changed:
     * he is not in a hurry until he is in the town, and the clock does not run
     * until then either.
     */
    cruisePx: 407,
    /**
     * THE APPROACH IS NOT DRIVEN — how much of it the player's hands are off.
     *
     * IT IS A COUNTDOWN, AND THAT IS WHAT IT IS FOR. The road hands a player
     * from a menu into a side-on car at seventy miles an hour with a crowd
     * coming, and the honest way to start that is the way every arcade racer
     * ever has: hold the car, say GET READY, and let go on a beat the player can
     * see arriving. Before this the approach was steerable but capped, which
     * managed to be both — a stretch that looked like it was being played and
     * was not being scored, on which the one thing a player could do was drive
     * into the kerb.
     *
     * So the whole of it is held: the speed is `entrySpeedPx` from the first
     * frame to the gate, and the WHEEL comes back a second early (`dashAtPx`)
     * with the dashboard. The pedal is the last thing handed over, at the gate,
     * with the clock.
     *
     * FALSE PUTS THE OLD APPROACH BACK — steerable, pedal capped at `cruisePx` —
     * which is what a demo course with a long opening would want if one ever
     * wanted it. Nothing shipped sets it.
     */
    handsOff: true,
    /** Where he says what the trip is FOR (world px) — as soon as the car has
     * settled into frame, which is the first moment there is anybody in the
     * picture to be thinking it. (`entryPx / closePx` at `entrySpeedPx`, plus a
     * beat.) */
    sayAtPx: 640,
    /**
     * WHERE THE TOWN STARTS (world px) — the gate.
     *
     * Everything the minigame is begins here at once: the houses, the far
     * pavement, the crowd, the lane traffic, and the CLOCK.
     *
     * FIVE SECONDS, AND THE NUMBER IS THE POINT. The approach is held at
     * `entrySpeedPx` from the first frame to the last — the pedal is not the
     * player's out here at all (see `handsOff`) — so this distance IS a duration:
     * 1500 px at 300 px/s. It was 6400, which at the old capped cruise was the
     * better part of FIFTEEN seconds of a minute-long minigame spent watching a
     * car drive down an empty road, and the single most common thing to want to
     * skip in the whole game.
     *
     * IT SHORTENS THE LEG AND NOT THE MINIGAME. `coursePx` came down by exactly
     * what this did, so the TOWN — the stretch the clock runs over, the one the
     * board ranks and the one every measured table on this file was taken
     * against — is the same length it has always been.
     */
    cityPx: 1500,
    /**
     * HOW MANY PEOPLE ARE OUT HERE ON WHEELS — riders per 1000 px of outskirt,
     * and the only traffic before the town.
     *
     * Thin, on purpose. This stretch has to read as EMPTY — that is the whole
     * job of it — and a footway serving riders at the town's own rate would be
     * the town without its houses. What it must not read as is a level that has
     * not finished loading, which is what a completely bare road does: one
     * cyclist or one delivery every few seconds is the difference between a road
     * out of town and a road with nothing on it.
     */
    ridersPerKPx: 2.5,
    /** …and where the first of them may stand (world px). Held back past the
     * car's own arrival: somebody else in the opening frame before the wagon is
     * in it makes the shot read as theirs. */
    ridersFromPx: 520,
    /**
     * HOW MANY LANES THE ROAD OUT OF TOWN HAS.
     *
     * TWO — the middle two of the town's four, so the carriageway is centred on
     * the same line and simply narrower. Four lanes with nothing on either side
     * of them is not a road out of town, it is the town with the buildings
     * forgotten; two is a country road, and it is what makes the widening at the
     * other end of the approach read as arriving somewhere.
     *
     * It is also the safety margin for the cyclists. The footway stays where the
     * town puts it (`crowdEdges`), so a narrow carriageway leaves a whole lane of
     * verge between the tarmac and the pavement: the delivery riders out there
     * are genuinely beyond the wagon's reach rather than nominally so, which is
     * the difference between scenery and a hazard the player is not being told
     * about.
     */
    laneCount: 2,
    /**
     * WHERE THE CAR IS HANDED OVER, AND THE DASHBOARD WITH IT (world px BEFORE
     * the gate) — ONE MARK for both, because they are one beat.
     *
     * A SECOND, EXACTLY (300 px at the held `entrySpeedPx`), and everything
     * about the opening hangs off it:
     *
     *   THE INSTRUMENTS ARRIVE. They are not on screen for the approach at all —
     *   out there nothing is scored and there is nothing to read, and three
     *   readouts saying that nothing is happening spend the one thing that
     *   stretch has, which is that it looks like a road at night with a car on
     *   it. They slide in from the left, which is the same beat the road
     *   widening is.
     *   THE WHEEL BECOMES HIS. Not the pedal — the speed is still held (see
     *   `handsOff`) — so the second before the flag is spent settling into the
     *   lane he wants to meet the town in, which is a genuine decision and the
     *   only one available.
     *   AND "GET READY" IS ON SCREEN until the gate, so the beat is stated
     *   rather than merely implied.
     *
     * ONE NUMBER RATHER THAN TWO, on purpose: a dashboard that arrived on a
     * different frame from the wheel would be the game telling the player two
     * different things about when the minigame starts.
     */
    dashAtPx: 300,
    /**
     * …and over how much road it opens out to four (world px), finishing exactly
     * at the gate.
     *
     * Long enough to be a TAPER rather than a step — a carriageway that doubled
     * in width in one frame would read as a rendering fault — and short enough
     * that the widening and the first house are plainly the same event.
     */
    widenPx: 520,
  },
  /**
   * …AND THE RUN-IN AT THE OTHER END — everything past the finish line.
   *
   * THE FINISH IS NOT THE ARRIVAL and the split is the whole of this block. The
   * clock stops and the town stops at the same world x, because that is what the
   * player is being scored on. Then the wheel comes off him and the leg plays
   * itself out: the car rolls in past GOODCO's fence with the data halls and the
   * ship standing behind them, pulls up on the staff lot, and HE GETS OUT — the
   * only time on this road the man is ever out of the car, and the reason it is
   * here is the level on the other side of the fade. GOODCO's front door has no
   * key (`engine/game/arrivals.ts`), so the last thing the minigame does is put
   * its own question in his mouth, standing on the tarmac looking at it.
   *
   * EVERY MARK BELOW IS ON THE CLOCK, not on a distance, and that is the
   * opposite of every other beat on this road. The car is coasting to a stop out
   * here, so a mark in world px is a mark a gentle enough arrival never reaches
   * — and a leg that ended at 30 mph would sit in front of GOODCO in silence
   * while the board waited on a line it was never going to get.
   */
  arrival: {
    /**
     * How hard the wagon sheds speed once the finish is behind it (px/s²) — a
     * man lifting off and rolling into a car park, not a man braking.
     *
     * Chosen against `outMs` rather than for its own sake: whatever he crosses
     * the line at, the car has to be STOPPED by the time the door opens, and
     * from the top of the dial this brings it up in about three and a half
     * seconds and eleven hundred px, which is the length of the approach the
     * campus is dressed along.
     */
    coastPx: 260,
    /** When he sees it (ms past the finish) — early, while the car is still
     * rolling and the halls are still growing in the windscreen. */
    sightMs: 1300,
    /**
     * When the door opens (ms past the finish). The car is PINNED to a stop
     * here rather than trusted to have coasted to one — a wagon still doing
     * walking pace with a man standing beside it is the one frame that would
     * undo the whole beat.
     */
    outMs: 3400,
    /** …and when he asks the question the next level is the answer to. Long
     * enough after the door for him to be standing still when he says it. */
    askMs: 4800,
    /** …and when the picture goes out under him (ms past the finish). Late
     * enough to read the line, early enough that the black is the last thing the
     * road does rather than a wait. */
    blackoutMs: 7100,
    /** How far he steps away from the door before he stops (world px), and how
     * long that takes (ms). Presentation, but it lives here with the beats it is
     * timed against rather than in the renderer. */
    walkPx: 13,
    walkMs: 900,
  },
  /** How long the whole run-in holds before the drive hands back (ms) — the
   * beats above plus the fade the app paints over the tail of them. */
  arrivalHoldMs: 8500,

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
    /**
     * …and cars traded paint with before the other drivers do. RE-MEASURED once
     * every lane carried traffic (`laneTraffic`), which is a different road:
     * the line was 8, set against one that handed out four to seven for free —
     * and most of those seven were the cars parked at the KERB rather than
     * anything moving, because there was hardly anything moving. A road with a
     * vehicle in every lane hands out a median of 21 to the auto-driver and
     * 28 at the ninetieth percentile (40 seeds a rung), so 26 is the point
     * where a leg has genuinely been spent bouncing off other people rather
     * than merely driving past them.
     */
    cars: 26,
    /**
     * The trip time (ms) under which he made unusually good going, and over
     * which he plainly dawdled. Both sit outside the band a driver actually
     * lands in, so neither is the line a player gets by default.
     *
     * RE-MEASURED AFTER THE RE-ENGINING (`make drive-bench`, 24 seeds a rung).
     * A car that reaches its cruise in a third of the time saves seconds at
     * every crossing without going any faster down the straights, so the whole
     * band moved in and tightened: the auto-driver now takes 79 s on EASY and
     * 105 s on JESUS, against 80 and 114 before. The lines follow it — a player
     * who is TOLD he dawdled has to have actually dawdled.
     */
    quickMs: 74000,
    slowMs: 112000,
    /** The body count that turns "roads are rough out this way" into "bit
     * bumpy tonight". Scaled to the crowd the road actually carries: across
     * every rung the auto-driver arrives with 64 to 100 on the count (a busier
     * road is a slower one, and a slower one meets more people), so the line
     * has to sit near the middle of that or one of the two lines never plays. */
    bumpyBodies: 85,
  },

  /**
   * WHAT THE CABINET PAYS — the arcade score a finished leg is worth, and the
   * board the drive's high-score screen ranks (`driveScore`, ./score.ts).
   *
   * IT PAYS FOR THE COMMUTE, AND IT PAYS NOTHING FOR A PERSON. That is the same
   * joke `verdict` above is machinery for, said a second way and much more
   * plainly: the machine tallies the four things a man is proud of on a drive
   * home — that he got there, that he made good time, that he had it flat out,
   * and that the car is unmarked — and the body count sits on the results card
   * as a STAT worth exactly zero. Score the crowd and the minigame becomes a
   * game about mowing people down, which is the one reading this whole road was
   * built to refuse: the player does the noticing, not the scoreboard.
   *
   * The two things that DO cost you are the two the hero can actually see —
   * somebody else's lamp post and somebody else's paintwork — which is the same
   * ordering `verdict` reads its lines in.
   *
   * MEASURED against the shipped auto-driver (`make drive-bench`): a MEDIUM leg
   * arrives around 65 s with the wagon half wrecked and a handful of cars
   * shoved, which lands near 13,000 — a chunky five-figure arcade number with
   * plenty of room above it for a clean, fast run and plenty below for a bad
   * one.
   */
  score: {
    /** Flat, for getting there at all. Only an ARRIVAL scores: a breakdown
     * restarts the road and a SKIP is a trip the player gave up on, so neither
     * reaches the board. */
    arrival: 2000,
    /**
     * THE TIME BONUS, per second under par — the biggest single term, because
     * beating the clock is what a driver is actually racing and it is the one
     * number a player can chase on the next attempt.
     *
     * PAR is derived from the course rather than fixed, so the attract loop's
     * short leg is scored on its own length and not against a minute of road it
     * never drove.
     */
    perSecondUnderPar: 250,
    /** The pace par is set at (px/s) — 24000 px at 320 px/s is 75 s, which sits
     * just above the 59–72 s a good driver takes and well above the 51 s a
     * reckless straight line does. So par is beatable by driving well and
     * comfortably missed by dawdling. */
    parSpeedPx: 320,
    /** Per mph of the fastest the wagon went. Flat out for even a moment is
     * worth 6000, which is a real chunk — the pedal is the minigame. */
    perTopMph: 50,
    /** The whole of it, for arriving without a mark on the car — scaled down by
     * the wear actually taken, so a bent wagon still collects something. */
    paint: 8000,
    /** Off the total, per street light left in the gutter. */
    perPost: 500,
    /** …and per car shoved out of the way. Cheaper than a post because the road
     * hands a few out for free (see `verdict.cars`). */
    perShunt: 300,
    /** Scores are rounded to this, the way an arcade cabinet's are — a score
     * ending in a stray 7 reads as a spreadsheet. */
    round: 10,
  },
} as const;

/** HOW LONG THIS LEG IS — the whole road unless the params shortened it (the
 * attract loop's only difference from a played drive). The ONE accessor: the
 * spawner, the arrival check and the bench all read the finish here, so a
 * shortened leg cannot end up with a crowd laid out for a longer one. */
export function courseLength(params: { coursePx?: number }): number {
  return params.coursePx ?? DRIVE.coursePx;
}

/**
 * WHERE THE TOWN STARTS — the gate, in course px from the start of the leg.
 *
 * The ONE accessor, for the same reason `courseLength` is: the houses, the far
 * pavement, the crowd, the traffic, the blockade and the CLOCK are all hung off
 * this number, and a road whose scenery began somewhere its clock did not would
 * be scored over a stretch the player cannot see the edges of.
 *
 * It is a parameter (`DriveParams.cityPx`) because the ATTRACT LOOP needs a
 * different answer: a title-screen demo has fifteen seconds to show somebody
 * what this minigame is, and fourteen of them spent on an empty road while a man
 * talks to himself is the whole budget spent on the part that is not the game.
 */
export function cityStartPx(params: { cityPx?: number }): number {
  return params.cityPx ?? DRIVE.opening.cityPx;
}

/** …and how much road the town actually occupies — the stretch the clock runs
 * over, and what a leg's par is measured against. Never negative: a short enough
 * demo course can put the finish inside the outskirts. */
export function cityLength(params: {
  coursePx?: number;
  cityPx?: number;
}): number {
  return Math.max(0, courseLength(params) - cityStartPx(params));
}

/**
 * …AND WHERE IT STANDS IN WORLD X — the two coordinates every pass that DRAWS or
 * PLACES something has to ask, rather than the distances above.
 *
 * The distinction is the leg's direction. `distance` is how far the car has
 * travelled and is always positive; world x runs the way the leg does, so the
 * trip home lays the same town out along negative x. Everything that belongs to
 * the ROAD rather than to the trip — the houses, the pavement, the kerb's
 * furniture, GOODCO's fence — is placed in world x for exactly that reason: the
 * same building has to be the same building on the way back.
 *
 * It rests on the one thing `createDrive` guarantees and nothing else: a drive
 * starts its car at x = 0.
 */
export function citySpanX(params: {
  direction: 1 | -1;
  coursePx?: number;
  cityPx?: number;
}): { fromX: number; toX: number } {
  const gate = params.direction * cityStartPx(params);
  const finish = params.direction * courseLength(params);
  return params.direction === 1
    ? { fromX: gate, toX: finish }
    : { fromX: finish, toX: gate };
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
