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
//     [--dormant]       also draw the sleeping packs and each spawn point's
//                       queued mobs, so the map shows what actually lives there
//                       rather than only what is minted at creation
//     [--bare]          no labels and no title strip — a pure art view
//     [--all]           render every level
//     [--generated]     render the mission as GENERATED MAPS carves it (see
//                       src/game/mapgen) instead of as it is hand-authored
//     [--size N]        small|medium|large — the generated carve's scale
//
// Output → pwa/assets-preview/level_<id>.png (or level_<id>_generated.png). This
// is the measuring instrument for an art pass — render, look, fix the sprites,
// render again — and, with --generated --dormant, for a MAP-BLUEPRINT pass: the
// only honest way to judge whether a carved chamber grid reads as a place worth
// searching is to look at it drawn with the real sprites and the real horde
// standing in it.

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
// WHICH ground sprite goes in a cell is the RENDERER's own rule, imported
// rather than restated — a second copy of it here would drift silently the
// first time a biome gained a zone, and this render would quietly stop
// matching the game it exists to show. (Same reason the library's page
// backgrounds import it; see pwa/src/game/render/ground-tiles.ts.)
const { groundTileName } = await import(
  engine("pwa/src/game/render/ground-tiles.ts")
);
const { resolvePackCount } = await import(
  engine("src/game/defs/difficulties.ts")
);

const previewDir = engine("pwa/assets-preview");
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

/** Blit a sprite centred on a world point at a fractional opacity — the canopy's
 * pieces are meant to be looked through, so a straight blit would misrepresent
 * them badly. */
function blendCentred(dst, src, x, y, alpha) {
  const dx = Math.round(x - src.width / 2);
  const dy = Math.round(y - src.height / 2);
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const si = (sy * src.width + sx) * 4;
      const a = (src.data[si + 3] / 255) * alpha;
      if (a <= 0) continue;
      const tx = dx + sx;
      const ty = dy + sy;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const di = (ty * dst.width + tx) * 4;
      for (let c = 0; c < 3; c++)
        dst.data[di + c] = Math.round(
          dst.data[di + c] * (1 - a) + src.data[si + c] * a,
        );
    }
  }
}

// ---- the dormant scatter ---------------------------------------------------

/** A tiny deterministic PRNG (xorshift32), so the dormant mobs land in the same
 * spots on every build instead of reshuffling the picture for no reason. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** A point inside a spawn radius, area-uniform (sqrt, not a raw radius roll —
 * without it everything bunches at the centre). */
function scatterAround(rng, at, radius) {
  const r = (radius ?? 110) * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return [at.x + Math.cos(a) * r, at.y + Math.sin(a) * r];
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
  // Spawn points: the finite knots the ambient horde comes out of, ringed at their
  // own trigger radius and labelled with what they still owe. A map read without
  // them is a map with no horde in it — and on a generated map the knots ARE the
  // level design, one per carved cell, so they are the first thing to look at.
  for (const s of def.spawners ?? []) {
    const hell = s.hellgate === true;
    const ring = hell ? [255, 110, 60, 150] : [255, 235, 140, 130];
    strokeCircle(surf, s.at.x, s.at.y, s.triggerRadius ?? 300, ring, 2);
    const owed = s.members.reduce((n, m) => n + m.count, 0);
    const kinds = s.members.map((m) => m.enemy).join("+");
    label(
      surf,
      `${hell ? "HELLGATE" : (s.id ?? "KNOT")} ${owed} ${kinds}`,
      s.at.x - 40,
      s.at.y + 8,
      hell ? [255, 150, 90, 255] : [255, 240, 170, 255],
    );
  }
  // Chests — the caches the detours pay out.
  for (const c of def.chests ?? [])
    label(surf, "CACHE", c.at.x + 6, c.at.y - 6, [255, 210, 110, 255]);
  // Pinned elites / unique / boss — named, coloured by role.
  for (const s of def.spawns ?? []) {
    if (!s.at) continue;
    const d = ENEMY_DEFS[s.enemy];
    const col = ROLE_COLOR[d?.role ?? "minion"] ?? ROLE_COLOR.minion;
    label(surf, d?.name ?? s.enemy, s.at.x + 10, s.at.y - 6, col);
  }
}

// ---- render one level ------------------------------------------------------
export function renderLevel(def, opts) {
  const state = createGame(opts.seed, def.id, opts.difficulty);
  const W = def.width;
  const H = def.height;
  const surf = fill(createSurface(W, H), [12, 12, 16, 255]);

  // 1. Ground + patch tiles.
  const tilesX = Math.ceil(W / TILE);
  const tilesY = Math.ceil(H / TILE);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const s = spriteSurface(groundTileName(def.tiles, tx, ty));
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

  // 5. Mobs + boss at their real spawn positions and real sprite sizes. This is
  //    everything the level MINTS at creation: the opening scatter, every
  //    hand-placed elite and the boss at its post, and whatever each spawn
  //    point pre-places around itself.
  const counts = new Map();
  const drawMob = (defId, x, y) => {
    const family = ENEMY_DEFS[defId]?.sprite ?? defId;
    blitCentred(surf, `${family}_0`, x, y);
    counts.set(defId, (counts.get(defId) ?? 0) + 1);
  };
  for (const e of state.enemies) drawMob(e.defId, e.pos.x, e.pos.y);

  // 6. The DORMANT population, when asked for: the sleeping packs and the mobs
  //    each spawn point still has queued. Those are the bulk of what a player
  //    actually fights — a render that leaves them out shows an empty map and
  //    calls it a level. They are drawn where they will arrive, at the point's
  //    own scatter radius, capped at the point's own alive cap, with the kinds
  //    taken from its own queue — the engine's numbers, not an estimate.
  //
  //    They are a LIKENESS rather than a plan: the same mobs stream in over
  //    time and the scatter re-rolls each run, which is exactly what the
  //    library's map caption says about them.
  if (opts.dormant) {
    for (const [i, pack] of (state.packs ?? []).entries()) {
      if (pack.status !== "dormant") continue;
      const members = def.packs?.[i]?.members ?? [];
      const rng = seeded(0x9e37 + i);
      for (const member of members) {
        const n = resolvePackCount(member.count, opts.difficulty);
        for (let k = 0; k < n; k++) {
          const [x, y] = scatterAround(rng, pack.at, pack.spawnRadius);
          drawMob(member.enemy, x, y);
        }
      }
    }
    for (const [i, point] of (state.spawners ?? []).entries()) {
      const queued = point.queue ?? [];
      if (queued.length === 0) continue;
      // What STANDS there at once is the point's alive cap, not its whole
      // lifetime budget — drawing all 39 of a spawner's wisps would paint a
      // crowd the level never has on the board.
      const alive = Math.min(point.maxAlive ?? queued.length, queued.length);
      const rng = seeded(0x1f83 + i);
      for (let k = 0; k < alive; k++) {
        const [x, y] = scatterAround(rng, point.at, point.spawnRadius);
        drawMob(queued[k], x, y);
      }
    }
  }

  // 6b. THE CANOPY — junk drifting between the eye and the ground, over
  //     everything that fights. Drawn here for the same reason the renderer draws
  //     it last: it is the layer the player looks THROUGH. The blur is applied by
  //     a cheap box pass over the sprite (this tool has no canvas filter), which
  //     is close enough to judge density and placement by.
  for (const piece of state.canopy ?? []) {
    const s = spriteSurface(piece.sprite);
    if (!s) continue;
    blendCentred(surf, s, piece.pos.x, piece.pos.y, piece.alpha);
  }

  // 6. Showcase overlay — label every zone, room, landmark, elite, boss,
  //    merchant and the spawn (unless --bare, for a pure art view).
  if (!opts.bare) drawShowcase(surf, def);

  // Thin title strip so the render is self-identifying — off under `--bare`,
  // which means a PURE art view: nothing on the image that isn't the level.
  // (The library's mission pages take the bare render and shrink it, so a
  // stamped-on caption would be a caption nobody asked for on a public page.)
  if (!opts.bare) {
    const title = renderText(
      `${def.name}  ${def.id}${opts.generated ? `  GENERATED ${opts.size}` : ""}  seed ${opts.seed} ${opts.difficulty}  ${W}x${H}`.toUpperCase(),
      [235, 235, 240, 255],
    );
    fillRect(surf, 0, 0, title.width + 6, title.height + 6, [0, 0, 0, 200]);
    blit(surf, title, 3, 3);
  }

  const out = `${previewDir}/level_${def.id}${opts.generated ? "_generated" : ""}.png`;
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
    dormant: false,
    generated: false,
    size: "medium",
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--bare") opts.bare = true;
    else if (a === "--dormant") opts.dormant = true;
    else if (a === "--generated") opts.generated = true;
    else if (a === "--size") opts.size = argv[++i];
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--difficulty") opts.difficulty = argv[++i];
    else if (a === "--zoom") opts.zoom = Math.max(1, Number(argv[++i]));
    else rest.push(a);
  }
  opts.id = rest[0];
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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

  // --generated swaps the hand-authored def for a grid carved from the mission's
  // blueprint. `createGame` inside renderLevel carves the same one (same id, same
  // seed, same size), because the engine flag makes the swap at level build — so
  // the picture and the run agree.
  if (opts.generated) {
    const { setGeneratedMapsEnabled, setGeneratedMapSize } = await import(
      engine("src/game/flags.ts")
    );
    const { resolveLevelDef, hasMapBlueprint } = await import(
      engine("src/game/mapgen/index.ts")
    );
    setGeneratedMapsEnabled(true);
    setGeneratedMapSize(opts.size);
    for (const entry of targets) {
      if (!hasMapBlueprint(entry.def.id)) {
        console.warn(`! no map blueprint for "${entry.def.id}"`);
        continue;
      }
      entry.def = resolveLevelDef(entry.def.id, opts.seed, opts.size);
    }
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
}
