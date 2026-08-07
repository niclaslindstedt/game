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
//
// A SPEAKER IS SHOWN AS A BUST, NEVER AT FULL LENGTH — `bustSrc`, the crop the
// hero's own HUD portrait has always worn, now shared by everyone who talks. A
// whole 16-to-48px body dropped into a small square frame puts a five-pixel
// head beside two lines of speech, which is a picture of somebody standing in a
// room rather than of somebody TALKING TO YOU; the face is the only part of the
// art that answers the question the frame is there to ask. `@ui/lib/bust.ts`
// finds the head. The full art stays available (`portraitSrc`) for the one
// speaker in the box that is not a person: a story item, which is an icon of a
// thing and has no face to find.

import { useFrameCycle } from "@ui/lib/frame-cycle.ts";

import { spriteBustUrl, spriteDataUrl, type Sprites } from "./assets.ts";
import { spriteClip } from "./render/clips.ts";

/**
 * The FULL art for a portrait named by sprite: an exact sprite name, or a
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
 * The same art cropped to head and shoulders — what every surface showing a
 * SPEAKER draws. Falls back to the full sprite for anything the crop can make
 * no sense of, so a portrait is never missing.
 */
export function bustSrc(sprites: Sprites, sprite: string): string | null {
  return (
    spriteBustUrl(sprites, sprite) ??
    spriteBustUrl(sprites, `${sprite}_0`) ??
    null
  );
}

/**
 * THE SPEAKER'S FACE WHILE THEY ARE SPEAKING — a bust that MOVES, when the art
 * behind it has frames to move through.
 *
 * This is the one animation in the game that had nowhere to live before mods
 * could declare their own (`render/clips.ts`). The convention every body is
 * drawn to — two frames, a walk cycle — has no notion of a mouth, so a portrait
 * has always been one still picture beside a speech that crawls out a letter at
 * a time. A mod that draws a talking head says so with a `talk:` clip, and this
 * is what plays it.
 *
 * IT FALLS BACK TO THE STILL FACE, and that is the whole compatibility story:
 * no clip, no cycle, no timer, and the same single bust the box has always
 * shown. The shipped game takes that path for every speaker in it.
 *
 * A hook, so it must be called unconditionally — pass `active: false` for a
 * speaker who is not talking rather than skipping the call.
 */
export function useSpeakingBust(
  sprites: Sprites,
  sprite: string,
  active = true,
): string | null {
  const clip = spriteClip(sprite, "talk");
  // Resolved to URLs before the cycle, not inside it: `spriteBustUrl` caches
  // per name, so this is a map over a handful of strings rather than the
  // head-crop canvas pass it looks like.
  const frames =
    clip === undefined
      ? EMPTY_FRAMES
      : clip.frames
          .map((name) => spriteBustUrl(sprites, name))
          .filter((url): url is string => url !== undefined);
  const shown = useFrameCycle(frames, clip?.delayMs ?? 0, active);
  return shown ?? bustSrc(sprites, sprite);
}

/** Shared so the no-clip path hands `useFrameCycle` the same array every
 * render — see its note on why a fresh literal would restart the cycle. */
const EMPTY_FRAMES: string[] = [];

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
