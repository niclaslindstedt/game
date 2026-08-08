#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level pipeline (see the `level-design` skill). Compiles the YAML level
// tree (`content/levels/*.yaml`) into the engine's MissionDef catalog —
// the map/atlas equivalent for levels. It:
//   1. harvests the live def-id catalogs from the engine (enemies, weapons,
//      gear, abilities, thoughts, story items, uniques) for cross-ref checks,
//   2. loads + schema-validates every YAML level (a bad id fails the build),
//   3. writes engine/generated/levels.ts (GENERATED_LEVELS — the full defs, read
//      by engine/game/defs/levels/index.ts) and engine/generated/level-index.ts (the
//      menu-facing summaries, the campaign / secret order arrays and the
//      stamina ladders, read by engine/game/defs/levels/summary.ts).
// The output is gitignored and regenerated on every build (like the sprite
// atlas), so the YAML is the single source of truth.

import { mkdirSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Engine modules under engine/lib use the @game/lib alias at runtime — map it so
// the def catalogs import cleanly under plain node.
register("./game-alias-loader.mjs", import.meta.url);

import { validateLevel } from "./asset-tools/level-schema.mjs";
import { loadLevels } from "./level-data/load-yaml.mjs";
import { loadMusic } from "./music-data/load-yaml.mjs";
import {
  loadCutscenes,
  loadStoryItems,
  loadThoughts,
} from "./story-data/load-yaml.mjs";

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// Import the def catalogs DIRECTLY (never @game/core — that pulls the levels
// registry, which imports the file we are about to write: a bootstrap cycle).
const { ENEMY_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/enemies/index.ts")).href
);
const { WEAPON_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/equipment.ts")).href
);
const { GEAR_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/gear.ts")).href
);
const { ABILITY_DEFS } = await import(
  pathToFileURL(engine("engine/game/defs/abilities.ts")).href
);
const { UNIQUE_DEFS, WORLD_UNIQUES } = await import(
  pathToFileURL(engine("engine/game/defs/uniques.ts")).href
);

const { storyItems: STORY_ITEMS } = loadStoryItems();
const { thoughts: THOUGHTS } = loadThoughts();

const refs = {
  enemies: new Set(Object.keys(ENEMY_DEFS)),
  // Roles let the pinned-spawn check tell a stationed minion (no authored
  // level/hp — it scales with the map's mob band) from an elite/boss set
  // piece (both required).
  enemyRoles: new Map(
    Object.entries(ENEMY_DEFS).map(([id, d]) => [id, d.role]),
  ),
  weapons: new Set(Object.keys(WEAPON_DEFS)),
  gear: new Set(Object.keys(GEAR_DEFS)),
  abilities: new Set(Object.keys(ABILITY_DEFS)),
  // The story catalogs come from `content/` rather than from the engine, like
  // the music below: they are content, and every id a level names here is one
  // `scripts/generate-story.mjs` has already validated.
  thoughts: new Set(Object.keys(THOUGHTS)),
  storyItems: new Set(Object.keys(STORY_ITEMS)),
  uniques: new Set(Object.keys(UNIQUE_DEFS)),
  worldUniques: new Set(WORLD_UNIQUES.map((u) => u.id)),
  doorKeys: new Set(
    Object.values(STORY_ITEMS)
      .map((s) => s.unlocks)
      .filter(Boolean),
  ),
  // A level's `prelude` chain: an unknown scene id used to throw at the moment
  // the venue opened, which is the worst place to learn about a typo.
  cutscenes: new Set(Object.keys(loadCutscenes().cutscenes)),
  // Read from `content/music/` rather than from the app, because the scores
  // are content now — and because an unknown `music` id used to be SILENT:
  // the player falls back to the default theme, so a typo shipped as "that
  // level plays the moon's music, apparently on purpose".
  music: new Set(loadMusic().entries.map((e) => e.id)),
};

const { entries, mobHp, staminaDrain, staminaRefill, staminaEmptyLock } =
  loadLevels();

// The level ids themselves are a ref set too: a travel door names its
// destinations, and a typo there is a door that opens onto nothing.
refs.levels = new Set(entries.map((e) => e.id));

const errors = [];
const warnings = [];
for (const { def, description } of entries) {
  const res = validateLevel(def, refs, description);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} level schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

// Campaign in story-index order; secret venues after, in file order.
const campaign = entries
  .filter((e) => e.campaign)
  .sort((a, b) => a.def.index - b.def.index);
const secret = entries.filter((e) => e.secret);

const defs = [...campaign, ...secret].map((e) => e.def);
const campaignOrder = campaign.map((e) => e.id);
const secretOrder = secret.map((e) => e.id);

const banner = `// @generated by scripts/generate-levels.mjs — DO NOT EDIT.
// Source of truth: content/levels/*.yaml + content/ladder.yaml. Regenerate with
// \`npm run levels\` (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const out = `${banner}
import type { MissionDef } from "../game/defs/levels/types.ts";

export const GENERATED_LEVELS: MissionDef[] = ${JSON.stringify(defs, null, 2)} as unknown as MissionDef[];
`;

// The LEVEL INDEX — the handful of fields something OUTSIDE a run reads, split
// off `levels.ts` so the menus never pull the maps.
//
// A compiled MissionDef is mostly story and economy: the intro and outro pages,
// the merchant's whole meeting scene, the loot pools, the thought pins. No menu
// touches a single field of it — the difficulty
// ladder wants a level's NAME, the high-score board its name and `foes` label,
// the difficulty catalog the stamina ladders, and the progression the campaign
// order. Sharing one module put every map in the app's startup chunk, because
// tree-shaking is global: an export used by ANY chunk keeps the bytes wherever
// its module was placed, and the module was on the startup path.
//
// Read through `defs/levels/summary.ts`, which is a leaf; `levelDef()` next door
// still answers with the whole def for anything inside a run. See
// pwa/scripts/check-seo.mjs for the budget this protects.
const summaries = Object.fromEntries(
  defs.map((def) => [def.id, { name: def.name, foes: def.foes }]),
);

const indexOut = `${banner}
/** A level as anything OUTSIDE a run sees it: what to call it, and what it is
 * full of. */
export type GeneratedLevelSummary = { name: string; foes: string };

/** Every level's menu-facing summary, keyed by id. */
export const GENERATED_LEVEL_SUMMARIES: Record<string, GeneratedLevelSummary> = ${JSON.stringify(summaries, null, 2)};

export const GENERATED_CAMPAIGN_ORDER: string[] = ${JSON.stringify(campaignOrder)};

export const GENERATED_SECRET_ORDER: string[] = ${JSON.stringify(secretOrder)};

/** The per-rung MOB-HP multiplier authored in \`content/ladder.yaml\`
 * (\`mobHp\`) — the ladder's own toughness step, on top of the level curve.
 * Read by the difficulty catalog and applied at every mob-hp read site. */
export const GENERATED_MOB_HP: Record<string, number> = ${JSON.stringify(mobHp, null, 2)};

/** The ladder's per-rung sprint-pool drain multipliers (content/ladder.yaml
 * \`staminaDrain\`), read by the difficulty catalog. */
export const GENERATED_STAMINA_DRAIN: Record<string, number> = ${JSON.stringify(staminaDrain, null, 2)};

/** The ladder's per-rung standstill breather, in SECONDS to refill the base
 * pool (content/ladder.yaml \`staminaRefill\`), read by the difficulty
 * catalog. */
export const GENERATED_STAMINA_REFILL: Record<string, number> = ${JSON.stringify(staminaRefill, null, 2)};

/** The ladder's per-rung empty-pool LOCKOUT, in SECONDS of uninterrupted
 * standstill a dry pool owes before regen resumes (content/ladder.yaml
 * \`staminaEmptyLock\`), read by the difficulty catalog. */
export const GENERATED_STAMINA_EMPTY_LOCK: Record<string, number> = ${JSON.stringify(staminaEmptyLock, null, 2)};
`;

const destDir = engine("engine/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/levels.ts`, out);
writeFileSync(`${destDir}/level-index.ts`, indexOut);
console.log(
  `wrote engine/generated/levels.ts — ${defs.length} levels ` +
    `(${campaignOrder.length} campaign, ${secretOrder.length} secret); ` +
    `engine/generated/level-index.ts — ${defs.length} summaries`,
);
