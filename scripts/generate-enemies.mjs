#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy pipeline (see the `enemy-design` skill). Compiles the YAML enemy
// tree (`content/enemies/<biome>/<id>.yaml`) into the engine's EnemyDef
// catalog — the roster equivalent of the level/sprite pipelines. It:
//   1. harvests the live def-id catalogs an EnemyDef points AT (companions,
//      uniques, story items, weapons+gear) for cross-ref checks,
//   2. loads + schema-validates every YAML enemy (a bad field/id fails the
//      build),
//   3. writes engine/generated/enemies.ts — GENERATED_ENEMIES, the flat catalog
//      engine/game/defs/enemies/index.ts reads.
// The output is gitignored and regenerated on every build (like levels.ts), so
// the YAML is the single source of truth.
//
// MUST run FIRST in the generate chain: both generate-assets.mjs (the sprite
// pipeline derives wound frames from every enemy's role/gore, so
// sprite-data/index.mjs imports the enemy catalog) and generate-levels.mjs
// (cross-refs spawn ids) import enemies/index.ts, which now reads the file this
// script writes — so it must exist before either runs. The cross-ref catalogs
// below are imported DIRECTLY (never @game/core, and never the enemy index) so
// nothing pulls the file we are about to write — mirroring the bootstrap-cycle
// note in generate-levels.mjs.

import { mkdirSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Engine modules under engine/lib use the @game/lib alias at runtime — map it so
// the def catalogs import cleanly under plain node.
register("./game-alias-loader.mjs", import.meta.url);

import { validateEnemy } from "./asset-tools/enemy-schema.mjs";
import { loadCompanions } from "./companion-data/load-yaml.mjs";
import { loadEnemies } from "./enemy-data/load-yaml.mjs";
import { loadPowerups } from "./powerup-data/load-yaml.mjs";
import { loadStoryItems } from "./story-data/load-yaml.mjs";

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const { UNIQUE_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/uniques.ts")).href
);
const { WEAPON_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/equipment.ts")).href
);
const { GEAR_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/gear.ts")).href
);
const { deathRites: loadDeathRites } = await import(
  pathToFileURL(engine("engine/game/death-rites/catalog.ts")).href
);
const RITE_DEFS = loadDeathRites();

const { enemies, entries } = loadEnemies();

const refs = {
  enemies: new Set(Object.keys(enemies)),
  // Read from `content/companions.yaml` through the same loader a mod's roster
  // goes through, for the same reason the story items are: the ids are the
  // content tree's to state, one reader means the two can never disagree, and
  // reaching for `defs/companions.ts` — which now reads a GENERATED module —
  // would put this pipeline behind the companion one for no gain.
  companions: new Set(Object.keys(loadCompanions().companions)),
  uniques: new Set(Object.keys(UNIQUE_DEFS)),
  // Read from `content/story-items.yaml` rather than the engine: the plot
  // pieces are content now, and a generator that reaches for a def module it
  // does not need is one bootstrap cycle away from a broken build.
  storyItems: new Set(Object.keys(loadStoryItems().storyItems)),
  items: new Set([...Object.keys(WEAPON_DEFS), ...Object.keys(GEAR_DEFS)]),
  // The POWERS a martyr's `dropsAbility` may name. Read from
  // `content/powerups.yaml` through the powerup loader rather than from
  // `engine/generated/powerups.ts`, and the reason is the step ORDER: enemies
  // are compiled BEFORE powerups (see generate-content.mjs), so the generated
  // module on disk is the PREVIOUS build's. The content tree is the one copy
  // that is always current — the same call the companions and story items
  // above make, for the same reason.
  abilities: new Set(Object.keys(loadPowerups().powerups)),
  // The DEATH RITES a boss's `death:` may name, read off the engine's own
  // catalog rather than copied into the schema. Same discipline the region
  // grammar follows: there is one list of what is valid, and a validator that
  // keeps a second copy of it is a validator that eventually disagrees with the
  // thing it is validating. `death-rites/catalog.ts` is an import-free leaf, so
  // it loads under plain node like the def catalogs above it.
  deathRites: new Set(RITE_DEFS.map((r) => r.id)),
  // Which of them are FLIGHT rites — the coward's exit rather than a finisher.
  // A separate set rather than a predicate so the error can NAME the valid
  // alternatives, which is the difference between a message an author can act
  // on and one they have to go and read the catalog to understand.
  flightRites: new Set(RITE_DEFS.filter((r) => r.flight).map((r) => r.id)),
};

const errors = [];
const warnings = [];
for (const { def } of entries) {
  const res = validateEnemy(def, refs);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} enemy schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

const banner = `// @generated by scripts/generate-enemies.mjs — DO NOT EDIT.
// Source of truth: content/enemies/<biome>/<id>.yaml. Regenerate with
// \`npm run levels\` (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const out = `${banner}
import type { EnemyDef } from "../game/defs/enemies/types.ts";

export const GENERATED_ENEMIES: Record<string, EnemyDef> = ${JSON.stringify(
  enemies,
  null,
  2,
)} as unknown as Record<string, EnemyDef>;
`;

const destDir = engine("engine/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/enemies.ts`, out);
console.log(
  `wrote engine/generated/enemies.ts — ${Object.keys(enemies).length} enemies`,
);
