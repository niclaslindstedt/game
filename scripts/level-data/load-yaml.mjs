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

const levelsDir = fileURLToPath(
  new URL("../../content/levels", import.meta.url),
);
const ladderPath = fileURLToPath(
  new URL("../../content/ladder.yaml", import.meta.url),
);

// The non-JESUS ladder rungs, in `DifficultyMobLevels` order. JESUS is omitted
// from the ladder — it stays player-relative.
const LADDER_RUNGS = ["easy", "medium", "hard", "nightmare"];

/**
 * Load the campaign LADDER (`ladder.yaml`): the per-[difficulty × map] `hero`
 * anchor + `mob: [start, end]` band, plus the shared RAMP catalog, hp curves,
 * and per-map hp-curve selection. This is the single source of truth both the
 * engine pipeline and the map tooling read — the numbers live here, not copied
 * into every level file.
 *
 * @returns `{ byLevel, ramps, hpCurves, pinnedHp, errors }` where `byLevel[id]`
 *   maps each rung to its `{ hero, mob }` cell.
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
  const ramps = doc.ramps ?? {};
  const hpCurves = doc.hpCurves ?? {};
  const pinnedHp = doc.pinnedHp ?? { default: "standard" };
  if (Object.keys(ramps).length === 0)
    errors.push("ladder.yaml: missing `ramps` catalog");
  return { byLevel, ramps, hpCurves, pinnedHp, errors };
}

/**
 * The per-rung `[start, end]` mob band for one level, or null if the ladder has
 * no entry for it.
 */
function bandsFor(cells) {
  if (!cells || LADDER_RUNGS.some((r) => !cells[r])) return null;
  return LADDER_RUNGS.map((r) => cells[r].mob);
}

/**
 * Resolve a named ramp to its four per-difficulty offsets, each `{ base, off,
 * banded }` where `base` is that rung's band start or end. Throws on an unknown
 * ramp.
 */
function rampOffsets(name, ramps, bands, where) {
  const spec = ramps[name];
  if (!spec) throw new Error(`${where}: unknown ramp "${name}"`);
  const anchor = spec.fromStart !== undefined ? "start" : "end";
  const raw = spec.fromStart ?? spec.fromEnd;
  if (raw === undefined)
    throw new Error(`ladder.yaml: ramp "${name}" needs fromStart or fromEnd`);
  return LADDER_RUNGS.map((_, i) => {
    const [start, end] = bands[i];
    const off = Array.isArray(raw) ? raw[i] : raw;
    return {
      base: anchor === "start" ? start : end,
      off,
      banded: !Array.isArray(raw),
    };
  });
}

/** A spawn point's mobLevels: the two-wide band [base+off, base+off+1] per rung. */
function spawnerMobLevels(name, ramps, bands, where) {
  return rampOffsets(name, ramps, bands, where).map(({ base, off, banded }) => {
    const lo = Math.max(1, base + off);
    return banded ? [lo, Math.max(lo, base + off + 1)] : lo;
  });
}

/** A pinned set-piece's level: the single value base+off per rung. */
function pinnedLevel(name, ramps, bands, where) {
  return rampOffsets(name, ramps, bands, where).map(({ base, off }) =>
    Math.max(1, base + off),
  );
}

/** Scale a pinned base hp across the four rungs by the map's named hp curve. */
function pinnedHpTuple(base, curveName, hpCurves, where) {
  const curve = hpCurves[curveName];
  if (!curve) throw new Error(`${where}: unknown hp curve "${curveName}"`);
  return curve.map((m) => Math.round(base * m));
}

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

  return { entries };
}
