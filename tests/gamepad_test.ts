// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The controller reader's pure half: deadzone shaping, press edges, and the
// auto-repeat that turns a held direction into menu steps.
//
// These are the three places a gamepad implementation actually goes wrong — a
// square deadzone that makes a character drift, an unrescaled magnitude that
// makes a creep impossible, and a menu that scrolls sixty rows a second because
// the API only ever says "the button IS down". None of them need a browser to
// test, which is why the module keeps them pure.

import { describe, expect, it } from "vitest";

import {
  BUTTON,
  createStepRepeat,
  leftStick,
  pressedSince,
  repeatStep,
  stepDirection,
  STEP_REPEAT_DELAY_MS,
  STEP_REPEAT_INTERVAL_MS,
  STICK_DEADZONE,
  stickVector,
  wasPressed,
  type GamepadSnapshot,
} from "../pwa/src/lib/gamepad.ts";

/** Build a snapshot with the given axes/buttons; everything else at rest. */
function pad(
  options: {
    index?: number;
    axes?: number[];
    down?: number[];
  } = {},
): GamepadSnapshot {
  const buttons = new Array(17).fill(false);
  for (const index of options.down ?? []) buttons[index] = true;
  return {
    index: options.index ?? 0,
    id: "test pad",
    standard: true,
    buttons,
    axes: options.axes ?? [0, 0, 0, 0],
  };
}

describe("stickVector — deadzone shaping", () => {
  it("reports centred for a stick at rest", () => {
    expect(stickVector(0, 0).magnitude).toBe(0);
  });

  it("swallows the resting drift of a worn stick", () => {
    // A worn stick can idle around 0.15. Reading it raw walks the character
    // slowly in a random direction forever while nobody is touching it.
    expect(stickVector(0.15, 0.1).magnitude).toBe(0);
    expect(stickVector(-0.2, 0).magnitude).toBe(0);
  });

  it("uses a ROUND deadzone, not a square one", () => {
    // A per-axis deadzone carves a square hole, so a push of the same force
    // registers on a cardinal but not on a diagonal. Just inside the radius on
    // the diagonal must be dead even though each axis alone clears nothing.
    const justInside = STICK_DEADZONE * 0.7; // 0.7,0.7 → hypot ≈ 0.99 × dz
    expect(stickVector(justInside, justInside).magnitude).toBe(0);
    // …and just outside it must live.
    expect(stickVector(0.9, 0.9).magnitude).toBeGreaterThan(0);
  });

  it("rescales so the slowest usable push is a creep, not a lurch", () => {
    // Without rescaling, the smallest non-zero output would be the deadzone
    // itself — the character's slowest possible walk would be 25% speed and
    // the analogue control would be gone.
    const barely = stickVector(STICK_DEADZONE + 0.01, 0);
    expect(barely.magnitude).toBeGreaterThan(0);
    expect(barely.magnitude).toBeLessThan(0.05);
  });

  it("reaches exactly 1 at full deflection", () => {
    expect(stickVector(1, 0).magnitude).toBeCloseTo(1, 6);
    expect(stickVector(0, -1).magnitude).toBeCloseTo(1, 6);
  });

  it("never lets a diagonal outrun a cardinal", () => {
    // A pad can report a diagonal past the unit circle; unclamped, pushing
    // corner-ward would be faster than pushing straight.
    const diagonal = stickVector(1, 1);
    expect(diagonal.magnitude).toBeLessThanOrEqual(1.000001);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(1.000001);
  });

  it("preserves direction while shaping magnitude", () => {
    const v = stickVector(0.6, -0.8);
    // Same bearing as the raw input (3-4-5 triangle), shorter.
    expect(v.x / v.y).toBeCloseTo(0.6 / -0.8, 6);
  });

  it("ignores a pad reporting NaN rather than propagating it", () => {
    expect(stickVector(NaN, 0).magnitude).toBe(0);
    expect(stickVector(0, Infinity).magnitude).toBe(0);
  });

  it("reads the left stick out of a snapshot", () => {
    expect(leftStick(pad({ axes: [1, 0, 0, 0] })).magnitude).toBeCloseTo(1, 6);
    expect(leftStick(null).magnitude).toBe(0);
  });
});

describe("pressedSince — edges, not levels", () => {
  it("reports a button going down exactly once", () => {
    const up = pad();
    const down = pad({ down: [BUTTON.a] });
    expect(pressedSince(up, down)).toEqual([BUTTON.a]);
    // Still held on the next frame — not a new press.
    expect(pressedSince(down, down)).toEqual([]);
  });

  it("treats the first snapshot as a baseline, not as a press", () => {
    // Launching the game with A held must not fire a confirm.
    expect(pressedSince(null, pad({ down: [BUTTON.start] }))).toEqual([]);
    // …and the press still lands once there is something to compare against.
    const held = pad({ down: [BUTTON.start] });
    expect(pressedSince(pad(), held)).toEqual([BUTTON.start]);
  });

  it("does not fire a burst when the pad is swapped", () => {
    // A different pad index means the previous button list describes a
    // different device. Diffing across it would report every button already
    // held on the new pad as freshly pressed — a controller reconnecting
    // mid-fight with a trigger down would fire that trigger.
    const first = pad({ index: 0, down: [BUTTON.a, BUTTON.b] });
    const second = pad({ index: 1, down: [BUTTON.a, BUTTON.b] });
    expect(pressedSince(first, second)).toEqual([]);
    // The new pad's own subsequent presses register normally.
    expect(
      pressedSince(
        second,
        pad({ index: 1, down: [BUTTON.a, BUTTON.b, BUTTON.x] }),
      ),
    ).toEqual([BUTTON.x]);
  });

  it("reports nothing when the pad goes away", () => {
    expect(pressedSince(pad({ down: [BUTTON.a] }), null)).toEqual([]);
  });

  it("names a button by its label", () => {
    expect(wasPressed(pad(), pad({ down: [BUTTON.b] }), "b")).toBe(true);
    expect(wasPressed(pad(), pad({ down: [BUTTON.b] }), "a")).toBe(false);
  });
});

describe("stepDirection", () => {
  it("reads the d-pad", () => {
    expect(stepDirection(pad({ down: [BUTTON.dpadUp] }))).toBe("up");
    expect(stepDirection(pad({ down: [BUTTON.dpadRight] }))).toBe("right");
  });

  it("treats a firmly pushed stick as a direction", () => {
    // Screen coordinates: forward is negative Y.
    expect(stepDirection(pad({ axes: [0, -1, 0, 0] }))).toBe("up");
    expect(stepDirection(pad({ axes: [0, 1, 0, 0] }))).toBe("down");
  });

  it("ignores a stick that is only just off centre", () => {
    // Past the WALKING deadzone but well short of a deliberate menu flick —
    // otherwise resting a thumb on the stick scrolls the list.
    expect(stepDirection(pad({ axes: [0, -0.4, 0, 0] }))).toBeNull();
  });

  it("resolves a sloppy diagonal to one axis", () => {
    // Never two steps at once: a diagonal must not move a row AND a column.
    expect(stepDirection(pad({ axes: [0.9, -0.7, 0, 0] }))).toBe("right");
    expect(stepDirection(pad({ axes: [0.7, -0.9, 0, 0] }))).toBe("up");
  });
});

describe("repeatStep — keyboard-style auto-repeat", () => {
  it("steps once immediately, then holds", () => {
    const state = createStepRepeat();
    expect(repeatStep(state, "down", 0)).toBe("down");
    // The whole point: a held direction must not step every frame.
    expect(repeatStep(state, "down", 16)).toBeNull();
    expect(repeatStep(state, "down", 100)).toBeNull();
  });

  it("starts repeating after the delay, at the interval", () => {
    const state = createStepRepeat();
    repeatStep(state, "down", 0);
    expect(repeatStep(state, "down", STEP_REPEAT_DELAY_MS - 1)).toBeNull();
    expect(repeatStep(state, "down", STEP_REPEAT_DELAY_MS)).toBe("down");
    expect(repeatStep(state, "down", STEP_REPEAT_DELAY_MS + 1)).toBeNull();
    expect(
      repeatStep(state, "down", STEP_REPEAT_DELAY_MS + STEP_REPEAT_INTERVAL_MS),
    ).toBe("down");
  });

  it("steps immediately when the direction changes", () => {
    const state = createStepRepeat();
    repeatStep(state, "down", 0);
    expect(repeatStep(state, "up", 20)).toBe("up");
  });

  it("re-arms once the stick is released", () => {
    const state = createStepRepeat();
    expect(repeatStep(state, "down", 0)).toBe("down");
    expect(repeatStep(state, null, 10)).toBeNull();
    // A fresh push is a fresh immediate step, not a resumed repeat.
    expect(repeatStep(state, "down", 20)).toBe("down");
  });
});
