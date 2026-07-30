#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the talent snapshot (tests/content/fixtures/talents-snapshot.json)
// from the CURRENT compiled catalog. The snapshot pins the
// content/talents.yaml → TalentDef compile, so an accidental edit to a shipped
// talent — a slope, a proc chance, a rank ceiling — fails
// `talent_roundtrip_test.ts`. When a rebalance is INTENTIONAL, regenerate the
// catalog and then run this to accept the new baseline:
//
//   npm run levels && node scripts/update-talent-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped trees.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { TALENT_DEFS } = await import(engine("src/game/defs/talents/index.ts"));

await writeSnapshot(
  engine("tests/content/fixtures/talents-snapshot.json"),
  TALENT_DEFS,
);
console.log(
  `updated talents-snapshot.json — ${Object.keys(TALENT_DEFS).length} talents`,
);
