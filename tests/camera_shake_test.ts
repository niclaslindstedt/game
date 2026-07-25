// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The transient camera KICK (pwa/src/game/render/view.ts): the jolt a lightning
// strike or a nuke throws through the view. Its decay is gated on the SIM
// clock, which is exactly what makes it need a kill switch — the sim clock
// FREEZES the moment the run leaves `playing`, so a jolt still in flight when
// the hero falls would park at a fixed amplitude and rattle the eight-second
// death tableau forever. What matters here: a kick decays to nothing on a
// running clock, a stopped clock does hold it (the bug), and
// `clearCameraShake` puts the camera back to dead still.

import { describe, expect, it } from "vitest";

import {
  applyCameraShake,
  clearCameraShake,
  createCameraShake,
  kickCameraShake,
} from "../pwa/src/game/render/view.ts";

/** The largest offset the shake throws the camera over a spread of render
 * clocks — the honest read of "is the view still rattling at `simMs`". */
function throwAt(
  shake: ReturnType<typeof createCameraShake>,
  simMs: number,
): number {
  let worst = 0;
  for (let timeMs = 0; timeMs < 400; timeMs += 3) {
    const camera = { x: 100, y: 100 };
    applyCameraShake(camera, shake, simMs, timeMs);
    worst = Math.max(worst, Math.abs(camera.x - 100), Math.abs(camera.y - 100));
  }
  return worst;
}

describe("camera shake", () => {
  it("rests still until something kicks it", () => {
    expect(throwAt(createCameraShake(), 1000)).toBe(0);
  });

  it("decays to nothing over its own duration", () => {
    const shake = createCameraShake();
    kickCameraShake(shake, 1000, 8, 500);
    expect(throwAt(shake, 1000)).toBeGreaterThan(0);
    expect(throwAt(shake, 1250)).toBeLessThan(throwAt(shake, 1000));
    expect(throwAt(shake, 1500)).toBe(0);
  });

  it("hangs at a fixed amplitude while the sim clock is stopped", () => {
    // Not a wish — a statement of the hazard `clearCameraShake` exists for. The
    // death scene freezes `stats.timeMs`, so a shake mid-decay when the hero
    // falls keeps throwing the same offset for every frame of the tableau.
    const shake = createCameraShake();
    kickCameraShake(shake, 1000, 8, 500);
    const frozenAt = 1200;
    expect(throwAt(shake, frozenAt)).toBeGreaterThan(0);
    expect(throwAt(shake, frozenAt)).toBe(throwAt(shake, frozenAt));
  });

  it("goes dead still when cleared, whatever the clock does next", () => {
    const shake = createCameraShake();
    kickCameraShake(shake, 1000, 8, 500);
    clearCameraShake(shake);
    // The frozen clock the death scene pins the sim at…
    expect(throwAt(shake, 1200)).toBe(0);
    // …and every other reading of it, including the instant of the kick.
    expect(throwAt(shake, 1000)).toBe(0);
    expect(throwAt(shake, 9999)).toBe(0);
  });

  it("takes a fresh kick after being cleared", () => {
    // Clearing must not latch the camera off — the next run's nuke still lands.
    const shake = createCameraShake();
    kickCameraShake(shake, 1000, 8, 500);
    clearCameraShake(shake);
    kickCameraShake(shake, 2000, 3.5, 380);
    expect(throwAt(shake, 2000)).toBeGreaterThan(0);
  });
});
