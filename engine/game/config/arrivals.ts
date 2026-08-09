// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAFF LOT'S OWN CLOCK — the numbers behind people turning up for a shift
// (`engine/game/arrivals.ts`, `LevelDef.arrivals`). What a level authors is WHO
// and HOW OFTEN; everything here is the choreography that is the same wherever
// the beat is used: how fast a car rolls in, how long somebody sits at the
// wheel before opening the door, how far off the doors he stops to badge in.
//
// The lengths are all read against the ONE thing this beat is for: a player who
// has just landed has to be able to SEE the whole sequence — a car arriving, a
// person getting out, a walk across the tarmac, a door opening — and understand
// from watching it that following the next one is the way in. So every beat is
// long enough to read at the reference viewport (~422x260 world units) and short
// enough that a player who has understood it is not made to wait.

export const ARRIVALS = {
  /**
   * How fast a car rolls down the access lane (px/s). Well under the road's
   * pace and a touch over the hero's own walk: it is somebody arriving at work
   * at half past midnight, and a car that came in at speed would read as a
   * threat the lot has no answer to.
   */
  driveSpeed: 96,
  /**
   * How hard it gets up to that, and how hard it stops for the bay (px/s²).
   *
   * The brake is the harder of the two and is read BACKWARDS from the bay
   * rather than forwards from a trigger line: the roll-in caps its speed at
   * `sqrt(2 * driveBrake * distance-left)`, so the car is always exactly able
   * to stop on the bay however short the lane it was given. A trigger line
   * would have to be tuned against a top speed the lane may never reach, and a
   * lane shorter than the ramp would have the car braking before it had
   * finished accelerating.
   */
  driveAccel: 220,
  driveBrake: 300,
  /** The crawl the last inch is covered at (px/s) — the stopping curve above
   * approaches the bay asymptotically, and a car that never quite arrives is a
   * car that never parks. */
  creepSpeed: 10,
  /** Ms the driver sits there after the engine dies before the door opens —
   * the beat that makes a parked car a car somebody is IN. */
  parkMs: 900,
  /** How fast the walk to the doors is (px/s). A shade under the hero's own,
   * so following one is a stroll rather than a chase. */
  walkSpeed: 48,
  /** Ms spent at the reader with the card out, before the doors move. */
  badgeMs: 700,
  /**
   * HOW LONG THE GATE STANDS OPEN once a badge has opened it (ms) — and the
   * single number the whole way into GOODCO is priced by.
   *
   * The gate is somebody else's and it opens because somebody else's card said
   * so, so what it gives the hero is a MOMENT rather than a door: it takes the
   * staffer who opened it and shuts behind them. A gate that stayed open would
   * turn "follow one in" into "wait at a wall until it moves", which is the
   * thing the whole beat exists instead of.
   *
   * Read against the walk it has to be taken on. The hero moves a shade quicker
   * than an arriving staffer (`walkSpeed`), so a player who starts walking when
   * the card comes out is a stride behind them at the threshold and goes
   * through on the same opening; one who starts when the gate MOVES has to jog
   * and just makes it. Anybody standing about watching misses it — and gets the
   * next car, because the beat never stops happening.
   *
   * It never shuts on a body in the doorway (`stepClosingDoor`), so this is the
   * clear-threshold hold rather than a guillotine.
   */
  gateHoldMs: 1600,
  /**
   * How far the apron stands off the doorway (px) — where the walk stops and
   * the card comes out. Wide enough that the swipe is visibly a thing that
   * happens BEFORE the doors move rather than under them.
   */
  apronGap: 34,
  /** How far past the doorway a body walks before it is taken off the field
   * (px). Past the jambs and out of the doorway, so nothing dissolves in an
   * opening the hero is about to walk through. */
  insideStep: 46,
  /**
   * How far the driving lane is held off the footpath (px).
   *
   * They are two lines because a rank of parked cars stands on one of them:
   * people walking to the doors along the same y they parked on would walk
   * through every bumper ahead of them. About a car's width apart, so the
   * footpath reads as the strip between the bays and the building.
   */
  laneOffset: 30,
  /** The rank's first bay, measured back from the apron along the lane (px) —
   * near enough to the doors to be obviously THEIR bay, far enough that the
   * car is not parked in the doorway. */
  bayGap: 96,
  /** …and the gap between the bays behind it. A car is 48 across (`CAR`), so
   * this is a bay and a half — a rank rather than a scrapyard. */
  baySpacing: 76,
  /**
   * How wide a strip has to be clear of furniture for the lane to be laid down
   * it (px, either side of the line). The car's own half-length plus a margin:
   * the drive-in does not collide with anything (a visitor's car threading the
   * lamp posts is not a simulation anybody asked for), so the lane is chosen
   * where nothing stands instead.
   */
  laneClearance: 30,
  /** How far from the ideal lane the search may wander looking for a clear
   * one (px), and the step it searches at. */
  laneSearch: 130,
  laneStep: 10,
  /**
   * Ms before a REPLACEMENT is sent when the beat has stalled — the badge
   * carrier was killed, or walked into something and never made it.
   *
   * The entrance is the only way into the building, so the one thing this
   * feature may never do is stop happening. A stall is measured rather than
   * predicted: while the door is still shut and nobody is walking toward it,
   * the next car is pulled forward to this.
   */
  retryMs: 6000,
  /**
   * How long a body may spend on one leg of the walk before it is written off
   * as wedged (ms per 100 px of the leg, plus a flat allowance). A person
   * jammed against a lamp post forever is the stall above, without the honesty
   * of being one.
   */
  legMsPer100: 3400,
  legMsFloor: 2000,
  /** The lot's own people (`ArrivalsSpec.guards`): how far apart they are
   * spread, and how far off the walls and the lane they are held (px). */
  guardSpacing: 190,
  guardMargin: 70,
} as const;
