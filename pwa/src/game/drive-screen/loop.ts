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

import {
  DRIVE,
  DRIVE_OUTCOME,
  driveRideQuality,
  type DriveState,
} from "@game/core";

import { type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { goreBurst, type GoreBurst } from "../game-screen/gore-burst.ts";
import { drawGore } from "../render/gibs.ts";
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
  drivePartHit,
  driveTrafficHit,
  type DriveFxState,
} from "./drive-fx.ts";
import {
  bodyHitSound,
  BREAKDOWN_SOUND,
  panelSound,
  SHED_SOUND,
  trafficHitSound,
} from "./drive-sounds.ts";
import { CROWD_SPRITES } from "./scenery.ts";

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
 * stop being a loop.
 */
export function drainDrive(
  drive: DriveState,
  bursts: Burst[],
  fx: DriveFxState,
  say?: (id: string) => void,
): void {
  for (const strike of drive.strikes) {
    const frames = CROWD_SPRITES[strike.variant % CROWD_SPRITES.length];
    bursts.push({
      // The burst's force is priced off the collision's own energy, so a body
      // taken at 120 comes apart harder than one clipped at 40 — the physics
      // reaches the picture rather than being re-decided here.
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
      sprite: frames?.[0] ?? "stampede_a_0",
    });
  }
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
    if (event.type === "trafficHit") {
      driveTrafficHit(fx, event.pos.x, event.pos.y, event.joules, drive.ms);
      playDriveSound(
        synth,
        trafficHitSound(event.pos.x, event.pos.y, event.joules),
      );
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
    if (event.type === "monologue") say("drive_out_welfare");
    if (event.type === "breakdown") say("drive_broke_down");
    if (event.type === "arrived") {
      const quality = driveRideQuality(drive);
      say(
        quality === "clean"
          ? "drive_arrive_clean"
          : quality === "some"
            ? "drive_arrive_some"
            : "drive_arrive_bumpy",
      );
    }
  }
}

/**
 * The bodies coming apart, over the finished picture — the same pass the run
 * uses, handed a synthetic effect because a drive has no effect layer.
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
      Math.round(b.x - camera.x),
      Math.round(b.y - camera.y),
      nowMs,
      sprites,
    );
  }
  return live;
}
