// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PAINTING THE SOAK ONTO HIM — the four numbers `hero-soak.ts` keeps, turned
// into a hero who is visibly wearing what he did.
//
// **THE COAT IS MASKED TO HIS OWN SILHOUETTE, NEVER AUTHORED ON A COPY OF HIM.**
// The obvious build is a bloodied twin of every sprite he can be drawn as — but
// he is a paper doll: two costumes, three stride frames, four armor slots each
// carrying any of eighty generated overlays, and a mod may add more. A second
// authored copy of that is not a sprite, it is a combinatorial explosion, and it
// goes stale the moment anything ships a new pair of boots. So the doll is
// composed into a scratch canvas first and the coat is CLIPPED TO WHAT IS
// ACTUALLY THERE: the blood hugs whatever he happens to be wearing this frame,
// in whatever pose, including gear that did not exist when the coat was drawn.
//
// **AND IT MULTIPLIES, IT DOES NOT REPAINT.** Drawing opaque red over him was
// the first attempt and it deletes the character: the dark outline every sprite
// in the game is built on goes red, his shading goes flat, and a drenched hero
// is a red blob in the shape of a man. Blood soaking a surface DARKENS AND
// REDDENS it, which is exactly what `multiply` does — the outline stays dark,
// the suit's own form still reads through the mess, and the same four coat
// sprites work over white plate, brown leather and black mail without one of
// them being authored per material. A second pass at `GLOSS` lifts it back
// toward true blood red, because pure multiply over an already-dark boot goes to
// mud rather than to gore.
//
// The whole feature is gated in `hero-soak.ts` (which is gated in `blood-hit.ts`
// with everything else that spills blood), so a clean hero reaches here as four
// zeroes and is drawn by the plain path with no compositing at all.

import { spriteByName, type Sprites } from "../assets.ts";
import type { DollLayer } from "../paper-doll.ts";
import type { CoatLayer } from "./soak-ladder.ts";
import { recolorSprite } from "./recolor.ts";
import { drawSpriteFacing } from "./shared.ts";
import type { SpriteImage } from "@ui/lib/atlas.ts";

/** How far the coat is lifted back toward true blood red after the multiply.
 * Zero is pure multiply — correct on his white EVA suit, mud on dark gear; one
 * is opaque paint, which is the thing this whole module exists not to do. */
const GLOSS = 0.45;

/** The scratch canvases, two per subject. TWO, because clipping the coat to what
 * it is soaking needs that subject's alpha kept somewhere the coat can be
 * intersected with — `multiply` alone happily paints outside a transparent
 * backdrop, which would hang blood in the air around him. Kept module-level and
 * reused: this runs every frame, for the body and again for the weapon. */
type Scratch = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
const scratches = new Map<string, Scratch>();

function scratch(key: string, width: number, height: number): Scratch | null {
  let held = scratches.get(key);
  if (!held || held.canvas.width !== width || held.canvas.height !== height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    held = { canvas, ctx };
    scratches.set(key, held);
  }
  const g = held.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, width, height);
  return held;
}

/**
 * The shared composite: paint a subject into a scratch canvas, soak `coat` into
 * it clipped to its own alpha, and hand the canvas back. Null when there is no
 * coat to lay on, or no 2D context to build it in — both meaning "draw it
 * plainly", which every caller falls back to.
 *
 * EXPORTED, because the hero is no longer the only thing in this game that
 * wears what it did. A CAR PANEL is the same problem in a different silhouette
 * (`drive-screen/car-soak.ts`): a bloodied twin of seven panels at four damage
 * rungs is 84 sprites nobody would keep in step, and one film masked to
 * whichever panel is being drawn is the identical trick — including the reason
 * it has to be `multiply` rather than paint, since a car's own outline and
 * paint colour have to keep reading through the mess exactly as his gear does.
 */
export function soaked(
  key: string,
  sprites: Sprites,
  coat: readonly CoatLayer[],
  size: { width: number; height: number },
  paint: (g: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  if (coat.length === 0) return null;
  const base = scratch(`${key}:base`, size.width, size.height);
  const blood = base ? scratch(`${key}:coat`, size.width, size.height) : null;
  if (!base || !blood) return null;
  paint(base.ctx);
  let painted = false;
  for (const layer of coat) {
    const found = spriteByName(sprites, layer.sprite);
    if (!found) continue;
    // A LAYER MAY BE WEARING SOMETHING OTHER THAN BLOOD, and it says so with a
    // ramp rather than with art of its own. The film is a lot of authored
    // pixels — four rungs of spatter over seven panels' worth of silhouette —
    // and a second set of them in pastel would be the same combinatorial trap
    // the whole module exists to avoid, one palette along. A luminance re-hue
    // keeps every speckle and every ragged edge and only changes what colour
    // they are, which is exactly what the gore families already do to the spray.
    const image = layer.ramp
      ? recolorSprite(found, layer.sprite, layer.ramp)
      : found;
    blood.ctx.globalAlpha = layer.alpha;
    blood.ctx.drawImage(image, 0, 0);
    painted = true;
  }
  if (!painted) return base.canvas;
  // The coat, built whole and then INTERSECTED with the subject — so a zone
  // whose art frays past the edge of a narrow sprite is trimmed to the body
  // rather than left hanging beside it.
  blood.ctx.globalAlpha = 1;
  blood.ctx.globalCompositeOperation = "destination-in";
  blood.ctx.drawImage(base.canvas, 0, 0);
  // Soak it in, then lift it back toward blood red. Two passes rather than one
  // because there is no single canvas blend that is "multiply, but not all the
  // way to mud on a dark surface".
  base.ctx.globalCompositeOperation = "multiply";
  base.ctx.drawImage(blood.canvas, 0, 0);
  base.ctx.globalCompositeOperation = "source-over";
  base.ctx.globalAlpha = GLOSS;
  base.ctx.drawImage(blood.canvas, 0, 0);
  base.ctx.globalAlpha = 1;
  return base.canvas;
}

/**
 * Draw `layers` at the current doll-local origin with `coat` soaked into them.
 *
 * The caller is already inside whatever transform poses the hero (the facing
 * flip, the walk's tip, a knockout's quarter turn), so this is a drop-in for the
 * plain layer loop and every pose gets the blood for free. With no coat to lay
 * on it IS the plain layer loop, straight onto the passed context — a clean hero
 * costs nothing.
 *
 * A missing 2D context (a test environment, a lost canvas) falls back to the
 * plain stack: a hero drawn without his blood, never a hero not drawn.
 */
export function drawCoatedLayers(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  layers: readonly DollLayer[],
  coat: readonly CoatLayer[],
  size: { width: number; height: number },
): void {
  const canvas = soaked("body", sprites, coat, size, (g) => {
    for (const layer of layers) {
      const image = spriteByName(sprites, layer.sprite);
      if (image)
        drawSpriteFacing(g, image, layer.dx, layer.dy, layer.flip ?? false);
    }
  });
  if (canvas) {
    ctx.drawImage(canvas, 0, 0);
    return;
  }
  for (const layer of layers) {
    const image = spriteByName(sprites, layer.sprite);
    if (image)
      drawSpriteFacing(ctx, image, layer.dx, layer.dy, layer.flip ?? false);
  }
}

/**
 * Draw ONE sprite — the held weapon — with `coat` soaked into it, at (`dx`,
 * `dy`) in whatever space the caller has set up.
 *
 * Its own call rather than another layer in the stack above, and that is the
 * whole point: the weapon is drawn INSIDE its swing pivot, so its blood has to
 * be composited into the weapon's own space to travel with the blade. Soaking it
 * into the standing doll instead would leave the blood hanging in mid-air while
 * the sword swept out from under it.
 */
export function drawCoatedSprite(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  image: SpriteImage,
  dx: number,
  dy: number,
  flip: boolean,
  coat: readonly CoatLayer[],
): void {
  const canvas = soaked(
    "held",
    sprites,
    coat,
    { width: image.width, height: image.height },
    (g) => drawSpriteFacing(g, image, 0, 0, flip),
  );
  if (canvas) ctx.drawImage(canvas, dx, dy);
  else drawSpriteFacing(ctx, image, dx, dy, flip);
}
