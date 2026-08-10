#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WRITE A SCORE THE SHORT WAY — compile a `.song` file into the tracker YAML
// under `content/music/`, and (with `--sheet`) engrave the result in the same
// breath, which is the whole loop:
//
//   node scripts/song-import.mjs songs/long_noon.song --sheet
//   …look at the PNG, edit the .song, run it again.
//
// The `.song` notation is `asset-tools/song-format.mjs`, which is also where
// the reasoning for having one at all is written down. In one line: the YAML is
// the right thing to SHIP and a bad thing to TYPE — rhythm is expressed by
// padding, the chord plan is retyped once per voice, and a kick drum is spelled
// as a pitch.
//
// IT PRINTS THE YAML TO STDOUT with `--stdout`, so a track can be looked at
// before it lands anywhere. Otherwise it writes the file and says where.
//
// THE COMPILED YAML IS THE SOURCE OF TRUTH, not the `.song`. This is an import
// tool, not a second format the game reads: what lands in `content/music/` is
// an ordinary authored score that anybody can edit by hand afterwards, and the
// `.song` is kept beside it only so the next pass can start from the short
// version. Nothing in the build knows `.song` exists.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { validateTrack } from "./asset-tools/music-schema.mjs";
import { parseSong, STEPS_PER_BAR } from "./asset-tools/song-format.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error(
    "usage: node scripts/song-import.mjs <file.song> [--sheet] [--stdout]",
  );
  process.exit(1);
}

let doc;
try {
  doc = parseSong(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`${file}:\n  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const yaml = emit(doc);

// THE SAME SCHEMA THE COMPILER RUNS, ON THE BYTES THAT WILL LAND — the emitted
// text is read back through the real YAML parser rather than checked against
// the object it came from, so an emitter bug (a quoting slip, a bad indent) is
// caught here instead of in the next build. An importer that can produce a file
// the build rejects has moved the error later, not caught it.
const res = validateTrack(parse(yaml));
if (res.errors.length > 0) {
  console.error(
    `${file} produced an invalid track:\n  ${res.errors.join("\n  ")}`,
  );
  process.exit(1);
}
for (const w of res.warnings) console.warn(`! ${w}`);

if (has("stdout")) {
  process.stdout.write(yaml);
  process.exit(0);
}

const out = path.join(root, "content", "music", `${doc.id}.yaml`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, yaml);
const bars = doc.order.reduce((n, name) => n + barsOf(doc.patterns[name]), 0);
const secs = (bars * STEPS_PER_BAR * 60) / (doc.bpm * doc.stepsPerBeat);
console.log(
  `wrote ${path.relative(root, out)} — ${Object.keys(doc.patterns).length} ` +
    `sections, ${doc.order.length} in order, ${bars} bars ≈ ${secs.toFixed(0)}s`,
);

if (has("sheet")) {
  // Recompile the catalog so the sheet reads the track that was just written,
  // then engrave it. Chained here rather than left to the caller because
  // "import and look at it" is one gesture in practice and two commands is one
  // command somebody forgets.
  for (const cmd of [
    ["node", ["scripts/generate-music.mjs"]],
    [
      "node",
      [
        "scripts/music-sheet.mjs",
        doc.id,
        ...args.filter(
          (a) =>
            a.startsWith("--pattern") ||
            a.startsWith("--bars") ||
            a.startsWith("--scale"),
        ),
      ],
    ],
  ]) {
    const run = spawnSync(cmd[0], cmd[1], { cwd: root, stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}

/** How many bars a compiled section holds. */
function barsOf(pattern) {
  const longest = Math.max(0, ...Object.values(pattern).map((v) => v.length));
  return Math.ceil(longest / STEPS_PER_BAR);
}

/** The compiled doc → the game's YAML, written the way a person writes it: the
 * arrangement in a header comment, the chord plan over each section, and every
 * bar on its own line. */
function emit(doc) {
  const bars = doc.order.reduce((n, name) => n + barsOf(doc.patterns[name]), 0);
  const secs = (bars * STEPS_PER_BAR * 60) / (doc.bpm * doc.stepsPerBeat);
  const L = [];
  L.push("# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0");
  L.push(`# ${doc.name} — compiled from a .song by scripts/song-import.mjs.`);
  L.push("#");
  L.push(
    `# Arrangement (${doc.bpm} bpm, 4/4, one bar = ${STEPS_PER_BAR} sixteenth-note steps):`,
  );
  L.push(
    `#   ${doc.order.map((n) => `${n}(${barsOf(doc.patterns[n])})`).join(" ")}`,
  );
  L.push(`#   = ${bars} bars ≈ ${secs.toFixed(0)} s per loop.`);
  L.push(`id: ${doc.id}`);
  L.push(`name: ${doc.name}`);
  if (doc.description) {
    L.push("description: >-");
    for (const line of wrap(doc.description, 72)) L.push(`  ${line}`);
  }
  L.push(`bpm: ${doc.bpm}`);
  L.push(`stepsPerBeat: ${doc.stepsPerBeat}`);
  L.push("instruments:");
  for (const [name, patch] of Object.entries(doc.instruments)) {
    L.push(`  ${name}:`);
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === "object") {
        L.push(`    ${key}:`);
        for (const [k, v] of Object.entries(value)) L.push(`      ${k}: ${v}`);
      } else {
        L.push(`    ${key}: ${value}`);
      }
    }
  }
  L.push("patterns:");
  for (const [name, pattern] of Object.entries(doc.patterns)) {
    const chords = doc.sections[name]?.chords;
    if (chords) {
      L.push(
        `  # ${name.toUpperCase()} — ${chords
          .map((bar) => bar.map((c) => c?.text ?? "-").join("/"))
          .join(" ")}`,
      );
    }
    L.push(`  ${name}:`);
    for (const [voice, steps] of Object.entries(pattern)) {
      L.push(`    ${voice}: |`);
      for (let i = 0; i < steps.length; i += STEPS_PER_BAR) {
        L.push(
          `      ${steps
            .slice(i, i + STEPS_PER_BAR)
            .map((t) => t.padEnd(2))
            .join(" ")
            .replace(/\s+$/, "")}`,
        );
      }
    }
  }
  L.push(`order: [${doc.order.join(", ")}]`);
  return `${L.join("\n")}\n`;
}

/** Wrap prose to a column, for the description block. */
function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}
