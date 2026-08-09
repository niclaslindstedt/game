// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TURNING WHEELS — the roll frames every vehicle on the drive's road gets, and
// the reason none of them used to have any.
//
// THE HERO'S CAR HAS ALWAYS SPUN and nothing else on the road ever did. His
// wagon is an ASSEMBLY (`render/vehicles.ts`): six panels and two wheels drawn
// separately, the wheels picked per frame off the simulated roll angle, so speed
// IS the spin. Every other vehicle out there is ONE grid with its wheels drawn
// into it — which is the right way to author twenty-two machines and the wrong
// way to move them. A bus overtaking at sixty on frozen wheels does not read as
// a mistake anybody can name; it reads as the bus being dragged.
//
// SO THE WHEELS ARE FOUND RATHER THAN DECLARED. Every tyre in this fleet is
// painted in the same char (`k`, the core palette's near-black), so the discs
// can be read straight off the authored grid — which means a new vehicle spins
// the day its art lands, with no table to keep in step and no chance of a
// twenty-third machine quietly being the one that doesn't. (A hand-kept map of
// wheel centres is exactly the drift `scenery.ts` spent two features learning
// not to write.)
//
// WHAT COMES OUT is a pair of FULL-CANVAS overlays per vehicle — `<id>_roll_0`
// and `<id>_roll_1` — holding the wheels and nothing else. Full canvas because
// the alternative is shipping coordinates to the renderer, and the renderer
// already knows how to blit a sprite at a vehicle's own anchor: an overlay laid
// at the same origin as the body lands its wheels exactly over the baked ones,
// through the same fold, yaw and facing flip, with no arithmetic anywhere.
//
// AND THE SPOKES ARE PAINTED, NOT ROTATED. Rotating the disc's interior was the
// first cut and it works on about half the fleet: a saloon's wheel carries a
// two-px rim bar that visibly turns, and a bus's carries a 3x3 block that is its
// own rotation. A pair of spokes struck across every wheel at two angles is the
// same trick `car_wheel_0`/`_1` are drawn with by hand — half a spoke apart —
// and it reads on all twenty-two.

/** How far apart the two frames are struck (radians). A quarter turn of a
 * four-spoke wheel, which is the largest angle that still reads as the SAME
 * wheel having turned rather than as a different wheel. */
const SPOKE_STEP = Math.PI / 4;

/** Every char a WHEEL is allowed to be made of: the tyre, the rim, the alloy,
 * the dark metal behind it and its own ink. Everything else inside the block is
 * the arch the wheel sits in, and belongs to the body. */
const WHEEL_INK = new Set(["k", "T", "A", "b", "O"]);

/**
 * WHAT COLOUR A SPOKE IS: WHICHEVER OF THE TWO THE WHEEL UNDER IT IS NOT.
 *
 * There are only two candidates — the rim's bright alloy and the dark metal
 * behind it — and the whole of the decision is that a spoke must not be struck
 * in the colour it is being struck ONTO. A bicycle's wheel is mostly air, so a
 * BRIGHT spoke crosses it; a cast wheel with a bright rim turns a DARK slot;
 * a car's wheel, whose middle is dark to begin with, turns a bright one again.
 *
 * Getting this wrong is silent, which is why it is measured rather than
 * assumed. The first cut picked "the lightest colour the disc contains", which
 * on a bright rim is the rim itself — so every frame struck a rim-coloured
 * spoke onto a rim-coloured wheel, and the entire fleet turned invisibly with
 * two extra atlas entries each to show for it.
 */
const BRIGHT = "T";
const DARK = "b";

/** The wheel chars that are bright enough that a bright spoke would vanish on
 * them. Everything else in `WHEEL_INK` is dark metal, tyre or ink. */
const BRIGHT_INK = new Set(["T", "A"]);

/**
 * EVERY WHEEL IN A GRID — the tyre clusters, as centres and radii in sprite px.
 *
 * Clustered by a gap in x, which is all the separation two wheels on a side
 * profile ever need: a vehicle's wheels are at its two ends and everything
 * between them is body. A cluster too small to be a wheel (a mirror stalk, a
 * pedal) is dropped on the pixel count.
 */
export function wheelDiscs(grid) {
  const pts = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "k") pts.push([x, y]);
    });
  });
  pts.sort((a, b) => a[0] - b[0]);
  const groups = [];
  for (const p of pts) {
    const last = groups[groups.length - 1];
    if (last && p[0] - last.maxX <= 2) {
      last.maxX = Math.max(last.maxX, p[0]);
      last.pts.push(p);
    } else {
      groups.push({ maxX: p[0], pts: [p] });
    }
  }
  return groups
    .filter((g) => g.pts.length > 6)
    .map((g) => {
      const xs = g.pts.map((p) => p[0]);
      const ys = g.pts.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      return {
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        r: Math.max(x1 - x0, y1 - y0) / 2,
      };
    });
}

/** Which char a spoke on this disc is struck in — measured off what is actually
 * inside the tyre, which is the only place the question means anything. */
function spokeChar(grid, disc) {
  const reach = Math.max(1, disc.r - 1.2);
  const tally = new Map();
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (Math.hypot(dx, dy) > reach) continue;
      const ch =
        grid[Math.round(disc.cy + dy)]?.[Math.round(disc.cx + dx)] ?? ".";
      tally.set(ch, (tally.get(ch) ?? 0) + 1);
    }
  }
  let top = ".";
  for (const [ch, n] of tally) if (n > (tally.get(top) ?? 0)) top = ch;
  return BRIGHT_INK.has(top) ? DARK : BRIGHT;
}

/**
 * ONE VEHICLE'S TWO ROLL FRAMES — the wheels, alone on the vehicle's own canvas,
 * struck with spokes half a step apart.
 *
 * Frame 0 is not "the authored wheel": BOTH frames carry spokes, because the
 * overlay covers the baked disc underneath it and a frame that added nothing
 * would show the authored wheel on one beat and a spoked one on the next — which
 * is a wheel that grows spokes at speed rather than one that turns.
 */
export function rollFrames(name, grid) {
  const discs = wheelDiscs(grid);
  if (!discs.length) return {};
  const w = grid[0].length;
  const h = grid.length;
  const out = {};
  for (let frame = 0; frame < 2; frame++) {
    const canvas = Array.from({ length: h }, () => new Array(w).fill("."));
    for (const disc of discs) {
      // The wheel exactly as authored, so the overlay's tyre and its ink ring
      // land on the ones underneath rather than beside them.
      //
      // CIRCULAR, AND ONLY THE WHEEL'S OWN COLOURS. A square block around the
      // disc scoops up the arch it sits in, and an overlay carrying a ring of
      // undamaged BODY colour would repaint the dent out of every wreck rung it
      // is laid over — the one thing a wheel must not do to the car around it.
      const reach = Math.ceil(disc.r) + 1;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (Math.hypot(dx, dy) > disc.r + 1.2) continue;
          const x = Math.round(disc.cx + dx);
          const y = Math.round(disc.cy + dy);
          const ch = grid[y]?.[x];
          if (ch && WHEEL_INK.has(ch)) canvas[y][x] = ch;
        }
      }
      // …and the spokes over it: two struck through the hub, a quarter turn
      // apart between the frames. They are painted onto the canvas whether or
      // not the copy has ink there, because a hollow wheel's spoke has to cross
      // AIR — checking first is what pinned a bicycle's spokes to the two the
      // artist happened to draw, leaving both frames identical.
      const ink = spokeChar(grid, disc);
      const reachIn = Math.max(1, disc.r - 1.3);
      for (let s = 0; s < 2; s++) {
        const a = frame * SPOKE_STEP + s * (Math.PI / 2);
        for (let t = -reachIn; t <= reachIn; t += 0.5) {
          const x = Math.round(disc.cx + Math.cos(a) * t);
          const y = Math.round(disc.cy + Math.sin(a) * t);
          if (canvas[y]?.[x] !== undefined) canvas[y][x] = ink;
        }
      }
    }
    out[`${name}_roll_${frame}`] = canvas.map((row) => row.join(""));
  }
  return out;
}
