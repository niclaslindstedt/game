// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas renderer: draws one frame of the engine state. The canvas backing
// store is in world units (1 canvas px = 1 world unit) and the browser
// upscales it with image-rendering: pixelated, so all coordinates here stay
// integers and the pixel art stays crisp. Draw order: ground → decor →
// landmarks → items → projectiles → enemies → player (shadow, jump height)
// → hurt flash.

import {
  abilityDef,
  activeMechanics,
  stasisRadius,
  APPARITION,
  COMPANIONS,
  companionDef,
  enemyDef,
  equipmentIcon,
  itemSpellOrbPositions,
  LAST_STAND,
  LEVELING,
  magnetRadius,
  MERCY,
  orbitSpellParams,
  orbPositions,
  stasisSpellParams,
  storyItemDef,
  WOUNDS,
  type GameState,
  type TileSpec,
  type WeaponClass,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";

import { spriteByName, type GameAssets, type Sprites } from "./assets.ts";
import { medkitIconFor } from "./consumables.ts";
import { playerDollLayers, WEAPON_SHOULDER } from "./paper-doll.ts";
import { getSettings } from "./settings.ts";
import { TIER_COLORS } from "./tiers.ts";

/**
 * CSS pixels per world unit at the mobile-first baseline — the reference
 * landscape phone (see AGENTS.md). The app is tuned to this zoom.
 */
export const VIEW_SCALE = 2;

/**
 * Large screens (desktop, big tablets) render everything at 2× the phone
 * baseline so the phone-sized HUD, text, and sprites stay legible instead of
 * shrinking into a sea of moon. The DOM UI is bumped to match by doubling the
 * root font-size at the same breakpoint (styles.css) — keep the two in sync.
 * Gate on the *smaller* viewport dimension so only genuinely large screens
 * scale: a landscape phone (~390 tall) keeps the baseline; a desktop window
 * (≥700 in both axes) doubles.
 */
export const UI_SCALE_BREAKPOINT_PX = 700;

/** Extra zoom multiplier for a viewport (1 on phones, 2 on desktop). */
export function uiScaleFor(width: number, height: number): number {
  return Math.min(width, height) >= UI_SCALE_BREAKPOINT_PX ? 2 : 1;
}

/** World zoom (CSS px per world unit) for the given viewport. */
export function viewScaleFor(width: number, height: number): number {
  return VIEW_SCALE * uiScaleFor(width, height);
}

const TILE = 16;

/**
 * The rift has no floor — the hero stands on nothing between universes, so the
 * renderer floats him with a slow vertical bob whenever he's grounded. Purely
 * cosmetic (world position is unchanged); the jump arc (`player.z`) takes over
 * the moment he leaves the "ground". Amplitude is in world units (doubled on
 * screen by VIEW_SCALE); the long period matches the level's dreamy, floaty
 * gravity.
 */
const RIFT_HOVER_BIOME = "rift";
const RIFT_HOVER_AMPLITUDE = 2;
const RIFT_HOVER_PERIOD_MS = 2400;

export type Camera = { x: number; y: number };

/**
 * The VICTORY QUAKE: while `state.quakeMs` burns (a level with an outro,
 * objective just cleared), the camera jitters a couple of world px on a fast
 * multi-frequency wobble — the whole world shaking itself apart under the
 * hero's feet. Amplitude in world units (doubled on screen by VIEW_SCALE);
 * driven by render time so it never touches the simulation.
 */
const QUAKE_AMPLITUDE = 2.5;

/** Top-left of the view rect: player-centered, clamped to the level. */
export function computeCamera(
  state: GameState,
  viewWidth: number,
  viewHeight: number,
  timeMs = 0,
): Camera {
  const clampAxis = (center: number, view: number, level: number) => {
    // A view larger than the level parks the level centered inside it.
    if (view >= level) return Math.round((level - view) / 2);
    return Math.round(Math.min(Math.max(center - view / 2, 0), level - view));
  };
  const camera = {
    x: clampAxis(state.player.pos.x, viewWidth, state.level.width),
    y: clampAxis(state.player.pos.y, viewHeight, state.level.height),
  };
  // Only the drawing pass passes a clock — the simulate pass's view rect
  // (enemy targeting) stays rock steady through the quake.
  if (state.quakeMs > 0 && timeMs > 0) {
    // Two incommensurate sine pairs read as a rumble, not a metronome.
    camera.x += Math.round(
      Math.sin(timeMs / 23) * QUAKE_AMPLITUDE +
        Math.sin(timeMs / 61) * QUAKE_AMPLITUDE * 0.6,
    );
    camera.y += Math.round(
      Math.cos(timeMs / 31) * QUAKE_AMPLITUDE +
        Math.cos(timeMs / 47) * QUAKE_AMPLITUDE * 0.6,
    );
  }
  return camera;
}

/** Cheap deterministic per-tile hash for ground variety. */
function tileHash(tx: number, ty: number): number {
  return (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0;
}

/**
 * Pick the ground tile for a cell, entirely from the level's `tiles` spec
 * (defs/levels.ts): the rare ground variant scatters into the common one,
 * and an optional `patch` pair clusters on a coarser grid so gravel/vents
 * clump instead of speckling. A new biome is a new `tiles` entry, no edit
 * here. `sprite` falls back to the first ground sprite if a name is unknown.
 */
function groundTile(sprites: Sprites, tiles: TileSpec, tx: number, ty: number) {
  // Zoned terrain: the first zone rect containing this tile supplies its own
  // ground/patch pair (martian dust outside, deck plating inside the base) —
  // still all data from the level def, no per-biome code.
  const zone = tiles.zones?.find(
    (z) =>
      tx * TILE >= z.rect.x &&
      tx * TILE < z.rect.x + z.rect.width &&
      ty * TILE >= z.rect.y &&
      ty * TILE < z.rect.y + z.rect.height,
  );
  const ground = zone?.ground ?? tiles.ground;
  const patch = zone ? zone.patch : tiles.patch;
  const fallback = spriteByName(sprites, ground.common) ?? sprites.moon_0;
  const pick = (name: string) => spriteByName(sprites, name) ?? fallback;
  if (patch && tileHash(tx >> 2, ty >> 2) % patch.every === 0) {
    return pick(tileHash(tx, ty) % 2 === 0 ? patch.a : patch.b);
  }
  const { common, rare, rareEvery } = ground;
  return pick(tileHash(tx, ty) % rareEvery === 0 ? rare : common);
}

// ---- Per-frame render caches ---------------------------------------------
// All keyed off the (memoized, singleton) Sprites instance: a fresh instance
// — e.g. after a hot reload — drops everything.

let cachesFor: Sprites | null = null;

/** The whole level's ground baked into one offscreen canvas. Tiles are a pure
 * function of the level def and the tile hash, so the layer never changes
 * during a run — blitting it is one draw call per frame instead of ~1,000
 * per-tile draws (each with a zone scan) re-composed every frame. */
let groundCache: { levelId: string; canvas: HTMLCanvasElement } | null = null;

/** Pre-rendered radial glows, keyed by `rgb/radius`. Loot glows pulse every
 * frame, and building a CanvasGradient per item per frame is the single most
 * expensive thing a loot-covered floor does — the pulse instead scales a
 * baked full-alpha glow via globalAlpha (identical output, both stops scale
 * linearly). */
const glowCache = new Map<string, HTMLCanvasElement>();

/** A monster's resolved sprite variants (base/hurt/wrecked/dying × 2 frames),
 * keyed by the def's sprite family — saves 1-2 string builds and up to 3
 * atlas probes per enemy per frame at horde scale. */
type EnemyFrames = [ImageBitmap, ImageBitmap];
type EnemyVariants = {
  base: EnemyFrames;
  hurt: EnemyFrames;
  wrecked: EnemyFrames;
  dying: EnemyFrames;
};
const enemySpriteCache = new Map<string, EnemyVariants>();

/** The width, in world units, of a sprite's non-transparent pixels — the art's
 * visible body, ignoring the transparent margin the fixed atlas cell pads it
 * with. Used to size the minion health bar to the character rather than the
 * cell. Measured once per bitmap (a getImageData scan) and cached. */
const opaqueWidthCache = new Map<ImageBitmap, number>();
function opaqueWidth(sprite: ImageBitmap): number {
  const cached = opaqueWidthCache.get(sprite);
  if (cached !== undefined) return cached;
  const c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return sprite.width;
  g.drawImage(sprite, 0, 0);
  const { data } = g.getImageData(0, 0, sprite.width, sprite.height);
  let min = sprite.width;
  let max = -1;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if ((data[(y * sprite.width + x) * 4 + 3] ?? 0) > 0) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  const w = max >= min ? max - min + 1 : sprite.width;
  opaqueWidthCache.set(sprite, w);
  return w;
}

function ensureCaches(sprites: Sprites): void {
  if (cachesFor === sprites) return;
  cachesFor = sprites;
  groundCache = null;
  glowCache.clear();
  enemySpriteCache.clear();
}

function groundLayer(
  state: GameState,
  sprites: Sprites,
): HTMLCanvasElement | null {
  if (groundCache && groundCache.levelId === state.level.id) {
    return groundCache.canvas;
  }
  const canvas = document.createElement("canvas");
  canvas.width = state.level.width;
  canvas.height = state.level.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const tilesX = Math.ceil(state.level.width / TILE);
  const tilesY = Math.ceil(state.level.height / TILE);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      ctx.drawImage(
        groundTile(sprites, state.level.tiles, tx, ty),
        tx * TILE,
        ty * TILE,
      );
    }
  }
  groundCache = { levelId: state.level.id, canvas };
  return canvas;
}

/** A soft radial glow fading `rgb` from full alpha at the center to clear at
 * `radius`, rendered once and reused. Draw with globalAlpha for the pulse. */
function glowSprite(rgb: string, radius: number): HTMLCanvasElement | null {
  const key = `${rgb}/${radius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const size = Math.max(2, Math.ceil(radius * 2));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${rgb}, 1)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  glowCache.set(key, canvas);
  return canvas;
}

/**
 * Draw a MERCY DROP mid-delivery: a guardian angel swoops down from above
 * cradling the rescue, then releases it to fall the last stretch to `item.pos`
 * (the spot the mob died). Driven entirely off the item's `deliverMs` countdown
 * — the engine parks the pickup at its landing spot and blocks the grab until it
 * lands (see `stepItems`); this only performs the descent, all within
 * `MERCY.angelDeliverMs` (< 2s). The two frames flap (`angel_0` wings-high ↔
 * `angel_1` wings-low) so the guardian beats its way down.
 */
function drawAngelDelivery(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  item: { id: number; pos: { x: number; y: number }; deliverMs?: number },
  drop: ImageBitmap,
  camera: { x: number; y: number },
  timeMs: number,
): void {
  const total = MERCY.angelDeliverMs;
  const p = Math.min(1, Math.max(0, 1 - (item.deliverMs ?? 0) / total));
  const RELEASE = 0.66; // fraction of the delivery spent descending, then let go
  const ENTRY = 156; // world px above the landing spot the angel enters from
  const HANDOFF = 34; // height it releases the gift at
  const CARRY = 15; // gap between the angel's hands and the gift while carried

  let lift: number; // the gift's height above the ground
  let angelLift: number; // the angel's height above the ground
  let angelAlpha: number;
  if (p < RELEASE) {
    const q = p / RELEASE;
    const ease = q * (2 - q); // ease-out: quick entrance, settling as it arrives
    lift = ENTRY + (HANDOFF - ENTRY) * ease;
    angelLift = lift + CARRY;
    angelAlpha = Math.min(1, p / 0.12); // fade in over the first beat
  } else {
    const t = (p - RELEASE) / (1 - RELEASE);
    lift = HANDOFF * (1 - t * t); // accelerating fall to the ground
    angelLift = HANDOFF + CARRY + t * 52; // lets go and lifts back up out of frame
    angelAlpha = Math.max(0, 1 - t * 1.2); // fading as it rises away
  }

  const sway = Math.sin(timeMs / 220 + item.id) * 3; // a gentle drift on the way down
  const drift = (1 - p) * -6; // enters a touch off-centre, straightens as it lands
  const groundX = item.pos.x - camera.x;
  const groundY = item.pos.y - camera.y;

  // A soft holy aura behind the gift so it still reads as loot through the fall.
  const glow = glowSprite("255, 236, 170", drop.width * 0.95);
  if (glow) {
    ctx.globalAlpha = 0.32 + 0.12 * Math.sin(timeMs / 200 + item.id);
    ctx.drawImage(
      glow,
      Math.round(groundX - glow.width / 2),
      Math.round(groundY - lift - glow.height / 2),
    );
    ctx.globalAlpha = 1;
  }

  // The angel, flapping, wrapped in its own faint radiance.
  const angel = spriteByName(
    sprites,
    Math.floor(timeMs / 180) % 2 === 0 ? "angel_0" : "angel_1",
  );
  if (angel && angelAlpha > 0.02) {
    const centerX = groundX + sway + drift;
    const centerY = groundY - angelLift;
    const halo = glowSprite("255, 244, 210", angel.width * 0.7);
    if (halo) {
      ctx.globalAlpha = 0.28 * angelAlpha;
      ctx.drawImage(
        halo,
        Math.round(centerX - halo.width / 2),
        Math.round(centerY - halo.height / 2),
      );
    }
    ctx.globalAlpha = angelAlpha;
    ctx.drawImage(
      angel,
      Math.round(centerX - angel.width / 2),
      Math.round(centerY - angel.height / 2),
    );
    ctx.globalAlpha = 1;
  }

  // The gift itself: tracking the angel's hands, then falling free and centring.
  const carriedX =
    p < RELEASE ? sway + drift : sway * (1 - (p - RELEASE) / (1 - RELEASE));
  ctx.drawImage(
    drop,
    Math.round(groundX + carriedX - drop.width / 2),
    Math.round(groundY - lift - drop.height / 2),
  );
}

/** A gravity well's darkening funnel (three fixed stops between the core and
 * the pull rim), rendered once per (core, pull) radius pair and reused. */
function funnelSprite(
  coreRadius: number,
  pullRadius: number,
): HTMLCanvasElement | null {
  const key = `funnel/${coreRadius}/${pullRadius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const size = Math.max(2, Math.ceil(pullRadius * 2));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const funnel = ctx.createRadialGradient(r, r, coreRadius, r, r, pullRadius);
  funnel.addColorStop(0, "rgba(8, 6, 20, 0.55)");
  funnel.addColorStop(0.6, "rgba(20, 12, 44, 0.28)");
  funnel.addColorStop(1, "rgba(20, 12, 44, 0)");
  ctx.fillStyle = funnel;
  ctx.beginPath();
  ctx.arc(r, r, pullRadius, 0, Math.PI * 2);
  ctx.fill();
  glowCache.set(key, canvas);
  return canvas;
}

function enemySprites(sprites: Sprites, family: string): EnemyVariants {
  const cached = enemySpriteCache.get(family);
  if (cached) return cached;
  // Faithful to the old per-frame fallbacks: a missing stage variant degrades
  // to the base frame of the same index, a missing base frame to the ghost.
  const base: EnemyFrames = [
    spriteByName(sprites, `${family}_0`) ?? sprites.ghost_0,
    spriteByName(sprites, `${family}_1`) ?? sprites.ghost_0,
  ];
  const stage = (suffix: string): EnemyFrames => [
    spriteByName(sprites, `${family}${suffix}_0`) ?? base[0],
    spriteByName(sprites, `${family}${suffix}_1`) ?? base[1],
  ];
  const variants: EnemyVariants = {
    base,
    hurt: stage("_hurt"),
    wrecked: stage("_wrecked"),
    dying: stage("_dying"),
  };
  enemySpriteCache.set(family, variants);
  return variants;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  playerAction?: PlayerAction,
): void {
  const { sprites } = assets;
  ensureCaches(sprites);
  const view = { width: ctx.canvas.width, height: ctx.canvas.height };
  ctx.imageSmoothingEnabled = false;

  // Letterbox backdrop (visible when the view outgrows the level).
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, view.width, view.height);

  // Ground: one blit of the visible rect from the baked level layer.
  const ground = groundLayer(state, sprites);
  if (ground) {
    const sx = Math.max(0, camera.x);
    const sy = Math.max(0, camera.y);
    const dx = sx - camera.x;
    const dy = sy - camera.y;
    const sw = Math.min(view.width - dx, state.level.width - sx);
    const sh = Math.min(view.height - dy, state.level.height - sy);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(ground, sx, sy, sw, sh, dx, dy, sw, sh);
    }
  } else {
    // No 2D context for the offscreen layer: tile the view directly.
    const x0 = Math.floor(Math.max(camera.x, 0) / TILE);
    const y0 = Math.floor(Math.max(camera.y, 0) / TILE);
    const x1 = Math.ceil(
      Math.min(camera.x + view.width, state.level.width) / TILE,
    );
    const y1 = Math.ceil(
      Math.min(camera.y + view.height, state.level.height) / TILE,
    );
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        ctx.drawImage(
          groundTile(sprites, state.level.tiles, tx, ty),
          tx * TILE - camera.x,
          ty * TILE - camera.y,
        );
      }
    }
  }

  const inView = (x: number, y: number, margin: number) =>
    x >= camera.x - margin &&
    x <= camera.x + view.width + margin &&
    y >= camera.y - margin &&
    y <= camera.y + view.height + margin;

  // Decor: craters and rocks under everything else. Each piece names its own
  // sprite (defs/levels.ts), so a new decor kind needs no edit here.
  for (const decor of state.decor) {
    if (!inView(decor.pos.x, decor.pos.y, 32)) continue;
    const sprite = spriteByName(sprites, decor.sprite) ?? sprites.rocks;
    ctx.drawImage(
      sprite,
      Math.round(decor.pos.x - sprite.width / 2 - camera.x),
      Math.round(decor.pos.y - sprite.height / 2 - camera.y),
    );
  }

  // Landmarks: `anchor` (from the def) decides whether the sprite's foot or
  // its center sits on the pos — no per-kind special-casing.
  for (const landmark of state.landmarks) {
    if (!inView(landmark.pos.x, landmark.pos.y, 48)) continue;
    const sprite = spriteByName(sprites, landmark.sprite) ?? sprites.rocks;
    const yAnchor =
      landmark.anchor === "base" ? sprite.height - 2 : sprite.height / 2;
    ctx.drawImage(
      sprite,
      Math.round(landmark.pos.x - sprite.width / 2 - camera.x),
      Math.round(landmark.pos.y - yAnchor - camera.y),
    );
  }

  // Obstacles sit on the ground plane, under everything that moves. Each
  // carries its sprite name from the def.
  for (const obstacle of state.obstacles) {
    if (!inView(obstacle.pos.x, obstacle.pos.y, 32)) continue;
    const sprite = spriteByName(sprites, obstacle.sprite) ?? sprites.rock;
    ctx.drawImage(
      sprite,
      Math.round(obstacle.pos.x - sprite.width / 2 - camera.x),
      Math.round(obstacle.pos.y - sprite.height / 2 - camera.y),
    );
  }

  // Gravity wells: a darkening funnel over the ground plane (the visual
  // warning of the pull's reach) around the animated hole itself. Drawn
  // before items/enemies so the loot hoarded on the rim sits readable on
  // top of the swirl.
  for (const well of state.wells) {
    if (!inView(well.pos.x, well.pos.y, well.pullRadius)) continue;
    const cx = Math.round(well.pos.x - camera.x);
    const cy = Math.round(well.pos.y - camera.y);
    const funnel = funnelSprite(well.coreRadius, well.pullRadius);
    if (funnel) {
      ctx.drawImage(
        funnel,
        cx - Math.round(funnel.width / 2),
        cy - Math.round(funnel.height / 2),
      );
    }
    const frame = Math.floor(timeMs / 240 + well.id) % 2;
    const sprite = spriteByName(sprites, `blackhole_${frame}`);
    if (sprite) {
      ctx.drawImage(
        sprite,
        Math.round(well.pos.x - sprite.width / 2 - camera.x),
        Math.round(well.pos.y - sprite.height / 2 - camera.y),
      );
    }
  }

  for (const item of state.items) {
    if (!inView(item.pos.x, item.pos.y, 16)) continue;
    const sprite =
      item.kind === "medkit"
        ? (spriteByName(sprites, medkitIconFor(item.tier ?? 0)) ??
          sprites.medkit)
        : item.kind === "xp"
          ? sprites.upgrade
          : item.kind === "repair"
            ? sprites.repair
            : item.kind === "drink"
              ? sprites.drink
              : item.kind === "ability"
                ? (spriteByName(sprites, abilityDef(item.defId).icon) ??
                  sprites.medkit)
                : item.kind === "story"
                  ? (spriteByName(sprites, storyItemDef(item.defId).icon) ??
                    sprites.medkit)
                  : (spriteByName(
                      sprites,
                      equipmentIcon(item.equipment.defId),
                    ) ?? sprites.medkit);
    // A MERCY DROP still riding its angel down (deliverMs ticking): the guardian
    // swoops in from above cradling the gift, then releases it to fall the last
    // stretch to `pos`. Purely presentational — the engine has already parked
    // the item at its landing spot and blocked the pickup until it lands.
    if (item.deliverMs !== undefined && item.deliverMs > 0) {
      drawAngelDelivery(ctx, sprites, item, sprite, camera, timeMs);
      continue;
    }
    // Dropped loot hovers and glows so it reads as pickupable, not decor.
    // Phase by item.id (like enemy bob) so items don't pulse in lockstep.
    const cx = Math.round(item.pos.x - camera.x);
    const cy = Math.round(item.pos.y - camera.y);
    const glowR = sprite.width * 0.9;
    const glowAlpha = 0.3 + 0.14 * Math.sin(timeMs / 240 + item.id);
    // Powerup pickups glow electric blue; everything else keeps the warm gold.
    const glowRgb = item.kind === "ability" ? "120, 190, 255" : "255, 236, 170";
    const glow = glowSprite(glowRgb, glowR);
    if (glow) {
      ctx.globalAlpha = glowAlpha;
      ctx.drawImage(
        glow,
        cx - Math.round(glow.width / 2),
        cy - Math.round(glow.height / 2),
      );
      ctx.globalAlpha = 1;
    }
    // Float ~2px off the ground and bob gently; the glow stays anchored below.
    const hover = Math.round(Math.sin(timeMs / 320 + item.id) * 1.5) - 2;
    const x = Math.round(item.pos.x - sprite.width / 2 - camera.x);
    const y = Math.round(item.pos.y - sprite.height / 2 - camera.y) + hover;
    // Story items glint gold — the plot should catch the eye from afar.
    if (item.kind === "story") {
      const pulse = Math.floor(timeMs / 300) % 2 === 0;
      ctx.fillStyle = "#ffd75e";
      const r = pulse ? 1 : 2;
      ctx.fillRect(x - r, y - r, 2, 2);
      ctx.fillRect(x + sprite.width + r - 2, y - r, 2, 2);
      ctx.fillRect(x - r, y + sprite.height + r - 2, 2, 2);
      ctx.fillRect(x + sprite.width + r - 2, y + sprite.height + r - 2, 2, 2);
    }
    // Dropped equipment glints in its tier color so rarity reads from afar.
    if (item.kind === "equipment" && item.equipment.tier !== "regular") {
      const pulse = Math.floor(timeMs / 300) % 2 === 0;
      ctx.fillStyle = TIER_COLORS[item.equipment.tier];
      const r = pulse ? 1 : 2;
      ctx.fillRect(x - r, y - r, 2, 2);
      ctx.fillRect(x + sprite.width + r - 2, y - r, 2, 2);
      ctx.fillRect(x - r, y + sprite.height + r - 2, 2, 2);
      ctx.fillRect(x + sprite.width + r - 2, y + sprite.height + r - 2, 2, 2);
    }
    ctx.drawImage(sprite, x, y);
  }

  for (const projectile of state.projectiles) {
    if (!inView(projectile.pos.x, projectile.pos.y, 16)) continue;
    // Each weapon names its own shot sprite (staple, zap, vial, ray…) — the
    // stapler throws staples, the taser arcs, the beaker sloshes. Fall back
    // to the class default if a name is ever unknown.
    const sprite =
      spriteByName(sprites, projectile.sprite) ??
      (projectile.weaponClass === "magic" ? sprites.spark : sprites.bolt);
    // Shots fired mid-jump draw at their height, sinking back in flight.
    ctx.drawImage(
      sprite,
      Math.round(projectile.pos.x - sprite.width / 2 - camera.x),
      Math.round(
        projectile.pos.y - sprite.height / 2 - camera.y - projectile.z,
      ),
    );
  }

  // Health bars are collected here and drawn in a second pass below, so a mob
  // drawn later in the loop never paints over an earlier mob's bar — every bar
  // stays legible on top of the whole horde.
  const healthBars: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    hpFrac: number;
  }[] = [];
  for (const enemy of state.enemies) {
    if (!inView(enemy.pos.x, enemy.pos.y, 48)) continue;
    const def = enemyDef(enemy.defId);
    // Offset the float phase per enemy so the haunting doesn't bob in sync.
    // This same idle bob keeps speakers visibly alive during dialogue —
    // it runs on render time, which never freezes.
    const frame = Math.floor(timeMs / 300 + enemy.id) % 2;
    // Battle damage: sprites swap to wounded variants as hp falls — every
    // mob at half, elites and bosses heavier below a quarter, bosses in a
    // dying last stand at the bottom (thresholds in config.WOUNDS /
    // LAST_STAND). Missing variants degrade to the base frame.
    const hpFrac = enemy.hp / enemy.maxHp;
    const lastStand = def.role === "boss" && hpFrac <= LAST_STAND.hpFraction;
    const variants = enemySprites(sprites, def.sprite);
    const stage = lastStand
      ? variants.dying
      : def.role !== "minion" && hpFrac <= WOUNDS.wreckedAt
        ? variants.wrecked
        : hpFrac <= WOUNDS.hurtAt
          ? variants.hurt
          : variants.base;
    const sprite = stage[frame] ?? sprites.ghost_0;
    const bob = Math.round(Math.sin(timeMs / 260 + enemy.id) * 1.5);
    const x = Math.round(enemy.pos.x - sprite.width / 2 - camera.x);
    const y = Math.round(enemy.pos.y - sprite.height / 2 - camera.y) + bob;
    // An evolved minion (menace stage stamped at spawn) wears a pulsing warm
    // aura that intensifies and reddens with its stage — the readable tell
    // that a rampage has toughened the horde it lured in.
    const evo = enemy.evo ?? 0;
    if (evo > 0) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 200 + enemy.id);
      ctx.globalAlpha = 0.12 + 0.1 * pulse;
      ctx.fillStyle = evo >= 4 ? "#ff5030" : evo >= 2 ? "#ff9040" : "#ffd050";
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 3 + evo, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A RARE or UNIQUE mob (config RARE_MOBS) wears a steady jeweled aura —
    // the Diablo special-monster glow: cool blue for a rare, radiant gold for
    // a one-of-a-kind unique — so the special find reads at a glance over the
    // recolored body, wherever it stands in the horde.
    if (def.rarity) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
      const unique = def.rarity === "unique";
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 260 + enemy.id);
      // Two nested rings — a soft body halo under a brighter rim — so the tell
      // reads without washing out the sprite it wraps.
      ctx.fillStyle = unique ? "#ffcf40" : "#5cc8ff";
      ctx.globalAlpha = (unique ? 0.16 : 0.13) + 0.09 * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + (unique ? 6 : 4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (unique ? 0.5 : 0.4) + 0.2 * pulse;
      ctx.strokeStyle = unique ? "#ffe38a" : "#a6e0ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + (unique ? 7 : 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // A TELEGRAPHED move winding up (mechanics.ts): the mob is rooted, so
    // the tell must carry — a fast white/red strobe ring plus, for a slam,
    // the danger circle the shockwave will fill; for a charge, the locked
    // bearing drawn as a lunge line. Read the dodge, earn the dodge.
    const telegraph = enemy.mech?.telegraph;
    if (telegraph) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
      const strobe = Math.floor(timeMs / 90) % 2 === 0;
      ctx.strokeStyle = strobe ? "#ffffff" : "#ff4030";
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      if (telegraph.kind === "slam") {
        const slam = activeMechanics(enemy, def)?.slam;
        if (slam) {
          ctx.beginPath();
          ctx.arc(cx, cy, slam.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (telegraph.dir) {
        const charge = activeMechanics(enemy, def)?.charge;
        const reach = (charge?.range ?? 120) * 1.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          Math.round(cx + telegraph.dir.x * reach),
          Math.round(cy + telegraph.dir.y * reach),
        );
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // An ENRAGED set piece burns: a steady red aura under the sprite, the
    // standing tell that its speed and blows are up for good.
    if (enemy.mech?.enraged) {
      const cx = Math.round(enemy.pos.x - camera.x);
      const cy = Math.round(enemy.pos.y - camera.y) + bob;
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 120 + enemy.id);
      ctx.globalAlpha = 0.18 + 0.1 * pulse;
      ctx.fillStyle = "#ff3020";
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A critical hit blinks the victim — skip alternating 60ms windows.
    const critBlink =
      (enemy.critFlashMs ?? 0) > 0 && Math.floor(timeMs / 60) % 2 === 0;
    // A boss on its last stand flickers: the tell that it now hits harder.
    if (lastStand && Math.floor(timeMs / 140) % 2 === 1) {
      ctx.globalAlpha = 0.55;
    }
    // A departing apparition dissolves: fade with its linger countdown.
    if (enemy.vanishMs !== undefined) {
      ctx.globalAlpha = Math.min(
        ctx.globalAlpha,
        Math.max(0, enemy.vanishMs / APPARITION.lingerMs),
      );
    }
    if (!critBlink) ctx.drawImage(sprite, x, y);
    ctx.globalAlpha = 1;

    // Health over the head. Bosses and elites always carry a bar once wounded,
    // and so do RARE/UNIQUE mobs — the special-monster tell that reads them as
    // the mini-bosses they fight like, in their aura's color. A plain minion
    // gets one only when the HEALTH BARS display setting is on, drawn thin and
    // trimmed just inside its silhouette since it holds so little hp. All are
    // collected here and drawn in the pass below, so a mob in front never
    // paints over another's bar.
    const plainMinion = def.role === "minion" && !def.rarity;
    const showBar = !plainMinion || getSettings().healthBars === "on";
    if (showBar && enemy.hp < enemy.maxHp) {
      const width = plainMinion
        ? // Trim the visible-body width by 2 so the bar sits inside the
          // sprite's silhouette rather than reaching its edges.
          Math.max(2, opaqueWidth(sprite) - 2)
        : def.role === "boss"
          ? 40
          : 28;
      const color = def.rarity
        ? def.rarity === "unique"
          ? "#ffcf40"
          : "#5cc8ff"
        : def.role === "boss"
          ? "#d83a3a"
          : def.role === "elite"
            ? "#d9a0f0"
            : "#e05050";
      healthBars.push({
        x: enemy.pos.x - camera.x,
        y: y - (plainMinion ? 3 : 6),
        width,
        height: plainMinion ? 1 : 3,
        color,
        hpFrac: enemy.hp / enemy.maxHp,
      });
    }
  }
  // Second pass: paint every collected bar on top of the drawn horde.
  for (const bar of healthBars) {
    const bx = Math.round(bar.x - bar.width / 2);
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(bx - 1, bar.y - 1, bar.width + 2, bar.height + 2);
    ctx.fillStyle = bar.color;
    ctx.fillRect(
      bx,
      bar.y,
      Math.max(1, Math.round(bar.width * bar.hpFrac)),
      bar.height,
    );
  }

  drawMerchant(ctx, state, assets, camera, timeMs);
  drawCompanions(ctx, state, assets, camera, timeMs);
  drawAbilities(ctx, state, assets, camera, timeMs);
  // The ding burn wraps the hero: the pillar and ground ring glow behind the
  // sprite, the rising embers float over it, so the light reads as engulfing
  // the character rather than a decal pasted on top.
  drawLevelUpBurn(ctx, state, camera, timeMs, "under");
  drawPlayer(ctx, state, assets, camera, timeMs, playerAction);
  drawLevelUpBurn(ctx, state, camera, timeMs, "over");

  // Asteroids fly over everything on the ground plane — they're rocks in
  // transit, not furniture. Scaled to each rock's rolled radius; the frame
  // flip (offset by id) reads as a tumble.
  for (const rock of state.asteroids) {
    if (!inView(rock.pos.x, rock.pos.y, 32)) continue;
    const frame = Math.floor(timeMs / 220 + rock.id) % 2;
    const sprite = spriteByName(sprites, `asteroid_${frame}`);
    if (!sprite) continue;
    const size = Math.max(12, Math.round(rock.radius * 2 + 4));
    ctx.drawImage(
      sprite,
      Math.round(rock.pos.x - size / 2 - camera.x),
      Math.round(rock.pos.y - size / 2 - camera.y),
      size,
      size,
    );
  }

  // Red flash while recently hurt.
  if (state.player.hurtFlashMs > 0) {
    ctx.fillStyle = `rgba(216, 58, 58, ${(0.25 * state.player.hurtFlashMs) / 250})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

/**
 * The wandering merchant: the trader in this level's costume (the engine
 * resolves his sprite family from the level def), striding his wander legs
 * until met. Once discovered a gold coin bobs over the stall — the "open
 * for business" tell that also makes him findable again from across a
 * screen.
 */
function drawMerchant(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const merchant = state.merchant;
  if (
    merchant.pos.x < camera.x - 48 ||
    merchant.pos.x > camera.x + ctx.canvas.width + 48 ||
    merchant.pos.y < camera.y - 48 ||
    merchant.pos.y > camera.y + ctx.canvas.height + 48
  ) {
    return;
  }
  const { sprites } = assets;
  const frame = merchant.moving && Math.floor(timeMs / 200) % 2 === 1 ? 1 : 0;
  const sprite =
    spriteByName(sprites, `${merchant.sprite}_${frame}`) ??
    spriteByName(sprites, `merchant_${frame}`);
  if (!sprite) return;
  const x = Math.round(merchant.pos.x - sprite.width / 2 - camera.x);
  const y = Math.round(merchant.pos.y - sprite.height / 2 - camera.y);
  if (merchant.faceLeft) {
    ctx.save();
    ctx.translate(x + sprite.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x, y);
  }
  if (merchant.discovered) {
    const coin = spriteByName(sprites, "icon_coin");
    if (coin) {
      const bob = Math.round(Math.sin(timeMs / 320) * 1.5);
      ctx.drawImage(
        coin,
        Math.round(merchant.pos.x - coin.width / 2 - camera.x),
        y - coin.height - 1 + bob,
      );
    }
  }
}

/**
 * The recruited party: each companion in its own sprite family (the same
 * frames its enemy twin wore), walk-animated like the merchant. A DOWNED
 * companion kneels as a faded still with a rising recovery sliver; a hurt
 * one shows a small green health bar, mirroring the elites' readout.
 */
function drawCompanions(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  for (const companion of state.companions) {
    if (
      companion.pos.x < camera.x - 48 ||
      companion.pos.x > camera.x + ctx.canvas.width + 48 ||
      companion.pos.y < camera.y - 48 ||
      companion.pos.y > camera.y + ctx.canvas.height + 48
    ) {
      continue;
    }
    const def = companionDef(companion.defId);
    const downed = companion.downedMs !== undefined;
    const frame =
      !downed && companion.moving && Math.floor(timeMs / 200) % 2 === 1 ? 1 : 0;
    const sprite =
      spriteByName(assets.sprites, `${def.sprite}_${frame}`) ??
      spriteByName(assets.sprites, `${def.sprite}_0`);
    if (!sprite) continue;
    const x = Math.round(companion.pos.x - sprite.width / 2 - camera.x);
    const y = Math.round(companion.pos.y - sprite.height / 2 - camera.y);
    ctx.save();
    if (downed) ctx.globalAlpha = 0.55;
    if (companion.faceLeft) {
      ctx.translate(x + sprite.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0);
    } else {
      ctx.drawImage(sprite, x, y);
    }
    ctx.restore();

    // The readout above the head: recovery while down, health while hurt.
    const barWidth = 16;
    const bx = Math.round(companion.pos.x - barWidth / 2 - camera.x);
    const by = y - 6;
    if (downed) {
      const frac =
        1 - Math.min(1, (companion.downedMs ?? 0) / COMPANIONS.reviveMs);
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, by - 1, barWidth + 2, 5);
      ctx.fillStyle = "#9aa3ad";
      ctx.fillRect(bx, by, Math.round(barWidth * frac), 3);
    } else if (companion.hp < companion.maxHp) {
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, by - 1, barWidth + 2, 5);
      ctx.fillStyle = "#7ef0c8";
      ctx.fillRect(
        bx,
        by,
        Math.round((barWidth * companion.hp) / companion.maxHp),
        3,
      );
    }
  }
}

/**
 * Running ability visuals: stasis draws its slow-field ring, orbit abilities
 * draw their fireballs at the engine's own orb positions.
 */
function drawAbilities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const player = state.player;
  for (const ability of player.abilities) {
    const def = abilityDef(ability.defId);

    if (def.stasis) {
      // A faint pulsing ring marks the field's slowing reach (INT widens it —
      // stasisRadius, the same read the engine slows by).
      const pulse = 0.18 + 0.08 * Math.sin(timeMs / 220);
      ctx.strokeStyle = `rgba(140, 205, 215, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        Math.round(player.pos.x - camera.x),
        Math.round(player.pos.y - camera.y),
        stasisRadius(state, def),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    if (def.orbit) {
      const sprite =
        spriteByName(assets.sprites, def.orbit.sprite) ??
        assets.sprites.fireball;
      for (const orb of orbPositions(player, ability)) {
        ctx.drawImage(
          sprite,
          Math.round(orb.x - sprite.width / 2 - camera.x),
          Math.round(orb.y - sprite.height / 2 - camera.y),
        );
      }
    }

    if (def.magnet) {
      // The magnet's reach, pulsing warm — items inside are on their way.
      const pulse = 0.14 + 0.08 * Math.sin(timeMs / 180);
      ctx.strokeStyle = `rgba(216, 96, 96, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        Math.round(player.pos.x - camera.x),
        Math.round(player.pos.y - camera.y),
        magnetRadius(state, def),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  // GRANTED forever spells (the `spell` affix on worn gear) draw off the
  // same engine params they tick with: the orbit ring's orbs, the stasis
  // field's slow ring. Storm strikes ride the lightning effect like the
  // pickup's. Same visuals as the pickups — the power reads identically,
  // it just never expires.
  for (const spell of player.itemSpells) {
    if (spell.spell === "orbit") {
      const params = orbitSpellParams(state, spell.rank);
      const sprite =
        spriteByName(assets.sprites, params.sprite) ?? assets.sprites.fireball;
      for (const orb of itemSpellOrbPositions(state, player, spell)) {
        ctx.drawImage(
          sprite,
          Math.round(orb.x - sprite.width / 2 - camera.x),
          Math.round(orb.y - sprite.height / 2 - camera.y),
        );
      }
    }
    if (spell.spell === "stasis") {
      const params = stasisSpellParams(state, spell.rank);
      const pulse = 0.18 + 0.08 * Math.sin(timeMs / 220);
      ctx.strokeStyle = `rgba(140, 205, 215, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        Math.round(player.pos.x - camera.x),
        Math.round(player.pos.y - camera.y),
        params.radius,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }
}

/**
 * Transient app-side effects: lightning strikes, nuke rings, gore splashes
 * on hit mobs, and floating damage numbers. GameScreen accumulates them
 * from engine events and passes what is still alive.
 */
export type Effect = {
  kind:
    | "lightning"
    | "nuke"
    | "nova"
    | "splash"
    | "damage"
    | "swing"
    | "muzzle"
    | "text"
    | "corpse";
  pos: { x: number; y: number };
  untilMs: number;
  /** Total effect length, for progress-driven animation. */
  durationMs?: number;
  /** World-clock ms before the effect begins drawing — lets a float lag behind
   * the hit that spawned it (the XP popup trails the damage number). */
  startMs?: number;
  /** Splash: gore family ("blood", "ecto") — frames `<family>_0/_1`.
   * Corpse: the slain enemy's sprite family, drawn as it keels over. */
  sprite?: string;
  /** Text float: the word to rise off the spot (e.g. "DODGE"). */
  text?: string;
  /** Text float: the glyph color. */
  color?: string;
  /** Text float: how far the word climbs over its life, in world px
   * (default 16). XP popups rise further so they read as "flowing up". */
  rise?: number;
  /** Text float: glyph scale (default 1). A golden-arrow XP popup doubles it,
   * and a merged pack-kill float grows it with the pack (≈count/10 — 20 mobs →
   * 2×, 30 → 3×), so a bigger gain reads as a bigger number. */
  scale?: number;
  /** Text float: crit-style jolt. The word shakes left–right–centre in place
   * for a run of opening beats, THEN lifts off — an arrow's (or a whole pack's)
   * XP is basically a crit's worth of levels, so it hits like one before it
   * floats. The beat count and throw grow with `scale`, so a bigger pop rattles
   * longer and wider. Plain floats (DODGE/MISS) leave this off and rise from
   * the first frame. */
  shake?: boolean;
  /** Damage number: the hit's rounded damage. */
  value?: number;
  /** Damage number: crits jolt left-right-center, grow, and glow gold. */
  crit?: boolean;
  /** Damage number: on a crit, how hard the blow rolled in [0, 1] — scales the
   * popup from a modest 1.5× (a glancing crit) up to a fat 3× (a top-of-band
   * slam). Absent = a neutral mid-size crit. */
  critPower?: number;
  /** Swing/muzzle: the aim direction in radians.
   * Corpse: the signed angle it keels over to (±π/2), rolled at spawn so
   * the horde doesn't topple in lockstep. */
  angle?: number;
  /** Corpse: an epic (elite/boss) body — it keels over and then simply lies
   * there for the rest of the level instead of blinking out. There are only
   * ever a handful, so leaving them on the field reads as a battlefield of
   * fallen giants rather than clutter. */
  persist?: boolean;
  /** Swing: the arc's reach in world px (the weapon's effective range). */
  radius?: number;
  /** Swing: the full cone angle in radians (wide blade vs narrow spear). */
  arc?: number;
  /** Muzzle: ranged fires a hot flash, magic a cool cast burst. */
  weaponClass?: "melee" | "ranged" | "magic";
};

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
): void {
  const font = assets.font;
  for (const effect of effects) {
    if (timeMs > effect.untilMs) continue;
    // A delayed float (e.g. the XP popup trailing its damage number) stays
    // hidden until its start tick, then animates from t=0 as usual.
    if (effect.startMs != null && timeMs < effect.startMs) continue;
    const x = Math.round(effect.pos.x - camera.x);
    const groundY = Math.round(effect.pos.y - camera.y);

    if (effect.kind === "splash") {
      // Two-frame gore burst pinned to where the hit landed.
      const duration = effect.durationMs ?? 240;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const frame = t < 0.5 ? 0 : 1;
      const sprite = spriteByName(
        assets.sprites,
        `${effect.sprite ?? "blood"}_${frame}`,
      );
      if (sprite) {
        ctx.drawImage(
          sprite,
          x - Math.round(sprite.width / 2),
          groundY - Math.round(sprite.height / 2),
        );
      }
      continue;
    }

    if (effect.kind === "corpse") {
      // A slain mob's send-off: it keels over flat to the ground with a little
      // hop, lies there a beat, then blinks out and is gone. Purely cosmetic —
      // the engine already removed the live enemy the tick it died, so this
      // plays on top at the spot it fell. Timeline over `duration` (2s):
      // keel-over (first ~260ms) → lie still → blink for the final second.
      const duration = effect.durationMs ?? 2000;
      const age = duration - (effect.untilMs - timeMs); // ms since death
      // A single fixed frame (dying, frame 0) — a corpse never walks or bobs,
      // it just keels over once and lies still. The dead don't animate.
      const sprite = enemySprites(assets.sprites, effect.sprite ?? "ghost")
        .dying[0];
      // Blink out over the final second: skip alternate ~90ms windows so it
      // flickers before it disappears. Epic bodies (persist) never blink —
      // they just keel over and stay down.
      const blinkAt = duration - 1000;
      if (
        !effect.persist &&
        age >= blinkAt &&
        Math.floor(timeMs / 90) % 2 === 0
      )
        continue;
      // Keel-over: rotate 0 → the rolled ±90° over the first 260ms (ease-out),
      // with a brief hop as it topples.
      const fall = Math.min(1, age / 260);
      const eased = fall * (2 - fall);
      const tip = (effect.angle ?? Math.PI / 2) * eased;
      const hop = Math.round(Math.sin(fall * Math.PI) * 4);
      const w = sprite.width;
      const h = sprite.height;
      ctx.save();
      // Pivot about the sprite's feet (bottom-centre) so it falls flat with its
      // base planted, then draw the body rising from that pivot.
      ctx.translate(x, groundY + Math.round(h / 2) - hop);
      ctx.rotate(tip);
      ctx.drawImage(sprite, -Math.round(w / 2), -h);
      ctx.restore();
      continue;
    }

    if (effect.kind === "damage") {
      // The hit's number pops on the victim's head and stays pinned there —
      // only XP floats now. A crit is a fat gold figure that jolts once —
      // a beat left, a beat right, then dead center for the rest of its
      // life — not a continuous buzz. A normal hit is a plain static number.
      // A crit's size tracks how hard it rolled: a glancing crit grows a
      // modest 1.5×, a top-of-band slam a fat 3× (quantized to half-steps so
      // the pixel glyphs stay crisp). It jolts harder the bigger it is.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const crit = effect.crit ?? false;
      const power = effect.critPower ?? 0.5;
      const scale = crit ? Math.round((1.5 + 1.5 * power) * 2) / 2 : 1;
      const elapsedMs = t * duration;
      const shake = !crit
        ? 0
        : elapsedMs < 70
          ? -Math.round(scale)
          : elapsedMs < 140
            ? Math.round(scale)
            : 0;
      const text = formatCompact(effect.value ?? 0);
      const width = font.measure(text) * scale;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      font.draw(
        ctx,
        text,
        x - Math.round(width / 2) + shake,
        groundY - font.height * scale,
        { scale, color: crit ? "#ffd75e" : "#f4f4f4" },
      );
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "text") {
      // A short word (e.g. "DODGE") rises and fades off the spot, like a
      // damage number but spelled out.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const scale = effect.scale ?? 1;
      const elapsedMs = t * duration;
      // A crit-style float jolts in place before it lifts off: it snaps
      // left–right for a run of beats, settles to centre, THEN rises over the
      // remainder. The bigger the gain (the higher `scale`), the more beats it
      // throws and the wider it throws them — a 2× pop goes left–right–centre,
      // a 3× goes left–right–left–centre, and so on up. Plain floats
      // (DODGE/MISS) leave `shake` off and rise from the first frame.
      const stepMs = 55;
      // One alternating beat per unit of scale (min two so the smallest jolt
      // still reads as a shake), then a trailing centre beat, then the rise.
      const shakeBeats = effect.shake ? Math.max(2, Math.round(scale)) : 0;
      const settleMs = shakeBeats * stepMs; // alternation ends → centre
      const shakeMs = settleMs + stepMs; // centre beat held, then lift off
      // A touch more throw for bigger gains — past 2× the swing widens faster
      // than the glyph so a huge pull visibly rattles harder.
      const amp = Math.round(scale + Math.max(0, scale - 2) * 0.5);
      const jolt =
        shakeBeats === 0 || elapsedMs >= settleMs
          ? 0
          : (Math.floor(elapsedMs / stepMs) % 2 === 0 ? -1 : 1) * amp;
      const riseT = effect.shake
        ? Math.max(0, (elapsedMs - shakeMs) / (duration - shakeMs))
        : t;
      const rise = Math.round((effect.rise ?? 16) * riseT);
      const text = effect.text ?? "";
      const width = font.measure(text) * scale;
      const tx = x - Math.round(width / 2) + jolt;
      const ty = groundY - rise - font.height * scale;
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      // A hard 1px drop-shadow first so the word keeps contrast on both the
      // bright floor and the dark sky — the colored glyphs ride on top.
      font.draw(ctx, text, tx + 1, ty + 1, { scale, color: "#0b0d10" });
      font.draw(ctx, text, tx, ty, {
        scale,
        color: effect.color ?? "#7ecbff",
      });
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "swing") {
      // Draw the EXACT region the swing strikes: a filled sector centred on the
      // player, out to the weapon's reach, spanning the weapon's full cone (see
      // `meleeSweep`/`weaponSweepHalfAngle` — the engine ships `radius` = the
      // true reach and `arc` = the full cone here, so the visual and the hit
      // test share one geometry). A bright edge sweeps across that footprint so
      // it still reads as a slash: a wide cone is a blade's arc, a narrow one a
      // spear's thrust straight down the line.
      const duration = effect.durationMs ?? 200;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      const aim = effect.angle ?? 0;
      const reach = Math.max(6, effect.radius ?? 40);
      // The true half-cone — no minimum, so a thrust draws exactly the thin
      // wedge it hits and a saturated (π) cone fills the whole disc.
      const half = Math.min(Math.PI, (effect.arc ?? 1.9) / 2);
      const start = aim - half;
      const end = aim + half;
      ctx.save();
      ctx.translate(x, groundY);
      // The footprint: the filled pie-slice the blow actually covers, faded so
      // it flashes and clears as the swing lands.
      ctx.globalAlpha = Math.max(0, 0.26 * (1 - t));
      ctx.fillStyle = "#9fc4ff";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, start, end);
      ctx.closePath();
      ctx.fill();
      // A thin outline traces the wedge's radial edges and rim so its shape
      // stays legible even at a glance.
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - t));
      ctx.strokeStyle = "#c7ddff";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Bright leading edge racing across the cone — the "slash" landing.
      const lead = start + 2 * half * Math.min(1, t * 1.3);
      ctx.globalAlpha = Math.max(0, 0.9 * (1 - t));
      ctx.strokeStyle = "#f2f7ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, reach, Math.max(start, lead - 0.4), lead);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "muzzle") {
      // A short flash at the weapon's muzzle, a few px ahead along the aim.
      // Ranged fires a hot yellow starburst; magic blooms a cool arcane ring.
      const duration = effect.durationMs ?? 110;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      const aim = effect.angle ?? 0;
      const fade = 1 - t;
      const mx = x + Math.round(Math.cos(aim) * 9);
      // Lift to the weapon's height (the hero holds it mid-body).
      const my = groundY + Math.round(Math.sin(aim) * 9) - 5;
      ctx.save();
      if (effect.weaponClass === "magic") {
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = "#c9a6ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, 2 + t * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(230, 214, 255, ${0.9 * fade})`;
        ctx.fillRect(mx - 1, my - 1, 2, 2);
      } else {
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#fff2c0";
        ctx.beginPath();
        ctx.arc(mx, my, 2 + fade * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd36b";
        ctx.lineWidth = 1;
        for (const spread of [0, 0.5, -0.5]) {
          const len = 4 + t * 4;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(
            mx + Math.cos(aim + spread) * len,
            my + Math.sin(aim + spread) * len,
          );
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "nuke") {
      // A white flash collapsing into an expanding shockwave ring.
      const duration = effect.durationMs ?? 450;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      ctx.fillStyle = `rgba(255, 245, 210, ${0.55 * (1 - t)})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.strokeStyle = `rgba(255, 215, 94, ${0.9 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x, groundY, 12 + t * 240, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }

    if (effect.kind === "nova") {
      // A NOVA proc: a violet ring bursting out to its damage radius — a
      // local, arcane shockwave (no screen flash; procs fire often).
      const duration = effect.durationMs ?? 320;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const reach = (effect.radius ?? 56) * (0.25 + 0.75 * t);
      const fade = 1 - t;
      ctx.strokeStyle = `rgba(184, 138, 232, ${0.85 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, groundY, reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(230, 214, 255, ${0.5 * fade})`;
      ctx.beginPath();
      ctx.arc(x, groundY, reach * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    // A jagged bolt from the sky to the strike point, plus a hot flash.
    ctx.strokeStyle = "#ffd75e";
    ctx.beginPath();
    ctx.moveTo(x + 6, Math.max(0, groundY - 90));
    ctx.lineTo(x - 3, groundY - 55);
    ctx.lineTo(x + 4, groundY - 30);
    ctx.lineTo(x, groundY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 245, 200, 0.9)";
    ctx.fillRect(x - 2, groundY - 2, 4, 4);
  }
}

/** Cheap deterministic hash → [0, 1) for particle variety (no Math.random —
 * the burn must draw identically for a given time, like every effect). */
function fract(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The level-up "burn": while the engine's ding-celebration window
 * (`state.levelUpFxMs`) is live, the hero is wreathed in golden light —
 * a shockwave ring on the ground, a pillar of light rising off him, and
 * embers floating up — the WoW ding, in pixels. The `under` layer (ring +
 * pillar) draws behind the player sprite, the `over` layer (embers) in
 * front, so the glow engulfs the character.
 */
function drawLevelUpBurn(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  timeMs: number,
  layer: "under" | "over",
): void {
  const left = state.levelUpFxMs;
  if (left <= 0) return;
  const duration = LEVELING.dingCelebrationMs;
  const t = 1 - left / duration; // 0 → 1 across the celebration
  const x = Math.round(state.player.pos.x - camera.x);
  const y = Math.round(state.player.pos.y - camera.y - state.player.z);
  // Snap in fast, hold, fade over the last quarter — the modal takes the
  // stage the moment this dies down.
  const fade = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.25);
  ctx.save();

  if (layer === "under") {
    // The ground shockwave: a squashed golden ring bursting outward in the
    // opening beats, the "something big just happened" footprint.
    if (t < 0.45) {
      const ring = t / 0.45; // 0 → 1
      ctx.globalAlpha = 0.85 * (1 - ring);
      ctx.strokeStyle = "#ffd75e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + 6,
        8 + ring * 30,
        (8 + ring * 30) * 0.4,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    // The pillar of light: a gold column rising off the hero, breathing
    // slightly so it reads as living flame rather than a static decal.
    const flicker = 1 + 0.12 * Math.sin(timeMs / 55);
    const w = 15 * flicker;
    const top = y - 58;
    const glow = ctx.createLinearGradient(0, top, 0, y + 8);
    glow.addColorStop(0, "rgba(255, 215, 94, 0)");
    glow.addColorStop(0.55, "rgba(255, 215, 94, 0.5)");
    glow.addColorStop(1, "rgba(255, 242, 192, 0.85)");
    ctx.globalAlpha = 0.6 * fade;
    ctx.fillStyle = glow;
    ctx.fillRect(Math.round(x - w), top, Math.round(w * 2), y + 8 - top);
    // A hot white-gold core, half as wide, twice as bright.
    ctx.globalAlpha = 0.7 * fade;
    const core = ctx.createLinearGradient(0, top + 18, 0, y + 6);
    core.addColorStop(0, "rgba(255, 246, 214, 0)");
    core.addColorStop(1, "rgba(255, 246, 214, 0.9)");
    ctx.fillStyle = core;
    ctx.fillRect(
      Math.round(x - w / 2),
      top + 18,
      Math.round(w),
      y + 6 - (top + 18),
    );
  } else {
    // Rising embers: a dozen golden motes climbing lanes around the hero,
    // each on its own deterministic phase/speed so the column shimmers.
    const EMBERS = 12;
    const palette = ["#ffd75e", "#fff2c0", "#ff9d3b"];
    for (let i = 0; i < EMBERS; i++) {
      const lane = (fract(i * 17.31) - 0.5) * 26; // x offset in the column
      const phase = fract(i * 7.77);
      const speed = 0.9 + fract(i * 3.33) * 0.9; // climbs per celebration
      const climb = (t * speed + phase) % 1; // 0 (feet) → 1 (top)
      const ex = x + Math.round(lane + Math.sin(timeMs / 90 + i) * 2);
      const ey = Math.round(y + 8 - climb * 58);
      const size = climb < 0.3 ? 2 : 1; // embers shrink as they rise
      ctx.globalAlpha = (1 - climb) * fade;
      ctx.fillStyle = palette[i % palette.length]!;
      ctx.fillRect(ex, ey, size, size);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The hero's in-flight attack, handed to `drawPlayer` so the held weapon
 * animates in step with the swing/muzzle effect it accompanies (the developer
 * WEAPON SWING flag). `startMs`/`durationMs` are on the simulation clock
 * (`state.stats.timeMs`) — the same clock `drawEffects` runs on — so the weapon
 * and its slash cone stay locked together. GameScreen captures it from the
 * hero's own `swing`/`shot` events.
 */
export type PlayerAction = {
  kind: "swing" | "shot";
  weaponClass: WeaponClass;
  startMs: number;
  durationMs: number;
};

/** A held-weapon animation pose: a rotation about the shoulder (WEAPON_SHOULDER)
 * plus a small translation, in doll-local coords (mirrored with the doll for
 * facing). Pivoting at the shoulder rather than the grip sweeps the whole
 * implied arm — the weapon rides the end of a stretched-out arm, not just a
 * flick of the wrist. Positive `rot` swings the blade/barrel down and forward
 * in the facing dir. */
type WeaponPose = { rot: number; offX: number; offY: number };

const REST_POSE: WeaponPose = { rot: 0, offX: 0, offY: 0 };

/**
 * The held weapon's pose for the active attack at `nowMs`. Each weapon class
 * gets its own motion, shaped to start AND end at rest so it folds cleanly back
 * to the static pose when the animation lapses (no snap): a blade winds back and
 * whips through its slash arc, a gun recoils with the muzzle rising, a wand
 * thrusts up on the cast. Returns `REST_POSE` when no attack is live.
 */
function weaponPose(
  action: PlayerAction | undefined,
  nowMs: number,
): WeaponPose {
  if (!action) return REST_POSE;
  const t = (nowMs - action.startMs) / action.durationMs;
  if (t < 0 || t > 1) return REST_POSE;
  if (action.weaponClass === "melee") {
    // windup (cock back) → strike (whip forward, ease-out) → recover
    // (smoothstep back to rest). Big sweep so the slash reads at a glance.
    const WINDUP = 0.55; // rad the blade cocks back
    const STRIKE = 1.35; // rad it whips forward through the slash
    let rot: number;
    if (t < 0.18) {
      rot = -WINDUP * (t / 0.18);
    } else if (t < 0.5) {
      const p = (t - 0.18) / 0.32;
      rot = -WINDUP + (STRIKE + WINDUP) * (1 - (1 - p) * (1 - p));
    } else {
      const p = (t - 0.5) / 0.5;
      rot = STRIKE * (1 - p * p * (3 - 2 * p));
    }
    return { rot, offX: 0, offY: 0 };
  }
  if (action.weaponClass === "ranged") {
    // A quick recoil impulse: kick back toward the shoulder, muzzle rising,
    // then settle forward. Triangle peaking early so the punch is felt.
    const kick = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    return { rot: -0.4 * kick, offX: -3 * kick, offY: -1 * kick };
  }
  // Magic: a smooth bloom (sin) that thrusts the wand up and forward on the
  // cast and eases it back — the staff "presents" the spell.
  const bloom = Math.sin(Math.PI * t);
  return { rot: 0.35 * bloom, offX: bloom, offY: -3 * bloom };
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  action: PlayerAction | undefined,
): void {
  const player = state.player;
  const airborne = player.z > 0;
  // The paper-doll owns the costume: body sprite (from `playerAppearance`),
  // worn-armor overlays, and the held weapon, as one ordered layer stack
  // shared with the DOM avatars (paper-doll.ts). The armor always draws; the
  // developer CHARACTER WEAPON flag can strip the field hero's held weapon
  // (the HUD avatar keeps its weapon).
  const { sprites } = assets;
  const frame = airborne
    ? "jump"
    : player.moving && Math.floor(timeMs / 160) % 2 === 1
      ? "1"
      : "0";
  const layers = playerDollLayers(state, frame, {
    weapon: getSettings().characterWeapon === "on",
  });
  // In the rift the ground isn't there — bob the grounded hero so he reads as
  // floating. The jump height (`player.z`) already lifts him in the air, so the
  // hover only applies while grounded to avoid fighting the arc.
  const hover =
    !airborne && state.level.biome === RIFT_HOVER_BIOME
      ? Math.sin((timeMs / RIFT_HOVER_PERIOD_MS) * Math.PI * 2) *
        RIFT_HOVER_AMPLITUDE
      : 0;
  const x = Math.round(player.pos.x - TILE / 2 - camera.x);
  const y = Math.round(player.pos.y - TILE / 2 - camera.y - player.z - hover);

  // Grounding shadow while airborne — the only cue for jump height.
  if (airborne) {
    const shadow = assets.sprites.shadow;
    ctx.drawImage(
      shadow,
      Math.round(player.pos.x - shadow.width / 2 - camera.x),
      Math.round(player.pos.y - shadow.height / 2 - camera.y + 5),
    );
  }

  // Blink during the post-hit flash so damage is legible on the character.
  if (player.hurtFlashMs > 0 && Math.floor(timeMs / 60) % 2 === 0) return;

  // Facing is a whole-doll horizontal mirror, so every layer — body, worn
  // overlays, held weapon — draws inside one flipped transform and the
  // outfit stays glued to the body. A layer's own `flip` mirrors the sprite
  // in place (left-pointing weapon icons) on top of whichever facing holds.
  // The held weapon swings on attack when the developer WEAPON SWING flag is
  // on (a pure render concern, like CHARACTER WEAPON): the weapon layer pivots
  // about the grip in step with the swing/muzzle effect. The pose folds to rest
  // between blows, and there is no weapon layer at all when CHARACTER WEAPON is
  // off, so the flag only bites when both are on.
  const pose =
    getSettings().weaponSwing === "on"
      ? weaponPose(action, state.stats.timeMs)
      : REST_POSE;
  ctx.save();
  if (player.faceLeft) {
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  for (const layer of layers) {
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue; // unknown def or stale save: skip, never crash
    const swung =
      layer.weapon && (pose.rot !== 0 || pose.offX !== 0 || pose.offY !== 0);
    if (swung) {
      // Pivot the weapon about the SHOULDER (translate to it, rotate, translate
      // back), on top of whatever facing transform already holds. Pivoting at
      // the shoulder — not the grip — arcs the grip end too, so the weapon
      // reads as riding a swinging arm rather than twisting in place.
      ctx.save();
      ctx.translate(
        WEAPON_SHOULDER.x + pose.offX,
        WEAPON_SHOULDER.y + pose.offY,
      );
      ctx.rotate(pose.rot);
      ctx.translate(-WEAPON_SHOULDER.x, -WEAPON_SHOULDER.y);
    }
    if (layer.flip) {
      ctx.save();
      ctx.translate(layer.dx + image.width, layer.dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(image, layer.dx, layer.dy);
    }
    if (swung) ctx.restore();
  }
  ctx.restore();
}
