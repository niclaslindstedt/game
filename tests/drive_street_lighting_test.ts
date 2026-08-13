// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S STREET LIGHTING — that a standing mast throws its CONE, and that
// nothing about the presentation mode decides whether it does.
//
// The lighting is the one thing on this road the player never asks for and
// always misses: the cone is what makes a night stretch read as a lit street
// rather than as a dark strip with posts along it. It went out once, because a
// mode that withheld the sprites a collision made short-circuited the whole
// mast draw on its way past — the post was still blitted, the pool was still on
// the tarmac, and only the beam between them was gone. Nothing failed; the
// street simply stopped being lit, in one mode, for anybody who had that mode
// on.
//
// So this asserts the beam through the RENDERER rather than restating its
// geometry: a recording context counts the apex the cone is drawn from
// (`moveTo(±2, -ROAD_LAMP_HEAD_PX)`, the lens), which no other path on this
// road draws.

import { describe, expect, it } from "vitest";

import { createDrive, DRIVE, isMastSlot, roadBandEdges } from "@game/core";
import type { DriveState } from "@game/core";

import { drawDrive } from "../pwa/src/game/drive-screen/render.ts";
import { ROAD_LAMP_HEAD_PX } from "../pwa/src/game/drive-screen/scenery.ts";
import type { Sprites } from "../pwa/src/game/assets.ts";

/**
 * A canvas that records nothing but the lamp beams.
 *
 * Every other pass on this road wants a sprite, a gradient or a fill, and none
 * of them is what is being asserted — so they are all accepted and dropped. The
 * beam is picked out by the ONE coordinate only it uses: the two px either side
 * of the lens, a mast's head up.
 */
function beamCounter(): {
  ctx: CanvasRenderingContext2D;
  apexes: () => number;
} {
  let apexes = 0;
  const ctx = {
    canvas: { width: 800, height: 400 },
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    transform() {},
    setTransform() {},
    resetTransform() {},
    clip() {},
    beginPath() {},
    closePath() {},
    rect() {},
    arc() {},
    ellipse() {},
    moveTo(x: number, y: number) {
      if (Math.abs(x) === 2 && y === -ROAD_LAMP_HEAD_PX) apexes += 1;
    },
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    fillText() {},
    strokeText() {},
    measureText: () => ({ width: 0 }),
    drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: false,
    shadowBlur: 0,
    shadowColor: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, apexes: () => apexes };
}

/** A leg with nothing on the kerb but ONE facing pair of masts, planted on a
 * real mast slot beside the car — the picture a lit town stretch is made of. */
function litPair(): DriveState {
  const drive = createDrive({
    seed: 11,
    direction: 1,
    difficulty: "medium",
    to: "goodco_hq",
    gib: false,
    split: false,
  });
  const { pitchPx, kerbOffsetPx } = DRIVE.street;
  let slot = Math.round(drive.car.pos.x / pitchPx) + 1;
  while (!isMastSlot(slot)) slot += 1;
  const band = roadBandEdges();
  for (const y of [band.top - kerbOffsetPx, band.bottom + kerbOffsetPx]) {
    drive.props.push({
      id: drive.nextId++,
      kind: "lamp_post",
      pos: { x: slot * pitchPx, y },
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
  }
  return drive;
}

/** Paint one frame of `drive` and count the cones it threw. */
function conesThrown(drive: DriveState, fairy: boolean): number {
  const { ctx, apexes } = beamCounter();
  drawDrive(
    ctx,
    drive,
    { x: drive.car.pos.x, y: 0 },
    {} as Sprites,
    440,
    260,
    0,
    undefined,
    undefined,
    undefined,
    fairy,
  );
  return apexes();
}

describe("the road's street lighting", () => {
  it("throws a cone from every standing mast", () => {
    expect(conesThrown(litPair(), false)).toBe(2);
  });

  it("throws the same cones in SFW mode — the lighting is not a gore setting", () => {
    expect(conesThrown(litPair(), true)).toBe(conesThrown(litPair(), false));
  });

  it("puts a felled or a blown-out post's light out", () => {
    const felled = litPair();
    felled.props[felled.props.length - 1]!.felled = true;
    expect(conesThrown(felled, false)).toBe(1);

    const dark = litPair();
    for (const prop of dark.props) prop.dark = true;
    expect(conesThrown(dark, false)).toBe(0);
  });
});
