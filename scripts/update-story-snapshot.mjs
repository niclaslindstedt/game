#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the story snapshot (tests/content/fixtures/story-snapshot.json) from
// the CURRENT compiled catalogs. It pins the content/cutscenes/*.yaml,
// content/thoughts.yaml and content/story-items.yaml compile, so an accidental
// edit to a shipped scene, monologue or lore page fails
// `story_roundtrip_test.ts`. When a change is INTENTIONAL — and the manuscript
// has been updated with it, per the story chain in AGENTS.md — regenerate the
// catalogs and then run this to accept it:
//
//   npm run levels && node scripts/update-story-snapshot.mjs
//
// The readable record of what changed is the diff of the YAML itself; this file
// only says THAT it changed.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

import { writeSnapshot } from "./snapshot-json.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const engine = (p) => path.join(root, p);

// The GENERATED modules rather than the def modules, for the same reason the
// music script reads its own output: what is pinned is the compile, and reading
// it through the engine would add a registry the snapshot has no business in.
const { GENERATED_CUTSCENES } = await import(
  engine("engine/generated/cutscenes.ts")
);
const { GENERATED_CAP_THOUGHTS, GENERATED_THOUGHTS } = await import(
  engine("engine/generated/thoughts.ts")
);
const { GENERATED_STORY_ITEMS } = await import(
  engine("engine/generated/story-items.ts")
);

await writeSnapshot(
  path.join(root, "tests", "content", "fixtures", "story-snapshot.json"),
  {
    cutscenes: GENERATED_CUTSCENES,
    thoughts: GENERATED_THOUGHTS,
    capThoughts: GENERATED_CAP_THOUGHTS,
    storyItems: GENERATED_STORY_ITEMS,
  },
);
console.log(
  `updated story-snapshot.json — ${Object.keys(GENERATED_CUTSCENES).length} ` +
    `scene(s), ${Object.keys(GENERATED_THOUGHTS).length} thought(s), ` +
    `${Object.keys(GENERATED_STORY_ITEMS).length} story item(s)`,
);
