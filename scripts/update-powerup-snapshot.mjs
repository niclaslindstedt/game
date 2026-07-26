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
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { ABILITY_DEFS } = await import(engine("src/game/defs/abilities.ts"));

// Canonical (sorted-key) JSON so the snapshot is stable regardless of the
// order the YAML happens to enumerate its entries.
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
};

const snapshot = sortKeys(JSON.parse(JSON.stringify(ABILITY_DEFS)));
const dest = engine("tests/content/fixtures");
mkdirSync(dest, { recursive: true });
writeFileSync(
  `${dest}/powerups-snapshot.json`,
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  `updated powerups-snapshot.json — ${Object.keys(ABILITY_DEFS).length} powerups`,
);
