#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the enemy round-trip snapshot (tests/content/fixtures/
// enemies-snapshot.json) from the CURRENT compiled catalog. The snapshot pins
// the YAML→EnemyDef compile so an accidental change to a shipped enemy fails
// `enemy_roundtrip_test.ts`. When an enemy change is INTENTIONAL, regenerate the
// generated catalog and then run this to accept the new baseline:
//
//   npm run levels && node scripts/update-enemy-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped roster.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));

await writeSnapshot(
  engine("tests/content/fixtures/enemies-snapshot.json"),
  ENEMY_DEFS,
);
console.log(
  `updated enemies-snapshot.json — ${Object.keys(ENEMY_DEFS).length} enemies`,
);
