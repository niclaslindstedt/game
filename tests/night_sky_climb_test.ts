// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NIGHT SKY UNDER A CLIMBING CAMERA — that a cloud band keeps producing
// cloud however far the camera rises, and that a camera standing still gets
// exactly the sky it always did.
//
// Both halves are load-bearing and neither is visible from the code. A band is
// hung as a fixed number of rows inside its own slice of sky; pushed down by a
// climb, those rows fall out of the frame and — before this — nothing replaced
// them, so the launch cutscene's ascent ran its own sky out from under the
// rocket while the closing caption waited for a tap. And the fix must not
// reach the ROAD, which never leaves the ground: the drive's sky is a tuned
// picture, and one more row of cloud in it is a regression nothing else would
// catch.

import { describe, expect, it } from "vitest";

import { drawNightSky } from "../pwa/src/game/render/night-sky.ts";
import type { Sprites } from "../pwa/src/game/assets.ts";

/** How tall the picture the sky is painted into is (canvas px). */
const FRAME_H = 200;
const FRAME_W = 400;
/** Where the ground line sits before any climb. */
const HORIZON = 150;

/** Every cloud the sky can ask for, as a stand-in of the real art's size. */
const CLOUDS = ["night_cloud_wisp", "night_cloud_puff", "night_cloud_bank"];

function sprites(): Sprites {
  const art = Object.fromEntries(
    CLOUDS.map((name) => [name, { width: 40, height: 9 }]),
  );
  return art as unknown as Sprites;
}

/** A canvas that records the y of every sprite blitted into it. */
function skyRecorder(): {
  ctx: CanvasRenderingContext2D;
  ys: number[];
} {
  const ys: number[] = [];
  const ctx = {
    canvas: { width: FRAME_W, height: FRAME_H },
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    clip() {},
    beginPath() {},
    closePath() {},
    rect() {},
    ellipse() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    strokeRect() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    fillRect() {},
    clearRect() {},
    drawImage(_img: unknown, _x: number, y: number) {
      ys.push(y);
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ys };
}

/** Paint one night and hand back the y of every cloud in it. `cameraY` is how
 * far the camera has climbed; the ground line rides the whole of it. */
function clouds(cameraY: number, deck = false): number[] {
  const { ctx, ys } = skyRecorder();
  drawNightSky(ctx, sprites(), 0, FRAME_W, HORIZON + cameraY, 0, {
    twinkle: false,
    cameraY,
    deck,
  });
  // The moon is blitted too, at the top of a translated context — the clouds
  // are everything drawn at a y the frame can actually hold.
  return ys.filter((y) => y > -40 && y < FRAME_H + 40);
}

/** …and how many of them are actually inside the picture. */
function onScreen(ys: number[]): number {
  return ys.filter((y) => y > -24 && y < FRAME_H).length;
}

describe("the night sky under a climbing camera", () => {
  it("keeps a band populated however long the climb is held", () => {
    const still = onScreen(clouds(0));
    expect(still).toBeGreaterThan(0);
    // Three minutes of the launch's closing drift (22 px/s) is 4000 px of
    // climb — far past the point a fixed set of rows has left the frame.
    for (const rise of [200, 600, 1500, 4000]) {
      expect(onScreen(clouds(rise)), `${rise} px up`).toBeGreaterThanOrEqual(
        Math.round(still / 2),
      );
    }
  });

  it("draws the same sky it always did while the camera is on the ground", () => {
    // The road's own case: no climb, and the bands hang in exactly the rows
    // they were composed in — nothing above them and nothing below.
    const ys = clouds(0).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(HORIZON);
  });

  it("hangs the near deck only for a caller that asks for it", () => {
    expect(clouds(0, true).length).toBeGreaterThan(clouds(0, false).length);
  });

  it("hangs the near deck LOW, where the open country covers it", () => {
    // The deck's whole excuse for existing is a camera that leaves the
    // ground: hung high it would be cloud the road pays for and never sees.
    // What it adds on a still night sits below the middle of the sky, which
    // is where the three ridges are already standing in front of it.
    const plain = clouds(0, false);
    const withDeck = clouds(0, true);
    const added = withDeck.filter((y) => !plain.includes(y));
    expect(added.length).toBeGreaterThan(0);
    expect(Math.min(...added)).toBeGreaterThan(HORIZON / 2);
  });
});
