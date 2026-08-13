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

import {
  CAR,
  createVehicles,
  runLevelDef,
  setCameraYaw,
  vehicleFootprint,
} from "@game/core";
import type { GameState, LevelDef } from "@game/core";

import type { Sprites } from "../pwa/src/game/assets.ts";
import { drawLightCones } from "../pwa/src/game/render/vehicle-lights.ts";
import { drawVehicles } from "../pwa/src/game/render/vehicles.ts";
import {
  DEFAULT_PITCH,
  DEFAULT_YAW,
  projectX,
  projectY,
  setWorldProjection,
} from "../pwa/src/game/render/tilt.ts";
import { startGame } from "./engine/helpers.ts";

/**
 * Point BOTH cameras at the same place — the renderer's projection and the one
 * number the engine takes from it (`setCameraYaw`, which is how a machine's
 * blockers find the ground its picture stands on). The app applies them in one
 * block for the same reason; splitting them is the only way they can drift.
 */
function applyCamera(projection: { pitch: number; yaw: number }): void {
  setWorldProjection(projection);
  setCameraYaw(projection.yaw);
}

/** Both are module state, so every test puts them back. */
afterEach(() => {
  applyCamera({ pitch: DEFAULT_PITCH, yaw: DEFAULT_YAW });
});

/** The part canvas every panel (and the underbody) shares, and the wheel. */
const PART = { width: 48, height: 26 };
const WHEEL = { width: 11, height: 11 };

/** A nose bearing square off the body's own axis — where every "the picture
 * ignores the heading" bug was loudest. Written down here rather than read off
 * a config knob because the engine no longer has one: a car's heading is the
 * axis it was parked on and never moves (see `applyCarWheel`), so this is a
 * value only a test can produce, which is exactly why the test produces it. */
const HARD_OVER = Math.PI * 0.48;

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
  /** How many gradient fills the pass laid down — the thrown light, and the
   * only thing in this pass that is painted rather than blitted. */
  let fills = 0;
  const at = (x: number, y: number) => ({
    x: m[0]! * x + m[2]! * y + m[4]!,
    y: m[1]! * x + m[3]! * y + m[5]!,
  });
  return {
    blits,
    /** How much thrown light the pass painted (see `fills`). */
    fills: () => fills,
    /** The live transform, so a pass can be asserted to have left it alone. */
    matrix: () => [...m],
    /** How many unmatched `save`s the pass is holding — a leak, if it is not 0
     * once the pass has returned. */
    depth: () => stack.length,
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
      rotate(angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        m = [
          m[0]! * cos + m[2]! * sin,
          m[1]! * cos + m[3]! * sin,
          m[0]! * -sin + m[2]! * cos,
          m[1]! * -sin + m[3]! * cos,
          m[4]!,
          m[5]!,
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
      // The light CONES the running car burns are canvas gradients rather than
      // blits (`drawLightCones`), and this probe has no pixels for them to land
      // on — but it must survive them being drawn, or a driven car could not be
      // put through it at all. Not recorded as blits: what is asserted about the
      // lamps is where the `car_lights` BLIT lands. COUNTED, though, because
      // whether a cone was thrown at all is a rule of its own (see A CAR IN A
      // LIT ROOM below).
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {
        fills += 1;
      },
      createLinearGradient() {
        return { addColorStop() {} };
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
  // Well clear of `CAR.boardRadius`: the boardable mark is a sprite this probe
  // has no bitmap for, and standing the hero off it keeps the blit list to the
  // machine itself.
  state.players[0].pos = { x: pos.x + 4000, y: pos.y + 4000 };
  return state;
}

/** The pass, run against one camera setting — what it drew, and how much light
 * it threw while drawing it. */
function probeAt(
  state: GameState,
  projection: { pitch: number; yaw: number },
): { blits: Blit[]; fills: number } {
  applyCamera(projection);
  const { sprites, names } = carSprites();
  const probe = drawProbe(names);
  drawVehicles(
    probe.ctx,
    state,
    sprites,
    { x: 0, y: 0 },
    () => true,
    0,
    "under",
  );
  return { blits: probe.blits, fills: probe.fills() };
}

/** The pass, run against one camera setting. */
function drawAt(
  state: GameState,
  projection: { pitch: number; yaw: number },
): Blit[] {
  return probeAt(state, projection).blits;
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
  // swings the better part of 180° inside the yaw stop. Anything hung off the
  // heading therefore swept a 172° arc across a car that had not visibly moved
  // a pixel — which is how the night pass's separate beam died.
  //
  // A DRIVEN CAR HAS ONE PAIR OF LAMPS AND THE ASSEMBLY OWNS THEM: the lit
  // `car_lights` layer and the cones it throws (`drawLightCones`), drawn in the
  // body's own screen space with the panels. The night pass draws no headlight
  // of its own — see A DRIVEN CAR'S HEADLIGHTS in render/night.ts.
  describe("the headlights", () => {
    /** The car, aimed at `heading`, with or without somebody at the wheel. */
    function carAt(heading: number, driven: boolean): GameState {
      const state = parkedCar({ x: 317, y: 244 });
      const car = state.vehicles[0]!;
      if (car.kind !== "car") throw new Error("no car");
      car.driver = driven ? 0 : null;
      car.heading = heading;
      return state;
    }

    /**
     * A spread of nose bearings, out to square either way.
     *
     * THE ENGINE CAN NO LONGER PRODUCE ANY BUT THE FIRST — `heading` is the
     * axis a car was parked on and the wheel moves the body rather than the
     * nose (`applyCarWheel`) — and the picture still has to be blind to all of
     * them, because "the lamps are bolted to a shell nothing rotates" is a fact
     * about the ART rather than a consequence of the physics. A renderer that
     * quietly started swivelling a cone off a heading would fail here on the
     * day something wrote one, rather than on the day somebody noticed.
     */
    const HEADINGS = [0, 0.4, 1, -1, HARD_OVER, -HARD_OVER];

    /**
     * A CAR IN A LIT ROOM THROWS NO CONE — the garage bay, and the reason the
     * rule exists at all: a beam laid across cement the strip lights are
     * already burning over cuts no darkness, so it reads as a highlight painted
     * ON the machine rather than as light coming OFF it. The boardable arrow is
     * what says LOOK AT THIS, and it says it BEFORE the hero climbs in.
     *
     * The gate is the LIT ZONE (`LevelDef.litZones`, the rooms whose own lights
     * are on) and nothing about the venue, so the wagon is dark in the bay and
     * has its beams back the frame it rolls out onto the drive — which is the
     * half a test has to hold, because a rule that killed the hub's headlights
     * outright would look identical standing still.
     */
    describe("in a room whose lights are on", () => {
      /** The room, four wheel-lengths square, with the car parked in it. */
      const ROOM = { x: 300, y: 220, width: 60, height: 60 };

      /**
       * A running car at `pos`, on a venue carrying exactly `rooms`.
       *
       * The zones are written EVERY time, empty list included: a carved def
       * outlives the run it was carved for in this suite, so a test that only
       * ever adds one leaves it lying there for the next.
       */
      function litAround(
        pos: { x: number; y: number },
        rooms: { rect: typeof ROOM; amount: number }[],
      ): GameState {
        const state = carAt(0, true);
        const car = state.vehicles[0]!;
        if (car.kind !== "car") throw new Error("no car");
        car.pos = { ...pos };
        runLevelDef(state).litZones = rooms;
        return state;
      }

      const LIT = [{ rect: ROOM, amount: 0.82 }];

      it("throws nothing, and still burns its lamps", () => {
        const inside = probeAt(
          litAround({ x: 317, y: 244 }, LIT),
          PROJECTIONS[0]!,
        );
        expect(inside.fills).toBe(0);
        expect(inside.blits.some((b) => b.name === "car_lights")).toBe(true);
      });

      it("has its beams back a step outside the room", () => {
        const outside = probeAt(
          litAround({ x: 380, y: 244 }, LIT),
          PROJECTIONS[0]!,
        );
        expect(outside.fills).toBeGreaterThan(0);
      });

      it("throws them on a venue with no lit room at all", () => {
        const bare = probeAt(
          litAround({ x: 317, y: 244 }, []),
          PROJECTIONS[0]!,
        );
        expect(bare.fills).toBeGreaterThan(0);
      });
    });

    it("burns only with somebody at the wheel", () => {
      const off = drawAt(carAt(0, false), PROJECTIONS[0]!);
      expect(off.some((b) => b.name === "car_lights")).toBe(false);
      const on = drawAt(carAt(0, true), PROJECTIONS[0]!);
      expect(on.some((b) => b.name === "car_lights")).toBe(true);
    });

    it("does not swing when the car turns", () => {
      for (const projection of PROJECTIONS) {
        const straight = drawAt(carAt(0, true), projection).find(
          (b) => b.name === "car_lights",
        );
        expect(straight).toBeDefined();
        for (const heading of HEADINGS) {
          const lit = drawAt(carAt(heading, true), projection).find(
            (b) => b.name === "car_lights",
          );
          expect(lit).toBeDefined();
          expect(lit!.centre.x).toBeCloseTo(straight!.centre.x, 6);
          expect(lit!.centre.y).toBeCloseTo(straight!.centre.y, 6);
        }
      }
    });

    it("rides the body's own anchor at every camera angle", () => {
      for (const projection of PROJECTIONS) {
        // Square off its axis, which is where the old bug was loudest.
        const blits = drawAt(carAt(HARD_OVER, true), projection);
        const body = blits.find((b) => b.name === "car_doors_0");
        const lit = blits.find((b) => b.name === "car_lights");
        expect(body).toBeDefined();
        expect(lit).toBeDefined();
        // The lamps are a layer of the same 48×26 part canvas, so they land on
        // the body's own anchor — the wheel arches' rule, applied to the light.
        expect(lit!.centre.x).toBeCloseTo(body!.centre.x, 5);
        expect(lit!.centre.y).toBeCloseTo(body!.centre.y, 5);
      }
    });
  });

  // ── AND THE GROUND IT BLOCKS IS THE GROUND IT STANDS ON ───────────────────
  // The other half of the same fact, and the half the player walks into: the
  // car's collision chain (`vehicleFootprint`) is columns of the SAME part
  // canvas, so projected it has to land on the drawn body's own columns. Laid
  // along the heading instead it swung off the picture at the camera's angle,
  // and the hero walked through the bonnet and was stopped by bare floor.
  //
  // ITS ROW IS NOT THE BODY'S, AND THAT IS THE POINT OF `CAR.footprint.lift`:
  // the chain sits a fixed number of world px UP the picture so a hero pressed
  // against the wagon has his boots on its tyres rather than a body-length out
  // on the floor (`FOOT_STANDOFF`, engine/game/obstacles.ts). Projected, that
  // is the lift times the camera's own pitch — and it is the same number at
  // every YAW, which is what says the step was taken across the picture rather
  // than down a world axis.
  describe("the blockers under it", () => {
    for (const projection of PROJECTIONS) {
      it(`land on the drawn body's own columns — ${projection.name}`, () => {
        const at = { x: 317, y: 244 };
        const state = parkedCar(at);
        const blits = drawAt(state, projection);
        const car = state.vehicles[0]!;
        const prints = vehicleFootprint(car);
        expect(prints).toHaveLength(CAR.footprint.offsets.length);
        prints.forEach((print, i) => {
          const dx = print.pos.x - at.x;
          const dy = print.pos.y - at.y;
          // Projected, the blocker sits at its own column of the assembly, on
          // the body's own row — at every camera the two knobs can reach.
          expect(projectX(dx, dy)).toBeCloseTo(CAR.footprint.offsets[i]!, 6);
          expect(projectY(dx, dy)).toBeCloseTo(
            -CAR.footprint.lift * projection.pitch,
            6,
          );
        });
        // …and the chain SPANS the drawn body rather than sampling it: the
        // outer two blockers' own edges reach the assembly's ends, which is
        // what stops a bonnet burying itself in a wall the collision has not
        // got to yet. Read against the wheels this pass actually blitted,
        // which are columns of the same canvas (`CAR.wheelOffsets`) — with
        // whole-pixel slack, because the drawn parts are rounded to the device
        // grid and the blockers are not.
        const shell = blits.find((b) => b.name === "car_doors_0")!;
        const wheels = blits.filter((b) => b.name.startsWith("car_wheel_"));
        CAR.wheelOffsets.forEach((offset, axle) => {
          expect(wheels[axle]!.centre.x - shell.centre.x).toBeCloseTo(
            offset,
            1,
          );
        });
        const columns = prints.map((print) =>
          projectX(print.pos.x - at.x, print.pos.y - at.y),
        );
        // A hair of slack: these columns come back through the projection and
        // its inverse, so they carry the last bit of a float with them.
        const half = PART.width / 2 - CAR.footprint.radius - 1e-6;
        expect(Math.min(...columns)).toBeLessThanOrEqual(-half);
        expect(Math.max(...columns)).toBeGreaterThanOrEqual(half);
      });
    }
  });

  // ── AND THE LAMPS GIVE THE CONTEXT BACK ───────────────────────────────────
  // "THE CAR STRETCHES SOMETIMES." A car whose tail lamps the road has knocked
  // out is very often a car the same blow SPUN, so `drawLightCones` was reached
  // with `tailOut` and a non-zero `yaw` together — and the early `return` that
  // skipped the tail glow skipped the `ctx.restore()` that was to undo the yaw's
  // `save()` as well. `endBillboard` then popped THAT save instead of its own,
  // and the billboard's inverse projection stayed on the context: every body
  // drawn after the wreck wore one extra, so the hero's wagon (drawn last,
  // because it is nearest) came out 1/pitch taller than it is — a third again at
  // the shipped camera, and half again with two spun wrecks in one frame.
  //
  // It is asserted on the CONTEXT rather than on a screenshot because that is
  // the only place it is visible as a fact: on screen it is a car that looks
  // wrong three lanes away from the wreck that did it.
  describe("the light cones", () => {
    /** Every combination of the two flags that killed a lamp, at a yaw. */
    const LAMPS = [
      { noseOut: false, tailOut: false, name: "both lamps burning" },
      { noseOut: true, tailOut: false, name: "the nose knocked out" },
      { noseOut: false, tailOut: true, name: "the tail knocked out" },
      { noseOut: true, tailOut: true, name: "both ends knocked out" },
    ];

    for (const lamps of LAMPS) {
      it(`leave the transform as they found it — ${lamps.name}`, () => {
        applyCamera(PROJECTIONS[1]!);
        const probe = drawProbe(new Map());
        const before = probe.matrix();
        // Spun off its axis: the yaw is the half that takes a `save()`.
        drawLightCones(
          probe.ctx,
          { x: 317, y: 244 },
          { x: 0, y: 0 },
          0,
          0,
          0,
          false,
          lamps.noseOut,
          lamps.tailOut,
          HARD_OVER,
        );
        expect(probe.depth()).toBe(0);
        expect(probe.matrix()).toEqual(before);
      });
    }

    it("do not stretch the car drawn after them", () => {
      const state = parkedCar({ x: 317, y: 244 });
      applyCamera(PROJECTIONS[1]!);
      const { sprites, names } = carSprites();
      const clean = drawProbe(names);
      drawVehicles(
        clean.ctx,
        state,
        sprites,
        { x: 0, y: 0 },
        () => true,
        0,
        "under",
      );
      // The same pass, with a spun wreck's dead tail lamps drawn first.
      const after = drawProbe(names);
      drawLightCones(
        after.ctx,
        { x: 111, y: 120 },
        { x: 0, y: 0 },
        0,
        0,
        0,
        false,
        false,
        true,
        HARD_OVER,
      );
      drawVehicles(
        after.ctx,
        state,
        sprites,
        { x: 0, y: 0 },
        () => true,
        0,
        "under",
      );
      expect(after.blits).toEqual(clean.blits);
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
