// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The friendly cast around the hero: the wandering merchant, the recruited
// companions, and the running ability visuals (stasis rings, orbiting orbs,
// the magnet's reach).

import {
  abilityDef,
  COMPANIONS,
  companionDef,
  itemSpellOrbPositions,
  magnetRadius,
  orbitSpellParams,
  orbPositions,
  stasisRadius,
  stasisSpellParams,
  type GameState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import {
  drawSpriteCentered,
  drawSpriteFacing,
  makeInView,
  spriteTopLeft,
} from "./shared.ts";
import { type Camera } from "./view.ts";

/**
 * The wandering merchant: the trader in this level's costume (the engine
 * resolves his sprite family from the level def), striding his wander legs
 * until met. Once discovered a gold coin bobs over the stall — the "open
 * for business" tell that also makes him findable again from across a
 * screen.
 */
export function drawMerchant(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const merchant = state.merchant;
  const inView = makeInView(camera, ctx.canvas);
  if (!inView(merchant.pos.x, merchant.pos.y, 48)) return;
  const { sprites } = assets;
  const frame = merchant.moving && Math.floor(timeMs / 200) % 2 === 1 ? 1 : 0;
  const sprite =
    spriteByName(sprites, `${merchant.sprite}_${frame}`) ??
    spriteByName(sprites, `merchant_${frame}`);
  if (!sprite) return;
  const { x, y } = spriteTopLeft(merchant.pos, sprite, camera);
  drawSpriteFacing(ctx, sprite, x, y, merchant.faceLeft);
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
export function drawCompanions(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const inView = makeInView(camera, ctx.canvas);
  for (const companion of state.companions) {
    if (!inView(companion.pos.x, companion.pos.y, 48)) continue;
    const def = companionDef(companion.defId);
    const downed = companion.downedMs !== undefined;
    const frame =
      !downed && companion.moving && Math.floor(timeMs / 200) % 2 === 1 ? 1 : 0;
    const sprite =
      spriteByName(assets.sprites, `${def.sprite}_${frame}`) ??
      spriteByName(assets.sprites, `${def.sprite}_0`);
    if (!sprite) continue;
    const { x, y } = spriteTopLeft(companion.pos, sprite, camera);
    ctx.save();
    if (downed) ctx.globalAlpha = 0.55;
    drawSpriteFacing(ctx, sprite, x, y, companion.faceLeft);
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
export function drawAbilities(
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
        drawSpriteCentered(ctx, sprite, orb, camera);
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
        drawSpriteCentered(ctx, sprite, orb, camera);
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
