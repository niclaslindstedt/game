// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD'S ANIMATIONS, at the point they are actually drawn.
//
// The compiler's half is `tests/content/mod_build_test.ts`; this is the
// renderer's. Four claims, and every one of them is a way replaced art can end
// up looking WORSE than the two frames it replaced:
//
//   * **No clip means no change.** The shipped game declares none, so every
//     lookup must answer `undefined` and every call site must fall through to
//     the convention it has always used. A table that answered anything else
//     would change the look of a game nobody modded.
//   * **A walk is driven by the ground covered.** Six frames must speed up,
//     slow and STOP with the body — a walk cycle on a timer moonwalks the
//     instant its owner is slowed, blocked or standing still.
//   * **Every body keeps its own phase.** The two-frame shimmer always offset
//     itself by the mob's id; a clip that dropped that would animate a horde of
//     forty as one organism.
//   * **A run's clips end with the run.** A mod is applied to a RUN, never to
//     an install, so clips left behind would point at sprites that have just
//     been deleted.

import { beforeEach, describe, expect, it } from "vitest";

import {
  actorFrame,
  clearSpriteClips,
  clipFrame,
  clipFrameName,
  setSpriteClips,
  spriteClip,
  type SpriteClip,
} from "../pwa/src/game/render/clips.ts";

/** A six-frame walk, as the compiler would emit one. */
const WALK: SpriteClip = {
  frames: ["w0", "w1", "w2", "w3", "w4", "w5"],
  delayMs: 160,
  drive: "stride",
};

/** A talking mouth — the state the two-frame convention has no name for. */
const TALK: SpriteClip = {
  frames: ["t0", "t1", "t2"],
  delayMs: 100,
  drive: "clock",
};

beforeEach(() => {
  clearSpriteClips();
});

describe("the shipped game", () => {
  it("declares no clips, so every call site keeps its own fallback", () => {
    expect(spriteClip("ghost", "idle")).toBeUndefined();
    expect(clipFrameName("ghost", "walk", { timeMs: 1234 })).toBeUndefined();
    expect(actorFrame("merchant", true, { timeMs: 0 })).toBeUndefined();
  });
});

describe("a clip's frame", () => {
  it("advances a walk with the ground covered, not with the clock", () => {
    // The stride phase is 0..1 through one left-right cycle. Six frames means
    // six even slices of it — and the clock is held still across all of them to
    // prove it is not what is being read.
    const at = (stride: number) => clipFrame(WALK, { timeMs: 7777, stride });
    expect(at(0)).toBe("w0");
    expect(at(0.2)).toBe("w1");
    expect(at(0.5)).toBe("w3");
    expect(at(0.99)).toBe("w5");
  });

  it("holds a walking body's frame while it stands still", () => {
    // The gait's phase stops advancing when the body stops covering ground, so
    // the frame stops with it. This is the whole reason a walk is not on a
    // timer: a mob halted against a wall must not keep striding on the spot.
    const still = { timeMs: 0, stride: 0.4 };
    const later = { timeMs: 9_000, stride: 0.4 };
    expect(clipFrame(WALK, still)).toBe(clipFrame(WALK, later));
  });

  it("falls back to the clock for a body that tracks no stride", () => {
    // A floater, a rover, anything the renderer keeps no gait for. Freezing on
    // frame 0 would be the alternative, and it would look broken.
    expect(clipFrame(WALK, { timeMs: 0 })).toBe("w0");
    expect(clipFrame(WALK, { timeMs: 160 })).toBe("w1");
    expect(clipFrame(WALK, { timeMs: 800 })).toBe("w5");
  });

  it("advances a clock-driven clip one frame per delayMs", () => {
    expect(clipFrame(TALK, { timeMs: 0 })).toBe("t0");
    expect(clipFrame(TALK, { timeMs: 99 })).toBe("t0");
    expect(clipFrame(TALK, { timeMs: 100 })).toBe("t1");
    expect(clipFrame(TALK, { timeMs: 250 })).toBe("t2");
    expect(clipFrame(TALK, { timeMs: 300 })).toBe("t0");
  });

  it("offsets each body by its own phase, so a horde is not one organism", () => {
    const shown = new Set(
      [0, 1, 2, 3, 4].map((id) => clipFrame(TALK, { timeMs: 0, phase: id })),
    );
    expect(shown).toEqual(new Set(["t0", "t1", "t2"]));
  });

  it("holds a one-frame clip still, whatever the clock says", () => {
    // A clip of one is a POSE — a body that holds an expression while it talks
    // — and it must not be divided by anything.
    const pose: SpriteClip = { frames: ["p"], delayMs: 100, drive: "clock" };
    expect(clipFrame(pose, { timeMs: 0 })).toBe("p");
    expect(clipFrame(pose, { timeMs: 99_999, phase: 7 })).toBe("p");
  });
});

describe("a mod's table", () => {
  beforeEach(() => {
    setSpriteClips({ ghoul: { walk: WALK, talk: TALK } });
  });

  it("answers for the states it declared and no others", () => {
    expect(spriteClip("ghoul", "walk")).toBe(WALK);
    expect(spriteClip("ghoul", "talk")).toBe(TALK);
    // Undeclared, so the renderer keeps the two-frame shimmer it always had —
    // a mod animating a walk does not have to redraw an idle.
    expect(spriteClip("ghoul", "idle")).toBeUndefined();
    expect(spriteClip("ghost", "walk")).toBeUndefined();
  });

  it("picks walk or idle off the engine's own moving flag", () => {
    expect(actorFrame("ghoul", true, { timeMs: 0, stride: 0.5 })).toBe("w3");
    // Standing: no idle clip declared, so this is the fallback's problem again.
    expect(actorFrame("ghoul", false, { timeMs: 0 })).toBeUndefined();
  });

  it("is replaced wholesale, never merged onto the last run's", () => {
    setSpriteClips({ ghost: { idle: TALK } });
    expect(spriteClip("ghoul", "walk")).toBeUndefined();
    expect(spriteClip("ghost", "idle")).toBe(TALK);
  });

  it("is cleared when the run ends, with the sprites it named", () => {
    clearSpriteClips();
    expect(spriteClip("ghoul", "walk")).toBeUndefined();
  });
});
