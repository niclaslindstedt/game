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

import { DRIVE, DRIVE_OUTCOME, type DriveState } from "@game/core";

import { type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { goreBurst, type GoreBurst } from "../game-screen/gore-burst.ts";
import { drawGore } from "../render/gibs.ts";
import { bodyAnchorX, bodyAnchorY } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";
import { playDriveSound } from "../sfx/index.ts";
import {
  engineGrainMs,
  engineNote,
  playDriveEngine,
  playDriveShift,
} from "../sfx/drive.ts";
import {
  driveBodyHit,
  driveBreakdown,
  driveLampGlass,
  drivePartHit,
  driveTrafficHit,
  type DriveFxState,
} from "./drive-fx.ts";
import { lampHeadLift } from "./scenery.ts";
import {
  bodyHitSound,
  BREAKDOWN_SOUND,
  crushSound,
  DEBRIS_SOUND,
  DRAG_SOUND,
  lampHitSound,
  panelSound,
  SHED_SOUND,
  splitSound,
  trafficHitSound,
} from "./drive-sounds.ts";
import { soakCarFromStrike } from "./car-soak.ts";
import { stepSkids, type SkidState } from "./skid.ts";
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

/** The engine's own little scheduler: when the next grain is due (drive-clock
 * ms) and which gear the last one was in, so an upshift can be HEARD rather
 * than merely computed. */
export type EngineNoteState = { dueMs: number; gear: number };

export function createEngineNote(): EngineNoteState {
  return { dueMs: 0, gear: 0 };
}

/**
 * ONE GRAIN OF THE ENGINE, if one is due — the running note, made out of
 * one-shots on a cadence that quickens with the revs (see `sfx/drive.ts`).
 *
 * Scheduled on the DRIVE's clock rather than the wall's, so it keeps step with
 * the physics through a stutter and stops with the world when a line is up. A
 * dead engine says nothing at all: the wreck rolls in silence, which is most of
 * why the breakdown lands.
 */
export function runEngineNote(
  drive: DriveState,
  engine: EngineNoteState,
): void {
  if (drive.outcome === DRIVE_OUTCOME.broken) return;
  if (drive.ms < engine.dueMs) return;
  const frac = Math.abs(drive.car.speed) / DRIVE.topSpeedPx;
  const { gear, rev } = engineNote(frac);
  // THE SHIFT IS HEARD BEFORE THE NEXT GRAIN: the note the player follows is
  // the climb inside a gear, so the moment it resets has to be marked or the
  // pitch simply appears to jump backwards for no reason.
  if (gear > engine.gear) playDriveShift(synth, frac);
  engine.gear = gear;
  playDriveEngine(synth, frac, drive.car.wear);
  engine.dueMs = drive.ms + engineGrainMs(rev);
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
 * spoken at the far end, standing beside the car, as the last page of the
 * destination's opening monologue. See `src/game/items/flow.ts` `introPages`.
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
    bursts.push({
      // The burst's force is priced off the collision's own energy, so a body
      // taken at 120 comes apart harder than one clipped at 40 — the physics
      // reaches the picture rather than being re-decided here.
      //
      // WHAT IT IS NOW FOR IS THE INSTANT, and only that. The body's own PIECES
      // are the sim's (`DriveRemain`) and are drawn where the road is holding
      // them; this is the shower of what was inside, thrown at the point of
      // contact and gone in a second — which is the one part of a collision
      // that genuinely has no afterwards.
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
      driveTrafficHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(
        synth,
        trafficHitSound(event.pos.x, event.pos.y, event.joules),
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
    if (!say) continue;
    if (event.type === "monologue") say("drive_out_welfare", drive.ms);
    if (event.type === "breakdown") say("drive_broke_down", drive.ms);
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
