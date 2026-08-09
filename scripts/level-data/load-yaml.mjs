// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML level loader (see the `level-design` skill). Globs the `levels/`
// tree — one self-describing file per level — and produces the plain MissionDef
// objects the engine consumes, mirroring the sprite loader
// (`sprite-data/load-yaml.mjs`).
//
// A LEVEL YAML IS A MISSION, NOT A MAP. The geometry — where the walls run, what
// stands on the floor, where the horde knots, where the boss is — is carved per
// run from `content/maps/<id>.yaml` (see the engine's `mapgen/`), so a mission
// that authors any of it is refused by name rather than silently ignored (see
// CARVED_FIELDS below). What is left is everything a venue is APART from its
// floor plan: its story, its ladder rung, its hazards, its merchant, its loot
// pools, its thought pins.
//
// A level YAML carries those `MissionDef` fields plus three authoring-only keys
// the loader strips before handing the def to the engine:
//
//   description   free-text design intent (documentation + the map renderer)
//   campaign      true → the level joins the ordered campaign (LEVEL_ORDER)
//   secret        true → an off-campaign venue (SECRET_LEVEL_ORDER)
//
// The per-difficulty DIFFICULTY RAMPS live in `ladder.yaml`, not the level
// files. A mission takes its own rung from there — the `mob: [start, end]` band
// stamped on as `mobLevels` and the hero anchor as `intendedLevel` — while the
// RAMPS its set pieces and knots name (`savage`, `apex`) are expanded against
// the same ladder by the blueprint loader next door (`map-data/load-yaml.mjs`),
// because that is where the cast now lives. So every difficulty number in the
// game is still tuned from the one file.
//
// Layout:
//   levels/<id>.yaml   description, campaign|secret, then the LevelDef fields
//                      (the file stem must equal the level `id`).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { LADDER_RUNGS, bandsFor, loadLadder } from "./ladder.mjs";

// The shipped tree. A MOD compiles the same YAML from its own directory
// (mod/tools/build.mjs), which is the whole reason the directory is an argument
// rather than a constant: a mod's level must go through the exact loader and
// the exact schema the campaign's does, or "it works in my mod" and "it works
// in the game" stop meaning the same thing.
const SHIPPED_LEVELS_DIR = fileURLToPath(
  new URL("../../content/levels", import.meta.url),
);

/**
 * The fields a MAP BLUEPRINT owns, listed with where each one went — a mission
 * that still declares one is refused by name.
 *
 * The alternative (ignoring them) is the bad kind of quiet: an author would
 * draw a wall, run the game, see no wall, and have nothing at all to read. Every
 * one of these has a home in `content/maps/<id>.yaml`, and the message says
 * which.
 */
const CARVED_FIELDS = {
  width: "`sizes` in the blueprint",
  height: "`sizes` in the blueprint",
  playerSpawn:
    "the carve (the hero lands as far from the boss as the grid allows)",
  landmarks: "`objects` of type `landmark` in the blueprint",
  path: "nothing — a carved mission is a SEARCH, and an intended route is what silences it",
  rareSpawns: "`rareSpawns` in the blueprint",
  spawns:
    "`horde`, `elites`, `guardians`, `boss` and `bystanders` in the blueprint",
  packs: "`horde` in the blueprint",
  spawners: "`horde` in the blueprint",
  waves: "`horde` in the blueprint",
  walls: "`objects` of type `wall`, plus each area's `enclosure`",
  doors: "`objects` of type `wall` (an area's enclosure decides what it seals)",
  buildings: "`objects` of type `building` or `lair`",
  propLines: "an area's `blocks` (a main street) in the blueprint",
  obstacles: "`objects` of type `obstacle`, `cover` or `crate`",
  decor: "`objects` of type `decor`",
  chests: "`objects` of type `chest`, placed at the carve's dead ends",
  merchantSpawns: "the carve (the trader gets a room of his own)",
  safeZones: "the carve (the trader's pitch is the one safe pocket)",
  quietZones: "the carve (the landing and the caches are quiet)",
  tempo: "the carve (a cell's knots are priced by the depth it sits at)",
  fauna: "`objects` of type `critter` in the blueprint",
  lairs: "`objects` of type `lair`, named by an elite's `lair`",
  elevators: "`annex` in the blueprint",
};

/**
 * Load the whole level tree.
 *
 * @returns `{ entries }` where each entry is
 *   `{ id, def, description, campaign, secret }` — `def` is the pure MissionDef
 *   (authoring keys stripped). Throws on a duplicate id or a stem/id mismatch.
 */
export function loadLevels(levelsDir = SHIPPED_LEVELS_DIR, options = {}) {
  const errors = [];
  const {
    byLevel: ladder,
    mobHp,
    staminaDrain,
    staminaRefill,
    staminaEmptyLock,
    errors: ladderErrors,
  } = loadLadder();
  errors.push(...ladderErrors);

  // A MOD prices its own levels on the same ladder: `extraLadder` carries the
  // per-rung `{ <level id>: { hero, mob } }` rows out of the mod's own
  // ladder.yaml, merged in before a band is read off it. It cannot restate the
  // RAMPS, the hp curves or the stamina ladders — those are the game's economy,
  // and a mod that re-tuned them would be rebalancing the campaign rather than
  // adding to it. So a mod says how deep ITS venue sits, and `savage` still
  // means what it means everywhere else.
  for (const [rung, cells] of Object.entries(options.extraLadder ?? {})) {
    for (const [id, cell] of Object.entries(cells ?? {})) {
      (ladder[id] ??= {})[rung] = cell;
    }
  }

  // A mod need not ship levels at all (one that adds only monsters is a mod);
  // an absent tree is an empty catalog, not a failure.
  const files = existsSync(levelsDir)
    ? readdirSync(levelsDir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
    : [];

  const seen = new Set();
  const entries = [];
  for (const file of files) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${levelsDir}/${file}`, "utf8"));
    if (doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
    }
    if (seen.has(doc.id)) {
      errors.push(`duplicate level id "${doc.id}"`);
      continue;
    }
    seen.add(doc.id);

    const { description, campaign, secret, ...def } = doc;
    for (const [field, home] of Object.entries(CARVED_FIELDS)) {
      if (def[field] !== undefined)
        errors.push(
          `${file}: "${field}" is the map's, not the mission's — it lives in ${home} (content/maps/${doc.id}.yaml)`,
        );
    }
    // A POSITION is the carve's answer too, wherever it appears. A mission says
    // WHAT it leaves lying around and how hard its black holes pull; where each
    // one ends up is decided per run, so an authored coordinate here is a
    // number that would never be read.
    for (const item of def.placedItems ?? [])
      if (item?.pos !== undefined)
        errors.push(
          `${file}: placedItems entries carry no "pos" — the carve strings them along its own depth axis`,
        );
    for (const well of def.wells ?? [])
      if (well?.pos !== undefined)
        errors.push(
          `${file}: wells carry no "pos" — the carve re-anchors each into a room of its own`,
        );
    // A REGIONAL FLOOR is a rectangle, and a rectangle is geometry: the deck
    // plating inside a dome is an AREA's own `ground` in the blueprint, which
    // is what puts it under the district it belongs to rather than under a
    // patch of coordinates the carve never heard of.
    if (def.tiles?.zones !== undefined)
      errors.push(
        `${file}: tiles.zones is the map's — an area's own \`ground\` in content/maps/${doc.id}.yaml paints its floor`,
      );
    if (def.openingStrike?.at !== undefined)
      errors.push(
        `${file}: openingStrike carries no "at" — the vanguard is placed beside wherever the hero lands`,
      );
    if (def.objective?.at !== undefined)
      errors.push(
        `${file}: the objective carries no "at" — a reachExit stands wherever the carve put the goal`,
      );
    if (campaign && secret) {
      errors.push(`${file}: level is both campaign and secret — pick one`);
    }
    if (!campaign && !secret) {
      errors.push(
        `${file}: level is neither campaign nor secret — set one to true`,
      );
    }
    // Stamp the ladder's mob bands + hero anchors onto the def, so the numbers
    // live in ladder.yaml alone (never per-level). A level authoring its own
    // top-level `mobLevels`/`intendedLevel` is an error — the ladder owns them.
    if (def.mobLevels !== undefined || def.intendedLevel !== undefined) {
      errors.push(
        `${file}: mobLevels/intendedLevel are owned by ladder.yaml — remove them from the level`,
      );
    }
    const cells = ladder[doc.id];
    const bands = bandsFor(cells);
    if (!bands) {
      errors.push(`ladder.yaml: missing entry for level "${doc.id}"`);
    } else {
      def.mobLevels = bands;
      def.intendedLevel = LADDER_RUNGS.map((r) => cells[r].hero);
    }
    entries.push({
      id: doc.id,
      def,
      description: description ?? "",
      campaign: Boolean(campaign),
      secret: Boolean(secret),
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} level load error(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return { entries, mobHp, staminaDrain, staminaRefill, staminaEmptyLock };
}
