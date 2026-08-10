#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// READ A SCORE THE SHORT WAY — the other direction of `song-import.mjs`: take a
// track out of `content/music/` and write it back as a `.song`.
//
//   node scripts/song-export.mjs overdue              → content/songs/overdue.song
//   node scripts/song-export.mjs overdue --stdout     → just look at it
//   node scripts/song-export.mjs --all
//
// TWO REASONS IT EXISTS, and the second is the important one.
//
// The obvious one: it is how you open an EXISTING track in the short format —
// change four notes in a melody without counting to sixteen, and compile it
// back. Every score in this game predates the notation and would otherwise be
// stuck in longhand forever.
//
// The one that matters: it makes the pair TESTABLE. An importer on its own can
// only be checked by reading its output and agreeing with it, which is the same
// eye that wrote the input. With both directions, `yaml → song → yaml` has to
// come back byte-identical, and that single property covers the whole notation
// at once — every duration, every tie across a bar line, every drum grid, every
// instrument flag. `tests/content/song_format_test.ts` runs it over the shipped
// catalogue, so a change to either half that loses information fails there.
//
// IT DOES NOT GUESS. No chord plan is recovered and no figure is inferred: a
// `pump` and eight bars that merely look like one are the same tokens, and a
// tool that told them apart would sooner or later tell them apart wrongly and
// quietly rewrite a bassline. Everything comes back longhand, which is exactly
// what makes the round trip lossless.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { toSong } from "./asset-tools/song-format.mjs";
import { cookTrack, loadMusic } from "./music-data/load-yaml.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const ids = args.filter((a) => !a.startsWith("--"));

const { entries } = loadMusic();
const wanted = has("all") ? entries : entries.filter((e) => ids.includes(e.id));
if (wanted.length === 0) {
  console.error(
    `name a track. this build has: ${entries.map((e) => e.id).join(", ")}`,
  );
  process.exit(1);
}

const outDir = path.join(root, "content", "songs");
if (!has("stdout")) mkdirSync(outDir, { recursive: true });

for (const { id, doc } of wanted) {
  const song = toSong({
    ...cookTrack(doc),
    id,
    name: doc.name,
    description: doc.description,
  });
  if (has("stdout")) {
    process.stdout.write(song);
    continue;
  }
  const out = path.join(outDir, `${id}.song`);
  writeFileSync(out, song);
  console.log(`wrote ${path.relative(root, out)}`);
}
