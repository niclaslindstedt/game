#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the powerup snapshot (tests/content/fixtures/powerups-snapshot.json)
// from the CURRENT compiled catalog. The snapshot pins the
// content/powerups.yaml → AbilityDef compile, so an accidental edit to a
// shipped power fails `powerup_roundtrip_test.ts`. When a rebalance is
// INTENTIONAL, regenerate the catalog and then run this to accept the new
// baseline:
//
//   npm run levels && node scripts/update-powerup-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped powers.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

import { writeSnapshot } from "./snapshot-json.mjs";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { ABILITY_DEFS } = await import(engine("src/game/defs/abilities.ts"));

await writeSnapshot(
  engine("tests/content/fixtures/powerups-snapshot.json"),
  ABILITY_DEFS,
);
console.log(
  `updated powerups-snapshot.json — ${Object.keys(ABILITY_DEFS).length} powerups`,
);
