// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLEET'S DAMAGE LADDER — the dented, de-glazed and finally written-off
// looks of every vehicle on the road to GOODCO, derived from its clean art.
//
// WHY DERIVED AND NEVER DRAWN. The traffic is twenty vehicles; three damage
// rungs each is sixty grids, and the sixty-first is whatever somebody adds next
// week. Hand-drawing them means a fleet that can only grow at the speed an
// artist can crumple a car, and — worse — a fleet where a retuned base sprite
// silently keeps three stale wrecks behind it. So a vehicle ships ONE grid and
// earns its ladder, exactly as an enemy ships two frames and earns its wounds
// (`damage.mjs`, which this file is deliberately the twin of).
//
// THE TWO INVARIANTS ARE THE SAME TWO, and both are load-bearing:
//   * DETERMINISTIC — the RNG is seeded from the sprite's own name, so
//     regenerating assets is byte-identical and a PNG diff only appears when a
//     grid actually changes. Without it every unrelated PR churns the atlas.
//   * PROGRESSIVE — each rung applies a PREFIX of one damage plan, so a car
//     climbing its ladder never rearranges the damage it already had. A vehicle
//     whose dents moved when it took another hit reads as a different vehicle.
//
// WHAT A RUNG ACTUALLY DOES, and the order matters because each reads the last:
//
//   1  DENTED     — the paint goes. Clusters of the body's own shadow colour
//                   punched into the flanks and the roof, and the lamps at both
//                   ends put out. It is the rung that has to read at 1x from a
//                   lane away, which is why it is shadow-on-paint rather than
//                   anything subtle.
//   2  STOVE IN   — the glass goes. Every window becomes a black hole, the
//                   dents deepen to bare metal, and the silhouette starts to
//                   lose its corners.
//   3  WRITTEN OFF— the shape goes. The roof line is chewed into, the ends are
//                   ragged, holes open through the body, and what is left is
//                   plainly not going anywhere under its own power.
//
// IT DOES NOT TOUCH THE RUNNING GEAR. Tyres and rims are left alone at every
// rung, and that is a decision rather than an oversight: a wrecked car still
// has to read as a CAR — a silhouette with its wheels eaten reads as a pile of
// scrap, and the player has to recognise the thing he ruined.

/** Chars never painted over: transparency, the outline, and everything the
 * running gear is made of. */
const PROTECTED = new Set([".", "O", "k", "T"]);
/** …and the glass, which has a rung of its own and must not be dented first. */
const GLASS = new Set(["G", "H", "c"]);
/** The lamps, which go out rather than getting dented. */
const LAMPS = new Set(["y", "r"]);

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
 * The rungs, in order. `dents` is how many clusters of crumpled paint go on,
 * `size` how big each is, `bite` how many chunks are taken out of the
 * silhouette, and `holes` how many go right through.
 */
const RUNGS = [
  {
    name: "dent1",
    dents: 7,
    size: [2, 3],
    bite: 0,
    holes: 0,
    glass: false,
    fold: 0,
  },
  {
    name: "dent2",
    dents: 13,
    size: [2, 4],
    bite: 3,
    holes: 1,
    glass: true,
    fold: 1,
  },
  {
    name: "dent3",
    dents: 20,
    size: [3, 5],
    bite: 7,
    holes: 4,
    glass: true,
    fold: 2,
  },
];

/**
 * FOLD THE BODY AT ITS WEAK SPOT.
 *
 * A car does not get evenly dirty when it is hit — it BENDS, and it bends where
 * the section is weakest, which side-on is the middle: the door aperture between
 * the axles, with a wheel arch bracing each end. So the upper body sags toward
 * the centre while the running gear stays exactly where it was, and the whole
 * silhouette goes from a rectangle to a shallow banana.
 *
 * IT IS THE RUNG THAT READS AT 1x. Dents are a texture — legible from a lane
 * away and gone at a glance; a roofline that has stopped being straight is
 * visible at any distance the vehicle is visible at all, and it is what tells a
 * player that the thing he has been ramming is nearly finished.
 *
 * THE PIVOT IS THE TOP OF THE TYRES, and it has to be: shifting the whole grid
 * down drives the wheels through the road, which reads as the vehicle SINKING
 * rather than folding (the same trap the derived kneel poses fell into). Only
 * what is above the axle line moves.
 */
function fold(rows, amount) {
  if (amount <= 0) return rows;
  let x0 = Infinity;
  let x1 = -Infinity;
  let pivot = rows.length;
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === ".") continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      // The topmost tyre pixel — where the bodywork stops being free to move.
      if (c === "k" && y < pivot) pivot = y;
    }
  if (!Number.isFinite(x0)) return rows;
  if (pivot >= rows.length) pivot = Math.round(rows.length * 0.62);
  const cx = (x0 + x1) / 2;
  const half = Math.max(1, (x1 - x0) / 2);
  const out = rows.map((row) => row.split(""));
  for (let x = x0; x <= x1; x++) {
    // A cosine rather than a triangle: a fold is a curve, and a linear ramp
    // leaves a visible kink at both ends that reads as a rendering error.
    const k = Math.cos((Math.PI / 2) * Math.min(1, Math.abs(x - cx) / half));
    const shift = Math.round(amount * k);
    if (shift <= 0) continue;
    for (let y = pivot - 1; y >= 0; y--) {
      out[y][x] = y - shift >= 0 ? rows[y - shift][x] : ".";
    }
  }
  return out.map((row) => row.join(""));
}

const at = (grid, x, y) =>
  y >= 0 && y < grid.length && x >= 0 && x < grid[y].length ? grid[y][x] : ".";

const set = (rows, x, y, ch) => {
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return;
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
};

/** Every pixel that is bodywork — paintable, and not glass, lamp or wheel. */
function bodyPixels(grid) {
  const out = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (PROTECTED.has(c) || GLASS.has(c) || LAMPS.has(c)) continue;
      out.push([x, y]);
    }
  return out;
}

/** …and every pixel on the silhouette's own outside edge, which is what a bite
 * is taken out of. */
function edgePixels(grid) {
  const out = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ".") continue;
      if (
        at(grid, x - 1, y) === "." ||
        at(grid, x + 1, y) === "." ||
        at(grid, x, y - 1) === "." ||
        at(grid, x, y + 1) === "."
      ) {
        out.push([x, y]);
      }
    }
  return out;
}

/**
 * WHICH DARK CHARS THIS SPRITE ACTUALLY HAS to crumple with.
 *
 * A derived look may only paint in chars the base sprite's own palette defines,
 * or it renders in nothing at all — the same trap the wound styles fall into,
 * and the reason `deriveWounds` merges the sprite's palette rather than the
 * family's. Every fleet grid carries `d` (its own shadow), `b` (dark trim) and
 * `O` (ink), so the ladder has a three-step ramp on every vehicle without any
 * of them authoring a thing for it.
 */
function inkFor(grid) {
  const used = new Set(grid.join(""));
  return {
    bruise: used.has("d") ? "d" : "b",
    metal: used.has("b") ? "b" : "O",
    hole: "O",
  };
}

/**
 * Derive the whole ladder for one vehicle. Returns `{ <name>_dent1: grid, … }`.
 *
 * `reroll` bumps the seed — the escape hatch for a sprite whose deal happens to
 * land every cluster on the same six pixels, exactly as the wound generator's
 * does.
 */
export function wreckedFrames(name, grid, reroll = 0) {
  const out = {};
  const rng = mulberry32(hashString(name) + reroll * 7919);
  const ink = inkFor(grid);
  // ONE PLAN, DEALT ONCE, APPLIED AS PREFIXES. This is what makes the ladder
  // progressive: rung 2 is rung 1 plus more of the same list, so a car that
  // takes another hit never rearranges the damage it already had.
  const body = bodyPixels(grid);
  const edge = edgePixels(grid);
  const plan = [];
  const total = RUNGS[RUNGS.length - 1];
  for (let i = 0; i < total.dents; i++) {
    const anchor = body[Math.floor(rng() * body.length)];
    if (!anchor) break;
    const w = 1 + Math.floor(rng() * total.size[0]);
    const h = 1 + Math.floor(rng() * (total.size[1] - 1));
    plan.push({ kind: "dent", x: anchor[0], y: anchor[1], w, h });
  }
  const bites = [];
  for (let i = 0; i < total.bite; i++) {
    const anchor = edge[Math.floor(rng() * edge.length)];
    if (!anchor) break;
    bites.push({ x: anchor[0], y: anchor[1], w: 1 + Math.floor(rng() * 2) });
  }
  const holes = [];
  for (let i = 0; i < total.holes; i++) {
    const anchor = body[Math.floor(rng() * body.length)];
    if (!anchor) break;
    holes.push({ x: anchor[0], y: anchor[1] });
  }

  let rungIndex = 0;
  for (const rung of RUNGS) {
    rungIndex++;
    // THE FOLD GOES ON FIRST, so everything after it lands on the shape the
    // body has actually ended up in. Dented first and folded second, the dents
    // slide with the panels and the crease ends up drawn through empty air.
    const rows = fold([...grid], rung.fold);
    // THE PAINT. Deeper ink the further up the ladder, so the same dent that
    // was a crease at rung 1 is bare metal by rung 3.
    const dentInk = rungIndex === 1 ? ink.bruise : ink.metal;
    for (const d of plan.slice(0, rung.dents)) {
      for (let y = d.y; y < d.y + d.h; y++)
        for (let x = d.x; x < d.x + d.w; x++) {
          const c = at(rows, x, y);
          if (PROTECTED.has(c) || GLASS.has(c) || LAMPS.has(c)) continue;
          // A DENT IS TWO TONES, NEVER ONE. A solid block of the shadow colour
          // reads as camouflage; a hard crease along the top with the softer
          // shade under it reads as metal that has been pushed in, because that
          // is what a dent does to a light coming from up and to the left.
          set(rows, x, y, y === d.y ? ink.metal : dentInk);
        }
    }
    // THE LAMPS, out from the first rung. Nothing on this road survives a shunt
    // with its lights on, and a dark lamp is the cheapest damage read there is.
    for (let y = 0; y < rows.length; y++)
      for (let x = 0; x < rows[y].length; x++) {
        if (LAMPS.has(at(rows, x, y))) set(rows, x, y, ink.metal);
      }
    // THE GLASS, from rung 2 — every window becomes a hole.
    if (rung.glass) {
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          if (GLASS.has(at(rows, x, y))) set(rows, x, y, ink.hole);
        }
    }
    // THE SILHOUETTE. Chunks off the corners, which is what actually says
    // "written off" at 1x — a dented but intact outline still reads as a car
    // that has been to the shops.
    for (const b of bites.slice(0, rung.bite)) {
      for (let x = b.x; x < b.x + b.w; x++) {
        if (PROTECTED.has(at(rows, x, b.y)) && at(rows, x, b.y) !== "O") {
          continue;
        }
        set(rows, x, b.y, ".");
      }
    }
    // …and holes right through it.
    for (const h of holes.slice(0, rung.holes)) {
      const c = at(rows, h.x, h.y);
      if (!PROTECTED.has(c)) set(rows, h.x, h.y, ink.hole);
    }
    out[`${name}_${rung.name}`] = rows;
  }
  out[`${name}_gore`] = goreFrame(name, grid, rng);
  return out;
}

/**
 * WHAT THE INSIDE OF A CAR LOOKS LIKE FROM OUTSIDE IT — the glass, and only the
 * glass, wearing what happened to the people behind it.
 *
 * IT IS AN OVERLAY RATHER THAN A RUNG, and that is the whole design. A car's
 * damage is a ladder of four pictures and whether anybody died in it is an
 * INDEPENDENT fact — a saloon can be folded up and empty, or barely marked with
 * two people dead in the front. Four rungs times two states is eight grids per
 * vehicle and nobody would keep them in step; one overlay drawn OVER whichever
 * rung is showing is one grid, and it lands correctly on all four because the
 * windows do not move.
 *
 * EVERY OTHER PIXEL IS TRANSPARENT, so the car underneath keeps its paint, its
 * dents and its outline. What goes in the apertures is a spatter rather than a
 * fill: a flat red window reads as tinted glass, and what this has to read as
 * from a lane away at 1x is a window somebody is up against.
 *
 * The rng is the LADDER'S OWN, taken after the rungs have been dealt, so the
 * spatter is deterministic per vehicle and adding it cannot move a single dent
 * on any of the four pictures above it.
 */
function goreFrame(name, grid, rng) {
  const frame = grid.map((row) => ".".repeat(row.length));
  // THE NOISE IS COARSE — one roll per 2×2 BLOCK rather than one per pixel, so
  // what lands on the pane is a smear with an edge to it rather than static.
  // That is a legibility rule at this size (a checkerboard of red and clear
  // reads as dithering, not as blood) and it is also what keeps the build's
  // orphan check quiet without an exemption: every mark is at least two pixels
  // of something.
  const blot = new Map();
  const roll = (x, y) => {
    const key = `${x >> 1},${y >> 1}`;
    if (!blot.has(key)) blot.set(key, rng());
    return blot.get(key);
  };
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (!GLASS.has(grid[y][x])) continue;
      const r = roll(x, y);
      // A fifth of the glass is left alone, so the window still reads as a
      // window with something on it. The rest is two depths: the dark core
      // where somebody is actually against the pane, and the brighter spray
      // around it.
      if (r < 0.2) continue;
      set(frame, x, y, r < 0.6 ? "r" : "i");
    }
  }
  // …and a last sweep for anything the pane's own shape left stranded: a one-
  // pixel window, or a corner the block grid clipped to a single cell. A lone
  // red pixel on an otherwise clean car reads as a rendering fault rather than
  // as blood, which is the same reason the build warns about them.
  const lit = (x, y) =>
    y >= 0 && y < frame.length && x >= 0 && x < frame[y].length
      ? frame[y][x] !== "."
      : false;
  for (let pass = 0; pass < 3; pass++) {
    let cleared = 0;
    for (let y = 0; y < frame.length; y++) {
      for (let x = 0; x < frame[y].length; x++) {
        if (!lit(x, y)) continue;
        if (lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1)) {
          continue;
        }
        set(frame, x, y, ".");
        cleared++;
      }
    }
    if (cleared === 0) break;
  }
  return frame;
}

/** The rung names, in order — what the renderer indexes into. */
export const WRECK_RUNGS = RUNGS.map((r) => r.name);

/** …and the name of the blood-on-the-glass overlay a vehicle derives beside
 * them, which the renderer lays over whichever rung is showing. */
export const WRECK_GORE = "gore";
