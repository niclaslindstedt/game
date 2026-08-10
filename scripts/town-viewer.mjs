#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TOWN VIEWER — assemble the road to GOODCO's buildings exactly the way the
// game assembles them, and write a sheet PNG.
//
// It is the LOOK half of the loop the town is built in, and it exists for the
// same reason `car-viewer.mjs` does: the buildings are ASSEMBLED rather than
// drawn (`engine/game/drive/town-plan.ts`), so there is no file anywhere whose
// contents are what the player sees. A shell in the previews tells you the wall
// generator works; it tells you nothing about whether the street does — whether
// the row has a rhythm, whether the skyline has a shape, whether the hero's end
// reads as abandoned and GOODCO's as bought.
//
// IT RUNS THE REAL PLANNER. Every strip below is `planTown` at a real distance
// along a real leg, composed in the real draw order — so a building that shows
// up wrong here is wrong in the game, and a fix that reads here reads there.
//
//   node scripts/town-viewer.mjs                     # five stops along the leg
//   node scripts/town-viewer.mjs --at 0.5            # one stretch, in detail
//   node scripts/town-viewer.mjs --at 0.5 --width 340  # …a screenful of it
//   node scripts/town-viewer.mjs --shells            # every archetype, clean
//   node scripts/town-viewer.mjs --site goodco       # what the leg pulls into
//   node scripts/town-viewer.mjs --site home         # …and the way back
//   node scripts/town-viewer.mjs --site home --from 700 --to 1400   # a screenful
//   node scripts/town-viewer.mjs --out some.png
//
// THE SITE MODE IS THE SAME LOOK FOR THE OTHER HALF OF THE ROAD. What a leg
// ARRIVES at is assembled the same way the street is (`sites.ts`) and is just as
// invisible in the per-sprite previews: a house in isolation tells you the
// generator works, and only the run-in tells you whether the plot reads as
// somewhere a man lives.
//
// Output defaults to pwa/assets-preview/town.png.

import { mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
register("./game-alias-loader.mjs", import.meta.url);

const { planTown } = await import(
  path.join(root, "engine/game/drive/town-plan.ts")
);
const { driveSite, planSite, siteSpanX, siteVehicles } = await import(
  path.join(root, "engine/game/drive/sites.ts")
);
const { TOWN, TOWN_COLOURWAYS, townHeight, townWidth } = await import(
  path.join(root, "engine/game/drive/town.ts")
);
const { cityEndPx, DRIVE } = await import(
  path.join(root, "engine/game/drive/config.ts")
);
const { SPRITES, SPRITE_PALETTES } = await import("./sprite-data/index.mjs");
const { gridToSurface } = await import("./asset-tools/grid.mjs");
const { blit, createSurface, fill, upscale } =
  await import("./asset-tools/surface.mjs");
const { writePng } = await import("./asset-tools/preview.mjs");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const outPath = opt("out", path.join(root, "pwa/assets-preview/town.png"));
const scale = Number(opt("scale", "3"));
const shellsOnly = args.includes("--shells");
/** How much road a stretch shows (world px). A screenful on the reference phone
 * is about 420, and the default is a screenful and a half — narrow it when the
 * question is about one building rather than about the rhythm of a row. */
const stripPx = Number(opt("width", "640"));
const only = opt("at", null);
const siteName = opt("site", null);

/** The night the road is driven on, so a wall reads the way it will in play
 * rather than the way it does on a white sheet. */
const NIGHT = [26, 30, 44, 255];
const VERGE = [34, 46, 34, 255];

const surfaceFor = (name) => {
  const grid = SPRITES[name];
  if (!grid) return null;
  return gridToSurface(grid, SPRITE_PALETTES[name]);
};

/** One stretch of street, composed the way the renderer composes it: buildings
 * back to front, then the frontage in front of them. */
function strip(t, widthPx) {
  // THROUGH THE TOWN rather than through the leg. The road opens on an outskirt
  // with no houses on it at all (`DRIVE.opening.cityPx`), so `t` is a position
  // in the STREET — 0 at the first house, 1 at GOODCO's gate — which is what
  // every stop below means and what `townDistrict` itself measures.
  const road = {
    direction: 1,
    coursePx: DRIVE.coursePx,
    cityPx: DRIVE.opening.cityPx,
  };
  // …AND IT ENDS AT THE TOWN'S OWN GATE rather than at the finish. The last
  // stretch of a leg is the destination's run-in and has no houses on it at all
  // (`cityEndPx`), so measuring the stop against `coursePx` put `--at 1` past
  // the end of the row and quietly answered the question with an empty verge.
  const x0 = Math.round(
    road.cityPx +
      t *
        (cityEndPx({ coursePx: road.coursePx, cityPx: road.cityPx }) -
          road.cityPx),
  );
  const props = planTown(x0, x0 + widthPx, road);
  if (!props.length) return createSurface(widthPx, 8);
  // THE NEAREST THING IN THE PICTURE STANDS ON THE GROUND LINE, and everything
  // further back is lifted by the world y it stands at — which is the whole of
  // the drive's projection at yaw 0, and enough to judge a street by.
  const nearest = Math.max(...props.map((p) => p.y));
  const groundY = 10;
  // …so the canvas has to reach the highest ROOF, and a piece standing further
  // back is drawn HIGHER: its lift comes OFF its screen top rather than being
  // added to it. Added, the sheet came out 18 px short — twice the gap between
  // the frontage line and the building line — and every roof on the road was
  // sliced off at exactly the height nobody thought to measure.
  const top = Math.min(...props.map((p) => groundY - (nearest - p.y) - p.h));
  const height = Math.round(groundY - top) + 8;
  const base = height - 8;
  const out = createSurface(widthPx, height);
  fill(out, NIGHT);
  for (let y = base; y < height; y++)
    for (let x = 0; x < widthPx; x++)
      out.data.set(VERGE, (y * widthPx + x) * 4);
  // Sorted by base y, exactly as the drive's own painter's pass sorts them: the
  // frontage stands nearer the camera than the building it fences.
  for (const prop of [...props].sort((a, b) => a.y - b.y)) {
    const px = Math.round(prop.x - prop.w / 2 - x0);
    const py = base - Math.round(nearest - prop.y) - prop.h;
    for (const layer of prop.layers) {
      const art = surfaceFor(layer.sprite);
      if (!art) {
        console.error(`town-viewer: no sprite "${layer.sprite}"`);
        continue;
      }
      blit(out, art, px + layer.x, py + layer.y);
    }
  }
  return out;
}

/**
 * THE RUN-IN — what the leg pulls into, composed exactly as the game composes
 * it.
 *
 * The whole site end to end in one strip, from its boundary to the far end of
 * it, so the arrangement can be judged as a sequence: the gate arriving, the
 * frontage going by, and the thing on the skyline standing over the lot.
 */
function site(id) {
  const to = id === "home" ? "garage" : "goodco_hq";
  const layout = driveSite(to);
  const road = {
    direction: 1,
    coursePx: DRIVE.coursePx,
    cityPx: DRIVE.opening.cityPx,
  };
  const full = siteSpanX(road, layout);
  const finishX = road.direction * road.coursePx;
  // A WINDOW ON THE PLOT, because a run-in is two thousand px long and a
  // screenful is four hundred: judged whole it is a strip nobody can see, and
  // judged a screen at a time it is what the player gets.
  const span = {
    fromX:
      opt("from", null) === null ? full.fromX : finishX + Number(opt("from")),
    toX: opt("to", null) === null ? full.toX : finishX + Number(opt("to")),
  };
  const widthPx = Math.round(span.toX - span.fromX);
  const props = planSite(span.fromX, span.toX, road, layout);
  const cars = siteVehicles(span.fromX, span.toX, road, layout);
  const placed = [
    ...props.map((p) => ({ y: p.y, prop: p })),
    ...cars.map((c) => ({ y: c.y, car: c })),
  ];
  if (!placed.length) return createSurface(widthPx, 8);
  const nearest = Math.max(...placed.map((p) => p.y));
  // HOW FAR A PIECE IS LIFTED off the ground line is how far BEHIND the nearest
  // thing in the picture it stands — the whole of the drive's projection at yaw
  // 0, and enough to judge a plot by.
  const lift = (y) => nearest - y;
  // The ground line sits under the TALLEST lifted piece rather than under the
  // tallest sprite: the ship stands twenty px further back than the house, so a
  // canvas sized off the art alone crops the nose off it.
  const base = Math.max(...props.map((p) => lift(p.y) + p.h), 48);
  const height = base + 10;
  const out = createSurface(widthPx, height);
  fill(out, NIGHT);
  for (const item of placed.sort((a, b) => a.y - b.y)) {
    if (item.car) {
      const art = surfaceFor(item.car.sprite);
      if (!art) continue;
      blit(
        out,
        art,
        Math.round(item.car.x - art.width / 2 - span.fromX),
        base - Math.round(lift(item.car.y)) - art.height,
      );
      continue;
    }
    const prop = item.prop;
    const px = Math.round(prop.x - prop.w / 2 - span.fromX);
    const py = base - Math.round(lift(prop.y)) - prop.h;
    for (const layer of prop.layers) {
      const art = surfaceFor(layer.sprite);
      if (!art) {
        console.error(`town-viewer: no sprite "${layer.sprite}"`);
        continue;
      }
      blit(out, art, px + layer.x, py + layer.y);
    }
  }
  return out;
}

/** Every archetype in every colourway, clean — the generator's own contact
 * sheet, for judging a wall gauge or a roofline on its own. */
function shells() {
  const pad = 4;
  const perRow = 6;
  let cw = 0;
  let ch = 0;
  for (const def of TOWN) {
    cw = Math.max(cw, townWidth(def));
    ch = Math.max(ch, townHeight(def));
  }
  const cols = perRow * TOWN_COLOURWAYS.length;
  const rows = Math.ceil(TOWN.length / perRow);
  const out = createSurface(cols * (cw + pad) + pad, rows * (ch + pad) + pad);
  fill(out, NIGHT);
  TOWN.forEach((def, i) => {
    TOWN_COLOURWAYS.forEach((suffix, c) => {
      const art = surfaceFor(`${def.id}${suffix}`);
      if (!art) return;
      const col = (i % perRow) * TOWN_COLOURWAYS.length + c;
      const row = Math.floor(i / perRow);
      blit(
        out,
        art,
        pad + col * (cw + pad),
        pad + row * (ch + pad) + (ch - art.height),
      );
    });
  });
  return out;
}

function stack(surfaces, gap = 6) {
  const w = Math.max(...surfaces.map((s) => s.width));
  const h = surfaces.reduce((sum, s) => sum + s.height + gap, gap);
  const out = createSurface(w, h);
  fill(out, [12, 14, 22, 255]);
  let y = gap;
  for (const s of surfaces) {
    blit(out, s, 0, y);
    y += s.height + gap;
  }
  return out;
}

mkdirSync(path.dirname(outPath), { recursive: true });
const STOPS = only ? [Number(only)] : [0, 0.25, 0.5, 0.75, 1];
const sheet = siteName
  ? site(siteName)
  : shellsOnly
    ? shells()
    : stack(STOPS.map((t) => strip(t, stripPx)));
await writePng(upscale(sheet, scale), outPath);
if (siteName) {
  console.log(`wrote the ${siteName} run-in → ${outPath}`);
} else
  console.log(
    shellsOnly
      ? `wrote ${TOWN.length} archetypes x ${TOWN_COLOURWAYS.length} colourways → ${outPath}`
      : `wrote ${STOPS.length} stretch(es) of road (district ${STOPS.map((t) => t.toFixed(2)).join(", ")}) → ${outPath}`,
  );
