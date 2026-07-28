// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP BLUEPRINT loader — the "v2" level format's front door. Globs
// `content/maps/` (one self-describing blueprint per mission) and produces the
// plain `MapBlueprint` objects the engine's generator consumes, mirroring the
// level loader (`../level-data/load-yaml.mjs`).
//
// A blueprint YAML carries every `MapBlueprint` field plus one authoring-only
// key the loader strips:
//
//   description   free-text design intent (documentation + the schema warning)
//
// And, exactly like a level YAML, it names RAMPS rather than hard-coding
// per-difficulty numbers: a horde ladder rung, a set piece, an escort and the
// boss each name a `ramp` (and set pieces a single base `hp`), which this loader
// expands into the four [easy, medium, hard, nightmare] tuples the engine reads —
// using the ladder cell and hp curve of the LEVEL the blueprint inherits from.
// So a `savage` knot means the same mob level on a generated moon as on the
// authored one, and trimming `content/ladder.yaml` still moves both.
//
// Layout:
//   maps/<id>.yaml   description, then the MapBlueprint fields (the file stem
//                    must equal the blueprint `id` AND the level it generates).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import {
  bandsFor,
  loadLadder,
  pinnedHpTuple,
  pinnedLevel,
  spawnerMobLevels,
} from "../level-data/ladder.mjs";

const mapsDir = fileURLToPath(new URL("../../content/maps", import.meta.url));

/**
 * Expand one authored set piece (`{ enemy, ramp, hp, escort }`) into the
 * compiled form (`{ enemy, level, hp, escort }`), dropping the authoring-only
 * `ramp` and turning the base hp into its per-difficulty tuple.
 */
function expandSetPiece(piece, ctx, where) {
  const { ramps, hpCurves, curveName, bands } = ctx;
  const out = {
    enemy: piece.enemy,
    level: pinnedLevel(piece.ramp, ramps, bands, where),
    hp: pinnedHpTuple(piece.hp, curveName, hpCurves, where),
  };
  if (piece.escort) {
    out.escort = piece.escort.map((guard, i) => ({
      enemy: guard.enemy,
      count: guard.count,
      level: pinnedLevel(guard.ramp, ramps, bands, `${where} escort[${i}]`),
      hp: pinnedHpTuple(guard.hp, curveName, hpCurves, `${where} escort[${i}]`),
    }));
  }
  if (piece.regions) out.regions = piece.regions;
  return out;
}

/**
 * Expand every ramp reference in one blueprint into the per-difficulty tuples
 * the engine consumes: the horde's ramp LADDER, each elite/guardian/escort, the
 * hellborn mix, and the boss. Returns the compiled blueprint.
 */
function expandRamps(bp, ctx, where) {
  const { ramps, bands } = ctx;
  const out = { ...bp };
  out.horde = {
    ...bp.horde,
    ramps: (bp.horde.ramps ?? []).map((name, i) =>
      spawnerMobLevels(name, ramps, bands, `${where} horde.ramps[${i}]`),
    ),
  };
  out.elites = (bp.elites ?? []).map((p, i) =>
    expandSetPiece(p, ctx, `${where} elites[${i}]`),
  );
  out.guardians = (bp.guardians ?? []).map((p, i) =>
    expandSetPiece(p, ctx, `${where} guardians[${i}]`),
  );
  if (bp.hellborn) {
    out.hellborn = {
      level: spawnerMobLevels(
        bp.hellborn.ramp,
        ramps,
        bands,
        `${where} hellborn`,
      ),
      members: bp.hellborn.members,
    };
  }
  out.boss = bp.boss ? expandSetPiece(bp.boss, ctx, `${where} boss`) : null;
  return out;
}

/**
 * Load the whole map-blueprint tree.
 *
 * @returns `{ entries }` where each entry is `{ id, raw, blueprint,
 *   description }` — `raw` is the authored document (what the schema validates),
 *   `blueprint` the compiled `MapBlueprint` (ramps expanded, authoring keys
 *   stripped). Throws on a duplicate id, a stem/id mismatch, or a ramp/level the
 *   ladder cannot resolve.
 */
export function loadMaps() {
  const errors = [];
  const {
    byLevel: ladder,
    ramps,
    hpCurves,
    pinnedHp,
    errors: ladderErrors,
  } = loadLadder();
  errors.push(...ladderErrors);

  let files;
  try {
    files = readdirSync(mapsDir)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
  } catch {
    // No blueprint tree yet — a repo mid-bootstrap simply has no generated maps,
    // which is a valid state (the flag then never finds a blueprint to carve).
    return { entries: [] };
  }

  const seen = new Set();
  const entries = [];
  for (const file of files) {
    const stem = file.slice(0, -".yaml".length);
    const raw = parse(readFileSync(`${mapsDir}/${file}`, "utf8"));
    if (raw.id !== stem)
      errors.push(`${file}: id is "${raw.id}", expected "${stem}"`);
    if (seen.has(raw.id)) {
      errors.push(`duplicate map blueprint id "${raw.id}"`);
      continue;
    }
    seen.add(raw.id);
    // A blueprint generates the mission it is named after: one blueprint per
    // level, keyed by the level id, so `resolveLevelDef` can look it up by the
    // id a run was started with and nothing has to map between two namespaces.
    if (raw.level !== undefined && raw.level !== raw.id)
      errors.push(
        `${file}: level is "${raw.level}" but the blueprint id is "${raw.id}" — ` +
          `a blueprint generates the mission it is named after`,
      );

    const { description, ...bp } = raw;
    const cells = ladder[raw.level ?? raw.id];
    const bands = bandsFor(cells);
    if (!bands) {
      errors.push(`ladder.yaml: missing entry for map "${raw.id}"`);
      continue;
    }
    const curveName = pinnedHp[raw.id] ?? pinnedHp.default ?? "standard";
    let blueprint;
    try {
      blueprint = expandRamps(
        bp,
        { ramps, hpCurves, curveName, bands },
        `map "${raw.id}"`,
      );
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    entries.push({
      id: raw.id,
      raw,
      blueprint,
      description: description ?? "",
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} map load error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { entries };
}
