#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the level round-trip snapshot (tests/content/fixtures/
// levels-snapshot.json) from the CURRENT compiled catalog. The snapshot pins
// the YAML→LevelDef compile so an accidental change to a shipped level fails
// `yaml_roundtrip_test.ts`. When a level change is INTENTIONAL, regenerate the
// YAML catalog and then run this to accept the new baseline:
//
//   npm run levels && node scripts/update-level-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped maps.

import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { LEVELS, LEVEL_ORDER, SECRET_LEVEL_ORDER } = await import(
  engine("src/game/defs/levels/index.ts")
);

const snapshot = {
  order: LEVEL_ORDER,
  secret: SECRET_LEVEL_ORDER,
  defs: LEVELS,
};
const dest = engine("tests/content/fixtures");
mkdirSync(dest, { recursive: true });
writeFileSync(
  `${dest}/levels-snapshot.json`,
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  `updated levels-snapshot.json — ${Object.keys(LEVELS).length} levels`,
);
