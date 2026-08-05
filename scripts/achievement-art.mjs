#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PORTAL ARTWORK for the achievement lists — the images a human uploads
// beside the rows scripts/game-center-achievements.mjs and
// scripts/steam-achievements.mjs generate.
//
// Both storefronts want a picture per achievement, and between them that is 258
// rasters (86 for Game Center, 86 pairs for Steam). None of them is new art:
// every badge already HAS a picture — the atlas sprite its def names as `icon`,
// which the shelf and the unlock toast draw. A portal badge showing a different
// image than the game's own shelf would be the feature disagreeing with itself
// on two screens, so this script cuts the same sprite out of the same atlas and
// blows it up.
//
//   node scripts/achievement-art.mjs                  # both portals
//   node scripts/achievement-art.mjs --only steam     # one portal
//   node scripts/achievement-art.mjs --id boss_slayer # one badge, both portals
//
// Three rules make the output trustworthy:
//
//   1. NEAREST-NEIGHBOUR AT AN INTEGER FACTOR. Pixel art scales by whole
//      pixels or not at all (the repo's rule everywhere else, too) — a
//      resample would turn a two-color edge into a muddy gradient at exactly
//      the size a store shows it biggest.
//   2. THE LOCKED VARIANT IS THE SHELF'S OWN TREATMENT. Steam draws the pair
//      side by side, so the unearned icon is the earned one under the same
//      `grayscale(1) brightness(0.55)` the shelf applies to a locked badge
//      (styles.css, `.achievement-row.locked .achievement-cell .pixel-img`) —
//      not a second look invented here.
//   3. THE ID LIST IS THE COMMITTED MANIFEST. The manifests are drift-tested
//      against the catalog, so an added or retired badge flows into the
//      artwork on the next run with no second list to maintain.
//
// Output is gitignored (§11.2): it is reproducible build output, regenerated
// on demand like the store screenshots. The target directory is emptied first,
// so a retired badge's art never lingers to be uploaded.

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { badgeCanvas, lockedBadge } from "./asset-tools/achievement-badge.mjs";
import { createSurface } from "./asset-tools/surface.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register(pathToFileURL(path.join(here, "game-alias-loader.mjs")).href);

const { ACHIEVEMENTS_BY_ID } = await import(
  pathToFileURL(path.join(root, "pwa/src/game/achievement-defs.ts")).href
);

/** What each portal wants, and where it goes. */
const TARGETS = [
  {
    key: "game-center",
    label: "Game Center",
    manifest: "native/store/game-center-achievements.json",
    out: "native/store/achievements",
    // Apple's minimum is 512; 1024 is the recommended size and the one App
    // Store Connect keeps at full resolution.
    size: 1024,
    // Game Center rounds the corners of an achievement image, so the badge
    // keeps a tenth of the canvas as margin on every side rather than running
    // into a crop. Steam's 64px chip has no pixels to spare for one.
    margin: 0.1,
    variants: [{ suffix: "", locked: false }],
  },
  {
    key: "steam",
    label: "Steam",
    manifest: "electron/store/steam-achievements.json",
    out: "electron/store/achievements",
    size: 64,
    margin: 0,
    variants: [
      { suffix: "-achieved", locked: false },
      { suffix: "-locked", locked: true },
    ],
  },
];

const ASSETS = path.join(root, "pwa/src/game/assets");

const atlasRects = (() => {
  try {
    return JSON.parse(readFileSync(path.join(ASSETS, "atlas.json"), "utf8"));
  } catch {
    console.error(
      "no sprite atlas at pwa/src/game/assets/atlas.json — run `npm run assets` first.",
    );
    process.exit(1);
  }
})();

const atlas = await sharp(path.join(ASSETS, "atlas.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

/** Cut one sprite out of the atlas as a straight-alpha RGBA surface. */
function spriteSurface(name) {
  const cell = atlasRects[name];
  if (!cell) throw new Error(`sprite "${name}" is not in the atlas`);
  const [sx, sy, w, h] = cell;
  const out = createSurface(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((sy + y) * atlas.info.width + sx) * 4;
    out.data.set(atlas.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/** Write a surface as an opaque PNG — neither portal accepts an alpha channel. */
async function writeBadge(surface, file) {
  await sharp(Buffer.from(surface.data), {
    raw: { width: surface.width, height: surface.height, channels: 4 },
  })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(file);
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const only = flag("--only");
const oneId = flag("--id");

if (only && !TARGETS.some((target) => target.key === only)) {
  console.error(
    `unknown portal "${only}" — expected one of ${TARGETS.map((t) => t.key).join(", ")}`,
  );
  process.exit(1);
}

let wrote = 0;
for (const target of TARGETS) {
  if (only && target.key !== only) continue;

  const manifest = JSON.parse(
    readFileSync(path.join(root, target.manifest), "utf8"),
  );
  const rows = manifest.achievements.filter(
    (row) => oneId === undefined || row.id === oneId,
  );
  if (rows.length === 0) {
    console.error(
      `no achievement "${oneId}" in ${target.manifest} — is it a platform badge?`,
    );
    process.exit(1);
  }

  const dir = path.join(root, target.out);
  // A full run owns the directory: a badge retired from the catalog leaves no
  // orphan raster behind to be uploaded next to the live ones.
  if (oneId === undefined) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const sprites = new Set();
  for (const row of rows) {
    const def = ACHIEVEMENTS_BY_ID.get(row.id);
    if (!def) {
      throw new Error(
        `${target.manifest} lists "${row.id}", which the badge catalog does not have — ` +
          "regenerate the manifest.",
      );
    }
    sprites.add(def.icon);
    const sprite = spriteSurface(def.icon);
    for (const variant of target.variants) {
      const art = badgeCanvas(
        variant.locked ? lockedBadge(sprite) : sprite,
        target,
      );
      await writeBadge(art, path.join(dir, `${row.id}${variant.suffix}.png`));
      wrote++;
    }
  }

  console.log(
    `${target.label}: ${rows.length * target.variants.length} × ${target.size}px ` +
      `(${rows.length} badge${rows.length === 1 ? "" : "s"}, ` +
      `${sprites.size} sprite${sprites.size === 1 ? "" : "s"}) → ${target.out}/`,
  );
}

console.log(`\n${wrote} images written.`);
