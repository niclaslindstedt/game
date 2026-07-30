#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the companion snapshot (tests/content/fixtures/companions-snapshot.json)
// from the CURRENT compiled catalog. The snapshot pins the
// content/companions.yaml → CompanionDef compile, so an accidental edit to a
// shipped companion fails `companion_roundtrip_test.ts`. When a rebalance is
// INTENTIONAL, regenerate the catalog and then run this to accept the new
// baseline:
//
//   npm run levels && node scripts/update-companion-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped party. A change to a companion's spoken
// lines (`joinWords`, `killQuotes`) also owes docs/manuscript.md an update, and
// the story chain says the manuscript needs the user's confirmation first.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { COMPANION_DEFS } = await import(engine("src/game/defs/companions.ts"));

await writeSnapshot(
  engine("tests/content/fixtures/companions-snapshot.json"),
  COMPANION_DEFS,
);
console.log(
  `updated companions-snapshot.json — ` +
    `${Object.keys(COMPANION_DEFS).length} companions`,
);
