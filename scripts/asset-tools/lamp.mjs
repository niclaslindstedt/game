// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A STREET LIGHT WITH ITS LENS OUT — derived from the burning one, never drawn.
//
// WHY IT HAD TO EXIST. A felled post has to read as DARK: the lens is on the
// road, the beam and the pool are already gone, and a column lying in the
// carriageway still glowing would undo the whole thing. The renderer's answer
// used to be to swap in a DIFFERENT SPRITE — the near row's picture, which
// happens to show the back of the cowl and therefore has no lens on it.
//
// Which works for the near row and is plainly wrong for the far one: a tall
// mast standing there burning became, on the frame it was hit, a picture of a
// different lamp seen from the other side. The silhouette changed, the head
// changed, and what the player saw was the post being SUBSTITUTED rather than
// broken. (It got worse a tick later — see `mastAt`'s note in the renderer.)
//
// So the dark version is the SAME GRID with the lens killed: same column, same
// hood, same outline, same everything the eye was tracking, minus the light.
// One derived frame per lamp, exactly as the fleet earns its dents and its
// bloodied glass, so a mod's own lamp gets one for free.
//
// A LAMP WITH NO LENS IN ITS PICTURE EARNS NOTHING, and that is deliberate
// rather than an oversight: `road_lamp_near` IS the back of a cowl, so there is
// nothing in it to put out and a derived copy would be a byte-identical second
// entry in the atlas. The renderer falls back to the base name when no `_out`
// exists, which is the honest reading — "the dark one, or the same picture when
// it had no light to lose".

/** The lens: the hot core, and the warm ring around it. Both are core-palette
 * chars, so every lamp in the tree carries them without saying so. */
const LENS = new Set(["w", "y"]);
/** What each becomes when the glass is on the road — an empty socket in the
 * hood's own shadow. Both chars are in every lamp's palette already; a derived
 * look may only paint in chars the base sprite defines, or it renders in
 * nothing at all. */
const DEAD = { w: "O", y: "b" };

/**
 * THE STREET-LIGHTING SPRITES, which is the list this pass walks.
 *
 * Named rather than pattern-matched, for the reason the build's speckle
 * exemption is data rather than a regex: a pattern means every future sprite
 * with "lamp" in its name silently joins in, and every one that does not
 * silently misses out. `tests/content/drive_scenery_test.ts` holds it against
 * the names the renderer can actually ask for.
 */
export const LAMP_SPRITES = ["road_lamp", "road_lamp_near", "lamp_post"];

/**
 * Derive the lights-out look for one lamp. Returns `{ <name>_out: grid }`, or
 * an empty object when the grid has no lens in it at all.
 */
export function darkFrames(name, grid) {
  let lit = false;
  const rows = grid.map((row) =>
    [...row]
      .map((ch) => {
        if (!LENS.has(ch)) return ch;
        lit = true;
        return DEAD[ch];
      })
      .join(""),
  );
  return lit ? { [`${name}_out`]: rows } : {};
}
