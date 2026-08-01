// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WORLD PROJECTION (pwa/src/game/render/tilt.ts): the camera looks at the
// ground at an angle — and, with the yaw knob up, from a corner — so the floor
// foreshortens and turns while the bodies standing on it do neither.
//
// Three things here are load-bearing and would break silently rather than
// loudly. The projection has to be exactly invertible (the pointer runs it
// backwards to find what the player is pointing at, so a hero who walks a few
// degrees off the line asked for is the symptom). A billboard has to compose
// with it to the identity at a whole-pixel offset (anything else resamples
// every sprite in the game into mush, which no assertion elsewhere would
// notice). And turning the camera must not change how much world is on screen,
// or the yaw slider would be a difficulty slider wearing a disguise.

import { afterEach, describe, expect, it } from "vitest";

import { fogGridAnchor } from "../pwa/src/game/render/fog.ts";
import { drawFloorDecal } from "../pwa/src/game/render/plane.ts";
import {
  beginBillboard,
  cameraAnchorX,
  cameraAnchorY,
  canvasToWorld,
  DEFAULT_PITCH,
  DEFAULT_YAW,
  PITCH_RANGE,
  projectX,
  projectY,
  screenDirToWorld,
  setWorldProjection,
  unprojectX,
  unprojectY,
  worldPitch,
  worldToCanvas,
  worldViewRect,
  worldYaw,
  YAW_RANGE,
} from "../pwa/src/game/render/tilt.ts";
import { computeCamera } from "../pwa/src/game/render/view.ts";
import { startGame } from "./engine/helpers.ts";

/** The projection is module state, so every test puts it back. */
afterEach(() => {
  setWorldProjection({ pitch: DEFAULT_PITCH, yaw: DEFAULT_YAW });
});

/**
 * A canvas-context stand-in that only tracks what the transform would be —
 * enough to prove what a billboard composes to, with no DOM anywhere near it.
 * Seeded with the world projection exactly as `drawFrame` applies it.
 */
function transformProbe() {
  // The live 2×3 matrix, as [a, b, c, d, e, f] — screen = (a·x + c·y + e,
  // b·x + d·y + f).
  let m = [
    projectX(1, 0),
    projectY(1, 0),
    projectX(0, 1),
    projectY(0, 1),
    0,
    0,
  ];
  const stack: number[][] = [];
  return {
    save() {
      stack.push([...m]);
    },
    restore() {
      const prev = stack.pop();
      if (prev) m = prev;
    },
    translate(x: number, y: number) {
      m = [
        m[0]!,
        m[1]!,
        m[2]!,
        m[3]!,
        m[4]! + m[0]! * x + m[2]! * y,
        m[5]! + m[1]! * x + m[3]! * y,
      ];
    },
    transform(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) {
      m = [
        m[0]! * a + m[2]! * b,
        m[1]! * a + m[3]! * b,
        m[0]! * c + m[2]! * d,
        m[1]! * c + m[3]! * d,
        m[4]! + m[0]! * e + m[2]! * f,
        m[5]! + m[1]! * e + m[3]! * f,
      ];
    },
    /** Where a local point lands on screen under the current transform. */
    at(x: number, y: number) {
      return {
        x: m[0]! * x + m[2]! * y + m[4]!,
        y: m[1]! * x + m[3]! * y + m[5]!,
      };
    },
    get matrix() {
      return m;
    },
  };
}

/** Every projection the knobs can reach that is worth asserting about. */
const PROJECTIONS = [
  { pitch: 1, yaw: 0, name: "straight down (no projection at all)" },
  { pitch: DEFAULT_PITCH, yaw: DEFAULT_YAW, name: "the shipped camera" },
  { pitch: 0.5, yaw: 45, name: "full 2:1 isometric" },
  { pitch: 0.4, yaw: 22, name: "somewhere in between" },
];

describe("the world projection", () => {
  it("clamps a knob to its range rather than refusing it", () => {
    setWorldProjection({ pitch: 99, yaw: -30 });
    expect(worldPitch()).toBe(PITCH_RANGE.max);
    expect(worldYaw()).toBe(YAW_RANGE.min);
    setWorldProjection({ pitch: 0, yaw: 999 });
    expect(worldPitch()).toBe(PITCH_RANGE.min);
    expect(worldYaw()).toBe(YAW_RANGE.max);
  });

  it("leaves the picture untouched at pitch 1, yaw 0", () => {
    // The knobs must have an off position that is EXACTLY the old top-down
    // renderer, or there is no way to tell a projection bug from a drawing one.
    setWorldProjection({ pitch: 1, yaw: 0 });
    expect(projectX(13, -7)).toBeCloseTo(13, 12);
    expect(projectY(13, -7)).toBeCloseTo(-7, 12);
    const rect = worldViewRect(844, 390);
    expect(rect).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  });

  it.each(PROJECTIONS)("projects and un-projects exactly — $name", (p) => {
    setWorldProjection(p);
    for (const [x, y] of [
      [0, 0],
      [37, 12],
      [-120.5, 44.25],
      [1234.75, -998.5],
    ] as const) {
      expect(unprojectX(projectX(x, y), projectY(x, y))).toBeCloseTo(x, 8);
      expect(unprojectY(projectX(x, y), projectY(x, y))).toBeCloseTo(y, 8);
    }
  });

  it.each(PROJECTIONS)("round-trips a canvas point — $name", (p) => {
    setWorldProjection(p);
    const camera = { x: 400, y: 250 };
    for (const [cx, cy] of [
      [0, 0],
      [844, 390],
      [211, 97],
    ] as const) {
      const world = canvasToWorld(cx, cy, camera);
      const back = worldToCanvas(world.x, world.y, camera);
      expect(back.x).toBeCloseTo(cx, 8);
      expect(back.y).toBeCloseTo(cy, 8);
    }
  });

  it("shows the same amount of world however far the camera is turned", () => {
    // The yaw changes the SHAPE of the visible region, never its area — which
    // is what lets the look be dialled without quietly handing the player more
    // map to see, the balance rule the zoom tiers exist to hold (view.ts).
    const area = (pitch: number, yaw: number) => {
      setWorldProjection({ pitch, yaw });
      // The parallelogram the screen covers in world units: |det(M⁻¹)| × area.
      const ux = { x: unprojectX(1, 0), y: unprojectY(1, 0) };
      const uy = { x: unprojectX(0, 1), y: unprojectY(0, 1) };
      return Math.abs(ux.x * uy.y - ux.y * uy.x) * 844 * 390;
    };
    const square = area(0.6, 0);
    for (const yaw of [10, 22, 45]) {
      expect(area(0.6, yaw)).toBeCloseTo(square, 6);
    }
  });
});

describe("a push on the screen, as a direction on the floor", () => {
  // The controls that STEER rather than point — the touch dpad, the stick, the
  // WASD cluster — all state their intent in screen terms. Handing the raw
  // screen vector to the simulation is the bug the pointer would have had
  // without the inverse: under a yaw, "down" is south AND west, so the hero
  // walks off at an angle to the way the player pushed.
  it("leaves the four cardinals alone with the camera square-on", () => {
    setWorldProjection({ pitch: DEFAULT_PITCH, yaw: 0 });
    // Pitch alone only foreshortens, so a push down the screen is still due
    // south — and it must stay EXACTLY south, or every phone in the world gets
    // a steering change out of a camera that never turned.
    for (const [sx, sy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const dir = screenDirToWorld(sx, sy);
      expect(dir.x).toBe(sx);
      expect(dir.y).toBe(sy);
    }
  });

  it.each(PROJECTIONS)("walks where the player pushed — $name", (p) => {
    setWorldProjection(p);
    for (const [sx, sy] of [
      [0, 1],
      [1, 0],
      [-3, 2],
      [0.7, -0.7],
    ] as const) {
      const dir = screenDirToWorld(sx, sy);
      // Walking that way for a while has to travel the way the thumb pushed:
      // the projected step is parallel to the push, and points the same way.
      const px = projectX(dir.x, dir.y);
      const py = projectY(dir.x, dir.y);
      const cross = px * sy - py * sx;
      const dot = px * sx + py * sy;
      expect(Math.abs(cross)).toBeLessThan(1e-9);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it.each(PROJECTIONS)("hands back a unit vector — $name", (p) => {
    // The caller's own magnitude IS the pace (how far the thumb sits from the
    // dpad centre). Letting the projection through would make walking north
    // slower than walking east.
    setWorldProjection(p);
    for (const [sx, sy] of [
      [0, 1],
      [0, 40],
      [-3, 2],
    ] as const) {
      const dir = screenDirToWorld(sx, sy);
      expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 10);
    }
  });

  it("stands still for a dead centre stick", () => {
    expect(screenDirToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("the fog's dither grid", () => {
  const CAMERAS = [
    { x: 700, y: 500 },
    { x: 700.5, y: 500 },
    { x: 700.9, y: 500.1 },
    { x: 701, y: 500.25 },
    { x: 688.125, y: 493.75 },
    { x: -37.4, y: 1211.6 },
  ];

  it.each(PROJECTIONS)(
    "looks at the same floor the screen is showing, to within half a pixel — $name",
    (p) => {
      // THE FLICKER, pinned. The fog is composited in SCREEN space — one buffer
      // pixel per canvas pixel — and its Bayer stipple is a rigid lattice on
      // that buffer. So the buffer has to be registered to the screen the way
      // every other pass is: snapped to a whole SCREEN pixel.
      //
      // Snapping the camera in WORLD units instead (what this did before the
      // projection existed, when the two were the same thing) leaves the fog
      // looking at a floor up to a whole world unit away from the one under it —
      // a fractional, continuously-varying number of screen pixels once the
      // floor is foreshortened and turned. That misregistration is the crawl:
      // the frontier band slides against the ground and the stipple re-phases as
      // the hero walks.
      setWorldProjection(p);
      for (const cam of CAMERAS) {
        const anchor = fogGridAnchor(cam);
        // Where the buffer THINKS its own origin is, against where the canvas
        // actually puts it — measured in screen px, which is the unit the
        // stipple's lattice is spaced in.
        expect(Math.abs(anchor.x - projectX(cam.x, cam.y))).toBeLessThanOrEqual(
          0.5,
        );
        expect(Math.abs(anchor.y - projectY(cam.x, cam.y))).toBeLessThanOrEqual(
          0.5,
        );
      }
    },
  );

  it.each(PROJECTIONS)("steps by whole screen pixels — $name", (p) => {
    // …and it may only ever move in whole ones: the stipple is drawn INTO the
    // buffer, so a fractional step would resample the dots rather than carry
    // them, which is the same reason the ground layer is baked already
    // projected (render/caches.ts).
    setWorldProjection(p);
    const base = fogGridAnchor(CAMERAS[0]!);
    for (const cam of CAMERAS) {
      const anchor = fogGridAnchor(cam);
      expect(Number.isInteger(anchor.x - base.x)).toBe(true);
      expect(Number.isInteger(anchor.y - base.y)).toBe(true);
    }
  });
});

describe("billboard", () => {
  it.each(PROJECTIONS)("composes to the identity — $name", (p) => {
    setWorldProjection(p);
    const ctx = transformProbe();
    beginBillboard(
      ctx as unknown as CanvasRenderingContext2D,
      500,
      300,
      120,
      80,
    );
    const [a, b, c, d] = ctx.matrix;
    expect(a).toBeCloseTo(1, 10);
    expect(b).toBeCloseTo(0, 10);
    expect(c).toBeCloseTo(0, 10);
    expect(d).toBeCloseTo(1, 10);
  });

  it.each(PROJECTIONS)("lands integers on whole pixels — $name", (p) => {
    // A counter-transform about a FRACTIONAL anchor would put sprites on half
    // pixels: crisp art, blurred on the way to the screen.
    setWorldProjection(p);
    const ctx = transformProbe();
    for (const [wx, wy] of [
      [500, 300],
      [500.5, 300.25],
      [407.9, -18.3],
    ] as const) {
      ctx.save();
      beginBillboard(
        ctx as unknown as CanvasRenderingContext2D,
        wx,
        wy,
        120,
        80,
      );
      for (const [lx, ly] of [
        [0, 0],
        [-8, 13],
        [21, -4],
      ] as const) {
        const at = ctx.at(lx, ly);
        expect(Math.abs(at.x - Math.round(at.x))).toBeLessThan(1e-9);
        expect(Math.abs(at.y - Math.round(at.y))).toBeLessThan(1e-9);
      }
      ctx.restore();
    }
  });

  it.each(PROJECTIONS)(
    "pins a body to its own spot on the floor — $name",
    (p) => {
      // The whole contract: the anchor moves with the projection, the body does
      // not shrink or lean. A pixel of rounding is the allowance; more than that
      // and the horde visibly floats off the ground it is standing on.
      setWorldProjection(p);
      const ctx = transformProbe();
      const cam = { x: 120, y: 80 };
      for (const [wx, wy] of [
        [130, 90],
        [640.5, 240.5],
        [-40, 611.75],
      ] as const) {
        ctx.save();
        beginBillboard(
          ctx as unknown as CanvasRenderingContext2D,
          wx,
          wy,
          cam.x,
          cam.y,
        );
        // The local point an unprojected pass would have drawn the body's centre
        // at must land where that world point actually projects to. Rounded,
        // because that is what every pass in the game actually hands the canvas
        // (`spriteTopLeft` and friends round the camera-relative offset) — and
        // the whole-pixel grid is the thing keeping the art crisp.
        const drawn = ctx.at(Math.round(wx - cam.x), Math.round(wy - cam.y));
        expect(
          Math.abs(drawn.x - projectX(wx - cam.x, wy - cam.y)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(drawn.y - projectY(wx - cam.x, wy - cam.y)),
        ).toBeLessThanOrEqual(1);
        ctx.restore();
      }
    },
  );

  // THE WARP, pinned — and swept across the WHOLE range both knobs can reach
  // rather than sampled at the shipped camera, because the failure is a
  // property of the projection's ARITHMETIC and every setting has its own
  // rounding phase. A yawed camera is the case that has to be swept: it turns
  // BOTH screen axes into fractional combinations of the two world ones, so the
  // asymmetry that hid this bug at yaw 0 (x exact, y foreshortened) is gone and
  // an isometric picture ripples in every direction at once.
  const RIGIDITY_SWEEP: { pitch: number; yaw: number; name: string }[] = [];
  for (const pitch of [1, 0.75, 0.6, 0.5, 0.4, 0.25]) {
    for (const yaw of [0, 5, 15, 22, 30, 45]) {
      RIGIDITY_SWEEP.push({ pitch, yaw, name: `pitch ${pitch}, yaw ${yaw}°` });
    }
  }

  it.each(RIGIDITY_SWEEP)(
    "holds the whole field rigid as the camera pans — $name",
    (p) => {
      // Two props do not move relative to each other because the hero walked
      // past them, and the picture must say so: whatever the camera does, the
      // screen distance between two static bodies is a CONSTANT.
      //
      // What broke it was rounding the camera-relative projection in one go
      // (`round(project(world - camera))`). Square-on that is exact in x — the
      // projection is the identity there and `computeCamera` rounds to a whole
      // world unit — so east-west travel was solid and hid the bug. In y the
      // pitch is a fraction, so a whole unit of camera travel is 0.75 of a
      // screen pixel and every body crossed its own rounding boundary at its own
      // moment: the gap between two props measured 12 px on one frame and 13 on
      // the next, and the whole field rippled while the baked floor sat still
      // underneath. Under a yaw there is no solid axis left to walk along.
      setWorldProjection(p);
      const props = [
        { x: 300, y: 300 },
        { x: 316.4, y: 316.4 },
        { x: 287.25, y: 341.5 },
      ] as const;
      // Driven through `beginBillboard` rather than the anchor helpers, so what
      // is pinned is where a pass's own `Math.round(pos - camera)` draw actually
      // lands — the real path, not a stand-in for it.
      const ctx = transformProbe();
      const drawnAt = (
        prop: { x: number; y: number },
        cam: { x: number; y: number },
      ) => {
        ctx.save();
        beginBillboard(
          ctx as unknown as CanvasRenderingContext2D,
          prop.x,
          prop.y,
          cam.x,
          cam.y,
        );
        const at = ctx.at(
          Math.round(prop.x - cam.x),
          Math.round(prop.y - cam.y),
        );
        ctx.restore();
        return at;
      };
      const gapAt = (cam: { x: number; y: number }) => {
        const first = drawnAt(props[0], cam);
        return props.map((prop) => {
          const at = drawnAt(prop, cam);
          // Rounded past the float noise a yawed matrix's compose-then-invert
          // leaves behind (~1e-14) — the claim is about whole pixels. The `+ 0`
          // folds the -0 a rounded negative epsilon produces back to 0, which a
          // deep equality otherwise reports as a difference.
          return {
            x: Math.round(at.x - first.x) + 0,
            y: Math.round(at.y - first.y) + 0,
          };
        });
      };
      // Walking north, then east, then diagonally — a whole world unit at a
      // time, which is the step `computeCamera` hands the renderer.
      const base = gapAt({ x: 200, y: 200 });
      for (let step = 0; step < 24; step++) {
        expect(gapAt({ x: 200, y: 200 + step })).toEqual(base);
        expect(gapAt({ x: 200 + step, y: 200 })).toEqual(base);
        expect(gapAt({ x: 200 + step, y: 200 + step })).toEqual(base);
      }
    },
  );

  it.each(PROJECTIONS)(
    "steps the whole picture by whole pixels — $name",
    (p) => {
      // …and the camera's own seat may only move in whole screen pixels, or the
      // rigid scene above would land on half a pixel and resample every sprite
      // in it. This is the lattice the baked ground layer's blit and the fog's
      // dither register against too.
      setWorldProjection(p);
      const base = { x: cameraAnchorX(200, 200), y: cameraAnchorY(200, 200) };
      for (const cam of [
        { x: 201, y: 200 },
        { x: 200, y: 213 },
        { x: 200.5, y: 200.25 },
        { x: -37.4, y: 1211.6 },
      ]) {
        const seat = {
          x: cameraAnchorX(cam.x, cam.y),
          y: cameraAnchorY(cam.x, cam.y),
        };
        expect(Number.isInteger(seat.x - base.x)).toBe(true);
        expect(Number.isInteger(seat.y - base.y)).toBe(true);
      }
    },
  );

  it.each(RIGIDITY_SWEEP)(
    "seats a floor decal on that same lattice — $name",
    (p) => {
      // THE BLOOD IS ON THE FLOOR, AND THE FLOOR DOES NOT WOBBLE. A stain, a
      // pool's frayed rim and a boot print are the one part of the picture the
      // player watches for minutes at a stretch, so a decal that shifts against
      // the ground under it reads as the whole field crawling.
      //
      // Those passes used to draw their art THROUGH the live tilt, at
      // `pos - camera` in world units. Every claim below fails that way: the
      // destination lands between two pixels, so a nearest-neighbour squash
      // re-picks which rows it drops as the camera moves a fraction of a pixel,
      // and each blot re-picks at its own moment. Walking east or west hid it
      // completely — the projection is the identity there and the camera is a
      // whole world unit, so nothing ever landed off a pixel.
      setWorldProjection(p);
      // Deliberately fractional and off-grid: a tile centre nudged by the
      // blood grid's own per-cell jitter, and a boot print laid wherever a foot
      // came down.
      const decals = [
        { x: 312, y: 312 },
        { x: 315.5, y: 328.25 },
        { x: 287.75, y: 341.5 },
      ] as const;
      const art = { width: 22, height: 17 };
      const drawnAt = (
        decal: { x: number; y: number },
        cam: { x: number; y: number },
      ) => {
        let at = { x: 0, y: 0 };
        const ctx = {
          drawImage: (_art: unknown, x: number, y: number) => {
            at = { x, y };
          },
        };
        drawFloorDecal(
          ctx as unknown as CanvasRenderingContext2D,
          art as unknown as ImageBitmap,
          decal.x,
          decal.y,
          cam,
        );
        return at;
      };
      const gapAt = (cam: { x: number; y: number }) => {
        const first = drawnAt(decals[0], cam);
        return decals.map((decal) => {
          const at = drawnAt(decal, cam);
          // Whole pixels, or the blit resamples the art it was baked to avoid
          // resampling.
          expect(Number.isInteger(at.x)).toBe(true);
          expect(Number.isInteger(at.y)).toBe(true);
          return { x: at.x - first.x + 0, y: at.y - first.y + 0 };
        });
      };
      const base = gapAt({ x: 200, y: 200 });
      for (let step = 0; step < 24; step++) {
        expect(gapAt({ x: 200, y: 200 + step })).toEqual(base);
        expect(gapAt({ x: 200 + step, y: 200 })).toEqual(base);
        expect(gapAt({ x: 200 + step, y: 200 + step })).toEqual(base);
      }
    },
  );

  it("puts the plain projection back when it ends", () => {
    const ctx = transformProbe();
    const before = [...ctx.matrix];
    ctx.save();
    beginBillboard(
      ctx as unknown as CanvasRenderingContext2D,
      900,
      700,
      40,
      30,
    );
    ctx.restore();
    expect(ctx.matrix).toEqual(before);
  });
});

describe("the camera under the projection", () => {
  it.each(PROJECTIONS)(
    "holds the hero at the middle of the screen — $name",
    (p) => {
      // Mid-map and hard against a corner alike. The camera used to clamp to the
      // level, which slid him off toward a corner near an edge; a projected view
      // is bigger than the canvas in world units, so that bit on nearly every map
      // rather than only the small ones (view.ts).
      setWorldProjection(p);
      const state = startGame();
      for (const [x, y] of [
        [state.level.width / 2, state.level.height / 2],
        [0, 0],
        [state.level.width, state.level.height],
      ] as const) {
        state.players[0].pos.x = x;
        state.players[0].pos.y = y;
        const camera = computeCamera(state, 844, 390);
        const at = worldToCanvas(x, y, camera);
        // Within a pixel of dead centre — the camera rounds to whole world units.
        expect(Math.abs(at.x - 422)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(at.y - 195)).toBeLessThanOrEqual(1.5);
      }
    },
  );
});
