// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SETTINGS → VISUALS (pwa/src/game/render/postfx.ts): the four knobs of how the
// field is presented, and the two rules that would break silently rather than
// loudly.
//
// OFF HAS TO COST NOTHING. Every one of these is a per-frame cost on a phone, so
// a knob at 0 must not merely draw nothing — it must not put the canvas on a
// compositing layer or leave an overlay for the compositor to blend. A no-op
// filter chain looks identical and costs real memory, which is exactly the kind
// of regression no screenshot would catch.
//
// AND THE HAZE MUST ANSWER TO THE CAMERA. It is aerial perspective — the floor
// fading as it rakes away — so a camera looking straight down has no horizon to
// fade toward. Left unscaled it would fog the top of a top-down screen for no
// reason at all.

import { describe, expect, it } from "vitest";

import {
  BLOOM,
  clampFx,
  defaultFx,
  FX_RANGES,
  fxStyleVars,
  HAZE,
  VIGNETTE,
  type FxName,
} from "../pwa/src/game/render/postfx.ts";

const NAMES = Object.keys(FX_RANGES) as FxName[];

describe("the visuals knobs", () => {
  it("ships every knob inside its own range", () => {
    const fx = defaultFx();
    for (const name of NAMES) {
      const range = FX_RANGES[name];
      expect(fx[name]).toBeGreaterThanOrEqual(range.min);
      expect(fx[name]).toBeLessThanOrEqual(range.max);
      expect(fx[name]).toBe(range.default);
    }
  });

  it("lets every knob reach a true OFF", () => {
    // A knob whose floor is above zero is a feature a player cannot decline —
    // and on a phone that is a frame budget they cannot get back.
    for (const name of NAMES) {
      expect(FX_RANGES[name].min).toBe(0);
      expect(clampFx(name, -5)).toBe(0);
    }
  });

  it("clamps out of range rather than refusing, and repairs a NaN", () => {
    expect(clampFx("bloom", 99)).toBe(BLOOM.max);
    expect(clampFx("vignette", -1)).toBe(VIGNETTE.min);
    // A corrupted stored value must not travel into a `filter` string, where it
    // would silently void the whole declaration.
    expect(clampFx("bloom", Number.NaN)).toBe(BLOOM.default);
  });
});

describe("the CSS half", () => {
  const pitch = 0.75; // the shipped camera

  it("emits a real filter at the shipped grade", () => {
    const vars = fxStyleVars(defaultFx(), pitch);
    expect(vars["--fx-grade"]).toMatch(/saturate\(.+\) contrast\(.+\)/);
  });

  it("emits `none` — not an identity chain — with the grade off", () => {
    // An identity `filter` still promotes the canvas to its own compositing
    // layer, which is real memory on a phone for a picture that would look
    // exactly the same without it.
    const vars = fxStyleVars({ ...defaultFx(), colorGrade: 0 }, pitch);
    expect(vars["--fx-grade"]).toBe("none");
  });

  it("fades the haze out as the camera stands up", () => {
    // Straight down (pitch 1) there is no horizon, so there is nothing to fade
    // toward and the haze must be gone entirely.
    const fx = { ...defaultFx(), depthHaze: HAZE.max };
    expect(Number(fxStyleVars(fx, 1)["--fx-haze"])).toBe(0);
    // …and it comes in as the floor rakes away.
    const shipped = Number(fxStyleVars(fx, 0.75)["--fx-haze"]);
    const raked = Number(fxStyleVars(fx, 0.5)["--fx-haze"]);
    expect(shipped).toBeGreaterThan(0);
    expect(raked).toBeGreaterThan(shipped);
    expect(raked).toBeLessThanOrEqual(HAZE.max);
  });

  it("keeps the haze at zero when its own knob is off, at any pitch", () => {
    const fx = { ...defaultFx(), depthHaze: 0 };
    for (const p of [1, 0.75, 0.5, 0.25]) {
      expect(Number(fxStyleVars(fx, p)["--fx-haze"])).toBe(0);
    }
  });

  it("passes the vignette through as a plain number CSS can multiply", () => {
    // The stylesheet does `calc(var(--fx-vignette) * 0.55)`, so a unit or a
    // suffix here would void the whole gradient rather than degrade it.
    const vars = fxStyleVars({ ...defaultFx(), vignette: 0.5 }, pitch);
    expect(Number(vars["--fx-vignette"])).toBeCloseTo(0.5, 6);
    expect(vars["--fx-vignette"]).toMatch(/^[0-9.]+$/);
  });
});
