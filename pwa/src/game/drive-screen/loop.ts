// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE TICK OF THE ROAD, TURNED INTO A PICTURE AND A NOISE — the parts of the
// drive's loop that are not the screen.
//
// WHY THEY LIVE HERE RATHER THAN INSIDE `DriveScreen`. There are now TWO hosts
// that stand a `DriveState` up and watch it: the minigame itself, and the
// effects gallery's DRIVE shelf (`effects-gallery/drive-exhibit.ts`), which
// builds a road, plants something in front of the bumper and loops the
// collision so a human can judge it. An exhibit that re-implemented the drain
// would be a diorama of what the road USED to do — the very drift the gallery
// exists to prevent — so both hosts run these three functions and nothing else
// decides what a collision looks or sounds like.
//
// WHAT IS NOT HERE: the two TERMINAL beats (a breakdown's restart, an arrival's
// crossing). Those are policy rather than presentation and the two hosts answer
// them differently — the screen hands the crossing back to the game, the gallery
// simply re-stages its show — so each owns its own.
//
// EVERY CLOCK IN HERE IS THE DRIVE'S OWN (`DriveState.ms`), never the wall's.
// That is what makes a monologue's freeze stop the gibs along with the road, and
// what lets the gallery play a 200 ms collision at an eighth speed with the gore,
// the sparks and the physics all stretching together.

import { DRIVE_OUTCOME, gibsBody, type DriveState } from "@game/core";

import { type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { goreBurst, type GoreBurst } from "../game-screen/gore-burst.ts";
import { drawGore } from "../render/gibs.ts";
import { bodyAnchorX, bodyAnchorY } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { playDriveSound } from "../sfx/index.ts";
import {
  ENGINE_GRAIN_MS,
  engineNote,
  playDriveEngine,
  playDriveShift,
} from "../sfx/drive.ts";
import {
  driveBodyHit,
  driveBreakdown,
  driveLampGlass,
  drivePartHit,
  driveSmash,
  driveTrafficHit,
  driveWindscreenGore,
  type DriveFxState,
} from "./drive-fx.ts";
import { playHudEvent } from "../hud/sounds.ts";
import { lampHeadLift } from "./scenery.ts";
import {
  bodyHitSound,
  BREAKDOWN_SOUND,
  crushSound,
  DEBRIS_SOUND,
  DRAG_SOUND,
  glassSound,
  lampHitSound,
  panelSound,
  pickSmash,
  ROLLOVER_SOUND,
  SHED_SOUND,
  SMASH_SOUNDS,
  splitSound,
  SUB_SOUND,
  trafficHitSound,
} from "./drive-sounds.ts";
import { soakCarFromStrike } from "./car-soak.ts";
import { stepSkids, type SkidState } from "./skid.ts";
import { driveVoice } from "./voice.ts";
import { stepWreckSmoke } from "./wreck-smoke.ts";
import {
  bodySprite,
  crushRemain,
  splashAt,
  splashForce,
  stepDriveGore,
  wetTyres,
  type DriveGoreState,
} from "./drive-gore.ts";

/** One body coming apart, held for as long as its pieces are in the air. */
export type Burst = {
  burst: GoreBurst;
  x: number;
  y: number;
  /** Drive-clock ms when the body was struck. */
  bornMs: number;
  sprite: string;
};

/** How long a burst's pieces are drawn for (ms) — the run's own figure. */
export const BURST_LIFE_MS = 2600;

/**
 * The engine's own little scheduler: when the next grain is due (drive-clock
 * ms), which gear the last one was in, so an upshift can be HEARD rather than
 * merely computed, and what the last one knew — the road speed it was fired at
 * and when — which is how the next one works out where the note is travelling
 * (`glideTo`, sfx/drive.ts).
 */
export type EngineNoteState = {
  dueMs: number;
  gear: number;
  /** The last grain's road speed, and the drive-clock ms it was fired at.
   * `atMs` is negative until the first grain of the leg has gone out. */
  speedPx: number;
  atMs: number;
  /** How far into the NEXT grain the engine's clatter is due to tick. Carried
   * across grains because the ticks run at the CRANK's rate rather than the
   * grain's, and a phase reset every grain would lope at the grain's instead
   * (`playDriveEngine`). */
  tickMs: number;
};

/**
 * HOW HIGH A WINDSCREEN SITS (world px off the road) — where the shards come
 * out of when somebody leaves through one.
 *
 * Read off the fleet's own art: every vehicle on this road carries its glass in
 * the band just above the shoulder line, so one number covers a hatchback and a
 * bus without either of them having to say so. Thrown from the ROAD instead, the
 * burst appears under the car that made it, which reads as the glass having
 * fallen out of the floor.
 */
const WINDSCREEN_LIFT = 12;

export function createEngineNote(): EngineNoteState {
  return { dueMs: 0, gear: 0, speedPx: 0, atMs: -1, tickMs: 0 };
}

/**
 * ONE GRAIN OF THE ENGINE, if one is due — the running note, made out of
 * overlapping one-shots on a fixed cadence (see `sfx/drive.ts`, which owns why
 * it is fixed).
 *
 * Scheduled on the DRIVE's clock rather than the wall's, so it keeps step with
 * the physics through a stutter and stops with the world when a line is up. A
 * dead engine says nothing at all: the wreck rolls in silence, which is most of
 * why the breakdown lands.
 *
 * THE CADENCE IS COUNTED FROM WHEN THE GRAIN WAS DUE, not from now, so a frame
 * that arrives late does not push the whole bed out behind it — a bed whose
 * grains drifted apart is a bed with holes in it. It never runs a backlog
 * either: a leg resumed off a pause card (or a tab that was in the background)
 * has a due time minutes in the past, and what that wants is one grain now,
 * not four hundred at once.
 */
export function runEngineNote(
  drive: DriveState,
  engine: EngineNoteState,
): void {
  if (drive.outcome === DRIVE_OUTCOME.broken) return;
  if (drive.ms < engine.dueMs) return;
  const speed = drive.car.speed;
  const { gear } = engineNote(speed);
  // THE SHIFT IS HEARD BEFORE THE NEXT GRAIN: the note the player follows is
  // the climb inside a gear, so the moment it resets has to be marked or the
  // pitch simply appears to jump backwards for no reason.
  if (gear > engine.gear) playDriveShift(synth, speed);
  engine.gear = gear;
  engine.tickMs = playDriveEngine(
    synth,
    speed,
    drive.car.wear,
    engine.atMs >= 0
      ? { speedPx: engine.speedPx, dtMs: drive.ms - engine.atMs }
      : undefined,
    engine.tickMs,
  );
  engine.speedPx = speed;
  engine.atMs = drive.ms;
  engine.dueMs =
    Math.max(engine.dueMs, drive.ms - ENGINE_GRAIN_MS) + ENGINE_GRAIN_MS;
}

/**
 * Turn one tick's drive strikes and events into what the app owes them — the
 * bursts, the effect layer, the sounds, and the hero's four lines.
 *
 * `say` is optional because only one host has a mouth: the gallery's exhibits
 * have no speech box, and a diorama that parked itself on a monologue would
 * stop being a loop. It takes the drive's own clock, because a line on this
 * road is a BARK that retires itself rather than a scene somebody dismisses.
 *
 * WHAT HE MAKES OF THE TRIP IS NOT SAID HERE. Only two of his lines belong to
 * the road — the promise before the crowd and the wagon giving up under him;
 * the arrival's verdict is read off the whole journey (`driveVerdict`) and
 * spoken at the far end, standing beside the car, as the FIRST page of the
 * destination's opening monologue. See `engine/game/items/flow.ts` `introPages`.
 */
export function drainDrive(
  drive: DriveState,
  bursts: Burst[],
  fx: DriveFxState,
  gore: DriveGoreState,
  skids: SkidState,
  say?: (id: string, nowMs: number) => void,
): void {
  for (const strike of drive.strikes) {
    // THE SHOWER ONLY HAPPENS IF ANYTHING CAME OFF — and that is the SIM's
    // answer (`gibsBody`, the same line `burstBody` tears its chunks past),
    // never a second threshold invented out here. Below it a body is knocked
    // down and bleeds and nothing more: the splash and the mark on the wagon
    // below still land, because a car that was barely moving still puts a
    // person on the tarmac and still comes away with them on the bumper.
    if (gibsBody(strike.joules)) {
      bursts.push({
        // The burst's force is priced off the collision's own energy, so a body
        // taken at 120 comes apart harder than one clipped at 40 — the physics
        // reaches the picture rather than being re-decided here.
        //
        // WHAT IT IS NOW FOR IS THE INSTANT, and only that. The body's own
        // PIECES are the sim's (`DriveRemain`) and are drawn where the road is
        // holding them; this is the shower of what was inside, thrown at the
        // point of contact and gone in a second — which is the one part of a
        // collision that genuinely has no afterwards.
        burst: goreBurst(
          "gib",
          Math.atan2(strike.vel.y, strike.vel.x),
          Math.min(6, 1 + strike.joules / 30000),
          1,
          "humanoid",
          strike.id,
          "blood",
        ),
        x: strike.pos.x,
        y: strike.pos.y,
        bornMs: drive.ms,
        sprite: bodySprite(strike.kind, strike.variant),
      });
    }
    // …the splash it puts on the tarmac, which is the one mark on this road
    // laid at the moment of a collision rather than by something travelling…
    splashAt(gore, strike.pos.x, strike.pos.y, splashForce(strike.joules));
    // …and what it puts on the CAR. Which panel wore it is the physics' own
    // answer (`DriveStrike.panel`, the same number the damage is booked
    // against), and how far UP the car the body got is its own lift — so the
    // wagon gets bloody where it was actually hit, and only reaches the
    // windscreen and the roof when somebody was properly thrown.
    soakCarFromStrike(
      gore.car,
      strike.panel,
      strike.vz,
      splashForce(strike.joules),
    );
  }
  // The trail: whatever is being dragged, skidded or carried leaves its blood on
  // the road it covered this tick. Walked here rather than at the draw, because
  // this runs on the drive's own fixed step and a draw runs on the frame rate —
  // a trail laid at 144 fps would be twice the trail laid at 72.
  stepDriveGore(gore, drive);
  // …and what the DRIVER left, which is the other kind of mark this road keeps:
  // the rubber a handbrake scrubs off, and the smoke coming off it. Walked here
  // beside the blood for the same reason — on the drive's own fixed step, so a
  // stop lays one line however fast the frames are arriving.
  stepSkids(skids, drive, fx);
  // …and what the WRECKS are still doing. Walked here beside the two above and
  // for the third time the same reason: a cloud raised by a car grinding down
  // the tarmac is laid by ground covered and time spent, so it belongs on the
  // fixed step rather than on the frame — and, unlike everything in the event
  // loop below, a wreck is a thing that goes ON happening. See `wreck-smoke.ts`.
  stepWreckSmoke(fx, drive);
  for (const event of drive.events) {
    // ── WHAT THE HIT LOOKS AND SOUNDS LIKE ────────────────────────────────
    // Every collision the engine books gets both. The WEIGHT of it comes from
    // the collision's own joules — the same number the gore burst is priced
    // off — so a body clipped at 40 gives a thud and a puff of grit, and a van
    // met square at 120 gives a crunch, a shower of sparks and a shove of the
    // whole frame. Nothing here decides how hard anything was; it only asks.
    if (event.type === "pedestrianHit") {
      driveBodyHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(
        synth,
        bodyHitSound(event.pos.x, event.pos.y, event.joules),
      );
    }
    // A BUMPER GOING THROUGH SOMEBODY. Its own sound over the thud rather than
    // instead of it: the thud is the steel arriving and this is the person, and
    // they are one collision. It also takes the frame harder — a body coming in
    // two is the biggest thing that happens on this road that is not a car.
    if (event.type === "bodySplit") {
      driveBodyHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(synth, splitSound(event.pos.x, event.pos.y));
    }
    // Something is caught under the floorpan and travelling with the car — the
    // long wet scrape underneath, which is the only sound on this road that
    // says a collision is still HAPPENING rather than having happened.
    if (event.type === "bodyCaught") {
      // The back axle is turning in it, so the tyres are loaded — and what they
      // print is the only part of this the driver takes with him.
      wetTyres(gore);
      playDriveSound(synth, DRAG_SOUND);
    }
    // A wheel has found something already down. Quiet, and it has to be: in the
    // middle of a blockade this fires several times a second, and a crush that
    // announced itself would drown the collision that made the mess.
    if (event.type === "bodyCrushed") {
      crushRemain(gore, drive, event.pos.x, event.pos.y);
      wetTyres(gore);
      playDriveSound(synth, crushSound(event.pos.x, event.pos.y));
    }
    // Dead steel already on the tarmac, kicked further down it: a hollow clout
    // with no crumple in it, because nothing here is giving way.
    if (event.type === "debrisStruck") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, false);
      playDriveSound(synth, DEBRIS_SOUND);
    }
    if (event.type === "trafficHit") {
      const hit = trafficHitSound(event.pos.x, event.pos.y, event.joules);
      // PAST THE TOP SHELF IT IS NOT A HIT, IT IS A CRASH: the big bank, the
      // frame's own ceiling, and the sub laid underneath it. Nothing here
      // decides how hard it was — the shelf is picked off the collision's own
      // joules, same as the two under it.
      if (hit.sub) {
        driveSmash(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
        playDriveSound(synth, SUB_SOUND);
      } else {
        driveTrafficHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      }
      playDriveSound(synth, hit.id);
    }
    // A CAR'S WINDOWS LEAVING IT, with nobody through them. Its own beat, and
    // played OVER whatever else the collision made: the crunch is the steel and
    // this is the glass, and they are one event.
    if (event.type === "glassSmashed") {
      driveLampGlass(fx, event.pos.x, event.pos.y, WINDSCREEN_LIFT, drive.ms);
      playDriveSound(synth, glassSound(event.pos.x, event.pos.y));
    }
    // SOMEBODY DIED IN THEIR SEAT — the death this road cannot show in the air,
    // so it shows it on the windows (`DriveTraffic.gore`). The noise is the
    // body's own wet tear under the glass rather than a bank of its own: what
    // happened is a person, and the player has already learnt that sound.
    if (event.type === "occupantKilled") {
      playDriveSound(synth, splitSound(event.pos.x, event.pos.y));
      playDriveSound(synth, glassSound(event.pos.x, event.pos.y));
    }
    // …AND A CAR GOING OVER. The longest sound and the biggest shove on this
    // road, and the only collision outcome the player cannot mistake for
    // another one.
    if (event.type === "trafficRolled") {
      driveSmash(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(synth, ROLLOVER_SOUND);
      playDriveSound(synth, SUB_SOUND);
    }
    // A CAR VISIBLY FOLDING UP — the same panel noise the hero's own wagon
    // makes, because it is the same event happening to somebody else's car.
    // Deliberately NOT a new bank: what the player is being told is "that one
    // took a rung", and he has already learnt that sound on his own bonnet.
    if (event.type === "trafficBent") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, false);
      playDriveSound(synth, panelSound(event.pos.x, event.pos.y));
    }
    // …AND ONE GIVING UP ENTIRELY. The breakdown noise, for the same reason:
    // the player knows it as the sound of an engine dying, and this is one.
    //
    // THE SMOKE IS NOT RAISED HERE and used to be, which put it on the WRONG
    // CAR: `driveBreakdown`'s column is pinned to the hero's own wagon
    // (`DriveFx.follow` — the one thing `drawDriveFx` is handed a live position
    // for, and correct for the hero's own engine dying), so every car the
    // player finished lit a plume over HIS bonnet and left the actual wreck
    // sitting in the road perfectly clean. A stranger's dead engine is
    // `stepWreckSmoke`'s, which issues it where the wreck is and goes on
    // issuing it for as long as the thing is there to smoke.
    if (event.type === "trafficWrecked") {
      driveSmash(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      // THREE AT ONCE, because a car being finished is three things happening:
      // the structure going (the big bank), the mass of it (the sub), and the
      // engine dying under all of it (the noise the player already knows as
      // exactly that, off his own bonnet).
      playDriveSound(synth, SMASH_SOUNDS[0]);
      playDriveSound(synth, SUB_SOUND);
      playDriveSound(synth, BREAKDOWN_SOUND);
    }
    // A TWO-WHEELER GOING OVER — parts off it and a crunch, which is what a
    // machine hitting tarmac on its side actually is.
    if (event.type === "machineDown") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, true);
      playDriveSound(
        synth,
        trafficHitSound(event.pos.x, event.pos.y, event.joules).id,
      );
    }
    // …AND ONE COMING APART IN THE MIDDLE. Parts everywhere and the BIG shelf,
    // whatever the joules say: a machine breaking in half has no gentle version
    // to play, and the joules of a 30 kg bicycle never will reach the line on
    // their own however completely it has been destroyed. That is the one place
    // on this road where the shelf is picked off WHAT HAPPENED rather than off
    // the energy — and it is right, because what happened is total.
    if (event.type === "machineSnapped") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, true);
      driveSmash(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(synth, pickSmash(event.pos.x, event.pos.y));
      playDriveSound(synth, SUB_SOUND);
    }
    // THE SCREEN GOING OUT, with somebody through it. The glass burst is the
    // lamp's own — a lens leaving a fitting and a windscreen leaving a frame
    // are the same shower of shards at 16 px — thrown from the height a
    // windscreen actually sits at rather than off the road.
    if (event.type === "windscreenOut") {
      driveLampGlass(fx, event.pos.x, event.pos.y, WINDSCREEN_LIFT, drive.ms);
      playDriveSound(synth, lampHitSound(event.pos.x, event.pos.y));
    }
    // …AND WHAT CAME THROUGH IT WITH THEM. Its own event rather than a second
    // read of the one above, because the engine raises it ONLY for a head-on and
    // only with the gore switches on — the gate is answered where the thing is
    // decided, and this is the app doing as it is told. The wet tear plays over
    // the glass: what the player is being shown is a person, not a window.
    if (event.type === "windscreenGore") {
      driveWindscreenGore(
        fx,
        event.pos.x,
        event.pos.y,
        WINDSCREEN_LIFT,
        drive.ms,
      );
      playDriveSound(synth, splitSound(event.pos.x, event.pos.y));
    }
    // …and the body itself, arriving in the air. The heavy bank whatever the
    // joules say: there is no gentle version of coming out of a vehicle.
    if (event.type === "occupantThrown") {
      driveBodyHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(
        synth,
        bodyHitSound(event.pos.x, event.pos.y, event.joules),
      );
    }
    // A STREET LIGHT LEAVING ITS BASE — the shards a car sheds, plus the
    // crunch, because what the player has just heard is steel shearing off a
    // concrete foot rather than a fender folding.
    if (event.type === "lampFelled") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, true);
      driveTrafficHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      // …AND THE LENS, out of the air where the head was. The event's position
      // is the post's while it is still standing, which is the one tick this
      // can be asked — a felled prop's `pos` is the flying half's and is moving
      // by the next one.
      driveLampGlass(
        fx,
        event.pos.x,
        event.pos.y,
        lampHeadLift(event.pos),
        drive.ms,
      );
      playDriveSound(synth, lampHitSound(event.pos.x, event.pos.y));
    }
    if (event.type === "panelBent") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, false);
      playDriveSound(synth, panelSound(event.pos.x, event.pos.y));
    }
    if (event.type === "partShed") {
      drivePartHit(fx, event.pos.x, event.pos.y, drive.ms, true);
      playDriveSound(synth, SHED_SOUND);
    }
    if (event.type === "breakdown") {
      driveBreakdown(fx, event.pos.x, event.pos.y, drive.ms);
      playDriveSound(synth, BREAKDOWN_SOUND);
    }
    // ── THE CLOCK ─────────────────────────────────────────────────────────
    // The two moments the STOPWATCH has, and the only sounds this road makes
    // that are not something happening to the car. They go through the HUD's
    // own catalog (`content/hud/events.yaml`) rather than the drive's sound
    // bank, because they are the CABINET talking: the town arriving in front of
    // the wagon is the leg starting to be scored, and the finish line is it
    // stopping. Everything else in `playDriveSound` above is steel, glass or a
    // person.
    if (event.type === "cityGate") playHudEvent("drive.clockStart");
    // THE STOPWATCH STOPS WITH THE TOWN, not with the leg. There is an outskirt
    // of road left after the last house — the stretch the leg driven the other
    // way opens over (`cityEndPx`) — and none of it is raced, so the noise that
    // says "that is your time" belongs at the far gate rather than at the finish
    // line an outskirt further on.
    if (event.type === "cityEnd") playHudEvent("drive.clockStop");
    if (!say) continue;
    // WHICH LEG THIS IS decides all three of his lines (`voice.ts`): the road
    // out is an errand and an opinion about the people on it, the road home is a
    // man with the part on the passenger seat who has stopped thinking about
    // them entirely.
    const voice = driveVoice(drive.params);
    if (event.type === "monologue") say(voice.monologue, drive.ms);
    if (event.type === "breakdown") say("drive_broke_down", drive.ms);
    // ── THE RUN-IN'S ONE LINE ─────────────────────────────────────────────
    // The place, said through the windscreen with it still growing in the glass
    // — and then the fade. He does not get out and he does not ask how to get
    // in: the level on the far side of the black opens on a car already in a bay
    // and, at GOODCO, on a gate with a guard sitting in it, so a question about
    // a door the player is looking at would be the game explaining its own map.
    //
    // It is the only line on this road that is not about the car, the clock or
    // the road surface, and it is allowed to be for the same reason the
    // opening's is: there is nobody in the picture. He is not failing to notice
    // anybody here; there is genuinely nobody left to notice.
    if (event.type === "sight") say(voice.sight, drive.ms);
  }
}

/**
 * The bodies coming apart, over the finished picture — the same pass the run
 * uses, handed a synthetic effect because a drive has no effect layer.
 *
 * SEATED THROUGH THE PROJECTION (`bodyAnchor*`), like the fx layer beside it
 * and like every standing body in the game. A raw `pos - camera` put every
 * burst most of a lane BELOW the person it came off — the road is drawn raked
 * (pitch 0.75) and a quarter of the offset from the camera's own line went
 * missing, which on a phone is a good fifty screen pixels of daylight between a
 * man and his own blood.
 *
 * Returns the bursts still in the air, so the caller keeps a list that shrinks.
 */
export function drawBursts(
  ctx: CanvasRenderingContext2D,
  bursts: Burst[],
  camera: Camera,
  nowMs: number,
  sprites: Sprites,
): Burst[] {
  const live = bursts.filter((b) => nowMs - b.bornMs < BURST_LIFE_MS);
  for (const b of live) {
    drawGore(
      ctx,
      {
        kind: "gib",
        gib: b.burst,
        sprite: b.sprite,
        untilMs: b.bornMs + BURST_LIFE_MS,
        durationMs: BURST_LIFE_MS,
        pos: { x: b.x, y: b.y },
      } as Parameters<typeof drawGore>[1],
      bodyAnchorX(b.x, b.y, camera.x, camera.y),
      bodyAnchorY(b.x, b.y, camera.x, camera.y),
      nowMs,
      sprites,
    );
  }
  return live;
}
