#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR VIEWER — assemble the hero's hatchback from its part sprites in
// any combination of damage states, and write a comparison sheet PNG.
//
// The car is a MACHINE, not a picture (engine/game/vehicles.ts): six body
// panels (`car_<panel>_<rung>`, rung 0..3: factory straight → bumped →
// hammered → broken) stacked on one shared canvas over two wheels
// (`car_wheel_*`: sound spin frames, a flat tire, a bent rim). This script
// is how a panel edit is JUDGED — assemble, look, refine — and how the
// driving minigame's damage matrix is previewed without driving anything.
//
//   node scripts/car-viewer.mjs                 # the ladder: all rungs 0..3
//   node scripts/car-viewer.mjs --mixed         # + a hard-luck mix row
//   node scripts/car-viewer.mjs --steer         # THE RACK, lock to lock
//   node scripts/car-viewer.mjs --gore          # THE ROAD: a leg, actually driven
//   node scripts/car-viewer.mjs --film          # the BLOOD LADDER, rung by rung
//   node scripts/car-viewer.mjs --out some.png  # elsewhere
//
// `--gore` is the one mode that does not stage anything: it PLAYS a leg of the
// driving minigame with the shipped auto-driver and draws the wagon at six
// moments along it, each with the damage the sim booked and the blood the app's
// own `drive-screen/car-soak.ts` put on it, composited the way
// `render/hero-coat.ts` composites it. That is the only honest way to judge the
// gore, because the thing being judged is a GRADIENT across seven panels over a
// whole trip — a staged profile can be made to look like anything, and the bug
// this was built for (a drenched nose bolted to a factory-fresh body) was
// invisible in every staged sheet and unmissable at second twenty of a real
// leg. `--difficulty` and `--seed` pick the leg; `--home` drives it backwards.
//
// Output defaults to pwa/assets-preview/car_states.png.

import { register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const SPRITES = `${root}content/sprites/goodco`;

// Draw order mirrors render/vehicles.ts: wheels, then panels, roof last.
const PANELS = [
  "backside",
  "doors",
  "hood",
  "front_side",
  "bumper",
  "roof",
  "glass",
];
const WHEEL_AT = [10, 36]; // wheel centers on the 48-wide part canvas
const CANVAS = { w: 48, h: 26 };
// The steered wheel's lean and height cue (render/vehicles.ts STEER_LEAN /
// STEER_GROW) — the numbers this preview has to match for its warp to be the
// one the game draws.
const STEER_LEAN = 0.35;
const STEER_GROW = 0.3;

/** Parsed sprites, kept — a sheet stamps the same dozen grids once per car, and
 * `--gore` draws six cars off one leg. */
const loaded = new Map();

function loadSprite(name) {
  const held = loaded.get(name);
  if (held) return held;
  const doc = parse(readFileSync(`${SPRITES}/${name}.yaml`, "utf8"));
  const rows = doc.grid
    .split("\n")
    .map((r) => r.trimEnd())
    .filter((r) => r.length > 0);
  const sprite = { rows, palette: doc.palette, w: doc.size[0], h: doc.size[1] };
  loaded.set(name, sprite);
  return sprite;
}

function hex(colour) {
  return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
}

/**
 * THE STEERED FRONT WHEEL, warped a column at a time — the same three moves
 * `drawSteeredWheel` (pwa/src/game/render/vehicles.ts) makes, and it must stay
 * the same three: foreshortened to `cos(steer)` of its width, sheared by each
 * column's own displacement toward the camera, and drawn a pixel taller on the
 * near half, anchored at the contact patch. Nearest-neighbour on both axes,
 * which is what the game's canvas does with smoothing off.
 */
function stampSteered(px, wheel, cx, baseY, steer) {
  const width = Math.max(1, Math.round(wheel.w * Math.abs(Math.cos(steer))));
  const swing = Math.sin(steer);
  const left = cx - Math.round(width / 2);
  for (let i = 0; i < width; i++) {
    const across = (i + 0.5) / width;
    const sx = Math.min(wheel.w - 1, Math.floor(across * wheel.w));
    const depth = (across - 0.5) * wheel.w * swing;
    const dy = Math.round(depth * STEER_LEAN);
    const grow = Math.max(-1, Math.min(1, Math.round(depth * STEER_GROW)));
    const h = wheel.h + grow;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(wheel.h - 1, Math.floor(((y + 0.5) / h) * wheel.h));
      const ch = wheel.rows[sy]?.[sx];
      if (!ch || ch === ".") continue;
      const colour = wheel.palette[ch];
      if (!colour) continue;
      const tx = left + i;
      const ty = baseY + dy - grow + y;
      if (ty >= 0 && ty < px.length && tx >= 0 && tx < CANVAS.w) {
        px[ty][tx] = hex(colour);
      }
    }
  }
}

/**
 * HOW HARD THE BLOOD IS LIFTED BACK TOWARD TRUE RED after it has been
 * multiplied in — `render/hero-coat.ts` `GLOSS`, and it has to be that number:
 * this sheet exists to be judged instead of the running game, so a composite
 * that is merely similar is a sheet that lies about the thing under review.
 */
const GLOSS = 0.45;

/**
 * ONE PIXEL WITH THE FILM SOAKED INTO IT — the passes `soaked()` makes, done in
 * plain arithmetic because there is no canvas out here.
 *
 * THE LAYER ORDER IS THE WHOLE OF IT. `soaked()` builds the film WHOLE first —
 * every layer `source-over` into one scratch canvas — and only then multiplies
 * it in and lifts it back at GLOSS, ONCE. Soaking each layer in separately
 * instead applies the gloss once per layer, so a two-layer film (the wash and
 * the spatter over it) comes out visibly redder here than in the game, and the
 * sheet quietly stops being evidence.
 */
function soakPixel(base, film) {
  // The film, composited: premultiplied colour and coverage, layer by layer.
  let colour = [0, 0, 0];
  let alpha = 0;
  for (const { rgb, a } of film) {
    colour = colour.map((channel, i) => rgb[i] * a + channel * (1 - a));
    alpha = a + alpha * (1 - a);
  }
  if (alpha <= 0) return base;
  // Un-premultiply back to the colour the canvas holds, then `multiply` (which
  // is why the panel's outline and its paint colour keep reading through the
  // mess) and one `source-over` at GLOSS (which is what stops a dark surface
  // going to mud). The film is masked to the subject for free: this is only
  // ever called for a pixel the subject actually painted.
  const straight = colour.map((channel) => channel / alpha);
  const gloss = GLOSS * alpha;
  return base.map((channel, i) => {
    const multiplied = channel * (1 - alpha + (alpha * straight[i]) / 255);
    return Math.max(
      0,
      Math.min(255, Math.round(multiplied * (1 - gloss) + gloss * straight[i])),
    );
  });
}

/**
 * One assembled car onto an RGBA grid: per-panel damage rungs + per-wheel
 * states, plus the FIX ladder (`fixes.<part>`: 0 attached, 1 loose, 2
 * dangling, 3 gone — render/vehicles.ts picks the same sprites) and the
 * `lights` layer the running engine burns.
 *
 * `opts.coat` is what `carCoat()` handed back for this moment — the film each
 * panel wears, keyed by panel id. It is applied INSIDE the stamp, in the
 * sprite's own canvas coordinates and before the shear, because that is where
 * `soaked()` applies it: the blood is masked to the panel it is on, so a bent
 * bumper's blood follows the bend.
 */
function assemble(panelRungs, wheelStates, opts = {}) {
  const px = Array.from({ length: CANVAS.h + 6 }, () =>
    Array.from({ length: CANVAS.w }, () => null),
  );
  const stamp = (sprite, ox, oy, shear, film) => {
    sprite.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const colour = sprite.palette[ch];
        if (!colour) return;
        const tx = ox + x;
        const ty = oy + y + (shear ? shear(ox + x) : 0);
        if (ty < 0 || ty >= px.length || tx < 0 || tx >= CANVAS.w) return;
        const wet = [];
        for (const layer of film ?? []) {
          const char = layer.sprite.rows[y]?.[x];
          const bloodColour =
            char && char !== "." && layer.sprite.palette[char];
          if (!bloodColour) continue;
          wet.push({ rgb: hex(bloodColour), a: layer.alpha });
        }
        px[ty][tx] = wet.length > 0 ? soakPixel(hex(colour), wet) : hex(colour);
      });
    });
  };
  // The shell's PITCH (render/vehicles.ts axleDrop): each corner sinks by
  // what its wheel no longer holds up, interpolated across the body — a car
  // missing its front wheel sits nose-down.
  const drop = (state) =>
    state === 3 ? 4 : state === 1 ? 2 : state === 2 ? 1 : 0;
  const rearDrop = drop(wheelStates[0]);
  const frontDrop = drop(wheelStates[1]);
  const shear =
    rearDrop === frontDrop
      ? () => rearDrop
      : (x) => {
          const band = Math.floor(x / 8) * 8 + 4;
          const t = (band - WHEEL_AT[0]) / (WHEEL_AT[1] - WHEEL_AT[0]);
          return Math.round(rearDrop + (frontDrop - rearDrop) * t);
        };
  stamp(loadSprite("car_underbody"), 0, 0, shear);
  wheelStates.forEach((state, i) => {
    if (state === 3) return; // GONE — the wheel is off, the arch is bare
    const name =
      state === 1
        ? "car_wheel_flat"
        : state === 2
          ? "car_wheel_bent_0"
          : "car_wheel_0";
    const wheel = loadSprite(name);
    // The FRONT axle rides the rack: cranked, it is warped exactly the way
    // render/vehicles.ts warps it (drawSteeredWheel), so this sheet is how the
    // turn is judged without driving anything.
    if (i === 1 && Math.abs(opts.steer ?? 0) > 0.05) {
      stampSteered(px, wheel, WHEEL_AT[i], CANVAS.h - wheel.h, opts.steer);
      return;
    }
    stamp(wheel, WHEEL_AT[i] - Math.floor(wheel.w / 2), CANVAS.h - wheel.h);
  });
  const fixes = opts.fixes ?? {};
  for (const panel of PANELS) {
    const fix = fixes[panel] ?? 0;
    let name = `car_${panel}_${panelRungs[panel] ?? 0}`;
    if (fix === 3 || (panel === "roof" && fix === 2)) {
      name = `car_${panel}_gone`;
    } else if (fix === 2) {
      name = `car_${panel}_dangle_0`;
    }
    stamp(
      loadSprite(name),
      0,
      0,
      shear,
      (opts.coat?.[panel] ?? []).map((layer) => ({
        sprite: loadSprite(layer.sprite),
        alpha: layer.alpha,
      })),
    );
  }
  if (opts.lights) stamp(loadSprite("car_lights"), 0, 0, shear);
  return px;
}

function writePng(cars, path, scale = 6, pad = 6) {
  const bg = [150, 155, 165];
  const cols = Math.min(cars.length, 2);
  const rows = Math.ceil(cars.length / cols);
  const cellH = Math.max(...cars.map((car) => car.length));
  const W = cols * (CANVAS.w * scale + pad) + pad;
  const H = rows * (cellH * scale + pad) + pad;
  const img = Array.from({ length: H }, () => Array(W).fill(bg));
  cars.forEach((car, i) => {
    const ox = pad + (i % cols) * (CANVAS.w * scale + pad);
    const oy = pad + Math.floor(i / cols) * (cellH * scale + pad);
    car.forEach((row, y) =>
      row.forEach((colour, x) => {
        if (!colour) return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            img[oy + y * scale + dy][ox + x * scale + dx] = colour;
      }),
    );
  });
  const raw = Buffer.concat(
    img.map((row) =>
      Buffer.concat([Buffer.from([0]), Buffer.from(row.flat())]),
    ),
  );
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // rgb
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * THE ROAD, ACTUALLY DRIVEN — one leg of the driving minigame played by the
 * shipped auto-driver, drawn at six moments along it.
 *
 * The engine and the app's soak book are imported through the alias loader
 * (`scripts/game-alias-loader.mjs`), which is why this is a dynamic import: the
 * rest of this script is a YAML reader that starts instantly, and only this
 * mode is worth paying a module graph for.
 *
 * WHAT IT DOES NOT DRAW IS THE TYRES. The blood on the wheels comes off
 * `DriveGoreState.tyre` (`drive-screen/drive-gore.ts`), which reaches the
 * sprite atlas and so cannot be imported without a browser. The panels are what
 * this sheet is for, and every one of them is the real number.
 */
async function driveALeg() {
  register("./game-alias-loader.mjs", import.meta.url);
  const drive = await import(`${root}engine/game/drive/index.ts`);
  const soak = await import(`${root}pwa/src/game/drive-screen/car-soak.ts`);
  const { DRIVE, DRIVE_OUTCOME } = drive;
  const home = args.includes("--home");
  const params = {
    seed: Number(opt("seed", "1")),
    direction: home ? -1 : 1,
    to: home ? "garage" : "goodco_hq",
    difficulty: opt("difficulty", "medium"),
    gib: true,
    split: true,
  };
  const leg = drive.createDrive(params);
  const driver = drive.createDriveDriver();
  const car = soak.cleanCar();
  // The engine's own fixed step, and the app's — the soak is a RATE in two of
  // its three parts, so a sheet stepped at anything else is a sheet of a
  // different car (drive-screen/drive-gore.ts STEP_MS).
  const STEP_MS = 16;
  const frames = [];
  while (leg.outcome === DRIVE_OUTCOME.driving && leg.ms < 180000) {
    drive.stepDrive(leg, STEP_MS, drive.driveDriverInput(driver, leg));
    for (const strike of leg.strikes) {
      soak.soakCarFromStrike(
        car,
        strike.panel,
        strike.vz,
        // `splashForce` (drive-screen/drive-gore.ts) — the collision in
        // remainForce units, which is what the soak book is priced in.
        strike.joules / (DRIVE.impact.wearJoules * DRIVE.gore.splitJoules),
      );
    }
    soak.smearCarSoak(car, leg.car.speed, STEP_MS);
    frames.push({
      ms: leg.ms,
      bodies: leg.bodies,
      panels: { ...leg.car.panels },
      coat: soak.carCoat(car),
      soak: { ...car },
    });
  }
  // Six moments spread over the part of the leg that has blood in it: the
  // OUTSKIRTS are deliberately empty, so spreading over the whole trip spends
  // two cells on a showroom-clean car and tells you nothing.
  const first = frames.findIndex((frame) => frame.bodies > 0);
  const from = first < 0 ? 0 : first;
  const picks = [];
  for (let i = 0; i < 6; i++) {
    picks.push(frames[Math.round(from + ((frames.length - 1 - from) * i) / 5)]);
  }
  for (const frame of picks) {
    console.log(
      `  ${(frame.ms / 1000).toFixed(0).padStart(3)}s  ${String(frame.bodies).padStart(3)} bodies  ` +
        PANELS.map((panel) => `${panel} ${frame.soak[panel].toFixed(2)}`).join(
          "  ",
        ),
    );
  }
  return picks.map((frame) =>
    assemble(frame.panels, [0, 0], { coat: frame.coat, lights: true }),
  );
}

/**
 * THE FILM LADDER — the whole car at one soak, at six soaks up the range.
 *
 * The companion to `--gore`, and it answers the other half of the question: the
 * leg says whether the GRADIENT reads, this says whether the RUNGS do. Every
 * panel is set to the same number, so what the sheet shows is purely the
 * ladder — the three rungs of art, and the alpha each is laid at.
 */
async function filmLadder() {
  register("./game-alias-loader.mjs", import.meta.url);
  const soak = await import(`${root}pwa/src/game/drive-screen/car-soak.ts`);
  const levels = (opt("at", "0.05,0.12,0.25,0.45,0.7,0.92") || "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return levels.map((level) => {
    const coat = soak.carCoat(
      Object.fromEntries(PANELS.map((panel) => [panel, level])),
    );
    const film = coat.doors ?? [];
    console.log(
      `  soak ${level.toFixed(2)}  ${film.length ? film.map((l) => `${l.sprite} @ ${l.alpha.toFixed(2)}`).join(" + ") : "clean"}`,
    );
    return assemble(flat(0), [0, 0], { coat, lights: true });
  });
}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const out =
  args[
    args.indexOf("--out") + 1 && args.indexOf("--out") >= 0
      ? args.indexOf("--out") + 1
      : -1
  ] ?? `${root}pwa/assets-preview/car_states.png`;

const flat = (rung) => Object.fromEntries(PANELS.map((panel) => [panel, rung]));
const cars = [
  assemble(flat(0), [0, 0]), // showroom
  assemble(flat(0), [0, 0], { lights: true }), // engine running, lamps lit
  assemble(flat(1), [0, 0]), // bumped
  assemble(flat(2), [1, 0]), // hammered, rear flat
  assemble(flat(3), [2, 2]), // broken, both rims bent
];
if (args.includes("--mixed")) {
  cars.push(
    // The hard-luck mix: a nose-first crash — bumper torn off, hood
    // hammered and DANGLING, doors scuffed, rear untouched, front rim bent.
    assemble(
      {
        backside: 0,
        doors: 1,
        roof: 0,
        hood: 2,
        front_side: 2,
        bumper: 3,
        glass: 2,
      },
      [0, 2],
      { fixes: { hood: 2, bumper: 3 } },
    ),
    // The write-off: everything broken, doors dangling, roof torn away,
    // rear wheel flat, front wheel GONE entirely.
    assemble(
      {
        backside: 3,
        doors: 3,
        roof: 2,
        hood: 3,
        front_side: 3,
        bumper: 3,
        glass: 3,
      },
      [1, 3],
      { fixes: { doors: 2, hood: 3, bumper: 3, roof: 3 } },
    ),
  );
}
if (args.includes("--gore")) {
  cars.length = 0;
  cars.push(...(await driveALeg()));
}
if (args.includes("--film")) {
  cars.length = 0;
  cars.push(...(await filmLadder()));
}
if (args.includes("--steer")) {
  // THE RACK, lock to lock: the front wheel cranked full right, half right,
  // straight, half left and full left (CAR.steerLock ≈ 34°, vehicles.ts).
  const LOCK = Math.PI * 0.19;
  for (const steer of [LOCK, LOCK / 2, 0, -LOCK / 2, -LOCK]) {
    cars.push(assemble(flat(0), [0, 0], { steer }));
  }
}
writePng(cars, out);
console.log(`wrote ${out} (${cars.length} states)`);
