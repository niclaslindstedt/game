// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas renderer: draws one frame of the engine state. The canvas backing
// store is in world units (1 canvas px = 1 world unit) and the browser
// upscales it with image-rendering: pixelated, so all coordinates here stay
// integers and the pixel art stays crisp. Draw order: ground → decor →
// landmarks → items → projectiles → enemies → player (shadow, jump height)
// → hurt flash.

import {
  abilityDef,
  APPARITION,
  enemyDef,
  equipmentIcon,
  LAST_STAND,
  magnetRadius,
  orbPositions,
  playerAppearance,
  storyItemDef,
  WOUNDS,
  type GameState,
  type TileSpec,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";

import { spriteByName, type GameAssets, type Sprites } from "./assets.ts";
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

/** Top-left of the view rect: player-centered, clamped to the level. */
export function computeCamera(
  state: GameState,
  viewWidth: number,
  viewHeight: number,
): Camera {
  const clampAxis = (center: number, view: number, level: number) => {
    // A view larger than the level parks the level centered inside it.
    if (view >= level) return Math.round((level - view) / 2);
    return Math.round(Math.min(Math.max(center - view / 2, 0), level - view));
  };
  return {
    x: clampAxis(state.player.pos.x, viewWidth, state.level.width),
    y: clampAxis(state.player.pos.y, viewHeight, state.level.height),
  };
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
        ? sprites.medkit
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

    // Bosses and elites carry their health over their head once wounded.
    if (def.role !== "minion" && enemy.hp < enemy.maxHp) {
      const barWidth = def.role === "boss" ? 40 : 28;
      const bx = Math.round(enemy.pos.x - barWidth / 2 - camera.x);
      const by = y - 6;
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, by - 1, barWidth + 2, 5);
      ctx.fillStyle = def.role === "boss" ? "#d83a3a" : "#d9a0f0";
      ctx.fillRect(bx, by, Math.round((barWidth * enemy.hp) / enemy.maxHp), 3);
    }
  }

  drawMerchant(ctx, state, assets, camera, timeMs);
  drawAbilities(ctx, state, assets, camera, timeMs);
  drawPlayer(ctx, state, assets, camera, timeMs);

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
      // A faint pulsing ring marks the field's slowing reach.
      const pulse = 0.18 + 0.08 * Math.sin(timeMs / 220);
      ctx.strokeStyle = `rgba(140, 205, 215, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        Math.round(player.pos.x - camera.x),
        Math.round(player.pos.y - camera.y),
        def.stasis.radius,
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
}

/**
 * Transient app-side effects: lightning strikes, nuke rings, gore splashes
 * on hit mobs, and floating damage numbers. GameScreen accumulates them
 * from engine events and passes what is still alive.
 */
export type Effect = {
  kind:
    "lightning" | "nuke" | "splash" | "damage" | "swing" | "muzzle" | "text";
  pos: { x: number; y: number };
  untilMs: number;
  /** Total effect length, for progress-driven animation. */
  durationMs?: number;
  /** World-clock ms before the effect begins drawing — lets a float lag behind
   * the hit that spawned it (the XP popup trails the damage number). */
  startMs?: number;
  /** Splash: sprite family ("blood", "ecto") — frames `<family>_0/_1`. */
  sprite?: string;
  /** Text float: the word to rise off the spot (e.g. "DODGE"). */
  text?: string;
  /** Text float: the glyph color. */
  color?: string;
  /** Text float: how far the word climbs over its life, in world px
   * (default 16). XP popups rise further so they read as "flowing up". */
  rise?: number;
  /** Damage number: the hit's rounded damage. */
  value?: number;
  /** Damage number: crits jolt left-right-center, grow, and glow gold. */
  crit?: boolean;
  /** Damage number: on a crit, how hard the blow rolled in [0, 1] — scales the
   * popup from a modest 1.5× (a glancing crit) up to a fat 3× (a top-of-band
   * slam). Absent = a neutral mid-size crit. */
  critPower?: number;
  /** Swing/muzzle: the aim direction in radians. */
  angle?: number;
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
      const rise = Math.round((effect.rise ?? 16) * t);
      const text = effect.text ?? "";
      const width = font.measure(text);
      const tx = x - Math.round(width / 2);
      const ty = groundY - rise - font.height;
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      // A hard 1px drop-shadow first so the word keeps contrast on both the
      // bright floor and the dark sky — the colored glyphs ride on top.
      font.draw(ctx, text, tx + 1, ty + 1, { scale: 1, color: "#0b0d10" });
      font.draw(ctx, text, tx, ty, {
        scale: 1,
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

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const player = state.player;
  const airborne = player.z > 0;
  // The engine owns the player's costume: `playerAppearance` names the sprite
  // family (plain-clothes "hero" until the EVA suit, "player" after), so a
  // sequel's costume changes are data — no branch here.
  const { sprites } = assets;
  const family = playerAppearance(state);
  const walkA = spriteByName(sprites, `${family}_0`) ?? sprites.hero_0;
  const walkB = spriteByName(sprites, `${family}_1`) ?? sprites.hero_1;
  const jump = spriteByName(sprites, `${family}_jump`) ?? sprites.hero_jump;
  const sprite = airborne
    ? jump
    : player.moving && Math.floor(timeMs / 160) % 2 === 1
      ? walkB
      : walkA;
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

  if (player.faceLeft) {
    ctx.save();
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sprite, x, y);
  }
}
