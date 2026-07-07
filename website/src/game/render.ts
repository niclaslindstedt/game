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
  LAST_STAND,
  magnetRadius,
  orbPositions,
  playerAppearance,
  storyItemDef,
  WOUNDS,
  type GameState,
  type TileSpec,
} from "@game/core";

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
  const fallback = spriteByName(sprites, tiles.ground.common) ?? sprites.moon_0;
  const pick = (name: string) => spriteByName(sprites, name) ?? fallback;
  if (tiles.patch && tileHash(tx >> 2, ty >> 2) % tiles.patch.every === 0) {
    return pick(tileHash(tx, ty) % 2 === 0 ? tiles.patch.a : tiles.patch.b);
  }
  const { common, rare, rareEvery } = tiles.ground;
  return pick(tileHash(tx, ty) % rareEvery === 0 ? rare : common);
}

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
        groundTile(sprites, state.level.tiles, tx, ty),
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

  for (const item of state.items) {
    if (!inView(item.pos.x, item.pos.y, 16)) continue;
    const sprite =
      item.kind === "medkit"
        ? sprites.medkit
        : item.kind === "xp"
          ? sprites.upgrade
          : item.kind === "repair"
            ? sprites.repair
            : item.kind === "ability"
              ? (spriteByName(sprites, abilityDef(item.defId).icon) ??
                sprites.medkit)
              : item.kind === "story"
                ? (spriteByName(sprites, storyItemDef(item.defId).icon) ??
                  sprites.medkit)
                : (spriteByName(sprites, equipmentIcon(item.equipment.defId)) ??
                  sprites.medkit);
    // Dropped loot hovers and glows so it reads as pickupable, not decor.
    // Phase by item.id (like enemy bob) so items don't pulse in lockstep.
    const cx = Math.round(item.pos.x - camera.x);
    const cy = Math.round(item.pos.y - camera.y);
    const glowR = sprite.width * 0.9;
    const glowAlpha = 0.3 + 0.14 * Math.sin(timeMs / 240 + item.id);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, `rgba(255, 236, 170, ${glowAlpha})`);
    glow.addColorStop(1, "rgba(255, 236, 170, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
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
    const stage = lastStand
      ? "_dying"
      : def.role !== "minion" && hpFrac <= WOUNDS.wreckedAt
        ? "_wrecked"
        : hpFrac <= WOUNDS.hurtAt
          ? "_hurt"
          : "";
    const sprite =
      (stage
        ? spriteByName(sprites, `${def.sprite}${stage}_${frame}`)
        : undefined) ??
      spriteByName(sprites, `${def.sprite}_${frame}`) ??
      sprites.ghost_0;
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
  kind: "lightning" | "nuke" | "splash" | "damage" | "swing" | "muzzle";
  pos: { x: number; y: number };
  untilMs: number;
  /** Total effect length, for progress-driven animation. */
  durationMs?: number;
  /** Splash: sprite family ("blood", "ecto") — frames `<family>_0/_1`. */
  sprite?: string;
  /** Damage number: the hit's rounded damage. */
  value?: number;
  /** Damage number: crits shake, grow, and glow gold. */
  crit?: boolean;
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
      // The hit's number rises off the victim's head. Crits slam first —
      // a fat gold figure shaking in place — then float up with the rest.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const crit = effect.crit ?? false;
      const shakePhase = crit ? Math.min(1, t / 0.25) : 1;
      const rise = Math.round(
        (crit ? 26 : 18) * Math.max(0, t - (crit ? 0.25 : 0)),
      );
      const shake =
        crit && shakePhase < 1 ? Math.round(Math.sin(timeMs / 14) * 2) : 0;
      const scale = crit ? 2 : 1;
      const text = String(effect.value ?? 0);
      const width = font.measure(text) * scale;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      font.draw(
        ctx,
        text,
        x - Math.round(width / 2) + shake,
        groundY - rise - font.height * scale,
        { scale, color: crit ? "#ffd75e" : "#f4f4f4" },
      );
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "swing") {
      // The slash sweeps through the aim across the weapon's cone: a bright
      // leading edge chasing a softer trail, at the weapon's reach. A wide
      // cone reads as a blade's arc; a narrow one as a spear's thrust straight
      // down the line. Reads as the swing without a per-weapon sprite.
      const duration = effect.durationMs ?? 200;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      const aim = effect.angle ?? 0;
      const reach = Math.max(6, (effect.radius ?? 40) - 4);
      // Half the true cone, clamped so even a pure thrust shows a sliver.
      const half = Math.max(0.12, (effect.arc ?? 1.9) / 2);
      const start = aim - half;
      // The edge races a touch ahead of the fade so the slash "lands".
      const lead = start + 2 * half * Math.min(1, t * 1.3);
      ctx.save();
      ctx.translate(x, groundY);
      // Softer trailing sweep behind the edge.
      ctx.globalAlpha = Math.max(0, 0.4 * (1 - t));
      ctx.strokeStyle = "#9fc4ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, reach - 1, start, lead);
      ctx.stroke();
      // Bright leading edge.
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
