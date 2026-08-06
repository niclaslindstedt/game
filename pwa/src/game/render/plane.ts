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
import { seatX, seatY } from "./shared.ts";
import { billboard, bodyAnchorX, bodyAnchorY } from "./tilt.ts";

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
    // Seat first, then step back by a WHOLE half-sprite — see `seatX`. A wall
    // panel or a cable run baked to an odd height is exactly the art that
    // shivered when the two were rounded together.
    billboard(ctx, pos.x, pos.y, camera.x, camera.y, () =>
      ctx.drawImage(
        flat,
        seatX(pos.x, camera.x) - Math.round(flat.width / 2),
        seatY(pos.y, camera.y) - Math.round(flat.height / 2),
      ),
    );
    return;
  }
  const yAnchor = Math.round(
    anchor === "base" ? sprite.height - 2 : sprite.height / 2,
  );
  billboard(ctx, pos.x, pos.y, camera.x, camera.y, () =>
    ctx.drawImage(
      sprite,
      seatX(pos.x, camera.x) - Math.round(sprite.width / 2),
      seatY(pos.y, camera.y) - yAnchor,
    ),
  );
}

/**
 * Draw the TOP `keep` fraction of a piece of the level's furniture, its top edge
 * pinned exactly where the whole piece's is — the roll-up garage door's slat
 * retracting into the block above it (render/effects.ts).
 *
 * It lives HERE rather than in the effect for the reason the module exists: an
 * effect that redraws an obstacle the engine has already dropped has to answer
 * the plane question the same way the obstacle pass answered it a frame earlier.
 * A raw blit stood the door's slats upright for the second they were opening —
 * the door flipped up off the floor, rolled, and the wall run it was hung in
 * stayed lying down beside it.
 *
 * IN SCREEN SPACE, like `drawFloorDecal` below and unlike `drawWorldSprite`
 * above: the effects pass is not inside the world transform (it seats its own
 * draws on `bodyAnchor*` and reaches for `applyWorldProjection` per effect), so
 * billboarding here would counter-transform art that was never projected and
 * fling the whole door off across the map — invisibly at yaw 0, where the
 * projection is the identity and the mistake costs nothing.
 */
export function drawWorldSpriteTop(
  ctx: CanvasRenderingContext2D,
  name: string,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: { x: number; y: number },
  keep: number,
): void {
  const art = isFloorPlaneSprite(name) ? flatSprite(sprite, name) : sprite;
  if (!art) return;
  const h = Math.max(
    1,
    Math.round(art.height * Math.min(1, Math.max(0, keep))),
  );
  const ax = bodyAnchorX(pos.x, pos.y, camera.x, camera.y);
  const ay = bodyAnchorY(pos.x, pos.y, camera.x, camera.y);
  ctx.drawImage(
    art,
    0,
    0,
    art.width,
    h,
    ax - Math.round(art.width / 2),
    ay - Math.round(art.height / 2),
    art.width,
    h,
  );
}

/**
 * A FLOOR DECAL — art the FIGHT left on the ground rather than furniture the
 * level was built with: the blood grid's tiles and the boot prints tracked out
 * of them. Centred on a world point, in SCREEN space.
 *
 * `art` is ALREADY BAKED through the projection (`bakeFlat`), so this is the
 * same deal `drawWorldSprite`'s flat branch strikes, made once per decal rather
 * than once per sprite: the squash is baked in and the per-frame draw is a plain
 * 1:1 blit. Drawing the raw art through the live tilt instead is what makes a
 * floor of blood WOBBLE — a nearest-neighbour squash decides which rows to drop
 * from the DESTINATION offset, so a floor whose destination moves 0.75 px per
 * world unit of northward travel re-picks them every frame, and the stains crawl
 * against a ground layer that is a single rigid blit. Northward travel is where
 * it shouts, the pitch being the fraction it is, but the camera's world point is
 * exact on both axes (view.ts), so east-west was never actually exempt.
 *
 * The seat is `bodyAnchor*` — the same whole-pixel lattice the standing bodies,
 * the ground blit and the fog's dither register against — so the blood steps
 * with the floor it is on instead of sliding across it.
 */
export function drawFloorDecal(
  ctx: CanvasRenderingContext2D,
  art: ImageBitmap | HTMLCanvasElement,
  worldX: number,
  worldY: number,
  camera: { x: number; y: number },
): void {
  ctx.drawImage(
    art,
    bodyAnchorX(worldX, worldY, camera.x, camera.y) - Math.round(art.width / 2),
    bodyAnchorY(worldX, worldY, camera.x, camera.y) -
      Math.round(art.height / 2),
  );
}
