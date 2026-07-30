// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A PERSON'S FACE, framed — the one way this game shows you who is talking.
//
// The dialogue box, the quest giver's offer and the merchant's counter all
// answer the same question ("who is this?") the same way: the speaker's own
// field art, blown up inside a small dark frame beside their name. Each had its
// own copy of the resolve-and-draw, which is three places to fix when the sprite
// naming convention changes and three chances for one surface to drift into
// drawing a smoothed portrait while the other two stay crisp.
//
// Two things are shared and one is not. SHARED: the family→frame resolution
// (`portraitSrc`) and the pixel-perfect fill (`.sprite-portrait`). NOT shared:
// the FRAME — the dialogue box grows a square as tall as its speech block, the
// quest offer holds a fixed one, the counter's is smaller again and gilded — so
// the frame comes in as `frameClass` and its sizing rule stays beside the
// surface it belongs to.
//
// The source is a plain `src` rather than a sprite name because one speaker is
// not a sprite at all: when the HERO talks, the dialogue box shows his composed
// PAPER DOLL (worn gear, blood soak and all), which is a canvas the overlay
// builds itself. A component that only took names would have locked him out of
// the very thing it exists to share.

import { spriteDataUrl, type Sprites } from "./assets.ts";

/**
 * The portrait art for a speaker named by sprite: an exact sprite name, or a
 * walk-cycle FAMILY (the merchant, every quest giver, every mob) resolved to its
 * first frame — the same convention the field renderer uses. Null when the atlas
 * answers to neither.
 */
export function portraitSrc(sprites: Sprites, sprite: string): string | null {
  return (
    spriteDataUrl(sprites, sprite) ??
    spriteDataUrl(sprites, `${sprite}_0`) ??
    null
  );
}

/**
 * The framed portrait, or NOTHING AT ALL when there is no art for the speaker —
 * a missing face is drawn as an absence rather than as an empty box, so a
 * speaker without art reads as a name-only line instead of a broken frame. That
 * null-means-nothing contract is why every call site can pass a possibly-null
 * `src` straight in and drop its own `{portrait && …}` guard.
 */
export function SpritePortrait({
  src,
  frameClass,
}: {
  src: string | null | undefined;
  /** The surface's own frame rule — size and rim (`.quest-portrait-frame`, …). */
  frameClass: string;
}) {
  if (!src) return null;
  return (
    <div className={frameClass}>
      <img src={src} alt="" className="pixel-img sprite-portrait" />
    </div>
  );
}
