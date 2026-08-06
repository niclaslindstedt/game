// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH PLANE A PIECE OF WORLD FURNITURE IS DRAWN ON.
//
// The world projection (./tilt.ts) splits everything on the field in two: the
// FLOOR lies down and takes the projection whole, the BODIES stand up at full
// size. For the passes that draw the level's own furniture — the obstacles, the
// decor, the landmarks — that split is not a property of the PASS, it is a
// property of the ART, and it always was: a boulder and a house front are drawn
// in elevation and have to stand, while a painted lane marking and a crate seen
// from above are drawn in PLAN and have to lie.
//
// Standing plan-view art up is what the tilt got wrong, and it is loud: the
// piece comes out taller than the floor grid it is set into, and once the camera
// is turned a straight run of it staircases diagonally across a floor whose own
// seams run the other way.
//
// THE PLAN VIEW HAS A THIRD CASE, THOUGH, AND IT IS THE ONE THE WALLS ARE IN.
// "Drawn in plan" and "flat" are not the same claim: a lane marking really is
// paint on the ground, but a wall panel is a plan view of a thing you cannot see
// past. Lying down it reads as a paving slab — turn the camera and a lab's
// partitions become a slightly darker path across the floor, and the room stops
// being a room. So `plane: wall` art keeps the same footprint on the same floor
// and is EXTRUDED off it: the one projected slice, stacked `rise` px upward with
// a cap on top (`wallBlock`). No second piece of art, and right at every pitch
// and yaw, because the projection is applied to the slice rather than to a
// hand-drawn elevation that would only ever suit one camera.
//
// So the art says which it is (`plane:` in the sprite's YAML, reaching the app as
// `isFloorPlaneSprite` / `wallPlaneRise`) and this is the one place that acts on
// it.
//
// …with ONE knob over the top of it: STANDING WALLS (DEVELOPER → VISUALS). The
// extrusion earns itself under a YAW and is a matter of taste square-on, so a
// developer may turn it off — and "off" means the third case collapses back into
// the second, not into the first. `drawnWallRise` and `laidFlat` are the pair
// that says so, and every pass asks them rather than the catalog.

import {
  isDirectionalSprite,
  isFloorPlaneSprite,
  wallPlaneRise,
} from "../assets.ts";
import { flatSprite, wallBlock } from "./caches.ts";
import { seatX, seatY } from "./shared.ts";
import { billboard, bodyAnchorX, bodyAnchorY, standingWalls } from "./tilt.ts";

/**
 * Directional art is authored running SOUTH — down the sprite's own rows — so a
 * piece placed along a bearing is turned by the difference. See
 * `isDirectionalSprite`.
 */
const AUTHORED_BEARING = Math.PI / 2;

/**
 * HOW FAR THIS PIECE RISES OFF ITS FOOTPRINT AS DRAWN — the art's own `rise`,
 * or 0 while STANDING WALLS is off (DEVELOPER → VISUALS, `standingWalls` in
 * ./tilt.ts). **Every pass asks THIS, never `wallPlaneRise`**, which is the
 * catalog's answer and does not know about the switch.
 */
export function drawnWallRise(name: string): number {
  return standingWalls() ? wallPlaneRise(name) : 0;
}

/**
 * DOES THIS PIECE LIE DOWN WITH THE FLOOR? — `plane: floor` always, and
 * `plane: wall` whenever it is not standing, because the whole of the switch's
 * meaning is "draw it the way it was drawn before the extrusion existed": the
 * same footprint on the same floor, taking the projection whole. Falling through
 * to the upright branch instead would stand a plan view up, which is the exact
 * mistake `plane:` exists to stop.
 */
function laidFlat(name: string): boolean {
  return isFloorPlaneSprite(name) || wallPlaneRise(name) > 0;
}

/** The turn a piece of art takes to run along `facing` — zero for art with no
 * bearing to state, and for a placement that never supplied one. */
function spinFor(name: string, facing: number | undefined): number {
  if (facing === undefined || !isDirectionalSprite(name)) return 0;
  return facing - AUTHORED_BEARING;
}

/**
 * Draw a piece of the level's furniture at world `pos`, on whichever plane its
 * art was authored for.
 *
 * `anchor` is for UPRIGHT art only, and says what the `pos` marks: `center` (the
 * default) hangs the sprite around it, `base` stands the sprite's feet on it —
 * the choice a tall landmark makes so it looms rather than sinking into the
 * floor. Flat art has no feet to stand on, so it always centres.
 *
 * `facing` is for DIRECTIONAL flat art only (a conveyor belt), and is the
 * bearing the piece's PLACEMENT runs along — ignored by everything else, which
 * is why a pass may hand it over unconditionally.
 */
export function drawWorldSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: { x: number; y: number },
  anchor: "center" | "base" = "center",
  facing?: number,
): void {
  const rise = drawnWallRise(name);
  if (rise > 0) {
    // THE WALL: the same footprint the flat branch below would have drawn, with
    // the block standing on it. The bake's BOTTOM slice is that footprint
    // (`bakeWall` stacks upward from it), so the seat is the flat seat and the
    // whole block is hung `rise` px above it.
    const block = wallBlock(sprite, name, rise);
    if (!block) return;
    const foot = block.height - rise;
    billboard(ctx, pos.x, pos.y, camera.x, camera.y, () =>
      ctx.drawImage(
        block,
        seatX(pos.x, camera.x) - Math.round(block.width / 2),
        seatY(pos.y, camera.y) - Math.round(foot / 2) - rise,
      ),
    );
    return;
  }
  if (laidFlat(name)) {
    // Pre-projected once (`flatSprite`) and blitted 1:1 here, rather than drawn
    // through the live transform — a per-frame resample of pixel art boils as
    // the camera pans. The blit happens INSIDE the billboard because the baked
    // art already carries the projection; drawing it in the tilted space would
    // apply it a second time.
    const flat = flatSprite(sprite, name, spinFor(name, facing));
    if (!flat) return;
    // Seat first, then step back by a WHOLE half-sprite — see `seatX`. A cable
    // run baked to an odd height is exactly the art that shivered when the two
    // were rounded together.
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
 *
 * A `plane: wall` door retracts as the BLOCK it is drawn as, top edge first —
 * the same question answered the same way, one plane later.
 */
export function drawWorldSpriteTop(
  ctx: CanvasRenderingContext2D,
  name: string,
  sprite: ImageBitmap,
  pos: { x: number; y: number },
  camera: { x: number; y: number },
  keep: number,
): void {
  const rise = drawnWallRise(name);
  const art = rise
    ? wallBlock(sprite, name, rise)
    : laidFlat(name)
      ? flatSprite(sprite, name)
      : sprite;
  if (!art) return;
  const h = Math.max(
    1,
    Math.round(art.height * Math.min(1, Math.max(0, keep))),
  );
  const ax = bodyAnchorX(pos.x, pos.y, camera.x, camera.y);
  const ay = bodyAnchorY(pos.x, pos.y, camera.x, camera.y);
  // The SAME seat `drawWorldSprite` uses for this plane, spelt out rather than
  // shared because that one is inside a billboard and this is not (see above).
  // An extruded block is seated on its FOOTPRINT with the rise hung above it —
  // centring the whole block instead drops the retracting door half a rise
  // below the wall run it is hung in, for exactly the second it is moving.
  const top = rise
    ? ay - Math.round((art.height - rise) / 2) - rise
    : ay - Math.round(art.height / 2);
  ctx.drawImage(
    art,
    0,
    0,
    art.width,
    h,
    ax - Math.round(art.width / 2),
    top,
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
