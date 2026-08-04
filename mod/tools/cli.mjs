#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE MODDER'S COMMAND — everything you can do to a mod without launching the
// game, in one place.
//
//   node mod/tools/cli.mjs new <name> [--in <dir>] [--title "MY MOD"]
//   node mod/tools/cli.mjs check <mod-dir>
//   node mod/tools/cli.mjs build <mod-dir> [--out <file>]
//   node mod/tools/cli.mjs ids [pattern] [--kind <kind>] [--limit <n>]
//   node mod/tools/cli.mjs where
//
// `check` is `build` without writing anything: the fast loop while authoring.
// Both report every problem at once rather than the first, because a mod that
// names three enemies that don't exist should take one round trip to fix, not
// three.
//
// The desktop game runs this same compiler on every mod it loads (see
// electron/src/mods.ts), so a mod that passes here is a mod the game accepts —
// that is the whole point of there being one compiler rather than a friendly
// one here and a strict one at load.
//
// `ids` and `where` exist for the same reason as the rest: they are the two
// questions every mod author (and every agent working in this directory) has
// to answer before they can get anywhere, and neither should require reading a
// 1,400-entry JSON file or guessing at an OS convention. See mod/AGENTS.md.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildMod } from "./build.mjs";
import { readCatalog } from "./catalog-read.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(here, "..", "catalog.json");
const EXAMPLE = path.join(here, "..", "examples", "greenhouse");
/** The id the worked example uses everywhere, and therefore the token `new`
 * rewrites. Kept here rather than inlined so the scaffold and the example
 * cannot drift apart silently. */
const EXAMPLE_ID = "greenhouse";

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const USAGE = `usage:
  node mod/tools/cli.mjs new <name> [--in <dir>] [--title "MY MOD"]
      Copy the worked example into a new mod of your own, with every id
      renamed. The result compiles immediately — change it from there.

  node mod/tools/cli.mjs check <mod-dir>
      Validate a mod and report every problem. Writes nothing.

  node mod/tools/cli.mjs build <mod-dir> [--out <file>]
      Validate, then write the compiled bundle (default <mod-dir>/mod.json).

  node mod/tools/cli.mjs ids [pattern] [--kind <kind>] [--limit <n>]
      Search the ids a mod may reference.

  node mod/tools/cli.mjs where
      Print the folder to drop a mod in so the game picks it up.

See mod/README.md for the guide and mod/AGENTS.md for the step-by-step.`;

try {
  await main();
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

async function main() {
  if (command === "new") return newMod();
  if (command === "check" || command === "build") return compile();
  if (command === "ids") return searchIds();
  if (command === "where") return whereToPutIt();
  console.error(`${USAGE}\n\nid kinds: ${kinds().join(", ")}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// new — the scaffold
// ---------------------------------------------------------------------------

/**
 * Copy the worked example into a mod of the caller's own.
 *
 * It renames rather than emptying: a scaffold that compiles and RUNS on the
 * first try is worth more than a blank directory, because the first question
 * anyone has is "does any of this work", and an empty folder cannot answer it.
 * Every id derived from the example's own id is rewritten, so the result does
 * not collide with the example or with anything else.
 */
function newMod() {
  const name = positional[0];
  if (!name) fail("new: needs a name — `cli.mjs new my-mod`");
  if (!/^[a-z][a-z0-9-]{2,31}$/.test(name)) {
    fail(
      `new: "${name}" cannot be a mod id — 3–32 chars, lowercase letters, ` +
        "digits and dashes, starting with a letter",
    );
  }
  if (name === EXAMPLE_ID) fail(`new: "${name}" is the example's own id`);

  const parent = path.resolve(flag("in") ?? process.cwd());
  const dest = path.join(parent, name);
  if (existsSync(dest)) fail(`new: ${dest} already exists`);

  mkdirSync(parent, { recursive: true });
  cpSync(EXAMPLE, dest, { recursive: true });

  // The id appears in file names, directory names and file contents alike
  // (`greenhouse_creeper.yaml`, `sprites/greenhouse/`, `id: greenhouse`), so
  // all three are rewritten. Content first, then paths — renaming as we walk
  // would invalidate the paths we are walking.
  const title = flag("title") ?? name.replace(/-/g, " ").toUpperCase();
  for (const file of walkFiles(dest)) {
    const before = readFileSync(file, "utf8");
    const after = before
      .replace(new RegExp(EXAMPLE_ID, "g"), name.replace(/-/g, "_"))
      .replace(/^name: THE .*$/m, `name: ${title}`)
      .replace(/^author: .*$/m, "author: YOU");
    if (after !== before) writeFileSync(file, after);
  }
  renamePaths(dest, name.replace(/-/g, "_"));

  // The manifest is rewritten rather than patched: the example's header
  // describes the EXAMPLE ("a worked addon demonstrating…"), which is exactly
  // wrong at the top of somebody's own mod, and a scaffold that lies about
  // what it is teaches the format badly. The `id` is set here too — it must be
  // the DASHED name (the rule the compiler enforces) while content ids use
  // underscores, so the blanket rewrite above would have got it wrong.
  writeFileSync(path.join(dest, "mod.yaml"), scaffoldManifest(name, title));

  const { errors } = buildMod(dest, readCatalog(CATALOG));
  if (errors.length > 0) {
    // The scaffold is ours; if it does not compile that is a bug in this tool,
    // and saying so is more useful than handing over a broken folder quietly.
    console.error(
      `\n✗ the scaffold did not compile — this is a bug in the SDK:`,
    );
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ ${title} → ${path.relative(process.cwd(), dest) || dest}\n` +
      `  it compiles as-is. Next:\n` +
      `    node mod/tools/cli.mjs check ${path.relative(process.cwd(), dest) || dest}\n` +
      `    copy it into the game's mods/ folder and launch (cli.mjs where)`,
  );
}

/** A fresh mod's manifest. Every field the compiler requires, and a comment
 * on each one saying what it is for — the file is the first thing its author
 * opens, so it doubles as the format's front page. */
function scaffoldManifest(id, title) {
  return `# SPDX-License-Identifier: CC0-1.0
# The manifest. Every mod has exactly one, at its root.
# Reference: mod/FORMAT.md — step-by-step: mod/AGENTS.md

# Lowercase, 3–32 chars, letters/digits/dashes. This is the folder a Workshop
# subscription unpacks into and the key the game remembers your mod by, so it
# must not change once you have published.
id: ${id}

name: ${title}
version: 1.0.0
author: YOU
description: >-
  One or two sentences. This becomes the Workshop item's description the first
  time you publish.

# addon      — adds to the shipped game. Your ids must not collide with the
#              base game's, and your levels join the campaign at their \`index\`.
# conversion — REPLACES the campaign. Collisions are allowed (that is how you
#              re-skin a shipped venue), and you must list \`campaign:\` in
#              play order.
kind: addon
`;
}

/** Every file under `dir`, recursively. */
function walkFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walkFiles(full) : [full];
  });
}

/** Rename any file or directory whose name carries the example's id.
 * Deepest-first, so renaming a directory cannot strand the paths under it. */
function renamePaths(dir, replacement) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) renamePaths(full, replacement);
    if (entry.includes(EXAMPLE_ID)) {
      renameSync(
        full,
        path.join(dir, entry.replaceAll(EXAMPLE_ID, replacement)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// check / build — the compiler
// ---------------------------------------------------------------------------

function compile() {
  const modDir = positional[0] ? path.resolve(positional[0]) : "";
  if (!modDir) fail(`${command}: needs a mod directory`);

  const { bundle, errors, warnings } = buildMod(modDir, readCatalog(CATALOG));
  for (const w of warnings) console.warn(`  ! ${w}`);

  if (errors.length > 0) {
    console.error(
      `\n${errors.length} problem(s) in ${path.basename(modDir)}:\n`,
    );
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error("");
    process.exit(1);
  }

  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  /** The parts most mods ship NONE of — each dropped when this one doesn't, so
   * the summary never reads as a list of things that went wrong. */
  const extras = (b, fmt) =>
    [
      [Object.keys(b.blueprints ?? {}).length, "map blueprint"],
      [Object.keys(b.talents ?? {}).length, "talent"],
      [Object.keys(b.companions ?? {}).length, "companion"],
      [Object.keys(b.cutscenes ?? {}).length, "scene"],
      [Object.keys(b.thoughts ?? {}).length, "thought"],
      [Object.keys(b.storyItems ?? {}).length, "story item"],
    ]
      .filter(([n]) => n > 0)
      .map(([n, one]) => fmt(n, one));
  const items =
    Object.keys(bundle.weapons).length +
    Object.keys(bundle.gear).length +
    Object.keys(bundle.uniques).length;
  const summary =
    `${bundle.name} v${bundle.version} — ` +
    [
      count(bundle.levels.length, "level"),
      count(Object.keys(bundle.enemies).length, "enemy", "enemies"),
      count(items, "item"),
      count(bundle.sprites.length, "sprite"),
      count(Object.keys(bundle.sounds ?? {}).length, "sound"),
      count(Object.keys(bundle.music ?? {}).length, "track"),
      count(Object.keys(bundle.powerups ?? {}).length, "powerup"),
      // The party and the story, counted only when there is some: every mod
      // ships levels and monsters, but plenty ship no recruits or scenes at all.
      ...extras(bundle, count),
    ].join(", ") +
    (bundle.kind === "conversion"
      ? `, campaign: ${bundle.campaign.join(" → ")}`
      : "");

  if (command === "check") {
    console.log(`✓ ${summary}`);
    return;
  }

  const out = flag("out") ?? path.join(modDir, "mod.json");
  writeFileSync(out, `${JSON.stringify(bundle)}\n`);
  console.log(`✓ ${summary}\n  → ${path.relative(process.cwd(), out)}`);
}

// ---------------------------------------------------------------------------
// ids — what a mod may reference
// ---------------------------------------------------------------------------

/** The catalog's list-shaped keys, which are the ones worth searching. */
function kinds() {
  const catalog = readCatalog(CATALOG);
  return Object.keys(catalog).filter((k) => Array.isArray(catalog[k]));
}

/**
 * Search the reference catalog.
 *
 * The alternative is reading `catalog.json`, which is 1,400 sprite names long
 * and answers "is `moon_boots` a real id" only by eye. This is the same
 * question with a useful answer, and it is the single most-used command when
 * something (or someone) is writing a mod against ids they cannot see.
 */
function searchIds() {
  const catalog = readCatalog(CATALOG);
  const pattern = positional[0]?.toLowerCase() ?? "";
  const kind = flag("kind");
  const limit = Number(flag("limit") ?? 40);

  const searchable = kind ? [kind] : kinds();
  if (kind && !Array.isArray(catalog[kind])) {
    fail(`ids: unknown kind "${kind}" — try ${kinds().join(", ")}`);
  }

  let shown = 0;
  let total = 0;
  for (const k of searchable) {
    const hits = catalog[k].filter((id) => id.toLowerCase().includes(pattern));
    if (hits.length === 0) continue;
    total += hits.length;
    console.log(`\n${k} (${hits.length})`);
    for (const id of hits.slice(0, limit)) {
      console.log(`  ${id}`);
      shown += 1;
    }
    if (hits.length > limit) console.log(`  … ${hits.length - limit} more`);
  }
  if (total === 0) {
    console.log(
      `nothing matches "${pattern}"${kind ? ` in ${kind}` : ""}. ` +
        `Kinds: ${kinds().join(", ")}`,
    );
    return;
  }
  console.log(`\n${shown} shown of ${total} match(es).`);
}

// ---------------------------------------------------------------------------
// where — the folder the game reads
// ---------------------------------------------------------------------------

function whereToPutIt() {
  console.log(
    `Two folders, and the game reads both. Either lists your mod under MODS on\n` +
      `the next launch.\n\n` +
      `  1. mods/ BESIDE THE GAME — Windows and Linux:\n\n` +
      `       <where the game is installed>/mods/\n\n` +
      `     It takes a mod FOLDER or a .zip of one, which is what makes it the\n` +
      `     folder to tell a player about: sending somebody a mod is sending\n` +
      `     them a zip and naming this directory. On Steam it is the game's own\n` +
      `     install folder (LIBRARY > right-click the game > BROWSE LOCAL FILES).\n\n` +
      `     NOT on macOS: an installed app lives in /Applications, which is not\n` +
      `     the player's to write to, and a file inside the .app would break the\n` +
      `     signature it is notarized under. Use folder 2 there — it takes zips\n` +
      `     too.\n\n` +
      `  2. The game's data folder — the mod you are WRITING, and anything you were
     sent on macOS:\n\n` +
      `       ${localModsHint()}\n\n` +
      `     Only a mod FOLDER here is offered a PUBLISH row — what gets\n` +
      `     published is what somebody authored, never a zip they were sent.\n` +
      `     Both folders sort after your subscriptions, so the mod you just\n` +
      `     added wins its clashes.\n\n` +
      `The data folder is the desktop shell's own (Electron's userData). If the\n` +
      `path above does not exist, launch the game once — it is created on the\n` +
      `first look.`,
  );
}

/**
 * The one-line version of the DATA folder, for the `new` hint.
 *
 * Derived from the desktop package's name rather than from the game's title:
 * the shell asks Electron for `userData`, which is named after the packaged
 * app, and the product name deliberately differs from the title (an apostrophe
 * cannot go in a path — see electron-builder.config.cjs). Guessing from the
 * title is how this printed a folder the game never reads.
 */
function localModsHint() {
  const app = "adastrail";
  if (process.platform === "win32") return `%APPDATA%\\${app}\\mods\\`;
  if (process.platform === "darwin") {
    return `~/Library/Application Support/${app}/mods/`;
  }
  return `~/.config/${app}/mods/`;
}

function fail(message) {
  throw new Error(message);
}
