#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TWO-WHEELERS, WITH THE PEOPLE ON THEM — every machine on the drive's road
// composed with the rider the fleet seats on it, at the offsets the game uses.
//
// IT EXISTS BECAUSE NEITHER HALF IS THE THING. A `rider_*` sprite on its own is
// a person floating in the air and a `traffic_*` sprite on its own is a
// riderless machine; what ships is the PAIR, assembled at runtime from
// `DriveVehicleDef.rider` and `RIDER_SEATS` (pwa/src/game/drive-screen/
// scenery.ts). Judging the two separately is how a rider ends up sitting behind
// the saddle, standing on the engine, or — the case that started this — reading
// as somebody who happens to be walking past a moped.
//
// It is `car-viewer.mjs` for the small stuff: the real tables, the real seats,
// the real order (machine first, rider over it), so a pair that reads here reads
// on the road.
//
//   node scripts/rider-viewer.mjs                 # every machine, 8x
//   node scripts/rider-viewer.mjs --scale 12
//   node scripts/rider-viewer.mjs --out some.png
//
// Output defaults to pwa/assets-preview/riders.png.

import { mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
register("./game-alias-loader.mjs", import.meta.url);

const { FLEET } = await import(path.join(root, "engine/game/drive/fleet.ts"));
const { SPRITES, SPRITE_PALETTES, FAMILIES } = await import(
  path.join(root, "scripts/sprite-data/index.mjs")
);
const { createSurface, fill, upscale } = await import(
  path.join(root, "scripts/asset-tools/surface.mjs")
);
const { writePng } = await import(
  path.join(root, "scripts/asset-tools/preview.mjs")
);

// THE SEATS AND THE RIDER ROSTER, RESTATED — the app's own tables live in a
// `.ts` module that imports the browser's world, so a plain node script cannot
// reach them. Kept in the same order and pinned by `drive_scenery_test.ts`,
// which is what stops this viewer showing a seating the game does not use.
const RIDER_SPRITES = [
  "rider_biker",
  "rider_commuter",
  "rider_courier",
  "rider_delivery",
  "rider_cyclist",
  "rider_skater",
];
const RIDER_SEATS = {
  traffic_motorcycle: { dx: 4, dy: 3 },
  traffic_scooter: { dx: 2, dy: 4 },
  traffic_ebike: { dx: 6, dy: 5 },
  traffic_delivery_moped: { dx: 5, dy: 4 },
  traffic_bicycle: { dx: 3, dy: 5 },
  traffic_skateboard: { dx: 1, dy: 1 },
};

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : args[at + 1];
};
const scale = Number(argOf("--scale", 8));
const outPath = path.resolve(
  root,
  argOf("--out", "pwa/assets-preview/riders.png"),
);

/** The night ground these are seen on, so a dark machine is judged against the
 * tarmac rather than against white. */
const ROAD = [0x31, 0x33, 0x3c, 255];

/** Paint one grid onto a surface at (ox, oy), skipping transparency. */
function draw(surface, name, ox, oy) {
  const grid = SPRITES[name];
  if (!grid) throw new Error(`no sprite "${name}"`);
  const family = FAMILIES.find((f) => f.name === "earth");
  const palette = { ...family.palette, ...SPRITE_PALETTES[name] };
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      const rgba = palette[ch];
      if (!rgba) throw new Error(`sprite "${name}": no palette for "${ch}"`);
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) {
        continue;
      }
      const at = (py * surface.width + px) * 4;
      surface.data.set(rgba, at);
    }
  }
}

// One cell per machine that carries a rider, plus the riders on their own in a
// row underneath — because half of judging a seated body is judging the pose
// with nothing under it to explain it away.
// `--only <id>` narrows the sheet to one machine, which is the only way to look
// at a 48x26 pair at a scale where a rider's ARM is a thing you can see.
const only = argOf("--only", "");
const seated = FLEET.filter(
  (def) => def.rider !== null && (!only || def.id.includes(only)),
);
const CELL_W = 52;
const CELL_H = 30;
const cols = seated.length;
const width = cols * CELL_W;
const height = CELL_H + 20;
const sheet = createSurface(width, height);
fill(sheet, ROAD);

seated.forEach((def, i) => {
  const ox = i * CELL_W + 2;
  draw(sheet, def.id, ox, 2);
  const seat = RIDER_SEATS[def.id];
  const rider = RIDER_SPRITES[def.rider];
  if (!seat || !rider) return;
  // THE GAME'S OWN SEATING, arithmetic for arithmetic (`putRider`): the machine
  // is anchored at its own bottom-centre and the rider is placed at the
  // machine's centre plus `dx`, with their feet `dy` px above the machine's.
  const machine = SPRITES[def.id];
  const body = SPRITES[rider];
  const mw = machine[0].length;
  const mh = machine.length;
  const bw = body[0].length;
  const bh = body.length;
  draw(
    sheet,
    rider,
    ox + Math.round(mw / 2) + seat.dx - Math.round(bw / 2),
    2 + mh - bh - seat.dy,
  );
});

// …and the bare riders in a strip under the machines.
RIDER_SPRITES.forEach((name, i) => {
  draw(sheet, name, i * 20 + 2, CELL_H + 2);
});

mkdirSync(path.dirname(outPath), { recursive: true });
await writePng(upscale(sheet, scale), outPath);
console.log(
  `wrote ${seated.length} machine(s) with riders + ${RIDER_SPRITES.length} bare rider(s) → ${outPath}`,
);
