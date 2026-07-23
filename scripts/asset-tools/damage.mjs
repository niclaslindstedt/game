// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Battle-damage variants — derive the "hurt" / "wrecked" / "dying" looks of
// an enemy from its base animation frames by overlaying wounds: gore splats
// (blood or ecto), grime scuffs on the lower body, dark dents chipped out of
// the silhouette, and (for the dying stage) cracks running through the body.
//
// Two invariants keep the output shippable without hand-tuning:
//   * Deterministic: the RNG is seeded from the sprite name, so regenerating
//     assets is byte-identical and PNG diffs only appear when a grid changes.
//   * Frame-stable: wounds land only on pixels that are body-colored in
//     EVERY frame (after each frame's whole-sprite bob shift), so damage
//     sticks to the body instead of flickering with the walk/float cycle.
//
// Stages are progressive — a wrecked mob keeps every wound its hurt version
// had and adds more — so losing hp never rearranges the damage.

/** Chars never painted over: transparency and the outline (incl. eyes). */
const PROTECTED = new Set([".", "O"]);

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

const firstLitRow = (grid) =>
  Math.max(
    0,
    grid.findIndex((row) => [...row].some((c) => c !== ".")),
  );

const isBody = (grid, x, y) =>
  y >= 0 &&
  y < grid.length &&
  x >= 0 &&
  x < grid[y].length &&
  !PROTECTED.has(grid[y][x]);

const isClear = (grid, x, y) =>
  y < 0 ||
  y >= grid.length ||
  x < 0 ||
  x >= grid[y].length ||
  grid[y][x] === ".";

/**
 * How much damage each stage lays on, scaled by body size (`per` = one
 * splat cluster per N body pixels, clamped to [min, max]). `size` is pixels
 * per cluster; dents chip the silhouette; cracks only appear on `dying`.
 */
const STAGES = {
  hurt: {
    per: 40,
    min: 2,
    max: 6,
    size: [2, 4],
    scuffs: 2,
    dents: 0,
    cracks: 0,
  },
  wrecked: {
    per: 18,
    min: 5,
    max: 14,
    size: [3, 6],
    scuffs: 3,
    dents: 4,
    cracks: 0,
  },
  dying: {
    per: 9,
    min: 9,
    max: 26,
    size: [4, 8],
    scuffs: 4,
    dents: 8,
    cracks: 4,
  },
};

/** Neighbor offsets, orthogonals first so clusters grow compact. */
const AROUND = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, -2],
  [-2, 0],
  [2, 0],
  [0, 2],
];

/**
 * Generate wounded variants of an enemy's animation frames.
 *
 * @param name    Sprite family name (seeds the RNG; keys the output).
 * @param frames  Base grids `[frame0, frame1, …]`.
 * @param style   `{ splat, core?, scuff? }` palette chars: `splat` is the
 *                gore color, `core` the darker wound center (defaults to
 *                splat), `scuff` optional grime for the lower body.
 * @param stages  Which of "hurt" / "wrecked" / "dying" to emit, in order.
 * @param reroll  Extra RNG offset — the caller bumps it to re-deal a layout
 *                whose clusters collapsed onto too few pixels to read (see
 *                the visibility retry in sprite-data/index.mjs). 0 keeps
 *                every currently-passing sprite's layout byte-identical.
 * @returns       `{ "<name>_<stage>_<frameIndex>": grid, … }`
 */
export function woundedFrames(name, frames, style, stages, reroll = 0) {
  const rand = mulberry32(hashString(name) + reroll);
  const core = style.core ?? style.splat;

  // Per-frame vertical bob: floaters shift the whole drawing down a row on
  // alternate frames; anchoring on the first lit row tracks that shift.
  const dys = frames.map((f) => firstLitRow(f) - firstLitRow(frames[0]));

  // Candidate pixels (frame-0 coordinates): body-colored in every frame.
  const candidates = [];
  frames[0].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (frames.every((f, i) => isBody(f, x, y + dys[i]))) {
        candidates.push({ x, y });
      }
    }
  });
  if (candidates.length === 0) return {};
  const candidateSet = new Set(candidates.map((p) => p.y * 1024 + p.x));
  const isCandidate = (x, y) => candidateSet.has(y * 1024 + x);
  const pick = () => candidates[Math.floor(rand() * candidates.length)];

  // Build ONE deep wound plan, then let each stage apply a prefix of it —
  // that's what makes the stages progressive. Ops are (x, y, char) paints
  // in frame-0 coordinates.
  const deepest = STAGES[stages[stages.length - 1]];
  const clusterOps = [];
  const clusterCount = Math.min(
    deepest.max,
    Math.max(deepest.min, Math.round(candidates.length / deepest.per)),
  );
  for (let c = 0; c < clusterCount; c++) {
    const anchor = pick();
    const [sizeMin, sizeMax] = deepest.size;
    const size = sizeMin + Math.floor(rand() * (sizeMax - sizeMin + 1));
    const ops = [{ x: anchor.x, y: anchor.y, char: core }];
    let placed = 1;
    for (const [dx, dy] of AROUND) {
      if (placed >= size) break;
      if (rand() < 0.35) continue; // ragged, not square
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (!isCandidate(x, y)) continue;
      ops.push({ x, y, char: style.splat });
      placed++;
    }
    clusterOps.push(ops);
  }

  // Grime on the lower body (legs wading through the mess).
  const lowY = firstLitRow(frames[0]);
  const lowCandidates = candidates.filter(
    (p) => p.y >= lowY + ((frames[0].length - lowY) * 2) / 3,
  );
  const scuffOps = [];
  for (let s = 0; s < deepest.scuffs && lowCandidates.length > 0; s++) {
    const p = lowCandidates[Math.floor(rand() * lowCandidates.length)];
    scuffOps.push([{ x: p.x, y: p.y, char: style.scuff ?? style.splat }]);
  }

  // Dents: darken body pixels that hug the exterior outline, so the
  // silhouette reads chipped without ever opening a hole in it.
  const edgeCandidates = candidates.filter(({ x, y }) =>
    AROUND.slice(0, 4).some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return (
        frames[0][ny]?.[nx] === "O" &&
        AROUND.slice(0, 4).some(([ex, ey]) =>
          isClear(frames[0], nx + ex, ny + ey),
        )
      );
    }),
  );
  const dentOps = [];
  for (let d = 0; d < deepest.dents && edgeCandidates.length > 0; d++) {
    const p = edgeCandidates[Math.floor(rand() * edgeCandidates.length)];
    dentOps.push([{ x: p.x, y: p.y, char: "O" }]);
  }

  // Cracks (dying only): short dark random walks through the body.
  const crackOps = [];
  for (let c = 0; c < deepest.cracks; c++) {
    let { x, y } = pick();
    const ops = [];
    const steps = 3 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      ops.push({ x, y, char: "O" });
      const [dx, dy] = AROUND[Math.floor(rand() * 4)];
      if (!isCandidate(x + dx, y + dy)) break;
      x += dx;
      y += dy;
    }
    crackOps.push(ops);
  }

  const out = {};
  for (const stage of stages) {
    const recipe = STAGES[stage];
    const clusters = Math.min(
      clusterOps.length,
      recipe.max,
      Math.max(recipe.min, Math.round(candidates.length / recipe.per)),
    );
    const ops = [
      ...clusterOps.slice(0, clusters).flat(),
      ...scuffOps.slice(0, recipe.scuffs).flat(),
      ...dentOps.slice(0, recipe.dents).flat(),
      ...crackOps.slice(0, recipe.cracks).flat(),
    ];
    frames.forEach((frame, i) => {
      const rows = frame.map((row) => [...row]);
      for (const op of ops) {
        const y = op.y + dys[i];
        if (isBody(frame, op.x, y)) rows[y][op.x] = op.char;
      }
      out[`${name}_${stage}_${i}`] = rows.map((r) => r.join(""));
    });
  }
  return out;
}
