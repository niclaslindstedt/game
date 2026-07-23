#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The item pipeline (see the `weapon-system` skill). Compiles the YAML item
// tree (`content/items/<rarity>/<id>.yaml`) plus the two knob files
// (`content/item-quality.yaml`, `content/item-rarity.yaml`) into the engine's
// item catalogs — the loot equivalent of the enemy/level pipelines. It:
//   1. harvests the sprite stems from the content/sprites tree (the only
//      cross-ref catalog an item points AT that is not the item tree itself),
//   2. loads + schema-validates every YAML item and both knob files (a bad
//      field/id fails the build),
//   3. writes src/generated/items.ts — the weapon/gear/unique catalogs, the
//      grade-name catalogs, and the cooked ITEM_QUALITY / ITEM_RARITY knob
//      blocks that defs/equipment.ts, defs/grades.ts, defs/uniques.ts, and
//      config.ts read.
// The output is gitignored and regenerated on every build (like enemies.ts),
// so the YAML is the single source of truth.
//
// MUST run FIRST in the generate chain — before generate-enemies.mjs: the
// enemy pipeline imports the equipment catalogs (for loot cross-refs), which
// now read the file this script writes. Unlike the other generators this one
// imports NOTHING from the engine — every ref it validates against comes from
// the content tree — so it can never join a bootstrap cycle.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  validateItem,
  validateQuality,
  validateRarity,
} from "./asset-tools/item-schema.mjs";
import { loadItems } from "./item-data/load-yaml.mjs";

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// ---- Sprite stems (content/sprites/<family>/<name>.yaml, stem == sprite id;
// underscore-prefixed files are family/core preambles, not sprites). ----------
const spritesDir = engine("content/sprites");
const sprites = new Set();
for (const family of readdirSync(spritesDir, { withFileTypes: true })) {
  if (!family.isDirectory()) continue;
  for (const f of readdirSync(`${spritesDir}/${family.name}`)) {
    if (f.endsWith(".yaml") && !f.startsWith("_"))
      sprites.add(f.slice(0, -".yaml".length));
  }
}

const { entries, quality, rarity } = loadItems();

// ---- Split the tree by kind + harvest the id sets the cross-refs check. -----
const weapons = entries.filter((e) => e.doc.kind === "weapon");
const gear = entries.filter((e) => e.doc.kind === "gear");
const uniques = entries.filter((e) => e.doc.kind === "unique");

// A unique's `base` may name a plain base OR one of its generated grade
// variants (defs/grades.ts mints those at engine load), so the ref sets
// include every `grades:` id alongside the authored ids. The engine's
// built-in sidearm (`blaster`, authored in defs/equipment.ts — see the
// ENGINE_WEAPONS note there) rides along as a weapon ref.
const gradeIds = (list) =>
  list.flatMap((e) =>
    e.doc.grades ? [e.doc.grades.exceptional?.id, e.doc.grades.elite?.id] : [],
  );
const refs = {
  weapons: new Set([
    "blaster",
    ...weapons.map((e) => e.id),
    ...gradeIds(weapons),
  ]),
  gear: new Set([...gear.map((e) => e.id), ...gradeIds(gear)]),
  sprites,
};

const errors = [];
const warnings = [];

// A grade-variant id must not collide with an authored item's id (they merge
// into one flat catalog at engine load).
const allIds = new Set(entries.map((e) => e.id));
for (const id of [...gradeIds(weapons), ...gradeIds(gear)]) {
  if (id !== undefined && allIds.has(id))
    errors.push(`grade variant id "${id}" collides with an authored item`);
}

for (const { doc } of entries) {
  const res = validateItem(doc, refs);
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const res of [validateQuality(quality), validateRarity(rarity)]) {
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}
for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} item schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

// ---- Cook the catalogs the engine reads. ------------------------------------

/** Shed the named YAML-only bookkeeping fields off a doc. */
function omit(doc, fields) {
  const def = { ...doc };
  for (const f of fields) delete def[f];
  return def;
}

/** A weapon/gear doc → its engine def: shed the tree bookkeeping (kind,
 * rarity, grades — the grade names ship as their own catalogs). */
function baseDef(doc) {
  return omit(doc, ["kind", "rarity", "grades"]);
}

/** A unique doc → its engine UniqueDef: the directory rarity IS the minted
 * tier, and the YAML's `dropWeight` is UniqueDef.rarity (the D2 per-item
 * drop weight — renamed in YAML to match the base items' knob). */
function uniqueDef(doc) {
  return {
    ...omit(doc, ["kind", "rarity", "dropWeight"]),
    tier: doc.rarity,
    ...(doc.dropWeight !== undefined && { rarity: doc.dropWeight }),
  };
}

const toRecord = (list, cook) =>
  Object.fromEntries(list.map((e) => [e.id, cook(e.doc)]));
const gradeNames = (list) =>
  Object.fromEntries(
    list.filter((e) => e.doc.grades).map((e) => [e.id, e.doc.grades]),
  );

const qualityIds = Object.keys(quality.qualities);
const pick = (field) =>
  Object.fromEntries(qualityIds.map((q) => [q, quality.qualities[q][field]]));
const ITEM_QUALITY = {
  order: qualityIds,
  prefix: pick("prefix"),
  mults: pick("mult"),
  ranges: pick("range"),
  weightsLow: pick("weightLow"),
  weightsHigh: pick("weightHigh"),
  highMlvl: quality.highMlvl,
};

const tierEntries = Object.entries(rarity.tiers);
const tierKnob = (field) =>
  Object.fromEntries(
    tierEntries
      .filter(([, t]) => t[field] !== undefined)
      .map(([id, t]) => [id, t[field]]),
  );
const ITEM_RARITY = {
  tiers: Object.fromEntries(
    tierEntries.map(([id, t]) => [
      id,
      { prefix: t.prefix, affixCount: t.affixCount },
    ]),
  ),
  rollOrder: rarity.rollOrder,
  unlockMlvl: tierKnob("unlockMlvl"),
  rarityBase: tierKnob("rollChance"),
  raritySlope: tierKnob("rollSlope"),
  mfSaturation: tierKnob("mfSaturation"),
  eliteRarityBonus: tierKnob("eliteBonus"),
  bossRarityBonus: tierKnob("bossBonus"),
  minionNamedMult: rarity.minionNamedMult,
  rarityChanceMax: rarity.rarityChanceMax,
};

// ---- Emit. ------------------------------------------------------------------

const banner = `// @generated by scripts/generate-items.mjs — DO NOT EDIT.
// Source of truth: content/items/<rarity>/<id>.yaml + content/item-quality.yaml
// + content/item-rarity.yaml. Regenerate with \`npm run levels\` (also runs
// inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const json = (v) => JSON.stringify(v, null, 2);

const out = `${banner}
import type { WeaponDef } from "../game/defs/equipment.ts";
import type { GearDef } from "../game/defs/gear.ts";
import type { GradeNames } from "../game/defs/grades.ts";
import type { UniqueDef } from "../game/defs/uniques.ts";
import type { Quality, Tier } from "../game/types/index.ts";

/** The hand-authored plain weapon bases (grade variants are generated on top
 * at engine load — see defs/grades.ts). */
export const GENERATED_WEAPONS: Record<string, WeaponDef> = ${json(
  toRecord(weapons, baseDef),
)} as unknown as Record<string, WeaponDef>;

/** The hand-authored gear bases (armor, charms, bags). */
export const GENERATED_GEAR: Record<string, GearDef> = ${json(
  toRecord(gear, baseDef),
)} as unknown as Record<string, GearDef>;

/** The named chase items (set/unique/legendary/artifact), minted by
 * mintUnique. */
export const GENERATED_UNIQUES: UniqueDef[] = ${json(
  uniques.map((e) => uniqueDef(e.doc)),
)} as unknown as UniqueDef[];

/** Each pool base's exceptional/elite identities (defs/grades.ts). */
export const GENERATED_WEAPON_GRADE_NAMES: Record<string, GradeNames> = ${json(
  gradeNames(weapons),
)};

export const GENERATED_GEAR_GRADE_NAMES: Record<string, GradeNames> = ${json(
  gradeNames(gear),
)};

type ItemQuality = {
  order: readonly Quality[];
  prefix: Record<Quality, string>;
  mults: Record<Quality, number>;
  ranges: Record<Quality, { min: number; max: number }>;
  weightsLow: Record<Quality, number>;
  weightsHigh: Record<Quality, number>;
  highMlvl: number;
};

/** The make-quality axis (content/item-quality.yaml) — read by config
 * \`QUALITY\` and the QUALITY_ORDER/QUALITY_PREFIX exports. */
export const ITEM_QUALITY: ItemQuality = ${json(
  ITEM_QUALITY,
)} as unknown as ItemQuality;

/** The tiers the rarity roll may land (see rollOrder / rollChance). */
type RollTier = Exclude<Tier, "regular" | "trash" | "set">;

type ItemRarity = {
  tiers: Record<Tier, { prefix: string; affixCount: number }>;
  rollOrder: readonly RollTier[];
  unlockMlvl: Record<Exclude<Tier, "regular">, number>;
  rarityBase: Record<RollTier, number>;
  raritySlope: Record<RollTier, number>;
  mfSaturation: Partial<Record<Tier, number>>;
  eliteRarityBonus: Partial<Record<Tier, number>>;
  bossRarityBonus: Partial<Record<Tier, number>>;
  minionNamedMult: number;
  rarityChanceMax: number;
};

/** The tier ladder + rarity economy (content/item-rarity.yaml) — read by the
 * TIERS/TIER_ROLL_ORDER exports and the config \`LOOT\` rarity knobs. */
export const ITEM_RARITY: ItemRarity = ${json(
  ITEM_RARITY,
)} as unknown as ItemRarity;
`;

const destDir = engine("src/generated");
mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/items.ts`, out);
console.log(
  `wrote src/generated/items.ts — ${weapons.length} weapons, ` +
    `${gear.length} gear, ${uniques.length} uniques`,
);
