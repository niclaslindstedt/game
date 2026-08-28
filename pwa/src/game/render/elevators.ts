// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ELEVATOR PADS — the plate the hero steps onto to be carried somewhere the map
// does not connect to (see `LevelDef.elevators` / `engine/game/elevator.ts`).
//
// The pad has one job the sprite alone cannot do: SAY THAT IT IS A CONTROL. A
// generated map is covered in ground furniture, and a plate lying flat among it
// is indistinguishable from a floor grate — which on the one prop that is the
// only route to the boss is a run-ending piece of ambiguity. So an unused pad
// carries a CALL LIGHT: a ring that breathes on a slow cycle, and its own
// LABEL under it, which is the half that says where the car goes rather than
// only that there is one. A pad the hero has already ridden stops advertising
// itself and dims to a plain plate; it still works, it just no longer shouts.
//
// What a keyed pad says when it REFUSES is not here: that is a one-shot read
// off the engine's own event (game-screen/lift-lock.ts), because it belongs to
// the moment the hero stepped on it rather than to the prop.

import type { GameState } from "@game/core";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteByName, type Sprites } from "../assets.ts";
import { drawWorldSprite } from "./plane.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** Seconds one full breath of the call light takes. */
const PULSE_SEC = 1.6;

/** Font scale for a pad's destination label — the field's small-caption size,
 * legible at the reference phone's viewport without crowding the plate. */
const LABEL_SCALE = 1;

/**
 * LAIR DOORS — the door prop on an occupied house (see `LevelDef.lairs`).
 *
 * Drawn AFTER the buildings, because the door belongs ON the house: the structure
 * itself is an ordinary solid box in the obstacle field, and this is the one
 * pixel of it that changes. Nothing else marks a lair out — no ring, no glow. It
 * has to look like every other house on the street right up until it opens, or
 * the beat is spoiled before it happens.
 */
export function drawLairs(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  const lairs = state.lairs;
  if (!lairs || lairs.length === 0) return;
  for (const lair of lairs) {
    if (!inView(lair.pos.x, lair.pos.y, 40)) continue;
    const sprite = spriteByName(sprites, lair.sprite);
    // A door is set into a wall, so it stands with the house it belongs to —
    // unless the house it belongs to is drawn in plan, in which case its door is
    // too, and ./plane.ts lays them both down together off the art.
    if (sprite) {
      drawWorldSprite(ctx, lair.sprite, sprite, lair.pos, camera);
    }
  }
}

export function drawElevators(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  font: PixelFont,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  const pads = state.elevators;
  if (!pads || pads.length === 0) return;
  const t = timeMs / 1000;
  // 0..1..0 — a sine mapped to a breath, so the ring swells and settles rather
  // than blinking. A blink reads as an alarm; this has to read as an invitation.
  const breath = 0.5 - 0.5 * Math.cos((t / PULSE_SEC) * Math.PI * 2);
  for (const pad of pads) {
    if (!inView(pad.pos.x, pad.pos.y, 48)) continue;
    const sprite = spriteByName(sprites, pad.sprite);
    // The plate IS the floor there, so it is authored in plan and lies down with
    // it (`plane: floor`). Its call light needs no such rule — the ring is
    // stroked in the tilted space, so it foreshortens into an ellipse on the
    // ground for free, which is exactly what a light in the plate should do.
    if (sprite) drawWorldSprite(ctx, pad.sprite, sprite, pad.pos, camera);
    if (pad.used) continue;
    const x = pad.pos.x - camera.x;
    const y = pad.pos.y - camera.y;
    const radius = pad.radius + 4 + breath * 5;
    ctx.save();
    // Additive, so the light sits ON the plate rather than painting over it.
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(96, 240, 208, ${0.3 + breath * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!pad.label) continue;
    // …AND WHERE IT GOES. Drawn upright over the plate rather than lying in it:
    // the ring is a light in the floor and reads foreshortened, but a word that
    // foreshortens is a word nobody can read at a glance. Shadowed first, like
    // every other line the field draws over ground of unknown colour.
    const width = font.measure(pad.label) * LABEL_SCALE;
    const tx = Math.round(x - width / 2);
    const ty = Math.round(y - radius - font.height * LABEL_SCALE - 3);
    font.draw(ctx, pad.label, tx + 1, ty + 1, {
      scale: LABEL_SCALE,
      color: "#0b0d10",
    });
    font.draw(ctx, pad.label, tx, ty, {
      scale: LABEL_SCALE,
      color: `rgba(140, 246, 220, ${0.55 + breath * 0.4})`,
    });
  }
}
