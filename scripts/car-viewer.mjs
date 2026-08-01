#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR VIEWER — assemble the hero's hatchback from its part sprites in
// any combination of damage states, and write a comparison sheet PNG.
//
// The car is a MACHINE, not a picture (src/game/vehicles.ts): six body
// panels (`car_<panel>_<rung>`, rung 0..3: factory straight → bumped →
// hammered → broken) stacked on one shared canvas over two wheels
// (`car_wheel_*`: sound spin frames, a flat tire, a bent rim). This script
// is how a panel edit is JUDGED — assemble, look, refine — and how the
// driving minigame's damage matrix is previewed without driving anything.
//
//   node scripts/car-viewer.mjs                 # the ladder: all rungs 0..3
//   node scripts/car-viewer.mjs --mixed         # + a hard-luck mix row
//   node scripts/car-viewer.mjs --out some.png  # elsewhere
//
// Output defaults to pwa/assets-preview/car_states.png.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const SPRITES = `${root}content/sprites/goodco`;

// Draw order mirrors render/vehicles.ts: wheels, then panels, roof last.
const PANELS = ["backside", "doors", "hood", "front_side", "bumper", "roof", "glass"];
const WHEEL_AT = [10, 36]; // wheel centers on the 48-wide part canvas
const CANVAS = { w: 48, h: 26 };

function loadSprite(name) {
  const doc = parse(readFileSync(`${SPRITES}/${name}.yaml`, "utf8"));
  const rows = doc.grid
    .split("\n")
    .map((r) => r.trimEnd())
    .filter((r) => r.length > 0);
  return { rows, palette: doc.palette, w: doc.size[0], h: doc.size[1] };
}

function hex(colour) {
  return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
}

/** One assembled car: per-panel rungs + per-wheel states onto an RGBA grid. */
function assemble(panelRungs, wheelStates) {
  const px = Array.from({ length: CANVAS.h }, () =>
    Array.from({ length: CANVAS.w }, () => null),
  );
  const stamp = (sprite, ox, oy) => {
    sprite.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const colour = sprite.palette[ch];
        if (!colour) return;
        const tx = ox + x;
        const ty = oy + y;
        if (ty >= 0 && ty < CANVAS.h && tx >= 0 && tx < CANVAS.w) {
          px[ty][tx] = hex(colour);
        }
      });
    });
  };
  stamp(loadSprite("car_underbody"), 0, 0);
  wheelStates.forEach((state, i) => {
    const name =
      state === 1
        ? "car_wheel_flat"
        : state === 2
          ? "car_wheel_bent_0"
          : "car_wheel_0";
    const wheel = loadSprite(name);
    stamp(wheel, WHEEL_AT[i] - Math.floor(wheel.w / 2), CANVAS.h - wheel.h);
  });
  for (const panel of PANELS) {
    stamp(loadSprite(`car_${panel}_${panelRungs[panel] ?? 0}`), 0, 0);
  }
  return px;
}

function writePng(cars, path, scale = 6, pad = 6) {
  const bg = [150, 155, 165];
  const cols = Math.min(cars.length, 2);
  const rows = Math.ceil(cars.length / cols);
  const W = cols * (CANVAS.w * scale + pad) + pad;
  const H = rows * (CANVAS.h * scale + pad) + pad;
  const img = Array.from({ length: H }, () => Array(W).fill(bg));
  cars.forEach((car, i) => {
    const ox = pad + (i % cols) * (CANVAS.w * scale + pad);
    const oy = pad + Math.floor(i / cols) * (CANVAS.h * scale + pad);
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

const args = process.argv.slice(2);
const out =
  args[args.indexOf("--out") + 1 && args.indexOf("--out") >= 0
    ? args.indexOf("--out") + 1
    : -1] ?? `${root}pwa/assets-preview/car_states.png`;

const flat = (rung) =>
  Object.fromEntries(PANELS.map((panel) => [panel, rung]));
const cars = [
  assemble(flat(0), [0, 0]), // showroom
  assemble(flat(1), [0, 0]), // bumped
  assemble(flat(2), [1, 0]), // hammered, rear flat
  assemble(flat(3), [2, 2]), // broken, both rims bent
];
if (args.includes("--mixed")) {
  // The hard-luck mix: a nose-first crash — bumper gone, hood hammered,
  // doors scuffed, rear untouched, front rim bent.
  cars.push(
    assemble(
      { backside: 0, doors: 1, roof: 0, hood: 2, front_side: 2, bumper: 3 },
      [0, 2],
    ),
  );
}
writePng(cars, out);
console.log(`wrote ${out} (${cars.length} states)`);
