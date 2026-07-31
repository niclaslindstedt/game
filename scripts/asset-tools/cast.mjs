// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAST POSES — derive the two frames a mob wears while it winds up a
// telegraphed move (`<sprite>_cast_0/1`, resolved by naming convention in
// pwa/src/game/render/enemies.ts) from its base animation frames.
//
// THE TELL SITS ON THE CHARACTER, and that is the rule this file exists to
// make affordable. A player who learns to watch the MOB beats a player who
// learns to watch the floor, so every set-piece move in the game roots its
// caster in a pose for a fixed windup — but until the elite tier, only the
// eight BOSSES shipped the two hand-drawn frames that pose needs. Every elite
// with a charge or a slam stood there looking exactly like an elite walking,
// and their tell was invisible.
//
// Hand-drawing them was the obvious answer and the wrong one: 27 elites is 54
// frames, plus two more for every mob a MOD ships — which means a mod's elite
// could never have a tell at all. So the pose is DERIVED, exactly as battle
// damage is (asset-tools/damage.mjs), and for the same reasons: one
// implementation, so a mod's cast frame is made the way the game's is, and no
// per-monster art bill.
//
// AUTHORED FRAMES ALWAYS WIN. A sprite that ships its own `_cast_0/1` derives
// nothing (see `deriveCastPoses`) — ARMSTRONG's hand-drawn wind-up is better
// than anything this file can compute, and the derivation is the FLOOR for
// everything nobody has drawn yet, never a replacement for what somebody did.
//
// WHAT THE POSE SAYS, and why it says it in these two moves:
//
//   • THE RISE. The whole body lifts one row, leaving the bottom row behind.
//     A body drawing itself up is the most legible "something is coming" a
//     16-to-24-pixel figure can perform — it changes the SILHOUETTE, which is
//     the only channel that survives at this size, at this zoom, in a crowd.
//     Anything subtler (a recolour, a shimmer) is lost the moment four other
//     mobs are on screen, which is precisely when the tell matters.
//   • THE RIM. A bright edge gathers around the body, sparse on frame 0 and
//     full on frame 1. Because the renderer alternates the two frames on a
//     FAST clock (110 ms) the rim visibly pulses, and a pulsing outline reads
//     as building rather than as standing still — which is the one thing a
//     wind-up must never read as.
//
// THE RIM IS COLOUR-NEUTRAL ON PURPOSE. Every ability carries its own `look`
// kit and draws its effect in it, so tinting the pose per ability would mean a
// mob with two abilities needed two poses — and the pose is per SPRITE, cast
// before the player can know which move is coming. A warm white says "winding
// up"; the effect that follows says what it was.

/** Chars never painted over: transparency and the outline (incl. eyes). */
const PROTECTED = new Set([".", "O"]);

/**
 * The rim's palette char and its colour. Registered into the sprite's palette
 * when the family does not already back it — the same escape hatch the gore
 * styles use (`STYLE_FALLBACK` in scripts/sprite-data/index.mjs), and needed
 * for the same reason: a MOD's family has no scope at all to back it with.
 *
 * `%` is used because no authored grid in the tree uses it as a body char, so
 * a derived rim can never collide with art somebody drew.
 */
export const CAST_RIM_CHAR = "%";
/**
 * `[r, g, b, a]`, the concrete form a palette entry takes here.
 *
 * A hot AMBER rather than the near-white this started as, and the reason is
 * worth keeping: a pale rim is invisible against pale art (the janitor's grey
 * coveralls, SpaceZ's deck plate, the moon's own regolith), and "the tell is
 * only readable on dark maps" is indistinguishable from "there is no tell" for
 * the third of the campaign that is lit. Amber carries on both, and it is
 * already the game's own colour for a thing charging up.
 */
export const CAST_RIM_RGBA = [255, 200, 87, 255];

/** Is this cell empty (or off the grid)? */
const isClear = (grid, x, y) =>
  y < 0 ||
  y >= grid.length ||
  x < 0 ||
  x >= grid[y].length ||
  grid[y][x] === ".";

/** Is this cell part of the drawing at all (body OR outline)? */
const isDrawn = (grid, x, y) => !isClear(grid, x, y);

/** FNV-1a — a stable tiny string hash to seed the per-sprite RNG. */
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG, plenty for pixel placement. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lift the drawing one row, keeping the grid's own dimensions. The bottom row
 * is dropped rather than the top: a sprite's top rows carry the head and the
 * silhouette that identifies it, while its bottom row is feet or a dust skirt,
 * and losing a row of THAT is what a body rising off the floor looks like.
 *
 * A drawing already touching row 0 is left where it is — lifting it would
 * decapitate the mob, which is a considerably worse tell than none.
 */
function rise(grid) {
  const width = grid[0]?.length ?? 0;
  const topLit = grid.findIndex((row) => [...row].some((c) => c !== "."));
  if (topLit <= 0) return [...grid];
  const lifted = grid.slice(1);
  lifted.push(".".repeat(width));
  return lifted;
}

/**
 * Paint the gathering rim: cells OUTSIDE the drawing that touch it
 * orthogonally, so the light sits around the body rather than eating into art
 * somebody drew. `density` is the share of eligible cells that light up —
 * frame 0 is sparse and frame 1 is full, which is what makes the pair pulse.
 *
 * The pick is seeded off the sprite name so regenerating assets is
 * byte-identical and a PNG diff only appears when a grid actually changes —
 * the same invariant the wound derivation holds.
 */
function rimmed(grid, rand, densities) {
  let rows = grid.map((row) => [...row]);
  // Laid ring by ring outward, each pass reading the PREVIOUS ring's result —
  // so the second ring hugs the first rather than the body, and the halo grows
  // outward instead of thickening into a blob.
  for (const density of densities) {
    if (density <= 0) continue;
    const lit = rows.map((row) => row.join(""));
    const height = lit.length;
    const width = lit[0]?.length ?? 0;
    const next = lit.map((row) => [...row]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isClear(lit, x, y)) continue;
        // EIGHT-connected, not four: a four-connected ring leaves every
        // diagonal of the silhouette open, and on a 16 px body that is most of
        // the outline — the halo comes out as dashes rather than as light.
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (isDrawn(lit, x + dx, y + dy)) {
              touches = true;
              break;
            }
          }
        }
        if (!touches) continue;
        if (rand() > density) continue;
        next[y][x] = CAST_RIM_CHAR;
      }
    }
    rows = next;
  }
  return pruneOrphans(rows).map((row) => row.join(""));
}

/**
 * Drop rim pixels with no lit ORTHOGONAL neighbour.
 *
 * The ring is placed 8-connected (see above), so a pixel that touches the body
 * only DIAGONALLY is legitimate light — right up until the sparse frame rolls
 * away the neighbours that were holding it, and it is left as a single lit
 * pixel floating in space. That is exactly what the build's own orphan check
 * flags, and it is right to: an isolated pixel reads as noise at 1×, and a
 * wind-up tell made of noise is a wind-up tell nobody can see.
 *
 * Pruned rather than prevented, because the alternative — only ever placing
 * 4-connected rim — leaves every diagonal of the silhouette open, which on a
 * 16 px body is most of the outline.
 */
function pruneOrphans(rows) {
  const lit = (x, y) =>
    y >= 0 &&
    y < rows.length &&
    x >= 0 &&
    x < rows[y].length &&
    rows[y][x] !== ".";
  return rows.map((row, y) =>
    row.map((char, x) => {
      if (char !== CAST_RIM_CHAR) return char;
      const held =
        lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1);
      return held ? char : ".";
    }),
  );
}

/**
 * Derive one sprite's two cast frames.
 *
 * @param name   Sprite family name (seeds the RNG; keys the output).
 * @param frames Base grids `[frame0, frame1]`.
 * @returns      `{ "<name>_cast_0": grid, "<name>_cast_1": grid }`
 */
export function castFrames(name, frames) {
  const rand = mulberry32(hashString(`${name}:cast`));
  // BOTH frames are derived from base frame 0, never one from each. The base
  // pair is a WALK cycle, and a wind-up is the one moment the mob is rooted —
  // a pose that kept stepping would say "still walking" at exactly the moment
  // the whole mechanic depends on saying "stopped".
  const posed = rise(frames[0]);
  // The PULSE: frame 0 is a broken inner ring, frame 1 a solid one with a
  // scatter of light standing off it. Alternated on the renderer's fast cast
  // clock (110 ms) that reads as gathering — which is the whole job, since a
  // wind-up that looked static would say "standing still" at the one moment the
  // mechanic depends on saying "something is coming".
  return {
    [`${name}_cast_0`]: rimmed(posed, rand, [0.55]),
    [`${name}_cast_1`]: rimmed(posed, rand, [1, 0.35]),
  };
}

/** Does this mob carry anything that telegraphs? Structures and apparitions
 * never cast (`stepEnemyMechanics` turns them away), and neither do minions. */
export function castsAnything(def) {
  if (def.role === "minion" || def.apparition || def.structure) return false;
  const sets = [def.mechanics, ...(def.phases ?? []).map((p) => p.mechanics)];
  return sets.some(
    (m) =>
      m &&
      (m.charge ||
        m.slam ||
        m.summon ||
        (Array.isArray(m.abilities) && m.abilities.length > 0)),
  );
}

export { PROTECTED };
