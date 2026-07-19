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
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));

// Canonical (sorted-key) JSON so the snapshot is stable regardless of the order
// the rosters or the YAML tree happen to enumerate their entries.
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
};

const snapshot = sortKeys(JSON.parse(JSON.stringify(ENEMY_DEFS)));
const dest = engine("tests/content/fixtures");
mkdirSync(dest, { recursive: true });
writeFileSync(
  `${dest}/enemies-snapshot.json`,
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  `updated enemies-snapshot.json — ${Object.keys(ENEMY_DEFS).length} enemies`,
);
