#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODDER'S COMMAND — build a mod, or check one, without launching the game.
//
//   node mod/tools/cli.mjs build <mod-dir> [--out <file>]
//   node mod/tools/cli.mjs check <mod-dir>
//
// `check` is `build` without writing anything: the fast loop while authoring.
// Both report every problem at once rather than the first, because a mod that
// names three enemies that don't exist should take one round trip to fix, not
// three.
//
// The desktop game runs this same compiler on every mod it loads (see
// electron/src/mods.ts), so a mod that passes here is a mod the game will
// accept — that is the whole point of there being one compiler rather than a
// friendly one here and a strict one at load.

import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildMod } from "./build.mjs";
import { readCatalog } from "./catalog-read.mjs";

const argv = process.argv.slice(2);
const command = argv[0];
const modDir = argv[1] ? path.resolve(argv[1]) : "";
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (!["build", "check"].includes(command) || !modDir) {
  console.error(
    "usage:\n" +
      "  node mod/tools/cli.mjs build <mod-dir> [--out <file>]\n" +
      "  node mod/tools/cli.mjs check <mod-dir>\n\n" +
      "See mod/README.md. There is a worked example in mod/examples/.",
  );
  process.exit(2);
}

const catalog = readCatalog(
  fileURLToPath(new URL("../catalog.json", import.meta.url)),
);
const { bundle, errors, warnings } = buildMod(modDir, catalog);

for (const w of warnings) console.warn(`  ! ${w}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) in ${path.basename(modDir)}:\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}

const sprites = bundle.sprites.length;
const summary =
  `${bundle.name} v${bundle.version} — ${bundle.levels.length} level(s), ` +
  `${Object.keys(bundle.enemies).length} enemy/enemies, ${sprites} sprite(s)` +
  (bundle.kind === "conversion"
    ? `, campaign: ${bundle.campaign.join(" → ")}`
    : "");

if (command === "check") {
  console.log(`✓ ${summary}`);
  process.exit(0);
}

const out = flag("out") ?? path.join(modDir, "mod.json");
writeFileSync(out, `${JSON.stringify(bundle)}\n`);
console.log(`✓ ${summary}\n  → ${path.relative(process.cwd(), out)}`);
