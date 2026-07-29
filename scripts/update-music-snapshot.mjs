#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the music snapshot (tests/content/fixtures/music-snapshot.json) from
// the CURRENT compiled catalog. The snapshot pins the content/music/*.yaml →
// ChiptuneTrack compile, so an accidental edit to a shipped score fails
// `music_roundtrip_test.ts`. When a change to a track is INTENTIONAL,
// regenerate the catalog and then run this to accept the new baseline:
//
//   npm run levels && node scripts/update-music-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly which bars changed, which is the only readable form a note change
// takes anywhere.

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = path.join(root, "pwa", "src", "generated", "music");

const tracks = {};
for (const file of readdirSync(dir).sort()) {
  if (file === "index.ts" || !file.endsWith(".ts")) continue;
  const id = file.slice(0, -".ts".length);
  tracks[id] = (await import(path.join(dir, file))).TRACK;
}

await writeSnapshot(
  path.join(root, "tests", "content", "fixtures", "music-snapshot.json"),
  tracks,
);
console.log(
  `updated music-snapshot.json — ${Object.keys(tracks).length} track(s)`,
);
