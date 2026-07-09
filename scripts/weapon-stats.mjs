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

const { WEAPON_DEFS, GEAR_DEFS, weaponAssumedTargets, weaponCritMult } =
  await import(path.join(root, "src/game/defs/equipment.ts"));
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);
const { LOOT } = await import(path.join(root, "src/game/config.ts"));

/**
 * The monster-level band each level is expected to span (player level + the
 * medium offset, opening → boss). Tuning targets, not engine data — update
 * when the XP curve or campaign pacing changes, and the checker will hold
 * every pool's levelReqs against the new reality.
 */
const LEVEL_MLVL_BANDS = {
  spacez_hq: [1, 8],
  moon: [4, 14],
  mars: [9, 20],
  the_rift: [13, 28],
};

const atlas = JSON.parse(
  readFileSync(path.join(root, "website/src/game/assets/atlas.json"), "utf8"),
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
  (1 + REF_CRIT * (weaponCritMult(def) - 1));
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
      if (def.levelReq < band[0] - 4) {
        warn(
          `${levelId}: ${def.id} (req ${def.levelReq}) sits far below the level's mlvl band [${band[0]}, ${band[1]}] — it will dominate the pool`,
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

// ---- Verdict -------------------------------------------------------------------

if (warnings.length === 0) {
  console.log("\nOK — no weapon-stat warnings.");
} else {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (process.argv.includes("--strict")) process.exit(1);
}
