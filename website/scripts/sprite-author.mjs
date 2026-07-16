#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sprite authoring loop — the tooling behind "draw a sprite from a
// description or a reference image, then refine it against the real game".
// See the `pixel-assets` skill and docs/sprite-yaml-plan.md for the workflow.
// Three subcommands, each one step of the loop:
//
//   analyze <image.png> --name N --family F [--size WxH] [--colors K]
//       Trace a reference image into a self-describing sprite YAML: resample
//       to the cell grid, quantize to a stable palette, emit the file. Prints
//       to stdout, or writes into the tree (and copies the reference) with
//       --out. This is the bootstrap — a hand-authored grid is optional.
//
//   pose <sprite-name> [--scale N] [--out path]
//       Render a base sprite centered on a patch of its OWN family ground,
//       upscaled, and print its description — the "does it read on the real
//       background" review surface (a sprite that reads on transparency can
//       vanish on its own tiles). Defaults to writing an @Nx PNG under the
//       preview dir.
//
//   compare <sprite-name> <reference.png>
//       Score the rendered sprite against a reference image (SSIM + mean OKLab
//       ΔE + coverage). A triage number for the refine loop, NOT an acceptance
//       test — the description and the human vote still decide.

import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { compareSurfaces } from "./asset-tools/compare.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import { loadImage, resampleToCells } from "./asset-tools/image.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import { quantizeGrid } from "./asset-tools/quantize.mjs";
import { toYaml } from "./asset-tools/sprite-yaml.mjs";
import {
  blit,
  createSurface,
  fill,
  tileSurface,
  upscale,
} from "./asset-tools/surface.mjs";
import { loadSprites } from "./sprite-data/load-yaml.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const previewDir = here("../assets-preview");
const spritesDir = here("./sprites");

/** Parse `--flag value` / `--flag` pairs and positional args out of argv. */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

/** `WxH` → `[w, h]` positive integers, or throw. */
function parseSize(spec) {
  const m = /^(\d+)x(\d+)$/.exec(String(spec));
  if (!m) die(`--size must look like 16x16, got "${spec}"`);
  return [Number(m[1]), Number(m[2])];
}

// ---- analyze: reference image → sprite YAML --------------------------------

async function analyze(positional, flags) {
  const imagePath = positional[0];
  if (!imagePath) die("analyze needs an image path");
  const name = flags.name;
  const family = flags.family;
  if (!name || name === true) die("analyze needs --name");
  if (!family || family === true) die("analyze needs --family");

  const image = await loadImage(imagePath);
  let size;
  if (flags.size && flags.size !== true) {
    size = parseSize(flags.size);
  } else if (image.width <= 64 && image.height <= 64) {
    size = [image.width, image.height]; // already sprite-sized — trace 1:1
  } else {
    die(
      `image is ${image.width}x${image.height}; pass --size WxH for the target`,
    );
  }

  const colors =
    flags.colors && flags.colors !== true ? Number(flags.colors) : 16;
  const cells = resampleToCells(image, size[0], size[1]);
  const { palette, grid } = quantizeGrid(cells, colors);

  const sprite = {
    name,
    family,
    size,
    description:
      flags.description && flags.description !== true ? flags.description : "",
    palette,
    grid,
  };

  const yaml = toYaml(sprite);
  if (flags.out && flags.out !== true) {
    const outPath = resolve(flags.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, yaml);
    let note = `wrote ${outPath}`;
    if (!flags["no-ref"]) {
      // Commit the reference next to the YAML so the refine loop is
      // reproducible from a clean checkout (the image is a source, like the
      // grid — it is not packed into the atlas).
      const refPath = outPath.replace(/\.ya?ml$/, ".ref.png");
      copyFileSync(resolve(imagePath), refPath);
      note += ` + ${basename(refPath)}`;
    }
    console.log(note);
  } else {
    process.stdout.write(yaml);
  }
}

// ---- pose: render a base sprite on its own family ground -------------------

function pose(positional, flags) {
  const name = positional[0];
  if (!name) die("pose needs a sprite name");
  const { SPRITES, SPRITE_PALETTES, SPRITE_FAMILY, FAMILIES } = loadSprites();

  const grid = SPRITES[name];
  if (!grid) {
    die(
      `no base sprite "${name}" (derived wound/worn variants aren't posable — ` +
        `pick a hand-authored sprite)`,
    );
  }
  const familyName = SPRITE_FAMILY[name];
  const family = FAMILIES.find((f) => f.name === familyName);
  const groundGrid = SPRITES[family.ground];
  const ground = gridToSurface(groundGrid, SPRITE_PALETTES[family.ground]);
  const sprite = gridToSurface(grid, SPRITE_PALETTES[name]);

  // A patch of ground with the sprite centered, one sprite-size of margin all
  // round so the silhouette is judged against tiling, not a bare edge.
  const pad = Math.max(sprite.width, sprite.height);
  const w = sprite.width + pad * 2;
  const h = sprite.height + pad * 2;
  const canvas = fill(createSurface(w, h), [24, 24, 28, 255]);
  blit(canvas, tileSurface(ground, w, h), 0, 0);
  blit(canvas, sprite, pad, pad);

  const scale = flags.scale && flags.scale !== true ? Number(flags.scale) : 8;
  const outPath =
    flags.out && flags.out !== true
      ? resolve(flags.out)
      : `${previewDir}/pose_${name}@${scale}x.png`;
  mkdirSync(dirname(outPath), { recursive: true });
  return writePng(upscale(canvas, scale), outPath).then(() => {
    const desc = readDescription(familyName, name);
    console.log(`pose → ${outPath}  (${family.ground} ground)`);
    console.log(
      `description: ${desc || "(empty — the acceptance target is unset)"}`,
    );
  });
}

/** Read a base sprite's `description` straight from its YAML for the pose readout. */
function readDescription(family, name) {
  try {
    const file = readFileSync(`${spritesDir}/${family}/${name}.yaml`, "utf8");
    return String(parse(file)?.description ?? "").trim();
  } catch {
    return "";
  }
}

// ---- compare: rendered sprite vs a reference image -------------------------

async function compare(positional) {
  const name = positional[0];
  const refPath = positional[1];
  if (!name || !refPath) die("compare needs <sprite-name> <reference.png>");
  const { SPRITES, SPRITE_PALETTES } = loadSprites();
  const grid = SPRITES[name];
  if (!grid) die(`no base sprite "${name}"`);

  const sprite = gridToSurface(grid, SPRITE_PALETTES[name]);
  const reference = await loadImage(refPath);
  const { ssim, meanDeltaE, coverage } = compareSurfaces(sprite, reference);
  console.log(`sprite   ${name} (${sprite.width}x${sprite.height})`);
  console.log(`ref      ${refPath} (${reference.width}x${reference.height})`);
  console.log(`ssim     ${ssim.toFixed(3)}   (1 = identical structure)`);
  console.log(`ΔE       ${meanDeltaE.toFixed(4)}   (0 = identical color)`);
  console.log(
    `coverage ${(coverage * 100).toFixed(1)}%  (opaque/transparent agreement)`,
  );
}

// ---- dispatch --------------------------------------------------------------

const [, , cmd, ...rest] = process.argv;
const { flags, positional } = parseArgs(rest);

const commands = { analyze, pose, compare };
if (!commands[cmd]) {
  console.error("usage: sprite-author <analyze|pose|compare> ...");
  console.error(
    "  analyze <image.png> --name N --family F [--size WxH] [--colors K] [--out path]",
  );
  console.error("  pose <sprite-name> [--scale N] [--out path]");
  console.error("  compare <sprite-name> <reference.png>");
  process.exit(cmd ? 1 : 0);
}

await commands[cmd](positional, flags);
