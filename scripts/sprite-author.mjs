#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sprite authoring loop — the tooling behind "draw a sprite from a
// description or a reference image, then refine it against the real game".
// See the `pixel-assets` skill for the workflow.
// Four subcommands, each one step of the loop:
//
//   prompt <sprite-name> [--out path]
//       Synthesize an image-generation prompt from a sprite's fields — the
//       global style preamble, its family's style anchor, its description, size,
//       and palette. The grid is excluded: the prompt exists to regenerate it.
//       This is the blank-canvas step — feed the prompt to an image model, save
//       the result, then hand it to `analyze`.
//
//   analyze <image.png> --name N --family F [--size WxH] [--colors K]
//       Trace a reference image into a self-describing sprite YAML: resample
//       to the cell grid, quantize to a stable palette, emit the file. Prints
//       to stdout, or writes into the tree (and copies the reference) with
//       --out. This is the bootstrap — a hand-authored grid is optional. Pass
//       --model/--seed/--prompt-file to record generation provenance beside the
//       reference (`<name>.ref.json`) — auditable, not reproducible.
//
//   pose <sprite-name> [--scale N] [--out path]
//       Render a base sprite centered on a patch of its OWN family ground,
//       upscaled, and print its description — the "does it read on the real
//       background" review surface (a sprite that reads on transparency can
//       vanish on its own tiles). Defaults to writing an @Nx PNG under the
//       preview dir.
//
//   verify <sprite-name> [--scale N] [--out path]
//       The sync gate — generate the sprite's prompt AND render its pose in one
//       shot, then run the mechanical prompt↔sprite coherence check
//       (`coherence.mjs`): is the prompt whole enough to recreate the sprite,
//       and does anything in the words (a restated size, a stray "front-facing",
//       an unnamed color) fight the pixels? Prints the prompt, the pose path,
//       and the findings, then hands the semantic "does it LOOK like the words"
//       call to the eye. Run it whenever a sprite is created or its
//       description/subject changes.
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
import { promptSelfCheck } from "./asset-tools/coherence.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import { loadImage, resampleToCells } from "./asset-tools/image.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import {
  buildImagePrompt,
  paletteComments,
  provenanceRecord,
} from "./asset-tools/prompt.mjs";
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
const previewDir = here("../pwa/assets-preview");
const spritesDir = here("../content/sprites");

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

      // Record what generated the reference, when told: the prompt, model, and
      // seed. Generation isn't deterministic, so this makes it auditable (an
      // RNG seed's analog) rather than reproducible.
      const val = (f) => (flags[f] && flags[f] !== true ? flags[f] : undefined);
      const promptFile = val("prompt-file");
      if (val("model") || val("seed") || promptFile) {
        const record = provenanceRecord({
          prompt: promptFile
            ? readFileSync(resolve(promptFile), "utf8").trim()
            : undefined,
          model: val("model"),
          seed: val("seed"),
        });
        const jsonPath = outPath.replace(/\.ya?ml$/, ".ref.json");
        writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
        note += ` + ${basename(jsonPath)}`;
      }
    }
    console.log(note);
  } else {
    process.stdout.write(yaml);
  }
}

// ---- prompt: sprite fields → image-generation prompt -----------------------

function promptCmd(positional, flags) {
  const name = positional[0];
  if (!name) die("prompt needs a sprite name");
  const { SPRITE_FAMILY, FAMILIES } = loadSprites();
  const familyName = SPRITE_FAMILY[name];
  if (!familyName) {
    die(
      `no base sprite "${name}" (derived wound/worn variants have no fields to ` +
        `prompt from — pick a hand-authored sprite)`,
    );
  }
  const family = FAMILIES.find((f) => f.name === familyName);
  const text = readFileSync(`${spritesDir}/${familyName}/${name}.yaml`, "utf8");
  const sprite = parse(text);

  const prompt = buildImagePrompt({
    description: sprite.description,
    subject: sprite.subject,
    familyStyle: family.style,
    size: sprite.size,
    palette: sprite.palette,
    paletteNames: paletteComments(text),
  });

  if (flags.out && flags.out !== true) {
    const outPath = resolve(flags.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${prompt}\n`);
    console.log(`wrote ${outPath}`);
  } else {
    process.stdout.write(`${prompt}\n`);
  }
}

// ---- pose: render a base sprite on its own family ground -------------------

/**
 * Render a base sprite centered on a patch of its own family ground and write
 * the upscaled PNG — the shared review surface for `pose` and `verify`. Returns
 * `{ outPath, ground }`. Dies if the name isn't a posable hand-authored sprite.
 */
async function renderPose(name, flags, data) {
  const { SPRITES, SPRITE_PALETTES, SPRITE_FAMILY, FAMILIES } = data;
  const grid = SPRITES[name];
  if (!grid) {
    die(
      `no base sprite "${name}" (derived wound/worn variants aren't posable — ` +
        `pick a hand-authored sprite)`,
    );
  }
  const family = FAMILIES.find((f) => f.name === SPRITE_FAMILY[name]);
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
  await writePng(upscale(canvas, scale), outPath);
  return { outPath, ground: family.ground };
}

async function pose(positional, flags) {
  const name = positional[0];
  if (!name) die("pose needs a sprite name");
  const data = loadSprites();
  const { outPath, ground } = await renderPose(name, flags, data);
  const desc = readDescription(data.SPRITE_FAMILY[name], name);
  console.log(`pose → ${outPath}  (${ground} ground)`);
  console.log(
    `description: ${desc || "(empty — the acceptance target is unset)"}`,
  );
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

// ---- verify: prompt ↔ sprite coherence -------------------------------------

async function verify(positional, flags) {
  const name = positional[0];
  if (!name) die("verify needs a sprite name");
  const data = loadSprites();
  const familyName = data.SPRITE_FAMILY[name];
  if (!familyName) {
    die(
      `no base sprite "${name}" (derived wound/worn variants have no fields to ` +
        `verify — pick a hand-authored sprite)`,
    );
  }
  const family = data.FAMILIES.find((f) => f.name === familyName);
  const text = readFileSync(`${spritesDir}/${familyName}/${name}.yaml`, "utf8");
  const sprite = parse(text);
  const paletteNames = paletteComments(text);

  // The two halves the sync check compares: the prompt words and the rendered
  // pixels. Build both, then run the mechanical desync check between them.
  const prompt = buildImagePrompt({
    description: sprite.description,
    subject: sprite.subject,
    familyStyle: family.style,
    size: sprite.size,
    palette: sprite.palette,
    paletteNames,
  });
  const { outPath, ground } = await renderPose(name, flags, data);
  const findings = promptSelfCheck({
    description: sprite.description,
    subject: sprite.subject,
    size: sprite.size,
    palette: sprite.palette,
    paletteNames,
  });

  console.log(prompt);
  console.log(`\npose  → ${outPath}  (${ground} ground)\n`);
  if (findings.length === 0) {
    console.log("coherence: ✓ nothing in the words fights the pixels");
  } else {
    const mark = { fix: "✗", trim: "~", note: "·" };
    console.log("coherence:");
    for (const f of findings) {
      console.log(`  ${mark[f.level] ?? "-"} [${f.level}] ${f.message}`);
    }
  }
  console.log(
    "\nNow read the prompt against the pose: could you recreate this sprite from\n" +
      "the prompt alone, and does the sprite look like the prompt says? If the two\n" +
      "disagree, sync them — the description/subject is the acceptance target, so\n" +
      "the grid usually yields (see the pixel-assets skill).",
  );
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

const commands = { prompt: promptCmd, analyze, pose, verify, compare };
if (!commands[cmd]) {
  console.error(
    "usage: sprite-author <prompt|analyze|pose|verify|compare> ...",
  );
  console.error("  prompt <sprite-name> [--out path]");
  console.error(
    "  analyze <image.png> --name N --family F [--size WxH] [--colors K] [--out path]",
  );
  console.error("           [--model M] [--seed S] [--prompt-file P]");
  console.error("  pose <sprite-name> [--scale N] [--out path]");
  console.error("  verify <sprite-name> [--scale N] [--out path]");
  console.error("  compare <sprite-name> <reference.png>");
  process.exit(cmd ? 1 : 0);
}

await commands[cmd](positional, flags);
