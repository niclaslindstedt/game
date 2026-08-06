// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST cast on the field: the people with errands to hand out, the marks
// over their heads, and the people the hero is walking somewhere.
//
// THE MARK IS THE WHOLE DISCOVERABILITY STORY, and it is drawn from a value the
// engine derives fresh every frame (`giverMark`) rather than from anything
// cached — a `?` that is one frame stale is a quest the player walks past. The
// three states are WoW's, and the game does not invent a fourth: a gold `!`
// (there is work here), a gold `?` (it is finished, come and collect), a grey
// `?` (you took this one, it is running). Nothing over the head means this
// person is done with the hero, and that silence is information too.
//
// The mark BOBS on the giver's own id hash, the same idiom the merchant's coin
// and the title menu's icons use, so a row of givers never pulses in lockstep.

import {
  QUESTS,
  escortName,
  escortSprite,
  giverMark,
  questGiverDef,
  type GameState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { walkFrame, walkGait, withStance } from "./gait.ts";
import {
  drawSpriteFacing,
  makeInView,
  seatX,
  spriteTopLeft,
  worldViewOf,
} from "./shared.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

/** Sprite name per mark state; `none` draws nothing at all. */
const MARK_SPRITE: Record<string, string> = {
  offer: "quest_bang",
  turnIn: "quest_query",
  progress: "quest_query_dim",
};

/** How far the mark rides off its resting height, in whole pixels either way. */
const MARK_BOB_PX = 1;

/** A stable 0..1 phase off a string id — the mark's own bob offset. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The people with errands. They stand where they were placed and never wander
 * — a person you have to walk BACK to has to still be there — so the gait is
 * the standing breath rather than a stride, and they turn to face the hero when
 * he comes near (the engine sets `faceLeft` at the same moment it meets them).
 */
export function drawQuestGivers(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  if (state.questGivers.length === 0) return;
  const inView = makeInView(camera, worldViewOf(ctx.canvas));
  const { sprites } = assets;
  for (const giver of state.questGivers) {
    if (!inView(giver.pos.x, giver.pos.y, 48)) continue;
    beginBillboard(ctx, giver.pos.x, giver.pos.y, camera.x, camera.y);
    const def = questGiverDef(giver.id);
    // Standing still, `walkGait` gives the breathing idle rather than a stride,
    // so a giver reads as alive without ever leaving their post.
    const gait = walkGait(`quest_${giver.id}`, giver.pos, timeMs);
    const sprite = spriteByName(sprites, `${def.sprite}_0`);
    if (!sprite) {
      endBillboard(ctx);
      continue;
    }
    const { x, y } = spriteTopLeft(giver.pos, sprite, camera);
    const bodyY = y + Math.round(gait.lift);
    withStance(
      ctx,
      { x: Math.round(giver.pos.x - camera.x), y: bodyY + sprite.height },
      { tilt: gait.tilt },
      () => drawSpriteFacing(ctx, sprite, x, bodyY, giver.faceLeft),
    );
    drawMark(ctx, sprites, state, giver.id, seatX(giver.pos.x, camera.x), y);
    endBillboard(ctx);
  }
}

/** The `!` / `?` over one giver's head, or nothing when they have none. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  sprites: GameAssets["sprites"],
  state: GameState,
  giverId: string,
  /** The glyph owner's whole-pixel seat (`seatX`) — never a raw offset. */
  seat: number,
  headY: number,
): void {
  const mark = giverMark(state, giverId);
  const name = MARK_SPRITE[mark];
  if (!name) return;
  const glyph = spriteByName(sprites, name);
  if (!glyph) return;
  // The bob rides the SIM clock, not the render clock, so the mark holds still
  // while the run is frozen behind the offer modal — a paused page whose
  // decorations are still animating reads as not actually paused.
  const bob = Math.round(
    Math.sin(state.stats.timeMs / 300 + phaseOf(giverId) * Math.PI * 2) *
      MARK_BOB_PX,
  );
  ctx.drawImage(
    glyph,
    seat - Math.round(glyph.width / 2),
    headY - glyph.height - 2 + bob,
  );
}

/**
 * The people being walked somewhere. Each carries a health bar the moment it
 * is scratched — an escort is a failure condition with a body, and a player who
 * cannot see it dropping has been handed a coin flip rather than a decision —
 * and a WAITING tell when the hero has walked out past its leash.
 */
export function drawEscorts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  if (state.escorts.length === 0) return;
  const inView = makeInView(camera, worldViewOf(ctx.canvas));
  const { sprites } = assets;
  for (const escort of state.escorts) {
    if (!inView(escort.pos.x, escort.pos.y, 48)) continue;
    beginBillboard(ctx, escort.pos.x, escort.pos.y, camera.x, camera.y);
    const gait = walkGait(`escort_${escort.id}`, escort.pos, timeMs);
    const frame = escort.moving ? walkFrame(gait) : 0;
    const sprite = spriteByName(sprites, `${escortSprite(escort)}_${frame}`);
    if (!sprite) {
      endBillboard(ctx);
      continue;
    }
    const { x, y } = spriteTopLeft(escort.pos, sprite, camera);
    const bodyY = y + Math.round(gait.lift);
    withStance(
      ctx,
      { x: Math.round(escort.pos.x - camera.x), y: bodyY + sprite.height },
      { tilt: gait.tilt },
      () => drawSpriteFacing(ctx, sprite, x, bodyY, escort.faceLeft),
    );
    if (escort.hp < escort.maxHp) {
      drawEscortBar(ctx, seatX(escort.pos.x, camera.x), y - 4, escort);
    }
    if (escort.waiting) {
      // The leash tell: the same grey `?` the tracker's "in progress" state
      // wears, so one glyph means "this is on you" everywhere it appears.
      const glyph = spriteByName(sprites, "quest_query_dim");
      if (glyph) {
        ctx.drawImage(
          glyph,
          seatX(escort.pos.x, camera.x) - Math.round(glyph.width / 2),
          y - glyph.height - 8,
        );
      }
    }
    endBillboard(ctx);
  }
}

/** A short health bar over an escort — green, not the horde's red. */
function drawEscortBar(
  ctx: CanvasRenderingContext2D,
  /** The escort's whole-pixel seat (`seatX`) — never a raw offset. */
  seat: number,
  y: number,
  escort: { hp: number; maxHp: number },
): void {
  const w = 18;
  const frac = Math.max(0, Math.min(1, escort.hp / escort.maxHp));
  const x = seat - Math.round(w / 2);
  ctx.fillStyle = "#1a1c2c";
  ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = frac > 0.35 ? "#63c74d" : "#e8b93e";
  ctx.fillRect(x, y, Math.round(w * frac), 2);
}

/**
 * The destination pin for a running escort: a small marker on the ground the
 * hero is walking somebody TO. Drawn on the ground plane (no billboard) —
 * it is a place, not a body, and the projection is what makes a ring on the
 * floor read as being on the floor.
 */
export function drawEscortDestinations(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  timeMs: number,
): void {
  if (state.escorts.length === 0) return;
  const inView = makeInView(camera, worldViewOf(ctx.canvas));
  for (const escort of state.escorts) {
    if (escort.arrived) continue;
    if (!inView(escort.to.x, escort.to.y, QUESTS.escortArriveRadius + 16)) {
      continue;
    }
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 420);
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.25 * pulse;
    ctx.strokeStyle = "#ffcf3a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      Math.round(escort.to.x - camera.x),
      Math.round(escort.to.y - camera.y),
      QUESTS.escortArriveRadius,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }
}

/** What the app calls the person in `escort` — re-exported so the HUD's escort
 * strip needs no second import path. */
export { escortName };
