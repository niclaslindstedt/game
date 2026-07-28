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
// The per-difficulty DIFFICULTY RAMPS live in `ladder.yaml`, not the level
// files: a spawn point / pinned set-piece names a RAMP and carries (for pinned)
// a single base `hp`, and this loader expands both into the four
// [easy, medium, hard, nightmare] tuples the engine reads — using the map's own
// `mob: [start, end]` band and hp curve. So the level YAML reads as intent
// ("a `savage` wave", "the `apex` boss") and every difficulty number is tuned
// from the one ladder file.
//
// Layout:
//   levels/<id>.yaml   description, campaign|secret, then the LevelDef fields
//                      (the file stem must equal the level `id`).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import {
  LADDER_RUNGS,
  bandsFor,
  loadLadder,
  pinnedHpTuple,
  pinnedLevel,
  spawnerMobLevels,
} from "./ladder.mjs";

const levelsDir = fileURLToPath(
  new URL("../../content/levels", import.meta.url),
);

/**
 * Rebuild an object, substituting keys as `swap(key, val)` directs: return
 * `[newKey, newVal]` to rename+revalue a key IN PLACE (preserving position),
 * or a falsy value to keep it. Preserving the `ramp` slot keeps the compiled
 * key order stable, so the level snapshot stays a clean record of real changes.
 */
function withKeys(obj, swap) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const r = swap(k, v);
    if (r) out[r[0]] = r[1];
    else out[k] = v;
  }
  return out;
}

/**
 * Expand every `ramp` reference in one level's spawn points and pinned
 * set-pieces into the four-difficulty `mobLevels` / `level` + `hp` tuples the
 * engine consumes, replacing the authoring-only `ramp` key in place. Mutates
 * `def.spawners` / `def.spawns`.
 */
function expandRamps(def, ramps, hpCurves, curveName, bands, errors) {
  if (def.spawners) {
    def.spawners = def.spawners.map((s) => {
      if (s.mobLevels !== undefined)
        errors.push(
          `${def.id}: spawner${s.id ? ` "${s.id}"` : ""} hard-codes mobLevels — name a ramp instead`,
        );
      if (s.ramp === undefined) return s;
      let mobLevels;
      try {
        mobLevels = spawnerMobLevels(
          s.ramp,
          ramps,
          bands,
          `${def.id} spawner${s.id ? ` "${s.id}"` : ""}`,
        );
      } catch (e) {
        errors.push(e.message);
        return s;
      }
      return withKeys(s, (k) => k === "ramp" && ["mobLevels", mobLevels]);
    });
  }
  if (def.spawns) {
    def.spawns = def.spawns.map((s) => {
      // Only pinned set-pieces (an `at` position) carry a ramp; banded scatter
      // spawns roll the map default and never do.
      if (!(s.at && s.ramp !== undefined)) {
        if (s.at && (s.level !== undefined || Array.isArray(s.hp)))
          errors.push(
            `${def.id}: pinned spawn "${s.enemy}" hard-codes level/hp — name a ramp + base hp instead`,
          );
        return s;
      }
      if (typeof s.hp !== "number")
        errors.push(
          `${def.id}: pinned spawn "${s.enemy}" needs a single base hp number`,
        );
      const where = `${def.id} pinned spawn "${s.enemy}"`;
      let level, hp;
      try {
        level = pinnedLevel(s.ramp, ramps, bands, where);
        hp =
          typeof s.hp === "number"
            ? pinnedHpTuple(s.hp, curveName, hpCurves, where)
            : s.hp;
      } catch (e) {
        errors.push(e.message);
        return s;
      }
      return withKeys(s, (k) =>
        k === "ramp" ? ["level", level] : k === "hp" ? ["hp", hp] : undefined,
      );
    });
  }
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
  const {
    byLevel: ladder,
    ramps,
    hpCurves,
    pinnedHp,
    staminaDrain,
    staminaRefill,
    staminaEmptyLock,
    errors: ladderErrors,
  } = loadLadder();
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
    const bands = bandsFor(cells);
    if (!bands) {
      errors.push(`ladder.yaml: missing entry for level "${doc.id}"`);
    } else {
      def.mobLevels = bands;
      def.intendedLevel = LADDER_RUNGS.map((r) => cells[r].hero);
      // Expand every ramp reference into the per-difficulty tuples the engine
      // reads. Runs against the same bands the def now carries.
      const curveName = pinnedHp[doc.id] ?? pinnedHp.default ?? "standard";
      expandRamps(def, ramps, hpCurves, curveName, bands, errors);
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

  return { entries, staminaDrain, staminaRefill, staminaEmptyLock };
}
