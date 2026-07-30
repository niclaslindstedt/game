#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE REFERENCE CATALOG — every id a mod is allowed to name, as plain JSON.
//
// The mod compiler validates a mod's YAML with the SAME schema the campaign's
// content goes through, and that schema cross-references ids: a level names
// enemies, a spawn names a ramp, an elite drops a unique. In the repo those id
// sets come from importing the engine's TypeScript catalogs — which the SHIPPED
// desktop app cannot do. It has no TypeScript toolchain, no `src/`, and its
// main process is plain compiled JavaScript; `src/generated/` isn't even in the
// build. So the id sets are snapshotted here into one JSON file that travels
// inside the app, and the compiler reads THAT instead of the engine.
//
// It is COMMITTED rather than gitignored, for the same two reasons the Game
// Center and Steam achievement manifests are: a modder browsing the repository
// can read it to find out what they may reference without building anything,
// and a diff on it is the exact list of ids a content change added or removed.
// `tests/content/mod_catalog_test.ts` fails the build when it drifts.
//
//   node mod/tools/catalog.mjs           # rewrite mod/catalog.json
//   node mod/tools/catalog.mjs --check    # fail if it has drifted
//
// What is NOT in here is as deliberate as what is: no numbers, no stats, no
// balance. A mod may NAME the game's content; it may not read the game's
// tuning out of a file that would then have to stay compatible for ever.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Engine modules under src/lib use the @game/lib alias — map it so the def
// catalogs import cleanly under plain node.
register("../../scripts/game-alias-loader.mjs", import.meta.url);

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const engine = (p) => path.join(repoRoot, p);
const OUT = path.join(repoRoot, "mod", "catalog.json");

// Import the def catalogs DIRECTLY rather than through @game/core, which pulls
// the level registry and with it every map in the game — the same bootstrap
// rule scripts/generate-levels.mjs follows.
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));
const { WEAPON_DEFS } = await import(engine("src/game/defs/equipment.ts"));
const { GEAR_DEFS } = await import(engine("src/game/defs/gear.ts"));
const { ABILITY_DEFS } = await import(engine("src/game/defs/abilities.ts"));
const { UNIQUE_DEFS, WORLD_UNIQUES } = await import(
  engine("src/game/defs/uniques.ts")
);
const { DIFFICULTY_DEFS } = await import(
  engine("src/game/defs/difficulties.ts")
);
const { COMPANION_DEFS } = await import(engine("src/game/defs/companions.ts"));
const { GENERATED_LEVEL_SUMMARIES } = await import(
  engine("src/generated/level-index.ts")
);
// The story catalogs are read from `content/` through the same loaders a mod's
// own story goes through, rather than from the engine — the ids are the content
// tree's to state, and one reader means the two can never disagree.
const { loadCutscenes, loadStoryItems, loadThoughts } = await import(
  engine("scripts/story-data/load-yaml.mjs")
);
const { cutscenes: CUTSCENES } = loadCutscenes();
// The errands, read the same way and for the same reason — the ids are the
// content tree's to state, and a mod's quests go through this exact loader.
const { loadQuestGivers, loadQuests } = await import(
  engine("scripts/quest-data/load-yaml.mjs")
);
const { quests: QUEST_DEFS } = loadQuests();
const { questGivers: QUEST_GIVER_DEFS } = loadQuestGivers();
const { thoughts: THOUGHT_DEFS } = loadThoughts();
const { storyItems: STORY_ITEM_DEFS } = loadStoryItems();

const sorted = (ids) => [...ids].sort();

/** The sound ids the game ships, so a mod may replace one by name and a
 * weapon's `sfx:` can be checked against something. */
function shippedSoundIds() {
  return sorted(
    readdirSync(engine("content/sounds"))
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.slice(0, -".yaml".length)),
  );
}

/** The track ids the game ships, so a mod may replace one by name and a
 * level's `music:` can be checked against something. */
function shippedMusicIds() {
  return sorted(
    readdirSync(engine("content/music"))
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.slice(0, -".yaml".length)),
  );
}

/** Every event the engine emits — what a sound's `on.type` may name. */
function emittedEvents() {
  const source = readFileSync(engine("src/game/types/events.ts"), "utf8");
  return sorted(
    new Set([...source.matchAll(/type:\s*"([a-zA-Z]+)"/g)].map((m) => m[1])),
  );
}

/** The sprite names the atlas ships, so a mod naming one gets a real check
 * rather than an invisible blank where a sprite should be. */
function shippedSpriteNames() {
  const atlas = JSON.parse(
    readFileSync(engine("pwa/src/game/assets/atlas.json"), "utf8"),
  );
  return sorted(Object.keys(atlas));
}

const catalog = {
  $comment:
    "GENERATED by mod/tools/catalog.mjs — do not edit by hand. Every id a " +
    "mod may reference; see mod/README.md.",
  // Bumped when the compiler's expectations of this file change, so an old
  // app and a new catalog can say so rather than mis-reading each other.
  formatVersion: 1,
  enemies: sorted(Object.keys(ENEMY_DEFS)),
  // The pinned-spawn check needs to tell a stationed minion (no authored
  // level/hp — it rides the map's mob band) from an elite or boss set piece,
  // for which both are required.
  enemyRoles: Object.fromEntries(
    sorted(Object.keys(ENEMY_DEFS)).map((id) => [id, ENEMY_DEFS[id].role]),
  ),
  weapons: sorted(Object.keys(WEAPON_DEFS)),
  gear: sorted(Object.keys(GEAR_DEFS)),
  abilities: sorted(Object.keys(ABILITY_DEFS)),
  thoughts: sorted(Object.keys(THOUGHT_DEFS)),
  storyItems: sorted(Object.keys(STORY_ITEM_DEFS)),
  // Every scene a level's `prelude` may name — the per-difficulty variants
  // included, since a level may name one directly.
  cutscenes: sorted(Object.keys(CUTSCENES)),
  uniques: sorted(Object.keys(UNIQUE_DEFS)),
  worldUniques: sorted(WORLD_UNIQUES.map((u) => u.id)),
  doorKeys: sorted(
    new Set(
      Object.values(STORY_ITEM_DEFS)
        .map((s) => s.unlocks)
        .filter(Boolean),
    ),
  ),
  companions: sorted(Object.keys(COMPANION_DEFS)),
  // The shipped errands and the people who hand them out, so an ADDON that
  // would shadow one is caught at compile time — and so a mod's own chain may
  // legitimately hang off a shipped quest on a shipped map.
  quests: sorted(Object.keys(QUEST_DEFS)),
  questGivers: sorted(Object.keys(QUEST_GIVER_DEFS)),
  difficulties: sorted(Object.keys(DIFFICULTY_DEFS)),
  // The shipped venues, so an ADDON that would shadow one is caught at compile
  // time rather than by the level registry throwing on a duplicate id.
  levels: sorted(Object.keys(GENERATED_LEVEL_SUMMARIES)),
  sprites: shippedSpriteNames(),
  sounds: shippedSoundIds(),
  music: shippedMusicIds(),
  events: emittedEvents(),
};

const body = `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = ""; // never generated → stays empty → maximally out of date
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* no catalog on disk yet */
  }
  if (current !== body) {
    console.error(
      "mod/catalog.json is out of date — run `node mod/tools/catalog.mjs`.\n" +
        "It is the id list mods validate against, so a content change that " +
        "adds or retires an id belongs in the same commit.",
    );
    process.exit(1);
  }
  console.log(`catalog up to date (${catalog.enemies.length} enemies)`);
  process.exit(0);
}

writeFileSync(OUT, body);
const counts = [
  ["enemies", catalog.enemies.length],
  ["weapons", catalog.weapons.length],
  ["gear", catalog.gear.length],
  ["uniques", catalog.uniques.length],
  ["abilities", catalog.abilities.length],
  ["sprites", catalog.sprites.length],
  ["sounds", catalog.sounds.length],
  ["tracks", catalog.music.length],
];
console.log(
  `wrote mod/catalog.json — ${counts.map(([k, n]) => `${n} ${k}`).join(", ")}`,
);
