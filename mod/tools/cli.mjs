#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE MODDER'S COMMAND — everything you can do to a mod without launching the
// game, in one place.
//
//   node mod/tools/cli.mjs new <name> [--in <dir>] [--title "MY MOD"]
//   node mod/tools/cli.mjs check <mod-dir>
//   node mod/tools/cli.mjs build <mod-dir> [--out <file>]
//   node mod/tools/cli.mjs validate <mod-dir>
//   node mod/tools/cli.mjs package <mod-dir> [--out <file>]
//   node mod/tools/cli.mjs ids [pattern] [--kind <kind>] [--limit <n>]
//   node mod/tools/cli.mjs where
//
// `check` is `build` without writing anything: the fast loop while authoring.
// Both report every problem at once rather than the first, because a mod that
// names three enemies that don't exist should take one round trip to fix, not
// three.
//
// `validate` is the wider question `check` cannot answer — is everything in
// this FOLDER something the game reads, does it say what it is, does the
// manifest describe every file — and `package` is `validate` plus a zip built
// from exactly the files the manifest declares. The pair exists so that what
// leaves somebody's machine is their mod and nothing else. See validate.mjs.
//
// The desktop game runs this same compiler on every mod it loads (see
// electron/src/mods.ts), so a mod that passes here is a mod the game accepts —
// that is the whole point of there being one compiler rather than a friendly
// one here and a strict one at load.
//
// `ids` and `where` exist for the same reason as the rest: they are the two
// questions every mod author (and every agent working in this directory) has
// to answer before they can get anywhere, and neither should require reading a
// JSON file of several thousand ids by eye, or guessing at an OS convention.
// See mod/AGENTS.md.

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
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { buildMod } from "./build.mjs";
import { readCatalog } from "./catalog-read.mjs";
import { sampleStem } from "./layout.mjs";
import { ModPackageError, packageMod } from "./package.mjs";
import { README_TODO, validateMod } from "./validate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(here, "..", "catalog.json");
const EXAMPLE = path.join(here, "..", "examples", "greenhouse");
/** The id the worked example uses everywhere, and therefore the token `new`
 * rewrites. Kept here rather than inlined so the scaffold and the example
 * cannot drift apart silently. */
const EXAMPLE_ID = "greenhouse";

/** Everything a mod folder holds that is AUTHORED rather than produced. An
 * allow-list rather than a list of binaries, so a media format the mod format
 * grows later is safe by default rather than corrupt by default: `new`
 * rewrites the example's id through every file it copies, and reading a `.wav`
 * or a `.png` as UTF-8 and writing it back mangles it whether or not the id
 * appears in its bytes. Those carry the id in their NAME, which `renamePaths`
 * handles. */
const TEXT_EXTS = new Set([".yaml", ".yml", ".md", ".lua", ".json", ".txt"]);
const isText = (file) => TEXT_EXTS.has(path.extname(file).toLowerCase());

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
/**
 * The bare arguments — everything that is neither a `--flag` nor THE VALUE OF
 * ONE.
 *
 * That second half is the part worth spelling out: dropping only the
 * `--`-prefixed words leaves a flag's value sitting in the positional list, so
 * `sounds --play my-mod` read `my-mod` as the search pattern and matched
 * nothing. Which flags take a value is not knowable from the strings alone, so
 * the rule is positional: an argument immediately after a flag belongs to it.
 * (Every flag this CLI has does take a value.)
 */
const positional = argv
  .slice(1)
  .filter((arg, at) => !arg.startsWith("--") && !argv[at]?.startsWith("--"));

const USAGE = `usage:
  node mod/tools/cli.mjs new <name> [--in <dir>] [--title "MY MOD"]
      Copy the worked example into a new mod of your own, with every id
      renamed. The result compiles immediately — change it from there.

  node mod/tools/cli.mjs check <mod-dir>
      Validate a mod and report every problem. Writes nothing.

  node mod/tools/cli.mjs build <mod-dir> [--out <file>]
      Validate, then write the compiled bundle (default <mod-dir>/mod.json).

  node mod/tools/cli.mjs validate <mod-dir>
      The pre-publish audit: check, plus the folder itself — nothing stray in
      it, a README, and a manifest that describes every file. Writes nothing.

  node mod/tools/cli.mjs package <mod-dir> [--out <file>]
      Validate, then zip exactly what the manifest declares — the file you
      hand somebody (default <parent>/<id>-<version>.zip).

  node mod/tools/cli.mjs ids [pattern] [--kind <kind>] [--limit <n>]
      Search the ids a mod may reference.

  node mod/tools/cli.mjs sounds [pattern] [--limit <n>]
      Every sound a recording can replace: the id to name your audio file
      after, what fires it, and what it is meant to sound like.

  node mod/tools/cli.mjs sounds [pattern] --play <mod-dir>
      AUDITION your own recordings instead — plays every file in
      <mod-dir>/sounds/ whose name matches, back to back, so you can hear a
      variant set the way a player will. Needs ffplay, mpv, afplay or paplay.

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
  if (command === "validate") return audit();
  if (command === "package") return zipItUp();
  if (command === "ids") return searchIds();
  if (command === "sounds") return listSounds();
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
  // TEXT ONLY — see `TEXT_EXTS`.
  const title = flag("title") ?? name.replace(/-/g, " ").toUpperCase();
  for (const file of walkFiles(dest).filter(isText)) {
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
  //
  // Its `contents:` is the ONE part carried over rather than written fresh,
  // read back from the copy after the rename so every path already points at
  // the new mod's own files. Rewriting it would mean this command knowing what
  // each of the example's files is, which is the example's business.
  const carried = parse(readFileSync(path.join(dest, "mod.yaml"), "utf8"));
  writeFileSync(
    path.join(dest, "mod.yaml"),
    scaffoldManifest(name, title, carried?.contents ?? []),
  );
  // The mod's own front page. Written rather than copied for the same reason
  // the manifest is, and it keeps the TODO marker deliberately: `validate`
  // refuses a README nobody has written, so a mod cannot be packaged with the
  // scaffold's words on it.
  writeFileSync(path.join(dest, "README.md"), scaffoldReadme(title));

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

  const where = path.relative(process.cwd(), dest) || dest;
  console.log(
    `✓ ${title} → ${where}\n` +
      `  it compiles as-is. Next:\n` +
      `    node mod/tools/cli.mjs check ${where}\n` +
      `    write README.md and the summaries in mod.yaml's contents:\n` +
      `    node mod/tools/cli.mjs validate ${where}\n` +
      `    copy it into the game's mods/ folder and launch (cli.mjs where)`,
  );
}

/** A fresh mod's manifest. Every field the compiler requires, and a comment
 * on each one saying what it is for — the file is the first thing its author
 * opens, so it doubles as the format's front page. */
function scaffoldManifest(id, title, contents) {
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

# EVERY FILE THE GAME LOADS, and what each one is. The game shows these lines
# to a player who taps your mod, so write them for that player rather than for
# the compiler — the summaries below came from the worked example and describe
# ITS files, so rewrite them as you replace them.
#
#   path     relative to this folder
#   summary  one line, under 120 characters
#   change   adds (default) or replaces — does it bring something new, or take
#            over something the game already had?
#
# \`cli.mjs validate\` refuses a file this list does not describe, and
# \`cli.mjs package\` zips exactly what is listed. That is the point of both:
# nothing ships that nobody meant to ship.
${contentsBlock(contents)}`;
}

/** The scaffold's `contents:` block, carried from the example with its paths
 * already rewritten. Emitted by hand rather than through a YAML serializer so
 * it looks like a file somebody wrote — which is what its author is about to
 * edit. */
function contentsBlock(contents) {
  if (!Array.isArray(contents) || contents.length === 0)
    return "contents: []\n";
  return `contents:\n${contents
    .map((entry) => {
      const change =
        entry.change && entry.change !== "adds"
          ? `\n    change: ${entry.change}`
          : "";
      return `  - path: ${entry.path}\n    summary: ${JSON.stringify(String(entry.summary ?? ""))}${change}`;
    })
    .join("\n")}\n`;
}

/**
 * A fresh mod's README — what a player reads before installing it.
 *
 * It ships the TODO marker on purpose: `validate` refuses a README still
 * carrying it, so the one file that is nobody's but the author's cannot be
 * published with this command's words in it.
 */
function scaffoldReadme(title) {
  return `# ${title}

${README_TODO} — a paragraph or two, for somebody deciding whether to install
it. What is it, what does it add or change, and is it an addon that joins the
campaign or a conversion that replaces it?

## What's in it

Say what a player gets: the venues, the monsters, the loot, the story. The
manifest's \`contents:\` block is the file-by-file version of this — the game
shows it on the MODS screen — and this is the version somebody reads first.

## Playing it

Drop the folder (or the zip \`cli.mjs package\` writes) into the game's mods
folder — \`node mod/tools/cli.mjs where\` prints it — then switch it on under
MODS on the main menu and press PLAY WITH THESE MODS.

## Credits and terms

Who made what, and what people may do with it.
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
      [(b.samples ?? []).length, "recording"],
      // Clips, not subjects: "3 animations" is what an author counts, and one
      // subject with a walk and a talk is two of them.
      [
        Object.values(b.clips ?? {}).reduce(
          (n, states) => n + Object.keys(states).length,
          0,
        ),
        "animation",
      ],
      [Object.keys(b.talents ?? {}).length, "talent"],
      [Object.keys(b.companions ?? {}).length, "companion"],
      [Object.keys(b.cutscenes ?? {}).length, "scene"],
      [Object.keys(b.thoughts ?? {}).length, "thought"],
      [Object.keys(b.storyItems ?? {}).length, "story item"],
      [Object.keys(b.scripts ?? {}).length, "rule script"],
      // The HUD, counted the way an author counts it: elements are the things
      // they wrote a file for. A mod that only re-points a press's sound or
      // adds a region shows up through those two lines instead.
      [(b.hud?.elements ?? []).length, "hud element"],
      [Object.keys(b.hud?.regions ?? {}).length, "hud region"],
      [Object.keys(b.hud?.events ?? {}).length, "hud sound"],
      [Object.keys(b.hud?.scripts ?? {}).length, "hud script"],
      // …and the run's own windows, counted the same way: the files the author
      // wrote. A window, a modal, a row hung off one of ours, a judgement.
      [(b.menus?.menus ?? []).length, "menu"],
      [(b.menus?.modals ?? []).length, "modal"],
      [(b.menus?.elements ?? []).length, "menu row"],
      [Object.keys(b.menus?.scripts ?? {}).length, "menu script"],
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
// validate / package — the folder, and the file you hand somebody
// ---------------------------------------------------------------------------

/** `validate` — everything `check` cannot see. See validate.mjs. */
function audit() {
  const modDir = positional[0] ? path.resolve(positional[0]) : "";
  if (!modDir) fail("validate: needs a mod directory");

  const { errors, warnings, contents, files } = validateMod(modDir, {
    catalog: readCatalog(CATALOG),
  });
  for (const w of warnings) console.warn(`  ! ${w}`);
  if (errors.length > 0) {
    console.error(
      `\n${errors.length} problem(s) in ${path.basename(modDir)}:\n`,
    );
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error("");
    process.exit(1);
  }
  const extras = files.sidecar.length;
  console.log(
    `✓ ${path.basename(modDir)} — ${contents.length} file(s) the game loads, ` +
      `all described${extras > 0 ? `, ${extras} alongside them` : ""}, ` +
      "nothing stray\n" +
      `  package it:  node mod/tools/cli.mjs package ${path.relative(process.cwd(), modDir) || modDir}`,
  );
}

/** `package` — validate, then write the zip. */
function zipItUp() {
  const modDir = positional[0] ? path.resolve(positional[0]) : "";
  if (!modDir) fail("package: needs a mod directory");

  let result;
  try {
    result = packageMod(modDir, {
      catalog: readCatalog(CATALOG),
      out: flag("out"),
    });
  } catch (e) {
    if (!(e instanceof ModPackageError)) throw e;
    console.error(`\n${e.message} — ${e.problems.length} problem(s):\n`);
    for (const problem of e.problems) console.error(`  ✗ ${problem}`);
    console.error(
      "\nNothing was written. Fix these and run `package` again.\n",
    );
    process.exit(1);
  }
  for (const w of result.warnings) console.warn(`  ! ${w}`);
  console.log(
    `✓ ${result.entries.length} file(s), ${Math.max(1, Math.round(result.bytes / 1024))} KB\n` +
      `  → ${path.relative(process.cwd(), result.file) || result.file}\n` +
      "  drop it in the game's mods/ folder, or send it to somebody who will " +
      "(cli.mjs where)",
  );
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
 * The alternative is reading `catalog.json`, whose sprite list ALONE runs to
 * thousands of names, and answering "is `moon_boots` a real id" by eye
 * (`mod ids --kind sprite` prints the current count). This is the same
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
// sounds — the index a sound designer works from
// ---------------------------------------------------------------------------

/**
 * Every sound a recording may replace.
 *
 * `ids --kind sound` already prints the names, and for a sound that is not
 * enough: naming a file `enemy_killed.wav` is a commitment about WHEN it will
 * be heard, and a column of bare ids does not say when. This prints the id, the
 * event that fires it (blank for the ones played by name — the interface, the
 * road, a weapon's own `sfx:`), and the sentence the shipped effect was
 * designed to.
 *
 * It is the whole interface of the feature: name your file after one of these,
 * drop it in `sounds/`, and it is heard everywhere that sound was.
 */
function listSounds() {
  const catalog = readCatalog(CATALOG);
  const index = catalog.soundIndex ?? {};
  const pattern = positional[0]?.toLowerCase() ?? "";
  const limit = Number(flag("limit") ?? 200);

  // `--play <mod-dir>` auditions YOUR recordings rather than listing ours.
  const playIn = flag("play");
  if (playIn !== undefined) return auditionSounds(playIn, pattern);

  const hits = Object.entries(index).filter(
    ([id, entry]) =>
      id.toLowerCase().includes(pattern) ||
      (entry.on?.type ?? "").toLowerCase().includes(pattern) ||
      (entry.what ?? "").toLowerCase().includes(pattern),
  );
  if (hits.length === 0) {
    console.log(
      `nothing matches "${pattern}" among ${Object.keys(index).length} sounds.`,
    );
    return;
  }

  const idWidth = Math.max(...hits.map(([id]) => id.length));
  const fireWidth = Math.max(
    ...hits.map(([, e]) => describeOn(e.on).length),
    "PLAYED BY".length,
  );
  console.log(
    `\nDrop sounds/<id>.{wav,mp3,ogg,opus,flac} into your mod and it replaces\n` +
      `that sound everywhere the game plays it. The id IS the routing.\n` +
      `Add <id>.1.wav, <id>.2.wav … for takes it cycles between, so a sound\n` +
      `heard hundreds of times a run is not one waveform hundreds of times.\n` +
      `Hear your own with:  cli.mjs sounds [pattern] --play <mod-dir>\n`,
  );
  console.log(
    `  ${"ID".padEnd(idWidth)}  ${"PLAYED BY".padEnd(fireWidth)}  WHAT IT IS`,
  );
  for (const [id, entry] of hits.slice(0, limit)) {
    const what = entry.what ?? "";
    console.log(
      `  ${id.padEnd(idWidth)}  ${describeOn(entry.on).padEnd(fireWidth)}  ` +
        (what.length > 72 ? `${what.slice(0, 71)}…` : what),
    );
  }
  if (hits.length > limit) console.log(`  … ${hits.length - limit} more`);
  console.log(`\n${Math.min(hits.length, limit)} shown of ${hits.length}.`);
}

/**
 * AUDITION a mod's own recordings, without launching the game.
 *
 * The slowest part of doing sound for a mod was the loop: to hear a file you
 * had shipped, you had to start the game, begin a run, and provoke the event.
 * A recording needs none of that — it is already audio, so the machine's own
 * player can play it. (The SHIPPED sounds are the other case and deliberately
 * not covered here: they are oscillator parameters, and a renderer written in
 * this file would be a second synth that disagrees with the real one. Those are
 * auditioned in the game, which is where they exist.)
 *
 * Plays every recording whose name matches `pattern`, in order, so
 * `--play . kill` walks a pack's takedowns back to back — which is how the
 * repetition a variant set exists to fix is actually noticed.
 */
function auditionSounds(modDir, pattern) {
  const dir = path.join(modDir === "" ? "." : modDir, "sounds");
  if (!existsSync(dir)) {
    console.error(`no sounds/ folder in ${modDir || "."} — nothing to play.`);
    process.exit(1);
  }
  const files = readdirSync(dir)
    .filter((f) => sampleStem(f) !== null)
    .filter((f) => f.toLowerCase().includes(pattern))
    .sort();
  if (files.length === 0) {
    console.log(
      pattern
        ? `no recording in ${dir} matches "${pattern}".`
        : `no recordings in ${dir} yet.`,
    );
    return;
  }

  const player = findPlayer();
  if (!player) {
    console.error(
      "no audio player found. Install one of: ffplay (ffmpeg), mpv, afplay " +
        "(macOS), paplay or aplay (Linux).",
    );
    process.exit(1);
  }

  console.log(`\nPlaying ${files.length} recording(s) with ${player.cmd}:\n`);
  for (const file of files) {
    console.log(`  ${file}`);
    const res = spawnSync(player.cmd, [...player.args, path.join(dir, file)], {
      stdio: "ignore",
    });
    if (res.status !== 0) {
      console.error(`    ✗ ${player.cmd} could not play it`);
    }
  }
  console.log("");
}

/** The first audio player on this machine that can play a file and exit. */
function findPlayer() {
  const candidates = [
    { cmd: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet"] },
    { cmd: "mpv", args: ["--no-video", "--really-quiet"] },
    { cmd: "afplay", args: [] },
    { cmd: "paplay", args: [] },
    { cmd: "aplay", args: ["-q"] },
  ];
  for (const player of candidates) {
    const probe = spawnSync(
      process.platform === "win32" ? "where" : "which",
      [player.cmd],
      { stdio: "ignore" },
    );
    if (probe.status === 0) return player;
  }
  return null;
}

/** An `on:` block as one column: what plays it, plus whatever narrows it.
 *
 * Two shapes, because there are two kinds of moment. `type:` is an ENGINE
 * event; `cue:` is one the app raises for something the simulation never
 * reported (a footfall) — see pwa/src/game/sfx/cues.ts. */
function describeOn(on) {
  if (!on) return "(by name)";
  const head = on.cue !== undefined ? `cue ${on.cue}` : on.type;
  const narrow = Object.entries(on)
    .filter(([key]) => key !== "type" && key !== "cue")
    .map(([key, value]) => `${key}=${value}`);
  return narrow.length > 0 ? `${head} ${narrow.join(" ")}` : head;
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
