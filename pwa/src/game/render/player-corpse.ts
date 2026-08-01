// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A FALLEN HERO'S BODY on the field (multiplayer plan §4.2, `state.corpses`):
// the walk-back target a party death leaves behind. It is drawn with the LOOT
// AURA machinery, exactly as the plan asks, because that is the honest read of
// what it is — a pile of the owner's own gear lying where they dropped, and
// the aura's rarity ladder advertises the best piece on it the same way it
// advertises any find. The body itself is the hero doll's base sprite laid on
// its back, the same tip-over the death scene and the knockout use, so a body
// on the ground reads as a body everywhere in the game.
//
// Closed-form like the loot pass: nothing here allocates per frame, and a solo
// run (which can never mint a corpse) costs one length check.

import {
  playerAppearance,
  tierRank,
  type GameState,
  type Tier,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import {
  drawLootAuraOver,
  drawLootAuraUnder,
  lootAuraFor,
} from "./loot-aura.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** The corpse's aura wears the BEST tier lying on it — the same claim the
 * pieces would each make from the floor, made once by the body holding them. */
function bestTier(gear: readonly { item: { tier: Tier } }[]): Tier {
  let best: Tier = "regular";
  for (const entry of gear) {
    if (tierRank(entry.item.tier) > tierRank(best)) best = entry.item.tier;
  }
  return best;
}

export function drawPlayerCorpses(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  if (state.corpses.length === 0) return;
  // The body wears the run's hero appearance. Every seat shares the sprite
  // today — WHOSE body it is travels on the corpse and matters to the pickup
  // rule, not to the pixels.
  const body = spriteByName(sprites, `${playerAppearance(state)}_0`);
  for (const corpse of state.corpses) {
    if (!inView(corpse.pos.x, corpse.pos.y, 48)) continue;
    beginBillboard(ctx, corpse.pos.x, corpse.pos.y, camera.x, camera.y);
    const cx = Math.round(corpse.pos.x - camera.x);
    const cy = Math.round(corpse.pos.y - camera.y);
    const aura = lootAuraFor(bestTier(corpse.gear));
    const size = body?.width ?? 16;
    if (aura) drawLootAuraUnder(ctx, aura, corpse.id, cx, cy, size, timeMs);
    if (body) {
      // Laid flat on its back — the death scene's own tip-over, settled to
      // the ground line so it lies sprawled rather than standing.
      ctx.save();
      ctx.translate(cx, cy + 4);
      ctx.rotate(Math.PI / 2 + 0.18);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(body, -Math.round(size / 2), -Math.round(size / 2));
      ctx.restore();
    }
    if (aura) drawLootAuraOver(ctx, aura, corpse.id, cx, cy, size, timeMs);
    endBillboard(ctx);
  }
}
