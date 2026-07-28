// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAMPAIGN LADDER, read once and shared.
//
// `content/ladder.yaml` is the hand-authored source of truth for how tough each
// map is on each rung: the per-[difficulty × map] `hero` anchor and `mob:
// [start, end]` band, the named RAMPS a spawn point or a set piece places itself
// at within that band, the hp curves a pinned base hp is scaled by, and the three
// stamina ladders.
//
// Two pipelines resolve ramps against it — the hand-authored level loader
// (`load-yaml.mjs`) and the map-blueprint loader (`../map-data/load-yaml.mjs`) —
// and a ramp must mean the SAME level on a generated map as on the authored one,
// or the two would drift apart the first time the ladder is trimmed. So the
// reading and the expansion live here, in one module both import, rather than
// being copied into the second pipeline.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const ladderPath = fileURLToPath(
  new URL("../../content/ladder.yaml", import.meta.url),
);

/**
 * The non-JESUS ladder rungs, in `DifficultyMobLevels` order. JESUS is omitted
 * from the ladder — it stays player-relative.
 */
export const LADDER_RUNGS = ["easy", "medium", "hard", "nightmare"];

/**
 * Every rung the STAMINA ladders must price, JESUS included — they are pure
 * difficulty knobs (how fast a run spends the pool, how long a breather takes),
 * not level-relative bands, so unlike the per-map cells they have no reason to
 * skip the top rung.
 */
const STAMINA_RUNGS = [...LADDER_RUNGS, "jesus"];

/**
 * Read one per-rung ladder of positive numbers that must never DECREASE as the
 * difficulty climbs (see the stamina ladders in `ladder.yaml`). Pushes a
 * message onto `errors` for every rung that is missing, unusable, or gentler
 * than the rung below it.
 */
function readClimbingLadder(doc, key, errors) {
  const out = {};
  const raw = doc[key];
  if (typeof raw !== "object" || raw === null) {
    errors.push(`ladder.yaml: missing \`${key}\` catalog`);
    return out;
  }
  let prev = -Infinity;
  let prevRung = "";
  for (const rung of STAMINA_RUNGS) {
    const value = raw[rung];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      errors.push(
        `ladder.yaml: ${key}.${rung} must be a positive number, got ${JSON.stringify(value)}`,
      );
      continue;
    }
    if (value < prev) {
      errors.push(
        `ladder.yaml: ${key}.${rung} (${value}) is gentler than ${prevRung} (${prev}) — the ladder must not ease as it climbs`,
      );
    }
    out[rung] = value;
    prev = value;
    prevRung = rung;
  }
  return out;
}

/**
 * Load the campaign LADDER (`ladder.yaml`): the per-[difficulty × map] `hero`
 * anchor + `mob: [start, end]` band, plus the shared RAMP catalog, hp curves,
 * and per-map hp-curve selection. This is the single source of truth both the
 * engine pipelines and the map tooling read — the numbers live here, not copied
 * into every level or blueprint file.
 *
 * @returns `{ byLevel, ramps, hpCurves, pinnedHp, staminaDrain, staminaRefill,
 *   staminaEmptyLock, errors }` where `byLevel[id]` maps each rung to its
 *   `{ hero, mob }` cell, `staminaDrain` maps every rung (JESUS included) to its
 *   sprint-pool drain multiplier, `staminaRefill` to the seconds a full
 *   standstill breather takes there, and `staminaEmptyLock` to the seconds of
 *   dead-still a dry pool owes before regen resumes.
 */
export function loadLadder() {
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
  // STAMINA — the whole duty cycle, one ladder per term: how fast a run SPENDS
  // the pool, how many seconds a standstill breather takes to REFILL it, and
  // the seconds of dead-still LOCKOUT a dry pool owes before regen resumes.
  const staminaDrain = readClimbingLadder(doc, "staminaDrain", errors);
  const staminaRefill = readClimbingLadder(doc, "staminaRefill", errors);
  const staminaEmptyLock = readClimbingLadder(doc, "staminaEmptyLock", errors);
  return {
    byLevel,
    ramps,
    hpCurves,
    pinnedHp,
    staminaDrain,
    staminaRefill,
    staminaEmptyLock,
    errors,
  };
}

/**
 * The per-rung `[start, end]` mob band for one level, or null if the ladder has
 * no entry for it.
 */
export function bandsFor(cells) {
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
export function spawnerMobLevels(name, ramps, bands, where) {
  return rampOffsets(name, ramps, bands, where).map(({ base, off, banded }) => {
    const lo = Math.max(1, base + off);
    return banded ? [lo, Math.max(lo, base + off + 1)] : lo;
  });
}

/** A pinned set-piece's level: the single value base+off per rung. */
export function pinnedLevel(name, ramps, bands, where) {
  return rampOffsets(name, ramps, bands, where).map(({ base, off }) =>
    Math.max(1, base + off),
  );
}

/** Scale a pinned base hp across the four rungs by the map's named hp curve. */
export function pinnedHpTuple(base, curveName, hpCurves, where) {
  const curve = hpCurves[curveName];
  if (!curve) throw new Error(`${where}: unknown hp curve "${curveName}"`);
  return curve.map((m) => Math.round(base * m));
}
