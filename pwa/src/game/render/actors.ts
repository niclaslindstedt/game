// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The friendly cast around the hero: the wandering merchant, the recruited
// companions, and the running ability visuals (stasis rings, orbiting orbs,
// the magnet's reach).

import {
  abilityDef,
  companionDef,
  immolationSpellBlock,
  itemSpellOrbPositions,
  orbitSpellBlock,
  stasisSpellParams,
  type GameState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { walkFrame, walkGait, withStance } from "./gait.ts";
import { drawRunningPowerups } from "./powerups.ts";
import {
  drawSpriteCentered,
  drawSpriteFacing,
  makeInView,
  spriteTopLeft,
  worldViewOf,
} from "./shared.ts";
import { beginBillboard, billboard, endBillboard } from "./tilt.ts";
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
  const inView = makeInView(camera, worldViewOf(ctx.canvas));
  if (!inView(merchant.pos.x, merchant.pos.y, 48)) return;
  beginBillboard(ctx, merchant.pos.x, merchant.pos.y, camera.x, camera.y);
  const { sprites } = assets;
  // He walks like everything else with legs does (gait.ts): the stride is
  // measured off the ground he covers, so his legs and his tip keep his pace.
  const gait = walkGait("merchant", merchant.pos, timeMs);
  const frame = merchant.moving ? walkFrame(gait) : 0;
  const sprite =
    spriteByName(sprites, `${merchant.sprite}_${frame}`) ??
    spriteByName(sprites, `merchant_${frame}`);
  if (!sprite) {
    endBillboard(ctx);
    return;
  }
  const { x, y } = spriteTopLeft(merchant.pos, sprite, camera);
  const bodyY = y + Math.round(gait.lift);
  withStance(
    ctx,
    { x: Math.round(merchant.pos.x - camera.x), y: bodyY + sprite.height },
    { tilt: gait.tilt },
    () => drawSpriteFacing(ctx, sprite, x, bodyY, merchant.faceLeft),
  );
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
  endBillboard(ctx);
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
  const inView = makeInView(camera, worldViewOf(ctx.canvas));
  for (const companion of state.companions) {
    if (!inView(companion.pos.x, companion.pos.y, 48)) continue;
    beginBillboard(ctx, companion.pos.x, companion.pos.y, camera.x, camera.y);
    const def = companionDef(companion.defId);
    const downed = companion.downed === true;
    // A companion walks on the hero's terms (gait.ts) — and a DOWNED one is
    // kneeling, so it neither steps nor tips: it lies as still as the sprite.
    const gait = walkGait(`c${companion.id}`, companion.pos, timeMs);
    const frame = !downed && companion.moving ? walkFrame(gait) : 0;
    const sprite =
      spriteByName(assets.sprites, `${def.sprite}_${frame}`) ??
      spriteByName(assets.sprites, `${def.sprite}_0`);
    if (!sprite) {
      endBillboard(ctx);
      continue;
    }
    const { x, y } = spriteTopLeft(companion.pos, sprite, camera);
    const bodyY = downed ? y : y + Math.round(gait.lift);
    ctx.save();
    if (downed) ctx.globalAlpha = 0.55;
    withStance(
      ctx,
      { x: Math.round(companion.pos.x - camera.x), y: bodyY + sprite.height },
      { tilt: downed ? 0 : gait.tilt },
      () => drawSpriteFacing(ctx, sprite, x, bodyY, companion.faceLeft),
    );
    ctx.restore();

    // The readout above the head: health while hurt. A DOWNED companion shows
    // an EMPTY bar rather than a recovery meter — there is nothing counting
    // down any more, and a bar that filled would promise a revive that is not
    // coming (the salts are, and they are in the player's bag).
    const barWidth = 16;
    const bx = Math.round(companion.pos.x - barWidth / 2 - camera.x);
    const by = y - 6;
    if (downed) {
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(bx - 1, by - 1, barWidth + 2, 5);
      ctx.fillStyle = "#4a1d1d";
      ctx.fillRect(bx, by, barWidth, 3);
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
    endBillboard(ctx);
  }
}

/**
 * Running ability visuals. The POWERUP half — the orbit ring, the stasis dome,
 * the magnet's field, the wake, the wells, the guns, and the shells the hero
 * wears — lives in ./powerups.ts (it is a whole look catalog now); what stays
 * here is the GRANTED forever spells worn gear casts, which have their own,
 * deliberately plainer read.
 */
export function drawAbilities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const player = state.players[0];
  drawRunningPowerups(ctx, state, assets, camera, timeMs);

  // GRANTED forever spells (the `spell` affix on worn gear) draw off the
  // same engine params they tick with: the orbit ring's orbs, the stasis
  // field's slow ring. Storm strikes ride the lightning effect like the
  // pickup's. Same visuals as the pickups — the power reads identically,
  // it just never expires.
  for (const spell of player.itemSpells) {
    if (spell.spell === "orbit") {
      const params = orbitSpellBlock(state, spell.rank);
      const sprite =
        spriteByName(assets.sprites, params.sprite) ?? assets.sprites.fireball;
      // Each orb stands where its own arc has carried it. The RING they trace
      // foreshortens with the floor — which is the tilt earning its keep: the
      // orbit reads as going round him rather than round a circle drawn on him
      // — while the orbs themselves keep their size.
      for (const orb of itemSpellOrbPositions(state, player, spell)) {
        billboard(ctx, orb.x, orb.y, camera.x, camera.y, () =>
          drawSpriteCentered(ctx, sprite, orb, camera),
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
    if (spell.spell === "immolation") {
      // The burning aura's live reach (rank widens it, INT quickens the tick):
      // a hot double ring — a flickering orange rim and a fainter inner glow —
      // so its damage zone reads at a glance while the ticks scorch the horde.
      drawImmolationRing(
        ctx,
        state,
        camera,
        immolationSpellBlock(state, spell.rank).radius,
        timeMs,
      );
    }
  }

  // A POWERUP carrying the same `immolation` block wears the same ring: the
  // effect is one implementation with two carriers (see ability-effects.ts), so
  // its picture must not be the granted spell's alone.
  for (const ability of player.abilities) {
    const immolation = abilityDef(ability.defId).immolation;
    if (!immolation) continue;
    drawImmolationRing(ctx, state, camera, immolation.radius, timeMs);
  }
}

/**
 * The IMMOLATION aura's live reach: a hot double ring — a flickering orange rim
 * and a fainter inner glow — so its damage zone reads at a glance while the
 * ticks scorch the horde. Drawn for either carrier off a plain radius, because
 * a ring the hero carries looks the same however he came by it.
 */
function drawImmolationRing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  radius: number,
  timeMs: number,
): void {
  const cx = Math.round(state.players[0].pos.x - camera.x);
  const cy = Math.round(state.players[0].pos.y - camera.y);
  const flicker = 0.32 + 0.12 * Math.sin(timeMs / 90);
  ctx.strokeStyle = `rgba(255, 150, 60, ${flicker})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(255, 216, 140, ${flicker * 0.6})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}
