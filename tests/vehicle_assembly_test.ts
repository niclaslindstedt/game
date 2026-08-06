// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLE ASSEMBLIES ARE ONE BILLBOARD EACH (pwa/src/game/render/vehicles.ts).
//
// A car is drawn part by part — an underbody, two wheels, six body panels — and
// every one of those parts is a slice of the SAME 48×26 part canvas. So the
// numbers that place them (`CAR.wheelOffsets`, the wheel arch columns) are
// SCREEN px along the drawn body, and the whole assembly hangs off ONE anchor
// through the world projection.
//
// Anchoring a part at `car.pos.x + offset` instead reads those columns as WORLD
// px across the floor, and that is invisible at yaw 0 — the projection leaves x
// alone there, so the wheels landed in their arches by coincidence. Turn the
// camera and a step east comes out east AND south (render/tilt.ts), while the
// panels stay dead straight-on: at the full isometric 45° the front wheel sat a
// wheel below its arch and the rear one climbed up behind the door, the pair of
// them offset at exactly the yaw's own angle.
//
// Nothing else in the suite would have caught it. The engine has no opinion on
// where a wheel is drawn, and every render assertion that existed ran at the
// shipped yaw of 0, which is the one setting where the bug is a no-op.

import { afterEach, describe, expect, it } from "vitest";

import { CAR, createVehicles } from "@game/core";
import type { GameState, LevelDef } from "@game/core";

import type { Sprites } from "../pwa/src/game/assets.ts";
import { carBeam } from "../pwa/src/game/render/night.ts";
import { drawVehicles } from "../pwa/src/game/render/vehicles.ts";
import {
  DEFAULT_PITCH,
  DEFAULT_YAW,
  projectX,
  projectY,
  setWorldProjection,
} from "../pwa/src/game/render/tilt.ts";
import { startGame } from "./engine/helpers.ts";

/** The projection is module state, so every test puts it back. */
afterEach(() => {
  setWorldProjection({ pitch: DEFAULT_PITCH, yaw: DEFAULT_YAW });
});

/** The part canvas every panel (and the underbody) shares, and the wheel. */
const PART = { width: 48, height: 26 };
const WHEEL = { width: 11, height: 11 };

/** One recorded blit, with the sprite it drew and where it landed ON SCREEN. */
type Blit = { name: string; centre: { x: number; y: number } };

/**
 * A canvas-context stand-in that tracks the transform and records what each
 * `drawImage` put where — the same trick `world_tilt_test.ts` uses to prove a
 * billboard's composite, carried one step further so a whole draw pass can be
 * asserted about with no DOM anywhere near it.
 *
 * `centre` is the part's BOTTOM-CENTRE in screen px: the column its arch (or its
 * body) is pinned at, on the base row it stands on. That is the point the
 * assembly's geometry is actually about, and it is what has to agree between a
 * wheel and the shell it belongs to at every camera angle.
 */
function drawProbe(names: Map<object, string>) {
  let m = [
    projectX(1, 0),
    projectY(1, 0),
    projectX(0, 1),
    projectY(0, 1),
    0,
    0,
  ];
  const stack: number[][] = [];
  const blits: Blit[] = [];
  const at = (x: number, y: number) => ({
    x: m[0]! * x + m[2]! * y + m[4]!,
    y: m[1]! * x + m[3]! * y + m[5]!,
  });
  return {
    blits,
    ctx: {
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
      drawImage(sprite: object, ...rest: number[]) {
        const name = names.get(sprite) ?? "?";
        const { width, height } = sprite as { width: number; height: number };
        // Both call shapes the assembly uses: the 3-arg whole-sprite blit and
        // the 9-arg source-rect one the shell's pitch shear and the steered
        // wheel's column warp draw through.
        const [dx, dy] =
          rest.length >= 8 ? [rest[4]!, rest[5]!] : [rest[0]!, rest[1]!];
        blits.push({
          name,
          centre: at(dx + Math.round(width / 2), dy + (height - 2)),
        });
      },
    } as unknown as CanvasRenderingContext2D,
  };
}

/** A sprite set of fake bitmaps, sized like the real art the car is cut from. */
function carSprites(): { sprites: Sprites; names: Map<object, string> } {
  const names = new Map<object, string>();
  const sprites: Record<string, object> = {};
  const add = (name: string, size: { width: number; height: number }) => {
    const bitmap = { ...size };
    sprites[name] = bitmap;
    names.set(bitmap, name);
  };
  add("car_underbody", PART);
  add("car_lights", PART);
  for (const panel of CAR.panels) add(`car_${panel}_0`, PART);
  add("car_wheel_0", WHEEL);
  add("car_wheel_1", WHEEL);
  return { sprites: sprites as unknown as Sprites, names };
}

/** A run with one car parked at `pos`, and nobody near enough to light it up. */
function parkedCar(pos: { x: number; y: number }): GameState {
  const state = startGame();
  state.vehicles = createVehicles({
    landmarks: [{ kind: "car", pos, sprite: "car_doors_0" }],
    doors: [],
  } as unknown as Pick<LevelDef, "landmarks" | "doors">);
  // Well clear of `CAR.boardRadius`: the boardable halo bakes a gradient on a
  // real canvas, which this probe has no business minting.
  state.players[0].pos = { x: pos.x + 4000, y: pos.y + 4000 };
  return state;
}

/** The pass, run against one camera setting. */
function drawAt(
  state: GameState,
  projection: { pitch: number; yaw: number },
): Blit[] {
  setWorldProjection(projection);
  const { sprites, names } = carSprites();
  const probe = drawProbe(names);
  drawVehicles(probe.ctx, state, sprites, { x: 0, y: 0 }, () => true, 0);
  return probe.blits;
}

/** Every camera the two knobs can be dialled to that is worth asserting on. */
const PROJECTIONS = [
  { pitch: 1, yaw: 0, name: "straight down (no projection at all)" },
  { pitch: DEFAULT_PITCH, yaw: DEFAULT_YAW, name: "the shipped camera" },
  { pitch: 0.5, yaw: 45, name: "full 2:1 isometric" },
  { pitch: 0.75, yaw: 45, name: "the shipped pitch, turned to the corner" },
  { pitch: 0.4, yaw: 22, name: "somewhere in between" },
];

describe("the car assembly", () => {
  for (const projection of PROJECTIONS) {
    it(`stands its wheels in their own arches — ${projection.name}`, () => {
      const state = parkedCar({ x: 317, y: 244 });
      const blits = drawAt(state, projection);
      const shell = blits.find((b) => b.name === "car_doors_0");
      const wheels = blits.filter((b) => b.name.startsWith("car_wheel_"));
      expect(shell).toBeDefined();
      expect(wheels).toHaveLength(2);
      wheels.forEach((wheel, axle) => {
        // The arch's column off the body's own centre, and the SAME base row —
        // a wheel stands on the ground the body is parked on, whatever the
        // camera is doing. Half a pixel of slack for the odd-width wheel's
        // rounded centre; a world-anchored offset is out by several.
        expect(wheel.centre.x - shell!.centre.x).toBeCloseTo(
          CAR.wheelOffsets[axle]!,
          1,
        );
        expect(wheel.centre.y - shell!.centre.y).toBeCloseTo(0, 1);
      });
    });
  }

  it("puts every panel of the stack on one anchor", () => {
    const state = parkedCar({ x: 317, y: 244 });
    const blits = drawAt(state, { pitch: 0.5, yaw: 45 });
    const shell = blits
      .filter((b) => b.name.startsWith("car_"))
      .filter((b) => !b.name.startsWith("car_wheel_"));
    // The underbody plus all seven panels, and a parked car's springs are at
    // rest, so nothing pitches: one anchor, one place.
    expect(shell.length).toBe(CAR.panels.length + 1);
    for (const part of shell) {
      expect(part.centre.x).toBeCloseTo(shell[0]!.centre.x, 5);
      expect(part.centre.y).toBeCloseTo(shell[0]!.centre.y, 5);
    }
  });

  // ── THE HEADLIGHTS ARE BOLTED ON ──────────────────────────────────────────
  // They are sealed beams in a shell, not steering-linked cornering lamps, and
  // the shell's picture never turns: the body is one side-profile assembly cut
  // nose-right and nothing mirrors or rotates it, while `CarVehicle.heading`
  // swings the better part of 180° inside the yaw stop. Walked down the heading
  // (which is how the beam started life) the wedge therefore swept a 172° arc
  // across a car that had not visibly moved a pixel.
  describe("the headlight beam", () => {
    /** The car, driven, aimed at `heading` — the field the beam must ignore. */
    function drivenCar(heading: number) {
      const state = parkedCar({ x: 317, y: 244 });
      const car = state.vehicles[0]!;
      if (car.kind !== "car") throw new Error("no car");
      car.driver = 0;
      car.heading = heading;
      return car;
    }

    /** Every heading the yaw stop lets the nose reach, and both ends of it. */
    const HEADINGS = [0, 0.4, 1, -1, CAR.maxYaw, -CAR.maxYaw];

    it("does not swing when the car turns", () => {
      const camera = { x: 0, y: 0 };
      const straight = carBeam(drivenCar(0), camera, 1);
      for (const heading of HEADINGS) {
        const beam = carBeam(drivenCar(heading), camera, 1);
        expect(beam.x).toBeCloseTo(straight.x, 6);
        expect(beam.y).toBeCloseTo(straight.y, 6);
        expect(beam.dir).toBe(straight.dir);
      }
    });

    it("throws out of the drawn nose at every camera angle", () => {
      const camera = { x: 0, y: 0 };
      for (const projection of PROJECTIONS) {
        const state = parkedCar({ x: 317, y: 244 });
        // Drawn PARKED — a running car burns its daylight cones through canvas
        // gradients, which this transform-only probe has no business minting.
        const body = drawAt(state, projection).find(
          (b) => b.name === "car_doors_0",
        );
        expect(body).toBeDefined();
        const car = state.vehicles[0]!;
        if (car.kind !== "car") throw new Error("no car");
        car.driver = 0;
        // Hard over, which is where the old bug was loudest.
        car.heading = CAR.maxYaw;
        const beam = carBeam(car, camera, 1);
        // The lamps sit AHEAD of the body's own anchor on the screen's x axis,
        // and on its row — the wheel arches' rule, applied to the light.
        expect(beam.x).toBeGreaterThan(body!.centre.x);
        // Within the pixel the body's own anchor is rounded to.
        expect(Math.abs(beam.y - body!.centre.y)).toBeLessThanOrEqual(1);
        expect(beam.dir).toBe(1);
      }
    });
  });

  it("keeps the wheels put as the camera turns", () => {
    const state = parkedCar({ x: 317, y: 244 });
    // The bug's own signature: the gap between the two axles is the body's
    // length, on the screen's x axis, and NOTHING the camera does may rotate it
    // — a yaw that swings it is the assembly being read as ground geometry.
    for (const projection of PROJECTIONS) {
      const wheels = drawAt(state, projection).filter((b) =>
        b.name.startsWith("car_wheel_"),
      );
      const span = CAR.wheelOffsets[1]! - CAR.wheelOffsets[0]!;
      expect(wheels[1]!.centre.x - wheels[0]!.centre.x).toBeCloseTo(span, 1);
      expect(wheels[1]!.centre.y - wheels[0]!.centre.y).toBeCloseTo(0, 1);
    }
  });
});
