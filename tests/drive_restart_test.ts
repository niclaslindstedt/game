// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BREAKDOWN'S RESTART THROWS AWAY (drive-screen/end-drive.ts) — and in
// particular that the hero's VOICE is one of the things it throws.
//
// The bug this pins: the wreck's own line ("COME ON. NOT HERE. NOT TONIGHT.")
// was still sitting over the clean car at the top of the fresh leg. Two facts
// compound into it, and neither is a mistake on its own — the bark is written
// to be readable and outlives `breakdownHoldMs`, and `restartDrive` rewinds the
// drive clock the bark retires itself on — so the only place the two can be
// reconciled is the restart, which is where every other leftover (the bursts,
// the sparks, the blood, the skid marks) is already dropped.

import { describe, expect, it, vi } from "vitest";

import {
  cityStartPx,
  createDrive,
  DRIVE,
  DRIVE_OUTCOME,
  type DriveParams,
  type DriveState,
} from "@game/core";

import { endDrive } from "../pwa/src/game/drive-screen/end-drive.ts";
import { createDriveFx } from "../pwa/src/game/drive-screen/drive-fx.ts";
import { createDriveGore } from "../pwa/src/game/drive-screen/drive-gore.ts";
import { createSkids } from "../pwa/src/game/drive-screen/skid.ts";
import {
  createEngineNote,
  resetEngineNoteAfterRewind,
  type Burst,
} from "../pwa/src/game/drive-screen/loop.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  to: "goodco_hq",
  difficulty: "medium",
  gib: true,
  split: true,
};

/** A drive a long way into its leg, in whatever state the caller names. */
function drivenTo(outcome: DriveState["outcome"], outcomeMs: number) {
  const drive = createDrive(PARAMS);
  drive.ms = 41_000;
  drive.distance = 20_000;
  drive.outcome = outcome;
  drive.outcomeMs = outcomeMs;
  return drive;
}

/** The screen's four leftover piles, plus the two things `endDrive` calls. */
function host() {
  const bursts: Burst[] = [];
  return {
    bursts,
    fx: createDriveFx(),
    gore: createDriveGore(),
    skids: createSkids(),
    clearSpeech: vi.fn(),
    onArrived: vi.fn(),
  };
}

const run = (drive: DriveState, h: ReturnType<typeof host>) =>
  endDrive(drive, h.bursts, h.fx, h.gore, h.skids, h.clearSpeech, h.onArrived);

describe("the drive's terminal beats", () => {
  it("makes the engine grain immediately due on the fresh clock", () => {
    const engine = createEngineNote();
    engine.atMs = 42_000;
    engine.dueMs = 42_105;
    engine.gear = 4;
    engine.speedPx = 700;
    engine.tickMs = 9;

    resetEngineNoteAfterRewind(16, engine);

    expect(engine).toEqual(createEngineNote());
  });

  it("takes the hero's line away with the wreck it was about", () => {
    const drive = drivenTo(DRIVE_OUTCOME.broken, DRIVE.breakdownHoldMs + 1);
    const h = host();
    run(drive, h);

    expect(h.clearSpeech).toHaveBeenCalledTimes(1);
    // …and the leg really did start again underneath it — AT THE TOWN'S GATE,
    // which is where the scoring starts. The approach in front of it (the wagon
    // sliding into frame, the empty outskirts, the two lines over them) is an
    // opening the player has already watched, and replaying it after every
    // breakdown is a punishment on top of a punishment.
    expect(drive.outcome).toBe(DRIVE_OUTCOME.driving);
    expect(drive.distance).toBe(cityStartPx(PARAMS));
    expect(drive.clockMs).toBe(0);
    expect(h.onArrived).not.toHaveBeenCalled();
  });

  it("cannot leave the box to the clock, because the restart rewinds it", () => {
    const drive = drivenTo(DRIVE_OUTCOME.broken, DRIVE.breakdownHoldMs + 1);
    // The bark's contract (DriveScreen `ageSpeech`): it is retired when the
    // DRIVE's clock passes the page's `untilMs`. The breakdown's line is raised
    // as the engine dies, so its page is due somewhere past the wreck's hold.
    const dueAt = drive.ms + DRIVE.breakdownHoldMs;
    run(drive, host());

    // A rewound clock never reaches it — so nothing but the explicit clear
    // above can take that page off the fresh leg.
    expect(drive.ms).toBe(0);
    expect(drive.ms).toBeLessThan(dueAt);
  });

  it("leaves the line up while the wreck is still being read", () => {
    const drive = drivenTo(DRIVE_OUTCOME.broken, DRIVE.breakdownHoldMs - 1);
    const h = host();
    run(drive, h);

    expect(h.clearSpeech).not.toHaveBeenCalled();
    expect(drive.outcome).toBe(DRIVE_OUTCOME.broken);
    expect(drive.ms).toBe(41_000);
  });

  it("hands an arrival on without restarting anything", () => {
    const drive = drivenTo(DRIVE_OUTCOME.arrived, DRIVE.arrivalHoldMs + 1);
    const h = host();
    run(drive, h);

    expect(h.onArrived).toHaveBeenCalledTimes(1);
    expect(h.clearSpeech).not.toHaveBeenCalled();
    expect(drive.ms).toBe(41_000);
  });
});
