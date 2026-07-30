// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH PLANE A PIECE OF WORLD FURNITURE IS DRAWN ON.
//
// The world projection (./tilt.ts) splits everything on the field in two: the
// FLOOR lies down and takes the projection whole, the BODIES stand up at full
// size. For the passes that draw the level's own furniture — the obstacles, the
// decor, the landmarks — that split is not a property of the PASS, it is a
// property of the ART, and it always was: a boulder and a house front are drawn
// in elevation and have to stand, while a wall panel, a painted lane marking and
// a crate seen from above are drawn in PLAN and have to lie.
//
// Standing plan-view art up is what the tilt got wrong, and it is loud: a wall
// panel comes out taller than the floor grid it is set into, and once the camera
// is turned a straight run of them staircases diagonally across a floor whose
// own seams run the other way.
//
// So the art says which it is (`plane: floor` in the sprite's YAML, reaching the
// app as `isFloorPlaneSprite`) and this is the one place that acts on it.

import { isFloorPlaneSprite } from "../assets.ts";
import { flatSprite } from "./caches.ts";
import { billboard } from "./tilt.ts";

/**
 * Draw a piece of the level's furniture at world `pos`, on whichever plane its
 * art was authored for.
 *
 * `anchor` is for UPRIGHT art only, and says what the `pos` marks: `center` (the
 * default) hangs the sprite around it, `base` stands the sprite's feet on it —
 * the choice a tall landmark makes so it looms rather than sinking into the
 * floor. Flat art has no feet to stand on, so it always centres.
 */
export function drawWorldSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: { x: number; y: number },
  anchor: "center" | "base" = "center",
): void {
  if (isFloorPlaneSprite(name)) {
    // Pre-projected once (`flatSprite`) and blitted 1:1 here, rather than drawn
    // through the live transform — a per-frame resample of pixel art boils as
    // the camera pans. The blit happens INSIDE the billboard because the baked
    // art already carries the projection; drawing it in the tilted space would
    // apply it a second time.
    const flat = flatSprite(sprite, name);
    if (!flat) return;
    billboard(ctx, pos.x, pos.y, camera.x, camera.y, () =>
      ctx.drawImage(
        flat,
        Math.round(pos.x - flat.width / 2 - camera.x),
        Math.round(pos.y - flat.height / 2 - camera.y),
      ),
    );
    return;
  }
  const yAnchor = anchor === "base" ? sprite.height - 2 : sprite.height / 2;
  billboard(ctx, pos.x, pos.y, camera.x, camera.y, () =>
    ctx.drawImage(
      sprite,
      Math.round(pos.x - sprite.width / 2 - camera.x),
      Math.round(pos.y - yAnchor - camera.y),
    ),
  );
}
