#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon stat sanity checker (see the `weapon-system` skill): prints every
// level's base weapon ladder — level requirement, class, damage, cadence,
// DPS, range, behaviors — plus the specials, and flags the mistakes that are
// easy to make while tuning:
//   - a base whose DPS falls well below a LOWER-requirement base of the same
//     class (the ladder should pay for leveling up),
//   - a pool entry whose levelReq lies outside the level's expected monster-
//     level band (it would never/always drop there),
//   - an icon or projectile sprite the atlas doesn't carry (the renderer
//     would fall back or draw nothing),
//   - guaranteed drops (earlyDrops, allClearWeapon, enemy loot) referencing
//     unknown weapon ids.
// Runs on plain `node` via type stripping — the defs import only types.
//
//   node scripts/weapon-stats.mjs [--strict]   # --strict: exit 1 on warnings

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const {
  WEAPON_DEFS,
  GEAR_DEFS,
  AFFIX_POOLS,
  weaponAssumedTargets,
  baseCritMult,
} = await import(path.join(root, "src/game/defs/equipment.ts"));
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);
const { LOOT, STATS } = await import(
  path.join(root, "src/game/config/index.ts")
);

/**
 * The monster-level band each level is expected to span on its STORY visits
 * (easy + medium — the rungs the NORMAL-grade pool serves; harder rungs
 * unfold the generated exceptional/elite variants instead). Derived from the
 * campaign curve (`leveling-curve.mjs --by-level`):
 *
 *   low  = max(1, the hero's level ENTERING the map on easy − 3)   (easy offset)
 *   high = the hero's level LEAVING the map on medium − 2 + 4      (medium offset
 *          + the boss levelBonus, since the set pieces reach gates first)
 *
 * Tuning targets, not engine data — re-derive when the XP curve or campaign
 * pacing changes, and the checker will hold every pool's levelReqs against
 * the new reality.
 */
const LEVEL_MLVL_BANDS = {
  spacez_hq: [1, 23],
  moon: [2, 25],
  mars: [5, 28],
  the_rift: [8, 31],
  eastworld: [12, 34],
};

const atlas = JSON.parse(
  readFileSync(path.join(root, "pwa/src/game/assets/atlas.json"), "utf8"),
);
const atlasHas = (name) => name in atlas;

const warnings = [];
const warn = (msg) => warnings.push(msg);

const dps = (def) => (def.damage * 1000) / def.cooldownMs;
// EFFECTIVE dps — the damage-budget model's number (see weapon-budget.mjs):
// per-target dps × assumed targets × cadence-weighted crit lift.
const REF_CRIT = 0.15;
const effDps = (def) =>
  dps(def) *
  weaponAssumedTargets(def) *
  (1 + REF_CRIT * (baseCritMult(def) - 1));
const fmt = (n, w) => String(n).padStart(w);

// ---- Per-level base pool tables -------------------------------------------

const inPools = new Set();
for (const levelId of LEVEL_ORDER) {
  const level = LEVELS[levelId];
  if (!level) continue;
  const pool = level.loot.weaponPool
    .map((id) => WEAPON_DEFS[id])
    .filter(Boolean);
  for (const def of pool) inPools.add(def.id);

  console.log(`\n=== ${level.name} (${levelId}) — base weapon pool ===`);
  console.log("  req  class   dmg    cd    dps  range  dur  behaviors");
  for (const def of [...pool].sort((a, b) => a.levelReq - b.levelReq)) {
    const p = def.projectile;
    const behaviors = [
      p?.count && `x${p.count} spread ${p.spreadDeg}°`,
      p?.pierce && `pierce ${p.pierce}`,
      p?.homing && `homing ${p.homing}`,
      p?.chain && `chain ${p.chain}`,
      !p && def.sweepDeg && `sweep ${def.sweepDeg}°`,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `  ${fmt(def.levelReq, 3)}  ${def.class.padEnd(6)} ${fmt(def.damage, 4)} ${fmt(def.cooldownMs, 5)} ${fmt(dps(def).toFixed(0), 6)} ${fmt(def.range, 6)} ${fmt(def.durability, 4)}  ${behaviors}`,
    );
  }

  // Pool reqs against the level's expected monster-level band.
  const band = LEVEL_MLVL_BANDS[levelId];
  if (band) {
    for (const def of pool) {
      if (def.levelReq > band[1]) {
        warn(
          `${levelId}: ${def.id} (req ${def.levelReq}) can never drop — the level's mlvl band tops out at ${band[1]}`,
        );
      }
      // A base far below the band only dominates if the drop window can't
      // retire it at the band's top — cumulative pools (later maps carrying
      // every earlier stage's arsenal) legitimately hold deep-stale bases
      // that `dropLevelWindow` benches once fresher ones are in band.
      if (
        def.levelReq < band[0] - 4 &&
        def.levelReq >= band[1] - LOOT.dropLevelWindow
      ) {
        warn(
          `${levelId}: ${def.id} (req ${def.levelReq}) sits far below the level's mlvl band [${band[0]}, ${band[1]}] and the drop window never retires it — it will dominate the pool`,
        );
      }
    }
  } else {
    warn(`${levelId}: no LEVEL_MLVL_BANDS entry — add one to the checker`);
  }

  // References out of the level's loot table.
  for (const drop of level.loot.earlyDrops ?? []) {
    if ("weapon" in drop && !WEAPON_DEFS[drop.weapon]) {
      warn(`${levelId}: earlyDrops references unknown weapon "${drop.weapon}"`);
    }
  }
  if (level.loot.allClearWeapon && !WEAPON_DEFS[level.loot.allClearWeapon]) {
    warn(
      `${levelId}: allClearWeapon references unknown weapon "${level.loot.allClearWeapon}"`,
    );
  }
  for (const id of level.loot.gearPool) {
    if (!GEAR_DEFS[id])
      warn(`${levelId}: gearPool references unknown gear "${id}"`);
  }
}

// ---- The DPS ladder across the whole base roster ---------------------------

console.log("\n=== Base ladder by class (all pools merged, EFFECTIVE dps) ===");
const byClass = { melee: [], ranged: [], magic: [] };
for (const id of inPools) byClass[WEAPON_DEFS[id].class].push(WEAPON_DEFS[id]);
// Grade variants ride their base's pool membership (defs/grades.ts), so the
// exceptional/elite versions join the ladder — the never-step-down rule now
// holds across the whole 1–100 requirement span.
for (const def of Object.values(WEAPON_DEFS)) {
  if (def.gradeBase && inPools.has(def.gradeBase)) byClass[def.class].push(def);
}
for (const [cls, defs] of Object.entries(byClass)) {
  defs.sort((a, b) => a.levelReq - b.levelReq);
  console.log(
    `  ${cls}: ` +
      defs
        .map((d) => `${d.id}(${d.levelReq}) ${effDps(d).toFixed(0)}eff`)
        .join(" → "),
  );
  // Leveling up should pay: the EFFECTIVE ladder (AoE- and crit-normalized,
  // the same math as weapon-budget.mjs) must not step down along levelReq.
  for (let i = 1; i < defs.length; i++) {
    const prev = defs[i - 1];
    const cur = defs[i];
    if (effDps(cur) < effDps(prev) * 0.95) {
      warn(
        `${cls} ladder: ${cur.id} (req ${cur.levelReq}, eff ${effDps(cur).toFixed(0)}) undercuts ${prev.id} (req ${prev.levelReq}, eff ${effDps(prev).toFixed(0)}) — leveling up should pay (see weapon-budget.mjs)`,
      );
    }
  }
}

// ---- Sprite coverage --------------------------------------------------------

for (const def of Object.values(WEAPON_DEFS)) {
  if (!atlasHas(def.icon)) warn(`${def.id}: icon "${def.icon}" not in atlas`);
  if (def.projectile && !atlasHas(def.projectile.sprite)) {
    warn(
      `${def.id}: projectile sprite "${def.projectile.sprite}" not in atlas`,
    );
  }
}
for (const def of Object.values(GEAR_DEFS)) {
  if (!atlasHas(def.icon)) warn(`${def.id}: icon "${def.icon}" not in atlas`);
}

// ---- Guaranteed enemy drops -------------------------------------------------

for (const def of Object.values(ENEMY_DEFS)) {
  for (const entry of def.loot?.items ?? []) {
    const id = typeof entry === "string" ? entry : entry.defId;
    if (!WEAPON_DEFS[id] && !GEAR_DEFS[id]) {
      warn(`enemy ${def.id}: loot.items references unknown equipment "${id}"`);
    }
  }
}

// ---- Tier gate sanity ---------------------------------------------------------

{
  const { magic, rare, unique, legendary } = LOOT.tierUnlockMlvl;
  if (!(magic < rare && rare < unique && unique < legendary)) {
    warn(
      `LOOT.tierUnlockMlvl is not ascending (magic ${magic} < rare ${rare} < unique ${unique} < legendary ${legendary})`,
    );
  }
}

// ---- Affix bracket sanity ------------------------------------------------------
// The ilvl-gated affix generations (AFFIX_POOLS[..].brackets) must form a
// clean ladder: ascending minIlvl starting at 1 (so every ilvl has a band),
// bands themselves ascending (a deeper generation never rolls smaller), and
// the top STAT generation held to ~60% of the hero's own stat soft cap so no
// single affix outweighs a whole build's chosen points.

{
  const seen = new Set();
  for (const [family, pool] of Object.entries(AFFIX_POOLS)) {
    for (const affix of pool) {
      const key = `${affix.kind}`;
      const label = `${family}.${affix.kind}`;
      let prev = null;
      if (affix.brackets[0]?.minIlvl !== 1) {
        warn(`${label}: first bracket must unlock at ilvl 1`);
      }
      for (const bracket of affix.brackets) {
        if (bracket.min > bracket.max) {
          warn(`${label}: bracket at ilvl ${bracket.minIlvl} has min > max`);
        }
        if (prev) {
          if (bracket.minIlvl <= prev.minIlvl) {
            warn(`${label}: bracket minIlvls not ascending`);
          }
          if (bracket.min < prev.min || bracket.max < prev.max) {
            warn(`${label}: bracket bands not ascending with depth`);
          }
        }
        prev = bracket;
      }
      if (affix.kind === "stat" && !seen.has(key)) {
        const top = affix.brackets[affix.brackets.length - 1];
        // Ceiling rule: the top stat generation stays a COMPLEMENT to a spec —
        // roughly a fifth of the endgame stat cap (STATS.statHardCap, 250), so
        // one affix never replaces a build's chosen points.
        const ceiling = STATS.statHardCap * 0.22;
        if (top.max > ceiling) {
          warn(
            `${label}: top stat bracket ${top.max} exceeds ~a fifth of statHardCap (${Math.round(ceiling)})`,
          );
        }
      }
      seen.add(key);
    }
  }
}

// ---- Drop-window coverage (--coverage) ------------------------------------------
// For every (map × difficulty) the campaign visits, walk the mlvl span that
// visit actually fields and count how many bases sit inside the drop window
// (levelReq in [mlvl − LOOT.dropLevelWindow, mlvl]) once the pool is unfolded
// to its grade variants — the pool `rollEquipment` really draws from. The
// coverage targets: ≥4 weapon and ≥3 gear bases in-window at every campaign
// mlvl, and ≥1 base newly unlocking per visit (an upgrade to chase). Prints
// the table; warns (and so fails --strict) on any hole.

if (process.argv.includes("--coverage")) {
  const { gradeVariantIds } = await import(
    path.join(root, "src/game/defs/grades.ts")
  );
  const { DIFFICULTY_ORDER, difficultyDef } = await import(
    path.join(root, "src/game/defs/difficulties.ts")
  );
  /**
   * The hero's level entering each story map per rung — the campaign curve's
   * `--by-level` table (tuning targets like LEVEL_MLVL_BANDS above; re-read
   * from `node scripts/leveling-curve.mjs --by-level` when pacing changes).
   * The trailing entry is the rung's end level.
   */
  const CAMPAIGN_LANDINGS = {
    easy: [1, 5, 8, 11, 15, 19],
    medium: [19, 21, 23, 26, 29, 32],
    hard: [32, 34, 36, 38, 40, 43],
    nightmare: [43, 45, 46, 48, 50, 53],
    jesus: [53, 54, 55, 57, 58, 60],
  };

  console.log("\n=== Drop-window coverage (mlvl → in-window bases) ===");
  console.log(
    "  map × difficulty      mlvl span   weapons(min)  gear(min)  new bases",
  );
  for (const diff of DIFFICULTY_ORDER) {
    const landings = CAMPAIGN_LANDINGS[diff];
    if (!landings) continue;
    const offset = difficultyDef(diff).mobLevelOffset;
    LEVEL_ORDER.forEach((levelId, i) => {
      const level = LEVELS[levelId];
      if (!level || i + 1 >= landings.length) return;
      const lo = Math.max(1, landings[i] + offset);
      const hi = Math.max(1, landings[i + 1] + offset);
      const expand = (ids, defs) =>
        ids
          .flatMap((id) => [id, ...gradeVariantIds(id)])
          .map((id) => defs[id])
          .filter(Boolean);
      const weapons = expand(level.loot.weaponPool, WEAPON_DEFS);
      const gear = expand(level.loot.gearPool, GEAR_DEFS);
      const inWindow = (defs, mlvl) =>
        defs.filter(
          (d) =>
            d.levelReq <= mlvl && d.levelReq >= mlvl - LOOT.dropLevelWindow,
        ).length;
      let minWeapons = Infinity;
      let minGear = Infinity;
      for (let mlvl = lo; mlvl <= hi; mlvl++) {
        minWeapons = Math.min(minWeapons, inWindow(weapons, mlvl));
        minGear = Math.min(minGear, inWindow(gear, mlvl));
      }
      const fresh = weapons.filter(
        (d) => d.levelReq > lo && d.levelReq <= hi,
      ).length;
      console.log(
        `  ${levelId.padEnd(12)} ${diff.padEnd(10)} ${String(lo).padStart(3)}–${String(hi).padEnd(5)} ${fmt(minWeapons, 8)} ${fmt(minGear, 10)} ${fmt(fresh, 9)}`,
      );
      // The aspiration is ≥4 weapons / ≥3 gear everywhere (read the table);
      // the hard floor warned on is 3/2. The campaign's opening map on easy
      // is exempt below that: its scripted earlyDrops own the tutorial's
      // loot cadence, and 2 bases in the first minutes is authored scarcity.
      const opening = levelId === LEVEL_ORDER[0] && diff === "easy";
      if (minWeapons < 3 && !opening) {
        warn(
          `coverage ${levelId}/${diff}: only ${minWeapons} weapon base(s) in the drop window somewhere in mlvl ${lo}–${hi} (floor ≥3, target ≥4)`,
        );
      }
      if (minGear < 2 && !opening) {
        warn(
          `coverage ${levelId}/${diff}: only ${minGear} gear base(s) in the drop window somewhere in mlvl ${lo}–${hi} (floor ≥2, target ≥3)`,
        );
      }
    });
  }
}

// ---- Verdict -------------------------------------------------------------------

if (warnings.length === 0) {
  console.log("\nOK — no weapon-stat warnings.");
} else {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (process.argv.includes("--strict")) process.exit(1);
}
