// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLOUD'S GLOW MUST NOT MINT A CANVAS PER FRAME.
//
// `glowCache` is a module-level Map that `ensureCaches` empties only when the
// sprite atlas INSTANCE changes — i.e. never, inside a session. So the size a
// glow is cached under has to come from a bounded set, and a caller whose glow
// PULSES has to scale one bake rather than ask for a new radius each frame.
//
// The cloud did neither: `cloudPuffRadius` grows with the puff's own animation
// clock, and it was handed straight to `glowSprite`. Every puff of every landed
// blow baked a fresh radial gradient EVERY FRAME and kept it for the life of the
// tab. What that looked like from the outside was not a blood bug at all — the
// tab crossed 280 MB, the browser started discarding canvas backing stores, and
// since the pixel font draws from a cached canvas, every label in the game went
// blank (a level-up box with five unlabelled buttons and no header) while the
// sprites beside them, which are data-URL <img>s, kept drawing perfectly.
//
// The draw itself is a canvas pass and is not tested here. What is pinned is the
// arithmetic underneath it: that a puff's radius really is a per-frame value
// (hence must never be a cache key), and that `glowSize` collapses any sweep of
// radii into a small bounded set of keys whatever a caller does.

import { describe, expect, it } from "vitest";

import { bloodBlow } from "../pwa/src/game/game-screen/blood-hit.ts";
import { cloudPuffRadius } from "../pwa/src/game/render/blood.ts";
import { glowSize } from "../pwa/src/game/render/caches.ts";
import { updateSettings } from "../pwa/src/game/settings.ts";
import { ALL_GORE_ON } from "./gore-settings.ts";

const MINION_HP = 100;

/** A blow taking `bars` of a minion's own health. */
function blow(bars: number) {
  updateSettings({ ...ALL_GORE_ON, blood: 1 });
  return bloodBlow(MINION_HP * bars, MINION_HP, "minion", true)!;
}

describe("glowSize", () => {
  it("keys on the canvas it will actually bake, not the radius asked for", () => {
    // 11.01 and 11.4 bake pixel-identical 23 px canvases. Keyed on the float
    // they were two entries; keyed on the size they are one.
    expect(glowSize(11.01)).toBe(glowSize(11.4));
    expect(glowSize(11.01)).toBe(23);
  });

  it("collapses a continuous sweep into a handful of keys", () => {
    const radii: number[] = [];
    for (let r = 10; r < 12; r += 0.001) radii.push(r);
    expect(radii.length).toBeGreaterThan(1000);
    // Four integer sizes across that span, however finely it is sampled.
    expect(new Set(radii.map(glowSize)).size).toBeLessThanOrEqual(5);
  });

  it("caps the bake, because a blow's FORCE has no ceiling", () => {
    // `bloodBlow` deliberately lets force climb for ever, so an overkill would
    // otherwise ask for a glow wider than the viewport and pay half a megabyte
    // to draw it offscreen.
    expect(glowSize(1e6)).toBe(256);
    expect(glowSize(Number.POSITIVE_INFINITY)).toBe(2);
    expect(glowSize(Number.NaN)).toBe(2);
    expect(glowSize(-5)).toBe(2);
  });
});

describe("the cloud's puffs", () => {
  it("swell over their life — which is why the radius is not a cache key", () => {
    const heavy = blow(1.5);
    const young = cloudPuffRadius(heavy, 0.1, 7);
    const old = cloudPuffRadius(heavy, 0.9, 7);
    expect(old).toBeGreaterThan(young);
  });

  it("grows with the blow", () => {
    const nick = cloudPuffRadius(blow(0.05), 0.5, 7);
    const heavy = cloudPuffRadius(blow(2), 0.5, 7);
    expect(heavy).toBeGreaterThan(nick);
  });

  it("asks for a BOUNDED set of glow sizes across a whole cloud's life", () => {
    // The regression, stated as the thing that actually broke: walk every puff
    // of a monstrous blow across every frame of its life and collect the sizes.
    // Unbounded keying made this set grow with the frame count; `glowSize`
    // bounds it no matter what the call site does.
    const monstrous = blow(40);
    const sizes = new Set<number>();
    const radii = new Set<number>();
    for (let puff = 0; puff < 18; puff++) {
      for (let frame = 0; frame <= 60; frame++) {
        const r = cloudPuffRadius(monstrous, frame / 60, puff + 3.5);
        radii.add(r);
        sizes.add(glowSize(r));
      }
    }
    // The raw radii really are all distinct — that is the hazard.
    expect(radii.size).toBeGreaterThan(1000);
    expect(sizes.size).toBeLessThanOrEqual(256);
  });
});
