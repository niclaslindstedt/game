// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dropped loot on the field: each pickup's icon with its hover, glow, and
// rarity glints — plus the MERCY DROP's angel-delivery descent.

import {
  abilityDef,
  equipmentIcon,
  MERCY,
  storyItemDef,
  type GameState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { medkitIconFor } from "../consumables.ts";
import { TIER_COLORS } from "../tiers.ts";
import { glowSprite } from "./caches.ts";
import { clamp01, spriteTopLeft } from "./shared.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

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
  const p = clamp01(1 - (item.deliverMs ?? 0) / total);
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

export function drawItems(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
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
    const glowRgb =
      item.kind === "ability" ? "120, 190, 255" : "255, 236, 170";
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
    const at = spriteTopLeft(item.pos, sprite, camera);
    const x = at.x;
    const y = at.y + hover;
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
}
