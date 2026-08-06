#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE-SHOT: write `content/sounds/` from the sound bank's own behaviour.
//
// This ran once, to move ~2,000 lines of hand-tuned imperative synth calls
// into content without a human retyping a single number — see `record.mjs` for
// why that mattered. It is kept rather than deleted for two reasons: it
// documents exactly how the content was derived (the alternative is a commit
// full of numbers nobody can trace), and it is the thing to re-run if the lift
// ever has to be redone against a different bank.
//
//   node scripts/sound-data/emit.mjs [--out content/sounds]
//
// It will NOT overwrite files that already exist: the YAML is authored content
// now, and a modder — or a designer retuning a sound — must not have their work
// clobbered by a tool whose job finished months ago.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  captureAchievementJingle,
  captureLegendJingle,
  captureEventSounds,
  captureUiSounds,
} from "./capture.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const outArg = process.argv.indexOf("--out");
const OUT =
  outArg >= 0
    ? path.resolve(process.argv[outArg + 1])
    : path.join(root, "content", "sounds");

/**
 * The comment a case carries in the source, as its `description`.
 *
 * The old bank's comments are the best writing about this game's audio that
 * exists ("the pew: a fast square dive with a muzzle-crack of noise"), and
 * dropping them on the floor would have made the content files a wall of
 * numbers. They are lifted with the numbers.
 */
function descriptions() {
  const found = new Map();
  for (const module of [
    "combat",
    "world",
    "pickups",
    "powerups",
    "jingles",
    "ui",
  ]) {
    const source = readFileSync(
      path.join(root, "pwa", "src", "game", "sfx", `${module}.ts`),
      "utf8",
    );
    // A case's prose sits either just BEFORE its `case` line or between the
    // case and its first synth call, depending on who wrote it. Both count.
    for (const match of source.matchAll(
      /((?:^[ \t]*\/\/.*\n)*)[ \t]*case "([a-zA-Z]+)":([\s\S]*?)(?=synth\.)/gm,
    )) {
      const [, before, type, after] = match;
      const prose = [...`${before}\n${after}`.matchAll(/^\s*\/\/ ?(.*)$/gm)]
        .map((m) => m[1].trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (prose && !found.has(type)) found.set(type, prose);
    }
  }
  return found;
}

const prose = descriptions();

const sounds = [
  ...(await captureEventSounds()).map((s) => ({
    ...s,
    description: prose.get(s.type) ?? "",
  })),
  // A UI sound is keyed by its own name, not by an event type.
  ...(await captureUiSounds()).map((s) => ({
    ...s,
    description: prose.get(s.ui) ?? "",
  })),
  await captureAchievementJingle(),
  await captureLegendJingle(),
];

mkdirSync(OUT, { recursive: true });
let written = 0;
let kept = 0;
for (const sound of sounds) {
  const file = path.join(OUT, `${sound.id}.yaml`);
  if (existsSync(file)) {
    kept += 1;
    continue;
  }
  writeFileSync(file, toYaml(sound));
  written += 1;
}

console.log(
  `sounds: ${written} written, ${kept} left alone → ${path.relative(process.cwd(), OUT)}`,
);

/** One sound as YAML. Hand-rolled rather than via the `yaml` package so the
 * key ORDER reads the way a person would write it — id, what plays it, then
 * the voices in the order they fire. */
function toYaml(sound) {
  const lines = ["# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0"];
  lines.push(`id: ${sound.id}`);
  if (sound.description) {
    // A real field, not a comment: every other content file in this repo
    // carries its intent as `description`, and a retune months from now needs
    // to know what the sound was FOR.
    lines.push("description: >-");
    for (const line of wrap(sound.description, 72)) lines.push(`  ${line}`);
  }

  if (sound.type) {
    lines.push("on:");
    lines.push(`  type: ${sound.type}`);
    for (const [key, value] of Object.entries(sound.variant ?? {})) {
      lines.push(`  ${key}: ${scalar(value)}`);
    }
  }

  lines.push("voices:");
  for (const call of sound.calls) {
    const { call: kind, ...options } = call;
    lines.push(`  - call: ${kind}`);
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined) continue;
      if (key === "filter") {
        lines.push("    filter:");
        for (const [f, v] of Object.entries(value)) {
          lines.push(`      ${f}: ${scalar(v)}`);
        }
      } else {
        lines.push(`    ${key}: ${scalar(value)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** A YAML scalar. Plain identifiers go unquoted — these files are read and
 * edited by hand, and `type: square` is what somebody would write. */
function scalar(value) {
  if (typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}
