// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML QUEST loader — the errands a map hands out, and the people who hand
// them out. Peer of the story/sound/level/enemy/item loaders, and takes a BASE
// DIRECTORY for exactly the same reason they do: a MOD's quests go through this
// loader and this schema (see mod/tools/build.mjs), so "it works in my mod" and
// "it works in the game" mean the same thing.
//
// Layout — one tree and one single-file catalog:
//   quests/<id>.yaml     one errand: the file stem IS the id.
//   quest-givers.yaml    a `questGivers:` mapping of id → person.
//
// A catalog key (or a file stem) IS the id, stamped onto the def here so the
// YAML never has to repeat it and the two can never disagree.
//
// The loader makes exactly ONE shape change, and it is the same readability
// trade the story loader makes: an objective's `count:` is optional in the
// authored form for the kinds that can only ever want one (`killNamed`,
// `escort`), because writing `count: 1` on "kill the boss" is noise. Everything
// else reaches the engine as authored.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/**
 * Load a quest tree.
 *
 * @param dir  the folder of `<id>.yaml` errands (the game's `content/quests`,
 *             or a mod's `quests/`).
 * @returns `{ quests, entries }` — `quests` is the flat `{ id → def }` catalog
 *          the engine takes; `entries` is `[{ id, def }]` in file order for the
 *          schema. Throws on a structural error: a stem that disagrees with an
 *          authored `id`, or a duplicate.
 */
export function loadQuests(dir = `${SHIPPED_ROOT}/quests`) {
  const quests = {};
  const entries = [];
  const errors = [];

  // A mod need not ship quests; an absent tree is an empty catalog.
  if (!existsSync(dir)) return { quests, entries };

  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .sort()) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${dir}/${file}`, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${file}: expected a mapping (an errand)`);
      continue;
    }
    if (doc.id !== undefined && doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
      continue;
    }
    if (stem in quests) {
      errors.push(`duplicate quest id "${stem}"`);
      continue;
    }
    const def = { ...doc, id: stem };
    if (Array.isArray(def.objectives)) {
      def.objectives = def.objectives.map(normalizeObjective);
    }
    quests[stem] = def;
    entries.push({ id: stem, def });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} quest tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { quests, entries };
}

/**
 * Load the quest-giver catalog.
 *
 * @param baseDir  the tree holding `quest-givers.yaml` (the game's `content/`,
 *                 or a mod's root).
 * @returns `{ questGivers, entries }`, shaped like `loadQuests`.
 */
export function loadQuestGivers(baseDir = SHIPPED_ROOT) {
  const source = `${baseDir}/quest-givers.yaml`;
  const questGivers = {};
  const entries = [];
  if (!existsSync(source)) return { questGivers, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("quest-givers.yaml: expected a YAML mapping");
  }
  const catalog = doc.questGivers;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(
      'quest-givers.yaml: expected a "questGivers:" mapping of id → person',
    );
  }
  for (const [id, def] of Object.entries(catalog)) {
    questGivers[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { questGivers, entries };
}

/**
 * Load the CONVERSATION tree catalog — the talks the hero steers (see
 * engine/game/defs/conversations.ts). Loaded by the QUEST loader, and compiled
 * into the quest catalog, because a conversation exists to move an errand
 * along; a pipeline of its own would buy a second schema to keep in step and
 * nothing else.
 *
 * Layout matches the errands: `conversations/<id>.yaml`, the file stem IS the
 * id. Shaped like `loadQuests`, and just as optional — a mod need not ship any.
 *
 * @param dir  the folder of `<id>.yaml` trees (the game's
 *             `content/conversations`, or a mod's `conversations/`).
 */
export function loadConversations(dir = `${SHIPPED_ROOT}/conversations`) {
  const conversations = {};
  const entries = [];
  const errors = [];

  if (!existsSync(dir)) return { conversations, entries };

  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .sort()) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${dir}/${file}`, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${file}: expected a mapping (a conversation)`);
      continue;
    }
    if (doc.id !== undefined && doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
      continue;
    }
    if (stem in conversations) {
      errors.push(`duplicate conversation id "${stem}"`);
      continue;
    }
    // The one authored-form shape change here: `nodes:` is a MAPPING of
    // id → node in the YAML (so a `goto:` reads as a key that is visibly
    // present in the file) and a LIST on the def (so the engine keeps authored
    // order without depending on object key order). The key becomes the id,
    // exactly as a catalog key does everywhere else in the content tree.
    const def = { ...doc, id: stem };
    if (def.nodes && !Array.isArray(def.nodes)) {
      def.nodes = Object.entries(def.nodes).map(([nodeId, node]) => ({
        id: nodeId,
        ...node,
      }));
    }
    conversations[stem] = def;
    entries.push({ id: stem, def });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} conversation error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { conversations, entries };
}

/** The one authored-form shape change: a singular objective needs no `count`. */
function normalizeObjective(objective) {
  if (!objective || typeof objective !== "object") return objective;
  if (
    objective.kind === "killNamed" ||
    objective.kind === "escort" ||
    objective.kind === "visit" ||
    objective.kind === "flag" ||
    objective.kind === "sell"
  ) {
    const rest = { ...objective };
    delete rest.count;
    return rest;
  }
  return objective;
}
