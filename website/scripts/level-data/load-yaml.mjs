// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML level loader (see the `level-design` skill). Globs the `levels/`
// tree — one self-describing file per level — and produces the plain LevelDef
// objects the engine consumes, mirroring the sprite loader
// (`sprite-data/load-yaml.mjs`). A level YAML carries every `LevelDef` field
// plus three authoring-only keys the loader strips before handing the def to
// the engine:
//
//   description   free-text design intent (documentation + the map renderer)
//   campaign      true → the level joins the ordered campaign (LEVEL_ORDER)
//   secret        true → an off-campaign venue (SECRET_LEVEL_ORDER)
//
// Layout:
//   levels/<id>.yaml   description, campaign|secret, then the LevelDef fields
//                      (the file stem must equal the level `id`).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const levelsDir = fileURLToPath(new URL("../levels", import.meta.url));
const ladderPath = fileURLToPath(new URL("../ladder.yaml", import.meta.url));

// The non-JESUS ladder rungs, in `DifficultyMobLevels` order. JESUS is omitted
// from the ladder — it stays player-relative.
const LADDER_RUNGS = ["easy", "medium", "hard", "nightmare"];

/**
 * Load the campaign LADDER (`ladder.yaml`) and derive, per level id, the
 * `mobLevels` tuple (the four [easy, medium, hard, nightmare] default mob bands)
 * and the `intendedLevel` tuple (the four hero anchors). This is the single
 * source of truth both the engine pipeline and the map tooling read — the
 * numbers live here, not copied into every level file.
 */
function loadLadder() {
  const doc = parse(readFileSync(ladderPath, "utf8"));
  const byLevel = {};
  const errors = [];
  for (const rung of LADDER_RUNGS) {
    const cells = doc[rung];
    if (!cells) {
      errors.push(`ladder.yaml: missing difficulty "${rung}"`);
      continue;
    }
    for (const [id, cell] of Object.entries(cells)) {
      (byLevel[id] ??= {})[rung] = cell;
    }
  }
  return { byLevel, errors };
}

/**
 * Load the whole level tree.
 *
 * @returns `{ entries }` where each entry is
 *   `{ id, def, description, campaign, secret }` — `def` is the pure LevelDef
 *   (authoring keys stripped). Throws on a duplicate id or a stem/id mismatch.
 */
export function loadLevels() {
  const errors = [];
  const { byLevel: ladder, errors: ladderErrors } = loadLadder();
  errors.push(...ladderErrors);
  const files = readdirSync(levelsDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

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
    if (!cells || LADDER_RUNGS.some((r) => !cells[r])) {
      errors.push(`ladder.yaml: missing entry for level "${doc.id}"`);
    } else {
      def.mobLevels = LADDER_RUNGS.map((r) => cells[r].mob);
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

  return { entries };
}
