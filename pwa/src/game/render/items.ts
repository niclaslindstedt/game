// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Dropped loot on the field: each pickup's icon with its hover, its rarity
// aura (./loot-aura.ts), the D2 TOSS that throws it clear of the body it came
// out of — plus the MERCY DROP's angel-delivery descent.

import {
  abilityDef,
  AMMO_KINDS,
  equipmentIcon,
  goldSprite,
  MERCY,
  questItemDef,
  storyItemDef,
  type GameState,
  type Item,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { medkitIconFor } from "../consumables.ts";
import { glowSprite } from "./caches.ts";
import { drawGoldGlitter } from "./gold.ts";
import {
  drawLootAuraOver,
  drawLootAuraUnder,
  lootAuraFor,
  type LootAura,
} from "./loot-aura.ts";
import { clamp01, spriteTopLeft } from "./shared.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";
import type { SpriteImage } from "@ui/lib/atlas.ts";

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
  drop: SpriteImage,
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

/**
 * THE TOSS — a drop still in the air, thrown clear of the body it came out of.
 *
 * The engine parks the item at its LANDING spot the moment it is minted and
 * only counts the flight off (`ItemToss`), so everything here is derived: the
 * ground track is a straight lerp from `toss.from` to `item.pos`, the height is
 * one parabola over it, and the tumble is the same `p` again. Nothing is
 * integrated, so the arc is identical at 30 fps and 144, and pausing mid-flight
 * leaves the item exactly where it was.
 *
 * Two things sell it beyond the arc. The SHADOW stays on the ground and shrinks
 * as the piece climbs — without it a sprite rising up the screen reads as a
 * sprite walking away from the camera. And a rare-or-better find drags its own
 * colour with it, so the good one is picked out of a five-item spill in the air,
 * before any of them have landed.
 */
function drawToss(
  ctx: CanvasRenderingContext2D,
  toss: NonNullable<Item["toss"]>,
  landing: { x: number; y: number },
  sprite: SpriteImage,
  aura: LootAura | null,
  camera: Camera,
): void {
  const { from, ms, totalMs } = toss;
  const p = clamp01(1 - ms / Math.max(1, totalMs));
  const gx = from.x + (landing.x - from.x) * p - camera.x;
  const gy = from.y + (landing.y - from.y) * p - camera.y;
  // The hop's height is priced off the ground it covers, with a floor — a find
  // that lands where it fell still has to visibly LEAVE the corpse — and a
  // ceiling, so a long unique scatter doesn't sail out of the viewport.
  const reach = Math.hypot(landing.x - from.x, landing.y - from.y);
  const peak = Math.min(30, 13 + reach * 0.22);
  const lift = 4 * p * (1 - p) * peak;

  // The shadow, on the ground the whole way: darkest and widest at both ends,
  // tightest at the apex.
  const close = 1 - lift / peak;
  ctx.save();
  ctx.globalAlpha = 0.14 + 0.2 * close;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(gx, gy + 3, 3 + 3 * close, (3 + 3 * close) * 0.42, 0, 0, 7);
  ctx.fill();
  ctx.restore();

  // A rare-or-better find lights its own flight.
  if (aura && aura.rank >= 2) {
    const trail = glowSprite(aura.rgb, Math.round(sprite.width * 0.8));
    if (trail) {
      ctx.globalAlpha = 0.34;
      ctx.drawImage(
        trail,
        gx - trail.width / 2,
        gy - lift - trail.height / 2,
        trail.width,
        trail.height,
      );
      ctx.globalAlpha = 1;
    }
  }

  // The tumble: one turn over a hop, two over a long throw. It spins about its
  // own centre, so the icon has to be drawn from the middle rather than from
  // the top-left the grounded path uses.
  ctx.save();
  ctx.translate(gx, gy - lift);
  ctx.rotate(p * (reach > 40 ? 2 : 1) * Math.PI * 2);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();
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
    // Loot stands on the floor rather than lying in it — including the angel's
    // whole descent, whose entry height is a height in the AIR and must not be
    // foreshortened along with the ground it is falling toward.
    beginBillboard(ctx, item.pos.x, item.pos.y, camera.x, camera.y);
    const sprite =
      item.kind === "medkit"
        ? (spriteByName(sprites, medkitIconFor(item.tier ?? 0)) ??
          sprites.medkit)
        : // A PILE OF GOLD wears the rung of the ladder its `amount` puts it on
          // (config `GOLD.pileTiers`), so how much is in it is legible from
          // across the room without a number over it.
          item.kind === "gold"
          ? (spriteByName(sprites, goldSprite(item.amount, item.id)) ??
            sprites.medkit)
          : // The XP SCROLL — read by walking over it (there is nothing to dock),
            // so it wears its own parchment-and-blue-script sprite rather than
            // the app's update-prompt arrow it used to borrow.
            item.kind === "xp"
            ? sprites.xp_scroll
            : item.kind === "repair"
              ? sprites.repair
              : item.kind === "drink"
                ? sprites.drink
                : // A BOX OF AMMUNITION draws its kind's own ground sprite — a
                  // couple of cartridges lying in the dirt, a bundle of arrows,
                  // a pair of charged cells — so a shooter reads what is worth
                  // the walk from across the room.
                  item.kind === "ammo"
                  ? (spriteByName(sprites, AMMO_KINDS[item.ammo].sprite) ??
                    sprites.medkit)
                  : item.kind === "ability"
                    ? (spriteByName(sprites, abilityDef(item.defId).icon) ??
                      sprites.medkit)
                    : item.kind === "story"
                      ? (spriteByName(sprites, storyItemDef(item.defId).icon) ??
                        sprites.medkit)
                      : // A QUEST PIECE draws the icon the errand that wants it
                        // authored, resolved through the quest rather than a
                        // global catalog — two mods may both ship a "spare fuse".
                        item.kind === "quest"
                        ? (spriteByName(
                            sprites,
                            questItemDef(item.questId, item.defId)?.icon ?? "",
                          ) ?? sprites.medkit)
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
      endBillboard(ctx);
      continue;
    }
    // How much spectacle this find has earned. Only EQUIPMENT rides the rarity
    // ladder — a medkit has no tier to be proud of, and a powerup keeps its own
    // electric blue, which says "a power" where a rarity colour would say "a
    // grade". Both fall through to the plain halo below.
    const aura =
      item.kind === "equipment" ? lootAuraFor(item.equipment.tier) : null;
    // THE TOSS: still in the air, arcing out of whatever it came from.
    if (item.toss) {
      drawToss(ctx, item.toss, item.pos, sprite, aura, camera);
      endBillboard(ctx);
      continue;
    }
    // Dropped loot hovers and glows so it reads as pickupable, not decor.
    // Phase by item.id (like enemy bob) so items don't pulse in lockstep.
    const cx = Math.round(item.pos.x - camera.x);
    const cy = Math.round(item.pos.y - camera.y);
    if (aura) {
      drawLootAuraUnder(ctx, aura, item.id, cx, cy, sprite.width, timeMs);
    } else {
      const glowAlpha = 0.3 + 0.14 * Math.sin(timeMs / 240 + item.id);
      // Powerup pickups glow electric blue; everything else keeps warm gold.
      const glowRgb =
        item.kind === "ability" ? "120, 190, 255" : "255, 236, 170";
      const glow = glowSprite(glowRgb, sprite.width * 0.9);
      if (glow) {
        ctx.globalAlpha = glowAlpha;
        ctx.drawImage(
          glow,
          cx - Math.round(glow.width / 2),
          cy - Math.round(glow.height / 2),
        );
        ctx.globalAlpha = 1;
      }
    }
    // Float ~2px off the ground and bob gently; the glow stays anchored below.
    //
    // GOLD IS THE ONE EXCEPTION, and it has to be: coins are not a magical
    // pickup waiting to be claimed, they are a heap of metal somebody dropped,
    // and a heap of metal bobbing in the air reads as a bug rather than as
    // treasure. It sits flat on the floor and GLITTERS instead — which is the
    // livelier cue anyway, and the one that scales with what is in the pile.
    const hover =
      item.kind === "gold"
        ? 0
        : Math.round(Math.sin(timeMs / 320 + item.id) * 1.5) - 2;
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
    ctx.drawImage(sprite, x, y);
    // THE GLITTER, over the pile it belongs to: bright specks winking off the
    // coin faces, more of them the more coins there are (./gold.ts). This is
    // gold's whole standing presentation — it is to a pile what the rarity aura
    // is to a magic find, and it is priced off the same thing the SPRITE is, so
    // the two say the same number in two languages.
    if (item.kind === "gold") {
      drawGoldGlitter(
        ctx,
        item.id,
        item.amount,
        x + sprite.width / 2,
        y + sprite.height / 2,
        sprite.width,
        sprite.height,
        timeMs,
      );
    }
    // The layers that pass IN FRONT of the piece — the smoke on its way up and
    // the near half of the orbiting motes. Drawn last so a legendary is never a
    // decal with an icon sitting on it.
    if (aura) {
      drawLootAuraOver(ctx, aura, item.id, cx, cy, sprite.width, timeMs);
    }
    endBillboard(ctx);
  }
}
