#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Refresh the item round-trip snapshot (tests/content/fixtures/
// items-snapshot.json) from the CURRENT compiled catalogs. The snapshot pins
// the YAML→def compile (weapons incl. generated grade variants, gear,
// uniques) so an accidental change to a shipped item fails
// `item_roundtrip_test.ts`. When an item change is INTENTIONAL, regenerate
// the generated catalog and then run this to accept the new baseline:
//
//   npm run levels && node scripts/update-item-snapshot.mjs
//
// Review the git diff of the snapshot before committing — it is the record of
// exactly what changed in the shipped arsenal.

import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { WEAPON_DEFS } = await import(engine("src/game/defs/equipment.ts"));
const { GEAR_DEFS } = await import(engine("src/game/defs/gear.ts"));
const { UNIQUE_DEFS } = await import(engine("src/game/defs/uniques.ts"));

// Canonical (sorted-key) JSON so the snapshot is stable regardless of the
// order the YAML tree happens to enumerate its entries.
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
};

const snapshot = sortKeys(
  JSON.parse(
    JSON.stringify({
      weapons: WEAPON_DEFS,
      gear: GEAR_DEFS,
      uniques: UNIQUE_DEFS,
    }),
  ),
);
const dest = engine("tests/content/fixtures");
mkdirSync(dest, { recursive: true });
writeFileSync(
  `${dest}/items-snapshot.json`,
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  `updated items-snapshot.json — ${Object.keys(WEAPON_DEFS).length} weapons, ` +
    `${Object.keys(GEAR_DEFS).length} gear, ` +
    `${Object.keys(UNIQUE_DEFS).length} uniques`,
);
