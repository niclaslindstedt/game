#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL RENDER — an HONEST, full-resolution top-down render of a level drawn
// with the REAL in-game pixel sprites, so you can SEE how a map actually looks
// in play (unlike `map-preview.mjs`, which is a schematic diagram of circles,
// zones, and a legend). It composites, at true world scale, exactly what the
// engine's render.ts draws on the ground plane: the ground/patch tiles, the
// scattered `decor`, every solid `obstacle` (walls, doors, buildings, crates,
// servers…), the `landmarks`, and every mob + boss at its real position and
// its real sprite size — from a live `createGame(seed)`.
//
//   node scripts/level-render.mjs <id>
//     [--seed N] [--difficulty easy|medium|hard|nightmare|jesus]
//     [--zoom N]        integer nearest-neighbour upscale (default 2)
//     [--all]           render every level
//
// Output → website/assets-preview/level_<id>.png. This is the measuring
// instrument for an art pass: render, look, fix the sprites, render again.

import { register } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { writePng } from "./asset-tools/preview.mjs";
import { renderText } from "./asset-tools/font.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import {
  blit,
  createSurface,
  fill,
  fillRect,
  strokeCircle,
  strokeRect,
  upscale,
} from "./asset-tools/surface.mjs";
import { SPRITES, SPRITE_PALETTES } from "./sprite-data/index.mjs";
import { loadLevels } from "./level-data/load-yaml.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { createGame } = await import(engine("src/index.ts"));
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));

const previewDir = engine("website/assets-preview");
mkdirSync(previewDir, { recursive: true });

const TILE = 16; // mirrors render.ts

// ---- sprite surfaces (cached) ---------------------------------------------
const surfCache = new Map();
/** Resolve a sprite name to a rendered RGBA surface, or null if unknown.
 * Accepts a bare name (`papers`) or an animation stem (`doge_1` → `doge_1_0`). */
function spriteSurface(name) {
  if (!name) return null;
  if (surfCache.has(name)) return surfCache.get(name);
  const key = SPRITES[name] ? name : SPRITES[`${name}_0`] ? `${name}_0` : null;
  const surf = key ? gridToSurface(SPRITES[key], SPRITE_PALETTES[key]) : null;
  surfCache.set(name, surf);
  return surf;
}

/** Blit a sprite centred on a world point (the engine's obstacle/decor/enemy
 * convention: pos − sprite/2). `anchorBase` drops the sprite so its FEET sit on
 * the point (landmarks with anchor:"base"). Returns whether it drew. */
function blitCentred(dst, name, x, y, anchorBase = false) {
  const s = spriteSurface(name);
  if (!s) return false;
  const dx = Math.round(x - s.width / 2);
  const dy = anchorBase
    ? Math.round(y - (s.height - 2))
    : Math.round(y - s.height / 2);
  blit(dst, s, dx, dy);
  return true;
}

// ---- ground tiling (mirrors render.ts groundTile/tileHash) ----------------
function tileHash(tx, ty) {
  return (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
}
function groundName(tiles, tx, ty) {
  const zone = (tiles.zones ?? []).find(
    (z) =>
      tx * TILE >= z.rect.x &&
      tx * TILE < z.rect.x + z.rect.width &&
      ty * TILE >= z.rect.y &&
      ty * TILE < z.rect.y + z.rect.height,
  );
  const ground = zone?.ground ?? tiles.ground;
  const patch = zone ? zone.patch : tiles.patch;
  if (patch && tileHash(tx >> 2, ty >> 2) % patch.every === 0) {
    return tileHash(tx, ty) % 2 === 0 ? patch.a : patch.b;
  }
  const { common, rare, rareEvery } = ground;
  return tileHash(tx, ty) % rareEvery === 0 ? rare : common;
}

// ---- showcase overlay ------------------------------------------------------
// The surface is 1:1 world px, so world coords ARE image coords here.
const ROLE_COLOR = {
  boss: [255, 90, 90, 255],
  elite: [255, 170, 70, 255],
  minion: [230, 230, 235, 255],
};

/** A small label with a dark backing so it reads over the art. */
function label(surf, text, x, y, color = [235, 235, 240, 255]) {
  const clean = String(text).toUpperCase().replace(/_/g, " ");
  const t = renderText(clean, color);
  fillRect(surf, x - 1, y - 1, t.width + 2, t.height + 2, [0, 0, 0, 205]);
  blit(surf, t, x, y);
  return t.width;
}

/** Outline every design zone, landmark, pinned elite/boss, merchant and the
 * spawn — so the render SHOWCASES every part of the level, not just the art. */
function drawShowcase(surf, def) {
  const zoneEdge = [220, 220, 230, 210];
  // Room + design zones (quiet pockets, safe strips) — outline + name.
  for (const z of [...(def.quietZones ?? []), ...(def.safeZones ?? [])]) {
    if (z.rect) {
      strokeRect(
        surf,
        z.rect.x,
        z.rect.y,
        z.rect.width,
        z.rect.height,
        zoneEdge,
        2,
      );
      if (z.label)
        label(surf, z.label, z.rect.x + 4, z.rect.y + 4, [180, 210, 255, 255]);
    } else if (z.pos) {
      strokeCircle(surf, z.pos.x, z.pos.y, z.radius, zoneEdge, 2);
      if (z.label)
        label(
          surf,
          z.label,
          z.pos.x - z.radius + 4,
          z.pos.y - 4,
          [140, 240, 180, 255],
        );
    }
  }
  // Landmarks (entrance, prototype rocket…).
  for (const lm of def.landmarks ?? [])
    label(surf, lm.kind, lm.pos.x + 6, lm.pos.y - 6, [180, 180, 200, 255]);
  // Merchant spawn nooks.
  for (const m of def.merchantSpawns ?? [])
    label(surf, "SHOP", m.x + 4, m.y - 4, [90, 220, 220, 255]);
  // Player start.
  label(
    surf,
    "START",
    def.playerSpawn.x + 6,
    def.playerSpawn.y - 4,
    [110, 230, 150, 255],
  );
  // Pinned elites / unique / boss — named, coloured by role.
  for (const s of def.spawns ?? []) {
    if (!s.at) continue;
    const d = ENEMY_DEFS[s.enemy];
    const col = ROLE_COLOR[d?.role ?? "minion"] ?? ROLE_COLOR.minion;
    label(surf, d?.name ?? s.enemy, s.at.x + 10, s.at.y - 6, col);
  }
}

// ---- render one level ------------------------------------------------------
function renderLevel(def, opts) {
  const state = createGame(opts.seed, def.id, opts.difficulty);
  const W = def.width;
  const H = def.height;
  const surf = fill(createSurface(W, H), [12, 12, 16, 255]);

  // 1. Ground + patch tiles.
  const tilesX = Math.ceil(W / TILE);
  const tilesY = Math.ceil(H / TILE);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const s = spriteSurface(groundName(def.tiles, tx, ty));
      if (s) blit(surf, s, tx * TILE, ty * TILE);
    }
  }

  // 2. Decor (flat, non-colliding scenery) — under everything.
  for (const d of state.decor) blitCentred(surf, d.sprite, d.pos.x, d.pos.y);

  // 3. Landmarks (entrance, prototype rocket…).
  for (const lm of state.landmarks)
    blitCentred(surf, lm.sprite, lm.pos.x, lm.pos.y, lm.anchor === "base");

  // 4. Obstacles — walls, doors, buildings, crates, servers, vending… all
  //    carry their own sprite name from create.ts.
  for (const o of state.obstacles)
    blitCentred(surf, o.sprite, o.pos.x, o.pos.y);

  // 5. Mobs + boss at their real spawn positions and real sprite sizes.
  const counts = new Map();
  for (const e of state.enemies) {
    const family = ENEMY_DEFS[e.defId]?.sprite ?? e.defId;
    blitCentred(surf, `${family}_0`, e.pos.x, e.pos.y);
    counts.set(e.defId, (counts.get(e.defId) ?? 0) + 1);
  }

  // 6. Showcase overlay — label every zone, room, landmark, elite, boss,
  //    merchant and the spawn (unless --bare, for a pure art view).
  if (!opts.bare) drawShowcase(surf, def);

  // Thin title strip so the render is self-identifying.
  const title = renderText(
    `${def.name}  ${def.id}  seed ${opts.seed} ${opts.difficulty}  ${W}x${H}`.toUpperCase(),
    [235, 235, 240, 255],
  );
  fillRect(surf, 0, 0, title.width + 6, title.height + 6, [0, 0, 0, 200]);
  blit(surf, title, 3, 3);

  const out = `${previewDir}/level_${def.id}.png`;
  return { state, surf, out, counts };
}

// ---- entry -----------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    seed: 1,
    difficulty: "medium",
    zoom: 2,
    all: false,
    bare: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--bare") opts.bare = true;
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--difficulty") opts.difficulty = argv[++i];
    else if (a === "--zoom") opts.zoom = Math.max(1, Number(argv[++i]));
    else rest.push(a);
  }
  opts.id = rest[0];
  return opts;
}

const { entries } = loadLevels();
const opts = parseArgs(process.argv.slice(2));
const targets = opts.all
  ? entries
  : entries.filter((e) => e.def.id === opts.id);

if (!targets.length) {
  console.error(
    `unknown level "${opts.id}" — try: ${entries.map((e) => e.def.id).join(", ")}`,
  );
  process.exit(1);
}

for (const entry of targets) {
  const { surf, out, counts } = renderLevel(entry.def, opts);
  await writePng(opts.zoom > 1 ? upscale(surf, opts.zoom) : surf, out);
  const roster = [...counts.entries()]
    .map(([id, n]) => `${id}×${n}`)
    .join(", ");
  console.log(
    `wrote ${out} (${surf.width * opts.zoom}x${surf.height * opts.zoom}) — mobs: ${roster || "none"}`,
  );
}
