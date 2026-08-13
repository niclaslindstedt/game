// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE SHELF — one exhibit per thing the road can do to you, each staged so
// the collision lands on cue.
//
// WHY THE ROAD NEEDED ITS OWN SHELF. Every other effect in this gallery is
// reviewable because it can be POSED: freeze a horde, push the event, look. A
// collision cannot be posed. It is a momentum sum between a moving car and a
// thing in front of it (`solveImpact`), and everything the player sees — how
// many sparks, how far the pieces go, how hard the frame is shoved, which of
// the two body shelves the sound comes off — is priced off the joules that sum
// returns. So an exhibit here does not fire an effect; it PLANTS something and
// DRIVES INTO IT, which is the only honest way to show what the road looks like.
//
// EVERY NUMBER BELOW IS A MEASUREMENT, not a taste. The plant distances are
// tuned so the hit lands about half a second into the show (early enough that
// the loop is mostly aftermath, late enough that the eye has the road first),
// and the lateral offsets are tuned so each exhibit lands on the shelf it says
// it does — a glancing blow on the light body bank, a square one on the heavy,
// a corner clip on the scrape, a rear-ender on the crunch.
// `tests/content/drive_exhibits_test.ts` drives every one of them headlessly and
// fails the build if a staging stops producing the event (and the sound) it
// advertises, which is what stops this file quietly becoming a museum of a road
// that has since been re-tuned.
//
// THIS FILE TOUCHES NO BROWSER. The staging is pure engine — `DriveState` and
// the numbers in `DRIVE` — so the test above can run it in Node. Everything
// that draws or makes a noise is the host's (`exhibit-run.ts`).

import {
  courseLength,
  createTraffic,
  crowdEdges,
  CROWD_THOUGHTS,
  CROWD_VARIANTS,
  DRIVE,
  FLEET,
  GLUED_BARKS,
  isMastSlot,
  GLUED_VARIANTS,
  haltTraffic,
  skipDriveOpening,
  laneCenter,
  roadBandEdges,
  roadEdges,
  rungTopSpeedPx,
  TRAFFIC_VARIANTS,
  type DriveState,
} from "@game/core";

import {
  BODY_SOUNDS,
  BREAKDOWN_SOUND,
  CRUNCH_SOUNDS,
  DRAG_HEAVY_SOUND,
  DRAG_SOUND,
  EXPLOSION_SOUND,
  HARD_BODY_SOUNDS,
  PANEL_SOUNDS,
  SCRAPE_SOUNDS,
  SHED_SOUND,
  SMASH_SOUNDS,
  SPLIT_SOUNDS,
} from "./drive-sounds.ts";
import type { DriveExhibit } from "../effects-gallery/exhibit-kit.ts";

/**
 * HOW FAR AHEAD OF THE BUMPER A THING IS PLANTED so it is met about half a
 * second in, at the speed the exhibit is driven at.
 *
 * The road opens with the car already at the speed its exhibit wants (see
 * `openAt`), so this is plain distance-over-speed. Just over four hundred
 * milliseconds is the beat that reads, and it is bounded at BOTH ends: an
 * exhibit that hit on the first tick would be over before the eye arrived, one
 * that hit two seconds in would be mostly waiting — and anything past about half
 * a second is planted off the right-hand edge of the reference viewport (the
 * camera shows roughly 310 world px ahead of the bumper), so the show would open
 * on an empty road and the thing would fly in from nowhere.
 */
const LEAD_MS = 420;

/** The throttle the two CAR-DAMAGE exhibits are driven on — see the note on
 * A PANEL GIVES for why they are the two that are not flat out. */
const THIRD = 0.3;

/**
 * HOW FAR UNDER ITS NEXT THRESHOLD a staged car is parked, as a fraction of
 * `DRIVE.impact.wearJoules`.
 *
 * A bend and a shed part are THRESHOLDS a running total crosses rather than
 * collisions, so those two exhibits stage the total and let the show's own hit
 * cross it. A body met at a third throttle is worth a bit under a thousandth of
 * `wearJoules` (measured: 0.0013 into a panel, 0.0008 of total wear on the more
 * worn car), so the gap is set at half of the smaller of those — comfortably
 * crossed by the nudge, and far too small to be crossed by anything else.
 */
const NUDGE = 0.0004;

function leadPx(speedPx: number): number {
  return (speedPx * LEAD_MS) / 1000;
}

/**
 * SILENCE THE SPAWNER — the road's own crowd and traffic, pushed past the end of
 * the course so nothing arrives that the exhibit did not plant.
 *
 * It is the DRIVE shelf's `clearEnemies` + `stopWaves` (see `STAGE_BASE`), and
 * the same rule: the only thing that happens on screen is the thing under
 * inspection. A shelf that let the road serve up its own bodies would show a
 * scrape exhibit gibbing somebody halfway through, which is a fine road and a
 * useless review.
 */
function silence(drive: DriveState): void {
  // …AND THE OPENING WITH THEM, which is the other thing on this road that is
  // not the exhibit. A fresh leg spends its first three and a half seconds
  // sliding the wagon into frame with the pedals disconnected and the collision
  // pass not running at all, and the outskirts after that hold the throttle at
  // a cruise — so a show staged on a fresh drive is a show whose collision
  // happens after everybody has stopped looking, if it happens at all.
  // `skipDriveOpening` is the engine's own answer, and an exhibit takes its
  // DEFAULT — the gate itself, hold already over. (A restart keeps the last
  // stretch of the approach on purpose; a show that opened on two lanes of
  // held-speed outskirt would be spending its first second and a half on the
  // one thing an exhibit is not about.)
  skipDriveOpening(drive);
  const past = courseLength(drive.params) + 1;
  drive.nextPedestrianAt = past;
  haltTraffic(drive, past);
}

/**
 * …AND THE KERB WITH IT. `silence` stops the CROWD and the TRAFFIC; the street
 * lays its furniture on a fixed pitch along the course and would carry on
 * standing lamp posts and parked cars through the middle of a show that is
 * about one of them.
 */
function clearKerb(drive: DriveState): void {
  drive.props.length = 0;
  // Past anything the spawner's reach can get to, in the direction it walks.
  drive.nextPropSlot =
    Math.round(drive.car.pos.x / DRIVE.street.pitchPx) +
    drive.params.direction * 10_000;
}

/** How fast a car this bent can go on THIS ROAD — the rung's own ceiling
 * (`rungTopSpeedPx`, 120 mph on EASY climbing to the wagon's 174 at the top)
 * through the road's `1 - wear × loss`, so a staged wreck opens at the speed it
 * would actually be doing.
 *
 * IT HAS TO BE THE RUNG'S OR THE PAIRING BELOW COMES APART. `openAt` and
 * `throttle` agree on a fraction of the top end precisely so the throttle does
 * not take the staged speed back (see `openAt`) — and the top the throttle
 * clamps to is the rung's, so a fraction of the CAR's would be handed straight
 * back on the next frame, which is the moving target that pairing exists to
 * stop. */
function topFor(drive: DriveState): number {
  return (
    rungTopSpeedPx(drive.params.difficulty) *
    (1 - drive.car.wear * DRIVE.wearTopSpeedLoss)
  );
}

/**
 * Open at `frac` of what this car can still do, rather than at the 28% the road
 * hands a player — so the staged hit lands at the speed worth looking at.
 *
 * It pairs with a THROTTLE held at the same fraction (`throttle` below), because
 * `applyCarPedal` clamps to `topSpeed × pedal`: without the pair, an exhibit
 * staged at a third of the top end would be flat out again a second later, which
 * is a fine road and a moving target.
 */
function openAt(drive: DriveState, frac = 1): number {
  drive.car.speed = topFor(drive) * frac;
  return drive.car.speed;
}

/** What is held on the wheel to keep it there. */
function throttle(frac: number): { pedal: number; wheel: number } {
  return { pedal: frac, wheel: 0 };
}

/** Somebody standing still, `ahead` px up the road and `across` px off the
 * car's own line. `across` is what decides whether the blow is square or
 * glancing — it is the contact normal's read onto the nose, and the whole of
 * the difference between the two body shelves. */
function plantBody(
  drive: DriveState,
  ahead: number,
  across: number,
  variant: number,
  /** Which of the crowd's thoughts is over their head, or −1 for the ones
   * simply walking — every exhibit but THE THINGS THEY CARRY. */
  thought = -1,
): void {
  drive.pedestrians.push({
    id: drive.nextId++,
    pos: {
      x: drive.car.pos.x + drive.params.direction * ahead,
      y: drive.car.pos.y + across,
    },
    vel: { x: 0, y: 0 },
    mode: "afoot",
    kind: "walker",
    bark: thought,
    variant: variant % CROWD_VARIANTS,
    phase: 0,
    z: 0,
    vz: 0,
    counted: false,
    crushed: false,
  });
}

/**
 * A SMALL BLOCKADE, `ahead` px up the road — THE GLUED, laid across every lane
 * exactly as `spawnBlockade` lays them, but planted in front of the bumper
 * rather than at its place in the course.
 *
 * FEWER OF THEM THAN THE ROAD CARRIES, and deliberately: the shipped
 * demonstration is twenty and takes the car three or four seconds to get
 * through, which is a whole minigame rather than an exhibit. Three rows is
 * enough to show the two things worth looking at — a wall that has no line
 * through it, and what a wagon at 174 does to the front row of one.
 */
function plantBlockade(drive: DriveState, ahead: number, rows: number): void {
  const dir = drive.params.direction;
  const edges = roadEdges();
  const span = edges.bottom - edges.top;
  const perRow = Math.max(1, Math.floor(span / DRIVE.blockade.seatPitchPx));
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let seat = 0; seat < perRow; seat++) {
      drive.pedestrians.push({
        id: drive.nextId++,
        pos: {
          x: drive.car.pos.x + dir * (ahead + row * DRIVE.blockade.rowPitchPx),
          y:
            edges.top +
            (span - (perRow - 1) * DRIVE.blockade.seatPitchPx) / 2 +
            seat * DRIVE.blockade.seatPitchPx,
        },
        vel: { x: 0, y: 0 },
        mode: "afoot",
        kind: "glued",
        variant: n % GLUED_VARIANTS,
        phase: 0,
        z: 0,
        vz: 0,
        counted: false,
        crushed: false,
        // Every third of them has something to say — the shipped formation's
        // own share (`DRIVE.blockade.voices` over its count), so the exhibit
        // shows the density of bubbles a player actually meets.
        bark: n % 3 === 0 ? n % GLUED_BARKS : -1,
      });
      n++;
    }
  }
}

/**
 * A PIECE OF KERB, `ahead` px up the road — one of the two things the street
 * stands on its own pavements (`engine/game/drive/street.ts`).
 *
 * Minted by hand rather than through the spawner because the spawner lays
 * furniture on a fixed PITCH along the course: what stands in front of the
 * bumper is a property of where the hero happens to be, which is exactly what
 * an exhibit cannot have. The shape is `DriveProp`'s own and the sim treats it
 * identically — the only thing staged is where it is.
 */
function plantProp(
  drive: DriveState,
  kind: "parked_car" | "lamp_post",
  ahead: number,
  y: number,
  variant = 0,
): void {
  drive.props.push({
    id: drive.nextId++,
    kind,
    pos: { x: drive.car.pos.x + drive.params.direction * ahead, y },
    variant: variant % TRAFFIC_VARIANTS,
    felled: false,
    dark: false,
    vel: { x: 0, y: 0 },
    z: 0,
    vz: 0,
    angle: 0,
    spin: 0,
    hitCooldownMs: 0,
  });
}

/** Another car, `ahead` px up the road at `y`, dawdling along at `pace` in the
 * given direction. */
function plantCar(
  drive: DriveState,
  ahead: number,
  y: number,
  pace: number,
  variant: number,
  towardHero = false,
  /**
   * HOW MANY PEOPLE ARE IN IT — staged, for the one exhibit that is ABOUT the
   * load rather than about the blow.
   *
   * How many a given car carries is a per-vehicle roll off its own id
   * (`rollOccupants`), biased hard toward one because nearly everybody on this
   * road is alone in the car. That is right for the road and no use at all to a
   * shelf that has to show the same thing every time it is opened: an exhibit
   * demonstrating what happens to the row the windscreen cannot reach needs a
   * car with a row behind the front pair, on every single run.
   */
  seats?: number,
  /** Stable id for an exhibit whose subject is a deterministic per-car roll. */
  forcedId?: number,
): void {
  const dir = drive.params.direction;
  const id = forcedId ?? 10;
  drive.nextId = Math.max(drive.nextId, id + 1);
  // Minted by the engine's own factory, so a car staged for the gallery is
  // built exactly the way a car on the road is — riders, occupants and all.
  const one = createTraffic(
    id,
    variant % TRAFFIC_VARIANTS,
    { x: drive.car.pos.x + dir * ahead, y },
    (towardHero ? -dir : dir) * pace,
  );
  if (seats !== undefined) one.occupants = seats;
  drive.traffic.push(one);
}

/**
 * A CAR THAT HAS ALREADY BEEN DRIVEN — the state a panel bend, a shed part and
 * a breakdown all arrive out of.
 *
 * None of those three is a collision; each is a THRESHOLD a running total
 * crosses, so staging one means staging the total that is about to be crossed
 * rather than the blow that crosses it. That is also what these look like in
 * play: nothing sheds a bumper on the first body of the trip.
 *
 * `panels` pins every panel's rung as well as its joules, so a staged car that
 * is visibly bashed does not ALSO fire the bend event on the show's own hit —
 * the exhibit under inspection gets the screen to itself.
 */
function worn(drive: DriveState, wear: number, panelRung: number): void {
  const { car } = drive;
  car.wear = wear;
  const joules = (DRIVE.panelRungs[panelRung - 1] ?? 0) + 0.02;
  for (const panel of Object.keys(
    drive.panelJoules,
  ) as (keyof typeof drive.panelJoules)[]) {
    drive.panelJoules[panel] = joules;
    car.panels[panel] = panelRung;
  }
}

/**
 * THE SHELF. Twelve exhibits, and between them every picture and every one of the
 * thirteen sounds the road can throw.
 */
export function driveExhibits(): DriveExhibit[] {
  return [
    {
      kind: "drive",
      id: "drive-body-clip",
      icon: "walker_hi_vis_0",
      label: "CLIPPED ON THE WING",
      blurb: "A GLANCING BODY - A THUD, A PUFF OF GRIT, AND NO SPEED LOST",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "body",
        "pedestrian",
        "glance",
        "grit",
      ],
      showMs: 1600,
      shows: "pedestrianHit",
      bank: BODY_SOUNDS,
      input: throttle(0.77),
      road: (drive) => {
        silence(drive);
        // NOT FLAT OUT, and it stopped being able to be. The LIGHT body shelf
        // sits under the line where a bumper goes through somebody, and past
        // about a hundred even a blow taken mostly across the nose is beyond it
        // — so the exhibit advertising the cheap thud was demonstrating the wet
        // tear. A hundred is where a glance is still a glance; the heavy one is
        // the exhibit below, met square.
        //
        // AND THE SHARE MOVED A THIRD TIME, for the third version of the same
        // reason: the shelves are priced in JOULES, so what this exhibit means
        // is a SPEED, and the dial it is a share OF is now the RUNG's rather
        // than the car's (`rungTopSpeedPx`). This shelf drives on MEDIUM, whose
        // dial stops at 135, so a hundred is a bit over three quarters of it.
        const speed = openAt(drive, 0.77);
        // OFF THE CAR'S OWN LINE, so the contact normal runs mostly ACROSS the
        // nose and the car barely notices it — the cheap blow a driver who
        // learns to clip rather than centre gets to keep his speed with.
        plantBody(drive, leadPx(speed) + 26, 9, 7);
      },
    },
    {
      kind: "drive",
      id: "drive-body-square",
      icon: "blood_burst_2",
      label: "TAKEN IN TWO",
      blurb:
        "MET DEAD ON AT 174 - ONE HALF OVER THE ROOF, THE OTHER UNDERNEATH",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "body",
        "pedestrian",
        "gore",
        "gib",
        "blood",
        "crunch",
      ],
      // Long: the pieces are in the air for the better part of three seconds
      // (`BURST_LIFE_MS`), and where they come down is half of what a gore pass
      // is judged on.
      showMs: 3000,
      shows: "pedestrianHit",
      bank: HARD_BODY_SOUNDS,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // AN ORDINARY BODY (variant 4, the suit — the yardstick the crowd's
        // weight table is written around, `CROWD_MASS_MULTS`). WHICH person is
        // standing here now picks which bank the hit comes off, so a card that
        // advertises the ordinary heavy shelf has to plant somebody of ordinary
        // weight or it is demonstrating the light one and saying otherwise.
        plantBody(drive, leadPx(speed) + 34, 0, 4);
      },
    },
    {
      kind: "drive",
      id: "drive-body-slow",
      icon: "gib_road_paste_1",
      label: "RUN DOWN",
      blurb:
        "TWENTY MILES AN HOUR - KNOCKED FLAT, AND CUT IN TWO BY THE WHEELS",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "body",
        "pedestrian",
        "slow",
        "crush",
        "gore",
        "blood",
      ],
      // THE OTHER END OF THE ROAD'S GORE, and the end that had nothing to look
      // at: under the split line the bumper goes through nobody, so what happens
      // to the body is entirely the WHEELS' doing — and the wheels used to erase
      // it in favour of its own paste, which is how a slow drive through a crowd
      // came to leave pools of blood with nobody in them. Long enough to show
      // all three beats: the thud, the body landing in the road, and the wheel
      // that arrives a moment later and takes it in two where it lies.
      showMs: 2600,
      shows: "bodySplit",
      bank: SPLIT_SOUNDS,
      input: throttle(0.12),
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive, 0.12);
        plantBody(drive, leadPx(speed) + 14, 0, 5);
      },
    },
    {
      kind: "drive",
      id: "drive-fairy-dust",
      icon: "spell_rending_strike",
      label: "FAIRY DUST",
      blurb:
        "SFW - THE BODY PEELS AWAY IN DUST, THE CRASH LANDS AS IT ALWAYS DID",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "body",
        "pedestrian",
        "sfw",
        "fairy",
        "stardust",
        "glitter",
        "disintegrate",
      ],
      showMs: 1500,
      shows: "pedestrianHit",
      bank: HARD_BODY_SOUNDS,
      sfw: true,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        plantBody(drive, leadPx(speed) + 34, 0, 4);
      },
    },
    {
      kind: "drive",
      id: "drive-fairy-crash",
      icon: "traffic_sedan_dent3",
      label: "FAIRY DUST - STEEL",
      blurb: "SFW - THE FULL SMASH, WITH A PUFF OF DUST OVER IT",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "crash",
        "sfw",
        "fairy",
        "stardust",
        "glitter",
        "puff",
      ],
      showMs: 1500,
      shows: "trafficHit",
      bank: CRUNCH_SOUNDS,
      sfw: true,
      input: throttle(0.67),
      // THE SAME CRASH THE CRUNCH EXHIBIT STAGES, in the mode — same speed,
      // same van, so the only difference between the two cases is the dressing.
      // Which is the point worth looking at: the smash, the sparks, the debris
      // and the shake are all still there, and the mode's whole contribution is
      // the puff of pastel over the top of them. Held against the body's shower
      // beside it, it is also what keeps the two sizes honest.
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive, 0.67);
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          DRIVE.trafficSpeedPx.min,
          6,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-drag",
      icon: "gib_road_smear_2",
      label: "CARRIED",
      blurb: "WHAT GOES UNDER STAYS UNDER - A BODY DRAGGED, AND THE ROAD AFTER",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "body",
        "drag",
        "smear",
        "blood",
        "trail",
        "tyre",
      ],
      // Long, because the SUBJECT is long: a piece caught at the top end rides
      // for the better part of a second and a half and paints a screen and a
      // half of tarmac doing it (`DRIVE.gore.dragMs`).
      showMs: 3400,
      shows: "bodyCaught",
      // BOTH DRAGS, because which one plays is a question about who is under
      // there (`dragSound`) and this card's business is the picture.
      bank: [DRAG_SOUND, DRAG_HEAVY_SOUND],
      // IT HOLDS LIKE EVERYTHING ELSE ON THIS SHELF, and following the car was
      // tried first and was wrong. The subject travels WITH the wagon, so
      // following it sounded right — but what the exhibit is actually of is the
      // TARMAC BEHIND, and the camera rides only 115 world px behind the car, so
      // a followed take put the entire trail off the left edge and showed an
      // empty road with a clean car on it. Held at the collision, the streak
      // unrolls away from a fixed point and every pixel of it stays in frame.
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        plantBody(drive, leadPx(speed) + 34, 0, 9);
      },
    },
    {
      kind: "drive",
      id: "drive-blockade",
      icon: "glued_arms_up",
      label: "THE GLUED",
      blurb: "A ROAD WITH NO LINE THROUGH IT - AND NO TIME TO FIND ONE",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "protest",
        "blockade",
        "glued",
        "climate",
        "sit",
        "placard",
      ],
      // Long enough to READ them before he reaches them, which is the whole
      // beat: the bubbles fade up as the car closes (`READ_PX`, placards.ts) and
      // then there is nothing at all the player can do with what they just read.
      showMs: 3600,
      shows: "bodySplit",
      bank: SPLIT_SOUNDS,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // Planted further out than anything else on this shelf, and that is the
        // exhibit: the crowd arrives at the bumper in a couple of hundred
        // milliseconds, and a wall you can see coming for a second and a half is
        // a different feeling entirely. Three rows, because twenty is a minigame
        // rather than a display case (`plantBlockade`).
        plantBlockade(drive, leadPx(speed) * 2.4, 3);
      },
    },
    {
      kind: "drive",
      id: "drive-paint",
      icon: "traffic_sedan",
      label: "TRADING PAINT",
      blurb: "A CORNER CAUGHT ON THE WAY PAST - SPARKS DOWN THE FLANK",
      group: "DRIVE",
      keywords: ["drive", "road", "car", "traffic", "scrape", "spark", "metal"],
      showMs: 1800,
      shows: "trafficHit",
      bank: SCRAPE_SOUNDS,
      input: throttle(0.48),
      road: (drive) => {
        silence(drive);
        // A CAR THAT HAS BEEN OUT HERE A WHILE, because that is the car this
        // happens to — and because a graze hard enough to throw a shower of
        // sparks would climb a panel rung on factory-fresh metal and fire the
        // BEND on the same tick, putting a second sound and a second burst over
        // the one under inspection.
        worn(drive, 0.2, 3);
        // AT HALF THE DIAL, WHICH IS WHERE THE SCRAPE SHELF LIVES. It opened at
        // the top of the dial and stayed correct until the wagon was re-engined:
        // the shelves are priced in JOULES and did not move, but flat out is
        // 174 mph now, and a full-length grind at 174 is a CRUNCH — so the
        // exhibit advertising the scrape was demonstrating the shelf above it.
        // Eighty-odd is where trading paint is still trading paint.
        const speed = openAt(drive, 0.48);
        // MOST OF THE WAY INTO THE NEXT LANE. A car passed cleanly a lane
        // apart never touches — the two are 26 px apart and two vehicles reach
        // only `DRIVE.impact.bodyBandFrac` of their own extents at each other,
        // because a car's picture stands UP the same axis the lanes are laid
        // across and only the bottom of it is on the road. So trading paint
        // means exactly what it says: drifting far enough over to catch a
        // corner, at a closing speed low enough that it stays a scrape.
        plantCar(
          drive,
          leadPx(speed) + 28,
          drive.car.pos.y - 9,
          DRIVE.trafficSpeedPx.min,
          6,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-crunch",
      icon: "traffic_van",
      label: "INTO THE BACK OF A VAN",
      blurb:
        "MET SQUARE AT NINETY - THE CRUNCH, THE BUMPER GONE, THE FRAME SHOVED",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "crash",
        "crunch",
        "shake",
        "flash",
      ],
      showMs: 2200,
      shows: "trafficHit",
      bank: CRUNCH_SOUNDS,
      input: throttle(0.67),
      road: (drive) => {
        silence(drive);
        // AT NINETY MILES AN HOUR, WHICH IS WHERE THE CRUNCH SHELF LIVES — and
        // which is what the blurb has always said out loud. It opened flat out,
        // and the road grew a shelf ABOVE the crunch (`SMASH_SOUNDS`) that a
        // full-speed rear-ender comfortably reaches, so the exhibit advertising
        // the crunch was quietly demonstrating the one above it; the big one has
        // its own exhibit now, below. The SHARE has moved twice more since — once
        // when the wagon was re-engined (ninety was eight tenths of a 120 mph
        // dial and barely half of a 174 one) and again when the DIAL became the
        // RUNG's rather than the car's (`rungTopSpeedPx`; this shelf drives on
        // MEDIUM, which stops at 135). The speed the shelf sits at has not moved
        // once through any of it, because the shelves are priced in JOULES —
        // which is the whole reason the share keeps having to.
        const speed = openAt(drive, 0.67);
        // THE WHOLE CASCADE, ON PURPOSE — and the one exhibit here that does not
        // isolate its event. A rear-ender at this speed is over the crunch line,
        // over a panel rung and over the first fix rung all at once: the crunch,
        // the bend and the bumper leaving are ONE thing that happens, and an
        // exhibit that staged them apart would be showing a collision the road
        // cannot produce.
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          DRIVE.trafficSpeedPx.min,
          6,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-smash",
      icon: "traffic_sedan_dent3",
      label: "THE BIG ONE",
      blurb: "A STOPPED CAR MET AT 174 - IT FOLDS, IT SPINS, IT EMPTIES",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "crash",
        "smash",
        "wreck",
        "crush",
        "fold",
        "eject",
        "windscreen",
      ],
      showMs: 2600,
      shows: "trafficHit",
      bank: SMASH_SOUNDS,
      road: (drive) => {
        silence(drive);
        // THE TOP OF THE LADDER, AND THE ONE WORTH LOOKING AT. Everything the
        // collision learned lands in this single event: the struck car's tail
        // folds in by the depth the energy bought (`crushShare`), its glass
        // goes, it is punted bodily up the road, the driver leaves through the
        // screen, and the noise is the smash bank with the sub underneath it. A
        // STOPPED car rather than a dawdling one, because the sweep is then the
        // hero's whole speed — which is what makes this the biggest collision
        // the road can produce.
        const speed = openAt(drive);
        plantCar(drive, leadPx(speed) + 40, drive.car.pos.y, 0, 0);
      },
    },
    {
      kind: "drive",
      id: "drive-explosion",
      icon: "flame_4a",
      label: "THE TANK GOES",
      blurb:
        "THE BLAST LIFTS THE CAR - FIRE, GLASS AND BLACK SMOKE RISE UNDER IT",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "explosion",
        "blast",
        "fire",
        "smoke",
        "glass",
      ],
      showMs: 3200,
      shows: "trafficExploded",
      bank: [EXPLOSION_SOUND],
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // ID 1 sits in the explosion third of the collision's deterministic
        // roll. Pinning it is the gallery equivalent of pinning a seed: this
        // card always shows the event its title promises.
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          0,
          0,
          false,
          undefined,
          1,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-fairy-fire",
      icon: "flame_4a",
      label: "STAR FIRE",
      blurb: "SFW - THE TANK POPS IN GOLD STARS AND THE WRECK FIZZES",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "explosion",
        "fire",
        "burning",
        "sfw",
        "star",
        "glitter",
        "sparkle",
      ],
      // LONGER THAN THE FIREBALL CARD IT MIRRORS, because the pop is only half
      // of what this exhibit is for: the burn underneath it is re-issued on a
      // cadence for as long as the wreck is alight (`burning.ts`), and the
      // question a reviewer has to answer — does a fizzing car still read as a
      // car in trouble — cannot be asked of the first half second.
      showMs: 3600,
      shows: "trafficExploded",
      bank: [EXPLOSION_SOUND],
      sfw: true,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // THE SAME TANK THE FIREBALL CARD PINS — id 1, the explosion third of
        // the collision's deterministic roll and NOT the tenth that goes up big
        // — so the two cards are one event in its two materials and nothing
        // else about them differs.
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          0,
          0,
          false,
          undefined,
          1,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-shockwave",
      icon: "flame_4b",
      label: "THE BIG ONE",
      blurb:
        "A TANK THAT TAKES THE WHOLE STREET - THE PRESSURE CROSSES THE FRAME",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "explosion",
        "blast",
        "shockwave",
        "pressure",
        "wave",
      ],
      showMs: 3200,
      shows: "trafficExploded",
      bank: [EXPLOSION_SOUND],
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // ID 87 clears BOTH of the road's deterministic rolls: the explosion
        // third (`collisionCombustion`) and the tenth that goes up big
        // (`blowsBig`). The card next door pins 1, which explodes and does NOT —
        // so the two of them are the same event at its two sizes, which is the
        // only way a reviewer can tell whether the rare one is worth being rare.
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          0,
          0,
          false,
          undefined,
          87,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-rollover",
      icon: "traffic_suv",
      label: "PUT ON ITS ROOF",
      blurb: "A TALL ONE CAUGHT ACROSS THE FLANK AT 174 - IT LEAVES THE ROAD",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "roll",
        "rollover",
        "flip",
        "crash",
      ],
      showMs: 2600,
      shows: "trafficRolled",
      road: (drive) => {
        silence(drive);
        // AN SUV, BECAUSE THE ROLLOVER IS ABOUT SHAPE RATHER THAN SPEED. The
        // test is the lateral Δv the sum hands the vehicle against its own
        // `topHeavy`, so the identical clip that puts this one over leaves a
        // low sports car of nearly the same weight sliding — which is the
        // whole reason the field exists and the thing this exhibit is for.
        const speed = openAt(drive);
        // …CAUGHT ON THE CORNER, which is where a lateral Δv comes from. Inside
        // the pair's own contact reach (`DRIVE.impact.bodyBandFrac`): a body
        // that is mostly air above the sills is not met by another one a whole
        // lane away, however much their pictures overlap.
        plantCar(
          drive,
          leadPx(speed) + 30,
          drive.car.pos.y - 9,
          0,
          FLEET.findIndex((def) => def.id === "traffic_suv"),
        );
      },
    },
    {
      kind: "drive",
      id: "drive-inside",
      icon: "traffic_minivan_gore",
      label: "THE ONES WHO STAY IN",
      blurb: "THE FRONT PAIR GO THROUGH THE SCREEN - THE BACK ROW DOES NOT",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "gore",
        "blood",
        "glass",
        "occupant",
        "windscreen",
      ],
      showMs: 2400,
      shows: "occupantKilled",
      road: (drive) => {
        silence(drive);
        // A THREE-ROW MINIVAN, AND THE THREE ROWS ARE STAGED. The case only
        // exists when there are more people in a car than the body can post out
        // at once: two go through the glass and the row behind them — who were
        // never in front of it — die where they sit, which the road can only
        // show one way (`DriveTraffic.gore`, the derived `<sprite>_gore`
        // overlay). A minivan CAN hold six and mostly holds one, because how
        // many are in a given car is a per-vehicle roll biased toward somebody
        // driving home alone; an exhibit that left it to the roll would be
        // showing an empty back seat five times in nine.
        const speed = openAt(drive);
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          0,
          FLEET.findIndex((def) => def.id === "traffic_minivan"),
          false,
          3,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-head-on",
      icon: "traffic_sedan_gore",
      label: "MET NOSE TO NOSE",
      blurb: "AN ONCOMING CAR TAKEN HEAD ON - THE DRIVER LEAVES THROUGH IT",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "traffic",
        "head-on",
        "oncoming",
        "gore",
        "blood",
        "eject",
        "windscreen",
      ],
      // Long enough to watch the landing: the torso leaves flat and fast and is
      // most of a screen up the road before it comes down.
      showMs: 3000,
      shows: "windscreenOut",
      road: (drive) => {
        silence(drive);
        // THE ONE COLLISION ON THIS ROAD WITH A GUARANTEED PICTURE, and the
        // reason it needs an exhibit at all: it is not a rung of any ladder.
        // Everything else out here is priced on the blow, so what it looks like
        // depends on how hard it was; a head-on in the OPPOSING LANE always
        // posts the driver's upper half out through the screen with his insides
        // after it and leaves the car wearing the rest of him (`eject.ts`,
        // `headOn`). That is what makes it something a player can decide to do.
        //
        // STAGED AT A MODEST SPEED for exactly that reason. Well under half the
        // dial, and well under the force at which an ejected body would come
        // apart on the ordinary ladder — the two of them CLOSED, and that is the
        // whole of the rule.
        const speed = openAt(drive, 0.4);
        const pace = DRIVE.trafficSpeedPx.min;
        // Planted against the CLOSING speed rather than the hero's own, or an
        // oncoming car arrives at the bumper in half the beat everything else on
        // this shelf is timed to.
        plantCar(
          drive,
          leadPx(speed + pace) + 40,
          drive.car.pos.y,
          pace,
          6,
          true,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-parked",
      icon: "traffic_estate",
      label: "SOMEBODY'S PARKED CAR",
      blurb: "IT IS NOT FURNITURE - IT FOLDS, IT SPINS, IT ROLLS UP THE KERB",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "kerb",
        "parked",
        "car",
        "crash",
        "crush",
        "handbrake",
      ],
      showMs: 2600,
      shows: "trafficHit",
      road: (drive) => {
        silence(drive);
        clearKerb(drive);
        // THE CASE THAT USED TO DO NOTHING. A parked car was a `DriveProp`, and
        // a prop has no velocity, no crush, no yaw and nothing to roll — so the
        // only answer the collision had was to move it sideways by a fixed
        // twenty-two px and carry on. It stops being furniture the moment it is
        // touched now (`unparkCar`) and takes the blow exactly as the road's own
        // cars do.
        const speed = openAt(drive);
        // Out at the near kerb, where the street actually parks them, with the
        // hero pulled over onto the same line.
        const kerb = roadBandEdges().bottom + DRIVE.street.kerbOffsetPx;
        drive.car.pos.y = kerb;
        plantProp(
          drive,
          "parked_car",
          leadPx(speed) + 40,
          kerb,
          FLEET.findIndex((def) => def.id === "traffic_estate"),
        );
      },
    },
    {
      kind: "drive",
      id: "drive-lamp",
      icon: "road_lamp_near",
      label: "A STREET LIGHT GOES",
      blurb: "IT SHEARS OFF ITS FOOT - THE STUMP STAYS, THE COLUMN DOES NOT",
      group: "DRIVE",
      keywords: ["drive", "road", "kerb", "lamp", "post", "mast", "glass"],
      showMs: 2600,
      shows: "lampFelled",
      road: (drive) => {
        silence(drive);
        clearKerb(drive);
        // ON A REAL MAST SLOT, which matters: the street stands its lighting on
        // a fixed pitch and the renderer asks `mastAt` which of the two
        // pictures a post is wearing. A lamp planted between slots is a garden
        // yard light, which is a different sprite and not the thing this shows.
        const speed = openAt(drive);
        const kerb = roadBandEdges().bottom + DRIVE.street.kerbOffsetPx;
        drive.car.pos.y = kerb;
        const { pitchPx } = DRIVE.street;
        const want = drive.car.pos.x + drive.params.direction * leadPx(speed);
        let slot = Math.round(want / pitchPx);
        // …and the NEXT one that is genuinely a mast, in the direction of
        // travel, so the post is always in front of the bumper.
        while (!isMastSlot(slot)) slot += drive.params.direction;
        drive.props.push({
          id: drive.nextId++,
          kind: "lamp_post",
          pos: { x: slot * pitchPx, y: kerb },
          variant: 0,
          felled: false,
          dark: false,
          vel: { x: 0, y: 0 },
          z: 0,
          vz: 0,
          angle: 0,
          spin: 0,
          hitCooldownMs: 0,
        });
      },
    },
    {
      kind: "drive",
      id: "drive-panel",
      icon: "car_doors_2",
      label: "A PANEL GIVES",
      blurb: "THE BONNET CLIMBS A RUNG - DARK SHARDS, NO LIGHT IN THEM",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "panel",
        "damage",
        "bend",
        "shard",
        "wear",
      ],
      // Short: a bend throws its shards for half a second and the show is over.
      showMs: 1400,
      shows: "panelBent",
      bank: PANEL_SOUNDS,
      // BODIES STAY IN ONE PIECE FOR THIS ONE, AND THE NEXT. Both exhibits are
      // about what a hit does to the CAR, and a gore burst is the loudest thing
      // the road can put on a screen — staged with it on, the seven dark shards
      // coming off the wing were invisible inside a cloud of somebody. So these
      // two run the road's own gore-OFF outcome (the body is knocked aside and
      // tumbles to the verge, `PedestrianMode`), which is a real road rather
      // than a trick, and leaves the shards the only thing to look at.
      gib: false,
      input: throttle(THIRD),
      road: (drive) => {
        silence(drive);
        // A car one nudge short of the next rung, and the nudge. The panel that
        // wears it is the one the physics put the contact on — hit things square
        // and it is the bumper, every time — and it goes from rung 0 to rung 1
        // ON SCREEN, which is the other half of what this exhibit is of.
        worn(drive, 0.2, 0);
        drive.panelJoules.bumper = (DRIVE.panelRungs[0] ?? 0.06) - NUDGE;
        // AND IT IS DRIVEN SLOWLY, which is the whole reason this reads. Every
        // one of the road's effects is anchored to the ROAD, so at the top end
        // the shards are off the left edge before the eye has found them — and
        // this exhibit's threshold is STAGED rather than earned, so it costs
        // nothing to cross it at a third of the speed and keep the car (with its
        // newly bent bumper) in the frame it came off.
        const speed = openAt(drive, THIRD);
        plantBody(drive, leadPx(speed) + 34, 0, 11);
      },
    },
    {
      kind: "drive",
      id: "drive-shed",
      icon: "car_shed_bumper",
      label: "THE BUMPER GOES",
      blurb: "A PART WORKS FREE AND SKIPS DOWN THE TARMAC BEHIND YOU",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "part",
        "shed",
        "bumper",
        "detach",
        "debris",
      ],
      // A shed part's shards outlive a bend's by a third of a second — what
      // comes off a car is heavier than what comes off the road.
      showMs: 1800,
      shows: "partShed",
      bank: [SHED_SOUND],
      /** Gore off, and a third of a throttle, for the reasons A PANEL GIVES has
       * both. */
      gib: false,
      input: throttle(THIRD),
      road: (drive) => {
        silence(drive);
        // A hair under the first fix rung, with the panels already bent far
        // enough that the nudge below cannot climb one and fire the bend
        // alongside — the bumper is what has been doing the work, and it is the
        // first thing to leave.
        worn(drive, (DRIVE.fixRungs[0] ?? 0.45) - NUDGE, 2);
        // Slowly, for the reason A PANEL GIVES is driven slowly: the bumper
        // hangs off a car that has to still be in the frame.
        const speed = openAt(drive, THIRD);
        plantBody(drive, leadPx(speed) + 34, 0, 16);
      },
    },
    {
      kind: "drive",
      id: "drive-breakdown",
      icon: "flame_smoke_1",
      label: "THE ENGINE DIES",
      blurb: "THE LAST HIT IT HAD IN IT - A WHEEL GOES, IT ROLLS, IT SMOKES",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "breakdown",
        "wreck",
        "smoke",
        "dead",
        "engine",
      ],
      // The wreck's whole hold (`DRIVE.breakdownHoldMs`, which is how long the
      // smoke burns for) and a beat either side, so the column is watched rather
      // than glimpsed — the one exhibit here whose show is the AFTERMATH.
      showMs: 3400,
      shows: "breakdown",
      bank: [BREAKDOWN_SOUND],
      road: (drive) => {
        silence(drive);
        // A car with one hit left in it, and the van that takes it. It opens at
        // the speed a car this bent can still do, which is barely half the top
        // end — the damage the player feels long before the engine gives up.
        worn(drive, 0.93, 3);
        const speed = openAt(drive);
        plantCar(
          drive,
          leadPx(speed) + 40,
          drive.car.pos.y,
          DRIVE.trafficSpeedPx.min,
          6,
        );
      },
    },
    {
      kind: "drive",
      id: "drive-ride",
      icon: "car_wheel_0",
      label: "THE RIDE AT 174",
      blurb:
        "NO COLLISION AT ALL - JUST WHAT A WAGON THIS OLD DOES AT THE TOP END",
      // THE ONE EXHIBIT THAT HAS TO NAME ITS RUNG, because it is the only one
      // whose subject IS the top of the dial — and the dial is the ladder's now
      // (`rungTopSpeedPx`): every rung under the last stops the wagon short of
      // its own 174, so on the shelf's default MEDIUM this exhibit would be THE
      // RIDE AT 135 with a label saying otherwise. It plants nothing and hits
      // nothing, so the rung's own weights never come into it.
      difficulty: "jesus",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "speed",
        "rumble",
        "shake",
        "tremble",
        "engine",
      ],
      showMs: 4000,
      // THE ONE EXHIBIT WITH NOTHING IN FRONT OF IT. The tremble rises with the
      // SQUARE of speed and is the only thing on screen that says 120 rather
      // than 30 — so it is shown the only way it can be: an empty road, held
      // flat out, with the engine note under it.
      engine: true,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // Oncoming traffic in the FAR lanes — never within reach of the near
        // one the car opens in, so nothing is ever hit, and closing at the sum
        // of both speeds, which is what makes the top end read at all. An empty
        // frame trembling is a frame with a bug in it.
        for (let i = 0; i < 6; i++) {
          plantCar(
            drive,
            leadPx(speed) * (1.4 + i * 1.9),
            laneCenter(i % 2),
            DRIVE.trafficSpeedPx.min + (i % 3) * 60,
            i * 3 + 1,
            true,
          );
        }
      },
    },
    {
      kind: "drive",
      id: "drive-thoughts",
      icon: "walker_old_woman_0",
      label: "THE THINGS THEY CARRY",
      blurb: "WHAT THE PEOPLE ON THIS ROAD ARE THINKING - AT 174, IN PASSING",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "crowd",
        "pedestrian",
        "thought",
        "text",
        "bubble",
        "placard",
        "words",
      ],
      // LONG ENOUGH FOR THREE OF THEM, which is the only way the beat is
      // reviewable at all: one line on its own is a caption, and three arriving
      // and leaving in turn is the cadence — up out of the traffic, read or not
      // read, gone, then a stretch of road with nobody thinking anything.
      showMs: 5200,
      // NOTHING IS HIT, and that is declared by leaving `shows` off (see the
      // suite): they are stood on the FAR pavement, the opposite side of the
      // road from the lane the wagon opens in, so the show is the words and only
      // the words. What it looks like when one of them goes under the car is
      // four other exhibits on this same shelf.
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // On the pavement furthest from the car's own line, which on either leg
        // is simply the edge of the crowd's band the car is not near.
        const edges = crowdEdges();
        const kerb = drive.car.pos.y > 0 ? edges.top + 4 : edges.bottom - 4;
        // Spaced roughly as the road spaces them (`DRIVE.thoughtPitchPx`) so the
        // gaps between the lines are the gaps a player gets, and given three
        // thoughts far apart in the catalogue — a hope, a debt and a kindness.
        const lines = [0, Math.floor(CROWD_THOUGHTS / 3), CROWD_THOUGHTS - 4];
        for (const [i, thought] of lines.entries()) {
          plantBody(
            drive,
            leadPx(speed) * 1.6 + i * DRIVE.thoughtPitchPx,
            kerb - drive.car.pos.y,
            i * 6 + 2,
            thought,
          );
        }
      },
    },
    {
      kind: "drive",
      id: "drive-reactions",
      icon: "walker_hoodie_0",
      label: "SOMEBODY SAW THAT",
      blurb: "THE CROWD SHOUTS ABOUT WHAT THE WAGON JUST DID TO ONE OF THEM",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "crowd",
        "pedestrian",
        "witness",
        "reaction",
        "shout",
        "bystander",
        "text",
        "words",
      ],
      // SHORT, AND SHORTER THAN THE BEAT IT IS OF, because of what THIS HOST
      // does with the camera: a drive take FOLLOWS the wagon until its own
      // collision lands and then HOLDS, so the aftermath stays in the display
      // case (`exhibit-run.ts`). That is right for every other shelf on this
      // road and it puts a hard ceiling on this one — the car drives out of the
      // frame, and every reaction after the first happens somewhere the picture
      // no longer is. So the shelf shows the ONE shout that lands on the blow,
      // and the PACING of them (one every `DRIVE.witness.gapMs`) is not
      // reviewable here at all; that is a thing to look at by driving.
      showMs: 1400,
      // THE COLLISION IS THE CAUSE, and it is what the contract test drives for:
      // the shout is a consequence the sim raises off it, so the event this
      // stages is still a body going under the bumper.
      shows: "pedestrianHit",
      // Flat out and met square, so these are the HEAVY takes — the same shelf
      // the road's own top-end collisions land on.
      bank: HARD_BODY_SOUNDS,
      road: (drive) => {
        silence(drive);
        const speed = openAt(drive);
        // THE PEOPLE IT HAPPENS TO — a knot of them across the car's own line.
        //
        // A KNOT RATHER THAN A BODY, and that is not dressing: a single figure
        // planted a second of road away spends that second WANDERING
        // (`DRIVE.walkPx`, and every planted body shares a wander phase), so it
        // can be forty pixels off the bumper by the time the car arrives and the
        // take is a wagon driving down an empty road. A knot spread wider than
        // the drift always has somebody left in the way.
        //
        // …AND EVERY BODY IN IT WEIGHS THE SAME KIND OF AMOUNT. Which of the
        // nine the bumper reaches first is not something the staging can pick —
        // they are spread across the lane and they drift — so if the knot were a
        // spread of BUILDS the take would land on whichever sound shelf that
        // body happened to belong to, and the shelf's own contract test would
        // fail on a coin toss. These four are the mid band of
        // `CROWD_MASS_MULTS` (0.92–1.08, `bodyWeight`), so the collision is the
        // ordinary heavy take whoever it meets, and the knot still looks like
        // four different people rather than one person nine times.
        const BUILDS = [4, 2, 13, 8];
        for (let i = 0; i < 9; i++) {
          plantBody(
            drive,
            leadPx(speed) + (i % 3) * 7,
            (i - 4) * 10,
            BUILDS[i % BUILDS.length] ?? 4,
          );
        }
        // …AND THE PEOPLE IT HAPPENS IN FRONT OF. On both pavements, thick
        // enough that there is certain to be somebody inside the reading window
        // (`DRIVE.witness.reachPx`) at the instant a body goes under — a witness
        // the picture cannot draw is an incident that passes in silence, and an
        // exhibit that showed that would be showing the bug rather than the
        // beat.
        const edges = crowdEdges();
        for (let i = 0; i < 8; i++) {
          const kerb = i % 2 === 0 ? edges.top + 3 : edges.bottom - 3;
          plantBody(
            drive,
            leadPx(speed) * 0.5 + i * (DRIVE.witness.reachPx / 2),
            kerb - drive.car.pos.y,
            i * 7 + 3,
          );
        }
      },
    },
    {
      kind: "drive",
      id: "drive-gearbox",
      icon: "car_wheel_1",
      label: "PULLING AWAY",
      blurb: "STANDSTILL TO THIRD - THE BOX CHANGES UP AND THE REVS FALL BACK",
      group: "DRIVE",
      keywords: [
        "drive",
        "road",
        "car",
        "gear",
        "gearbox",
        "shift",
        "rpm",
        "rev",
        "tacho",
        "speed",
        "accelerate",
        "engine",
      ],
      // LONG, BECAUSE THE SUBJECT IS SLOW. The wagon is a heavy thing with a
      // tired engine: first is gone in three and a half seconds, second takes
      // another three, and third is still climbing when the take ends. Cutting
      // it shorter would show one upshift, and one upshift does not read as a
      // gearbox — two does.
      showMs: 11000,
      // THE TWO THINGS THIS EXHIBIT IS: the note, which is the whole of what a
      // shift SOUNDS like, and the dashboard, which is the whole of what one
      // LOOKS like. Every other exhibit on this shelf has neither, and this one
      // is nothing at all without both — an empty road with a car on it.
      engine: true,
      dash: true,
      road: (drive) => {
        silence(drive);
        // FROM A DEAD STOP, which is the one thing the road never does on its
        // own: a played drive is handed over with the car already at 28% (the
        // hero is taking over a wagon that is leaving), so the first two gears
        // are over before the player ever sees the dashboard. Here they are the
        // entire show.
        openAt(drive, 0);
      },
    },
  ];
}
