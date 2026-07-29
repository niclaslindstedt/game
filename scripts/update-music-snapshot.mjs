#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the music snapshot (tests/content/fixtures/music-snapshot.json) from
// the CURRENT compiled catalog. It pins the content/music/*.yaml →
// ChiptuneTrack compile as a per-track FINGERPRINT (see music-data/digest.mjs
// for why a fingerprint rather than a copy), so an accidental edit to a shipped
// score fails `music_roundtrip_test.ts`. When a change to a track is
// INTENTIONAL, regenerate the catalog and then run this to accept it:
//
//   npm run levels && node scripts/update-music-snapshot.mjs
//
// The readable record of what changed is the diff of the YAML itself, which is
// laid out one bar per line. This file only says THAT it changed.

import { readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

import { trackDigest } from "./music-data/digest.mjs";
import { writeSnapshot } from "./snapshot-json.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = path.join(root, "pwa", "src", "generated", "music");
const { flattenTrack } = await import(
  path.join(root, "pwa", "src", "lib", "chiptune.ts")
);

const tracks = {};
for (const file of readdirSync(dir).sort()) {
  if (file === "index.ts" || !file.endsWith(".ts")) continue;
  const id = file.slice(0, -".ts".length);
  tracks[id] = trackDigest(
    (await import(path.join(dir, file))).TRACK,
    flattenTrack,
  );
}

await writeSnapshot(
  path.join(root, "tests", "content", "fixtures", "music-snapshot.json"),
  tracks,
);
console.log(
  `updated music-snapshot.json — ${Object.keys(tracks).length} track(s)`,
);
