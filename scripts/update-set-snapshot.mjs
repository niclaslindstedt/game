#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the set snapshot (tests/content/fixtures/sets-snapshot.json) from the
// CURRENT compiled catalog. The snapshot pins the content/sets.yaml → SetDef
// compile, so an accidental edit to a shipped kit fails `set_roundtrip_test.ts`.
// When a rebalance is INTENTIONAL, regenerate the catalog and then run this to
// accept the new baseline:
//
//   npm run levels && node scripts/update-set-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped kits.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { SET_DEFS } = await import(engine("engine/game/defs/sets.ts"));

await writeSnapshot(
  engine("tests/content/fixtures/sets-snapshot.json"),
  SET_DEFS,
);
console.log(
  `updated sets-snapshot.json — ${Object.keys(SET_DEFS).length} sets`,
);
