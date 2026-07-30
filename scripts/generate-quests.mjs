#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The QUEST pipeline. Compiles the two hand-authored catalogs that carry the
// field's errands — `content/quests/<id>.yaml` and `content/quest-givers.yaml`
// — into `src/generated/quests.ts`, which `src/game/defs/quests.ts` re-exposes
// as QUEST_DEFS and QUEST_GIVER_DEFS. It:
//   1. harvests the ids every quest may name — levels, enemies, sprites,
//      uniques, powerups, difficulties — straight from the content tree,
//   2. schema-validates every errand and every giver (see
//      asset-tools/quest-schema.mjs), plus the whole-catalog rules no single
//      file can check (a giver with no quests, a chain that loops),
//   3. writes both catalogs flat, stamping ids from file stems / catalog keys
//      so the YAML never repeats itself.
// The output is gitignored and regenerated on every build (like levels.ts and
// enemies.ts), so the YAML is the single source of truth.
//
//   node scripts/generate-quests.mjs
//
// Like the item, story and powerup pipelines it imports NOTHING from the
// engine — every ref it validates against is read out of `content/` — so it can
// never join a bootstrap cycle and its position in the chain is free.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import {
  validateQuest,
  validateQuestCatalog,
  validateQuestGiver,
} from "./asset-tools/quest-schema.mjs";
import {
  validateConversation,
  validateConversationCatalog,
} from "./asset-tools/quest-schema.mjs";
import { DIFFICULTY_RUNGS } from "./level-data/ladder.mjs";
import {
  loadConversations,
  loadQuestGivers,
  loadQuests,
} from "./quest-data/load-yaml.mjs";

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** Every `<name>.yaml` stem in a directory (a catalog whose stem IS its id). */
const stems = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".yaml".length));

// ---- The ids a quest may name, harvested from content/ ----------------------
const sprites = new Set();
const spritesDir = engine("content/sprites");
for (const family of readdirSync(spritesDir, { withFileTypes: true })) {
  if (!family.isDirectory()) continue;
  for (const name of stems(`${spritesDir}/${family.name}`)) sprites.add(name);
}

const enemies = new Set();
const enemiesDir = engine("content/enemies");
for (const biome of readdirSync(enemiesDir, { withFileTypes: true })) {
  if (!biome.isDirectory()) continue;
  for (const name of stems(`${enemiesDir}/${biome.name}`)) enemies.add(name);
}

// The named chase — every rarity directory that holds hand-authored relics.
const uniques = new Set();
const itemsDir = engine("content/items");
for (const rarity of ["set", "unique", "legendary", "artifact"]) {
  try {
    for (const name of stems(`${itemsDir}/${rarity}`)) uniques.add(name);
  } catch {
    // A game (or a mod) need not ship every rarity.
  }
}

const levels = new Set(stems(engine("content/levels")));

const powerups = parse(readFileSync(engine("content/powerups.yaml"), "utf8"));
const abilities = new Set(Object.keys(powerups?.powerups ?? {}));

// The hero's ceiling, read out of the CURVE rather than typed here — the last
// level `content/leveling.yaml` prices a step out of is the last one reachable,
// so a `reachLevel` objective past it is caught as the unfinishable errand it
// is. Read from content/ like every other ref, so this pipeline still imports
// nothing from the engine.
const leveling = parse(readFileSync(engine("content/leveling.yaml"), "utf8"));
const maxHeroLevel =
  Math.max(
    0,
    ...Object.keys(leveling?.xpToNext ?? {}).map((n) => Number(n) || 0),
  ) + 1;

// ---- Load ------------------------------------------------------------------
const { questGivers, entries: giverEntries } = loadQuestGivers(
  engine("content"),
);
const { quests, entries: questEntries } = loadQuests(engine("content/quests"));
const { conversations, entries: conversationEntries } = loadConversations(
  engine("content/conversations"),
);

const giverLevels = new Map(
  Object.entries(questGivers).map(([id, def]) => [id, def.level]),
);

const refs = {
  levels,
  enemies,
  sprites,
  uniques,
  abilities,
  difficulties: new Set(DIFFICULTY_RUNGS),
  givers: new Set(Object.keys(questGivers)),
  giverLevels,
  quests: new Set(Object.keys(quests)),
  conversations: new Set(Object.keys(conversations)),
  maxHeroLevel,
  // questId → the pieces some conversation branch hands over, so a piece that
  // is given rather than found is not reported as one nothing produces.
  givenPieces: collectGivenPieces(conversations),
  // Every flag any conversation branch sets, so an objective that waits on one
  // nobody ever sets is a build error rather than an errand that can never be
  // finished — the single most invisible way to break a chain.
  flags: collectFlags(conversations, quests),
};

/** questId → Set of piece ids some conversation branch hands over. */
function collectGivenPieces(catalog) {
  const map = new Map();
  for (const def of Object.values(catalog)) {
    for (const node of def.nodes ?? []) {
      for (const choice of node.choices ?? []) {
        const gives = choice?.gives;
        if (!gives?.quest || !gives?.item) continue;
        if (!map.has(gives.quest)) map.set(gives.quest, new Set());
        map.get(gives.quest).add(gives.item);
      }
    }
  }
  return map;
}

/**
 * Every run flag anything in the catalogs is capable of setting — a
 * conversation branch's `sets:`, or a sale across the trader's counter. Both
 * sources have to be here: a `flag` objective waiting on one nobody sets is an
 * errand that can never be finished, and it looks exactly like a bug in the
 * conversation the player just had.
 */
function collectFlags(conversationCatalog, questCatalog) {
  const flags = new Set();
  for (const def of Object.values(conversationCatalog)) {
    for (const node of def.nodes ?? []) {
      for (const choice of node.choices ?? []) {
        for (const flag of choice.sets ?? []) flags.add(flag);
      }
    }
  }
  for (const def of Object.values(questCatalog)) {
    for (const flag of def.merchant?.buys?.sets ?? []) flags.add(flag);
  }
  return flags;
}

// ---- Validate --------------------------------------------------------------
const errors = [];
const warnings = [];
const collect = (res) => {
  errors.push(...res.errors);
  warnings.push(...res.warnings);
};
for (const { id, def } of giverEntries)
  collect(validateQuestGiver(id, def, refs));
for (const { id, def } of questEntries) collect(validateQuest(id, def, refs));
for (const { id, def } of conversationEntries)
  collect(validateConversation(id, def, refs));
collect(validateQuestCatalog(quests, questGivers));
collect(validateConversationCatalog(conversations, quests));

for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} quest schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

// ---- Emit ------------------------------------------------------------------
const destDir = engine("src/generated");
mkdirSync(destDir, { recursive: true });

const json = (value) => JSON.stringify(value, null, 2);

writeFileSync(
  `${destDir}/quests.ts`,
  `// @generated by scripts/generate-quests.mjs — DO NOT EDIT.
// Source of truth: content/quests/<id>.yaml + content/quest-givers.yaml.
// Regenerate with \`npm run levels\` (also runs inside \`npm run assets\` /
// \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { ConversationDef } from "../game/defs/conversations.ts";
import type { QuestDef, QuestGiverDef } from "../game/defs/quests.ts";

export const GENERATED_QUESTS: Record<string, QuestDef> = ${json(
    quests,
  )} as unknown as Record<string, QuestDef>;

export const GENERATED_QUEST_GIVERS: Record<string, QuestGiverDef> = ${json(
    questGivers,
  )} as unknown as Record<string, QuestGiverDef>;

export const GENERATED_CONVERSATIONS: Record<string, ConversationDef> = ${json(
    conversations,
  )} as unknown as Record<string, ConversationDef>;
`,
);

console.log(
  `wrote src/generated/quests.ts — ${Object.keys(quests).length} quests from ` +
    `${Object.keys(questGivers).length} givers, ` +
    `${Object.keys(conversations).length} conversations`,
);
