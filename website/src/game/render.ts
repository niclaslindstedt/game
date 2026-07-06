// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas renderer: draws one frame of the engine state. The canvas backing
// store is in world units (1 canvas px = 1 world unit) and the browser
// upscales it with image-rendering: pixelated, so all coordinates here stay
// integers and the pixel art stays crisp. Draw order: ground → decor →
// landmarks → items → projectiles → enemies → player (shadow, jump height)
// → hurt flash.

import {
  abilityDef,
  enemyDef,
  equipmentIcon,
  orbPositions,
  type GameState,
} from "@game/core";

import { spriteByName, type GameAssets, type Sprites } from "./assets.ts";
import { TIER_COLORS } from "./tiers.ts";

/** CSS pixels per world unit — the app's zoom level. */
export const VIEW_SCALE = 2;

const TILE = 16;

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
 * Pick the ground tile for a cell. The biome comes from the level def;
 * "moon" lays regolith with occasional pocks and clustered gravel patches
 * (patches decided on a coarser grid so scree clumps instead of speckling).
 */
function groundTile(sprites: Sprites, tx: number, ty: number) {
  const patch = tileHash(tx >> 2, ty >> 2);
  if (patch % 7 === 0) {
    return tileHash(tx, ty) % 2 === 0 ? sprites.gravel_0 : sprites.gravel_1;
  }
  return tileHash(tx, ty) % 23 === 0 ? sprites.moon_1 : sprites.moon_0;
}

const DECOR_SPRITES: Record<string, keyof Sprites> = {
  craterBig: "crater_big",
  craterSmall: "crater_small",
  rocks: "rocks",
};

const LANDMARK_SPRITES: Record<string, keyof Sprites> = {
  lander: "lander",
  flag: "flag",
};

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const { sprites } = assets;
  const view = { width: ctx.canvas.width, height: ctx.canvas.height };
  ctx.imageSmoothingEnabled = false;

  // Letterbox backdrop (visible when the view outgrows the level).
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, view.width, view.height);

  // Ground: only the tiles overlapping the view.
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
        groundTile(sprites, tx, ty),
        tx * TILE - camera.x,
        ty * TILE - camera.y,
      );
    }
  }

  const inView = (x: number, y: number, margin: number) =>
    x >= camera.x - margin &&
    x <= camera.x + view.width + margin &&
    y >= camera.y - margin &&
    y <= camera.y + view.height + margin;

  // Decor: craters and rocks under everything else.
  for (const decor of state.decor) {
    if (!inView(decor.pos.x, decor.pos.y, 32)) continue;
    const sprite = sprites[DECOR_SPRITES[decor.kind] ?? "rocks"];
    ctx.drawImage(
      sprite,
      Math.round(decor.pos.x - sprite.width / 2 - camera.x),
      Math.round(decor.pos.y - sprite.height / 2 - camera.y),
    );
  }

  // Landmarks: the lander sits on its pos; the flag is anchored at its base.
  for (const landmark of state.landmarks) {
    if (!inView(landmark.pos.x, landmark.pos.y, 48)) continue;
    const sprite = sprites[LANDMARK_SPRITES[landmark.kind] ?? "rocks"];
    const yAnchor =
      landmark.kind === "flag" ? sprite.height - 2 : sprite.height / 2;
    ctx.drawImage(
      sprite,
      Math.round(landmark.pos.x - sprite.width / 2 - camera.x),
      Math.round(landmark.pos.y - yAnchor - camera.y),
    );
  }

  for (const item of state.items) {
    if (!inView(item.pos.x, item.pos.y, 16)) continue;
    const sprite =
      item.kind === "medkit"
        ? sprites.medkit
        : item.kind === "upgrade"
          ? sprites.upgrade
          : item.kind === "ability"
            ? (spriteByName(sprites, abilityDef(item.defId).icon) ??
              sprites.medkit)
            : (spriteByName(sprites, equipmentIcon(item.equipment.defId)) ??
              sprites.medkit);
    const x = Math.round(item.pos.x - sprite.width / 2 - camera.x);
    const y = Math.round(item.pos.y - sprite.height / 2 - camera.y);
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
    const sprite =
      projectile.weaponClass === "magic" ? sprites.spark : sprites.bolt;
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
    const frame = Math.floor(timeMs / 300 + enemy.id) % 2;
    const sprite =
      spriteByName(sprites, `${def.sprite}_${frame}`) ?? sprites.ghost_0;
    const bob = Math.round(Math.sin(timeMs / 260 + enemy.id) * 1.5);
    const x = Math.round(enemy.pos.x - sprite.width / 2 - camera.x);
    const y = Math.round(enemy.pos.y - sprite.height / 2 - camera.y) + bob;
    ctx.drawImage(sprite, x, y);

    // Bosses carry their health over their head once wounded.
    if (def.role === "boss" && enemy.hp < enemy.maxHp) {
      const barWidth = 40;
      const bx = Math.round(enemy.pos.x - barWidth / 2 - camera.x);
      const by = y - 6;
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, by - 1, barWidth + 2, 5);
      ctx.fillStyle = "#d83a3a";
      ctx.fillRect(bx, by, Math.round((barWidth * enemy.hp) / enemy.maxHp), 3);
    }
  }

  drawAbilities(ctx, state, assets, camera, timeMs);
  drawPlayer(ctx, state, assets, camera, timeMs);

  // Red flash while recently hurt.
  if (state.player.hurtFlashMs > 0) {
    ctx.fillStyle = `rgba(216, 58, 58, ${(0.25 * state.player.hurtFlashMs) / 250})`;
    ctx.fillRect(0, 0, view.width, view.height);
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
  }
}

/**
 * Transient app-side effects (the storm's lightning strikes). GameScreen
 * accumulates them from engine events and passes what is still alive.
 */
export type Effect = {
  kind: "lightning";
  pos: { x: number; y: number };
  untilMs: number;
};

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
): void {
  for (const effect of effects) {
    if (timeMs > effect.untilMs) continue;
    const x = Math.round(effect.pos.x - camera.x);
    const groundY = Math.round(effect.pos.y - camera.y);
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
  const sprite = airborne
    ? assets.sprites.player_jump
    : player.moving && Math.floor(timeMs / 160) % 2 === 1
      ? assets.sprites.player_1
      : assets.sprites.player_0;
  const x = Math.round(player.pos.x - TILE / 2 - camera.x);
  const y = Math.round(player.pos.y - TILE / 2 - camera.y - player.z);

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
