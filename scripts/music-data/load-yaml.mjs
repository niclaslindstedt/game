// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML music loader — the peer of the sound loader, and takes a DIRECTORY
// for the same reason it does: a MOD's scores go through this exact loader and
// this exact schema (see mod/tools/build.mjs), so "it works in my mod" and "it
// works in the game" mean the same thing.
//
// Layout:
//   music/<id>.yaml   one score: the file stem IS the id.
//
// It also COOKS a score into the shape the sequencer reads: an authored voice
// is a block of text laid out one bar per line, which is the whole reason the
// format is readable, and `ChiptunePattern` wants a flat token array. That is
// the only transformation — the same job `bars()` did when the scores were
// TypeScript.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { stepsOf } from "../asset-tools/music-schema.mjs";

const SHIPPED_MUSIC_DIR = fileURLToPath(
  new URL("../../content/music", import.meta.url),
);

/** An authored doc → the `ChiptuneTrack` the player takes. */
export function cookTrack(doc) {
  return {
    bpm: doc.bpm,
    stepsPerBeat: doc.stepsPerBeat,
    instruments: doc.instruments,
    patterns: Object.fromEntries(
      Object.entries(doc.patterns).map(([name, pattern]) => [
        name,
        Object.fromEntries(
          Object.entries(pattern).map(([voice, text]) => [
            voice,
            stepsOf(text),
          ]),
        ),
      ]),
    ),
    order: doc.order,
  };
}

/**
 * Load a music tree.
 *
 * @returns `{ entries }` — `[{ id, doc }]` in file order. Cook a doc with
 *          `cookTrack` once it has passed the schema; cooking a malformed one
 *          would throw where a reported error belongs. Throws on a structural
 *          error (a stem that disagrees with its `id`, or a duplicate).
 */
export function loadMusic(musicDir = SHIPPED_MUSIC_DIR) {
  const errors = [];
  const entries = [];
  const seen = new Set();

  // A mod need not ship music; an absent tree is an empty catalog.
  if (!existsSync(musicDir)) return { entries };

  const files = readdirSync(musicDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  for (const file of files) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${musicDir}/${file}`, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${file}: expected a mapping (a score)`);
      continue;
    }
    if (doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
      continue;
    }
    if (seen.has(doc.id)) {
      errors.push(`duplicate track id "${doc.id}"`);
      continue;
    }
    seen.add(doc.id);
    entries.push({ id: doc.id, doc });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} music tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { entries };
}
