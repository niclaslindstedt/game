#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ITEM FORGE (see the `weapon-system` skill): the one door new items come
// through. Give it the item's SHAPE — class, level requirement, cadence,
// reach, AoE form — and it computes the numbers the balance model owes that
// shape: weapon damage ON the damage-budget line (the same math
// weapon-budget.mjs checks, so a forged item can never ship overpowered),
// armor on the per-slot catalog curve, durability from the class's
// neighbors. It prints a ready-to-paste def plus the wiring checklist
// (pools, sprites, checkers). It REFUSES to freehand: damage/armor are
// outputs here, never inputs.
//
//   node scripts/item-forge.mjs weapon --id volt_pike --class melee \
//     --req 18 --cooldown 700 --range 56 --sweep 30 [--special]
//   node scripts/item-forge.mjs weapon --id storm_carbine --class ranged \
//     --req 24 --cooldown 950 --range 240 \
//     --projectile speed=420,radius=3,lifetime=900 [--count 3 --spread 24] \
//     [--pierce 2] [--homing 0.4] [--chain 2]
//   node scripts/item-forge.mjs gear --id crystal_greaves --slot legs --req 30
//   node scripts/item-forge.mjs check        # the full checker battery
//
// The model in one line (keep in lockstep with scripts/weapon-budget.mjs):
//   damage = budget(levelReq) × cooldown/1000 ÷ assumedTargets ÷ critLift
// where budget(L) = BASE + PER_LEVEL·(L−1), assumedTargets reads the AoE
// shape (cone 4 / full-circle 5 / pellets / pierce / chain), and critLift
// prices the cadence-derived crit multiplier at the reference crit chance.
// Deeper finds of the forged base then grow via WEAPON.damagePerIlvl /
// ARMOR.armorPerIlvl and the ilvl-gated affix brackets — the instance
// scaling is the drop system's job, the FORGE only authors the level-req
// baseline.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { WEAPON_DEFS, GEAR_DEFS, weaponAssumedTargets, weaponCritMult } =
  await import(path.join(root, "src/game/defs/equipment.ts"));

// ---- Budget knobs — MUST match scripts/weapon-budget.mjs -------------------

const BASE = 40;
const PER_LEVEL = 4;
const SPECIAL_PREMIUM = 1.15;
const REF_CRIT = 0.15;

// ---- CLI --------------------------------------------------------------------

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

if (mode === "check") {
  // The full battery: everything that holds the item model honest, in one
  // command. Any failure exits non-zero — run this before every item PR.
  const battery = [
    ["scripts/weapon-budget.mjs", ["--strict"]],
    ["scripts/weapon-stats.mjs", ["--coverage", "--strict"]],
    ["scripts/weapon-ilvl.mjs", ["--check"]],
    ["scripts/unique-check.mjs", []],
  ];
  let failed = false;
  for (const [script, extra] of battery) {
    console.log(`\n══ ${script} ${extra.join(" ")}`);
    try {
      execFileSync("node", [path.join(root, script), ...extra], {
        stdio: "inherit",
      });
    } catch {
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

if (mode !== "weapon" && mode !== "gear") {
  console.error(
    "usage: item-forge.mjs weapon|gear|check [--options]  (header comment has the recipes)",
  );
  process.exit(1);
}

const id = opt("id");
const req = Number(opt("req"));
if (!id || !Number.isFinite(req) || req < 1) {
  console.error("need --id <snake_case> and --req <levelReq ≥ 1>");
  process.exit(1);
}
if (WEAPON_DEFS[id] || GEAR_DEFS[id]) {
  console.error(`id "${id}" already exists in the catalog`);
  process.exit(1);
}
const name = id.replaceAll("_", " ").toUpperCase();

if (mode === "weapon") {
  const cls = opt("class");
  const cooldownMs = Number(opt("cooldown"));
  const range = Number(opt("range"));
  if (!["melee", "ranged", "magic"].includes(cls ?? "")) {
    console.error("need --class melee|ranged|magic");
    process.exit(1);
  }
  if (!Number.isFinite(cooldownMs) || !Number.isFinite(range)) {
    console.error("need --cooldown <ms> and --range <world px>");
    process.exit(1);
  }

  // Build the candidate def the shared model functions read.
  const candidate = { id, name, class: cls, levelReq: req, cooldownMs, range };
  if (cls === "melee") {
    const sweep = Number(opt("sweep", "120"));
    candidate.sweepDeg = sweep;
  } else {
    const projSpec = opt("projectile");
    if (!projSpec) {
      console.error(
        "ranged/magic need --projectile speed=420,radius=3,lifetime=900",
      );
      process.exit(1);
    }
    const proj = Object.fromEntries(
      projSpec.split(",").map((kv) => kv.split("=").map((s) => s.trim())),
    );
    candidate.projectile = {
      speed: Number(proj.speed),
      radius: Number(proj.radius),
      lifetimeMs: Number(proj.lifetime ?? proj.lifetimeMs),
      sprite: opt("sprite", "bolt"),
    };
    for (const [key, prop] of [
      ["count", "count"],
      ["spread", "spreadDeg"],
      ["pierce", "pierce"],
      ["homing", "homing"],
      ["chain", "chain"],
    ]) {
      const value = opt(key);
      if (value !== undefined) candidate.projectile[prop] = Number(value);
    }
  }

  // THE BUDGET LINE — damage is an OUTPUT. This is the whole point.
  const special = flag("special");
  const budget = (BASE + PER_LEVEL * (req - 1)) * (special ? SPECIAL_PREMIUM : 1);
  const targets = weaponAssumedTargets(candidate);
  const lift = 1 + REF_CRIT * (weaponCritMult(candidate) - 1);
  const damage = Math.max(
    1,
    Math.round((budget * (cooldownMs / 1000)) / targets / lift),
  );

  // Durability from the class's catalog neighbors (median inside ±6 req).
  const neighbors = Object.values(WEAPON_DEFS)
    .filter(
      (d) =>
        d.class === cls &&
        d.durability !== undefined &&
        Math.abs(d.levelReq - req) <= 6,
    )
    .map((d) => d.durability)
    .sort((a, b) => a - b);
  const durability =
    neighbors.length > 0
      ? neighbors[Math.floor(neighbors.length / 2)]
      : 150;

  const lines = [
    `  ${id}: {`,
    `    id: "${id}",`,
    `    name: "${name}",`,
    `    class: "${cls}",`,
    `    levelReq: ${req},`,
    `    // Forged on the damage-budget line (item-forge.mjs): ${budget.toFixed(0)} eff dps`,
    `    // at req ${req} ÷ ${targets} assumed target(s) ÷ ${lift.toFixed(2)} crit lift.`,
    `    damage: ${damage},`,
    `    cooldownMs: ${cooldownMs},`,
    `    range: ${range},`,
    `    durability: ${durability},`,
  ];
  if (candidate.sweepDeg !== undefined) {
    lines.push(`    sweepDeg: ${candidate.sweepDeg},`);
  }
  if (candidate.projectile) {
    const p = candidate.projectile;
    const extras = ["count", "spreadDeg", "pierce", "homing", "chain"]
      .filter((k) => p[k] !== undefined)
      .map((k) => `, ${k}: ${p[k]}`)
      .join("");
    lines.push(
      `    projectile: { speed: ${p.speed}, radius: ${p.radius}, lifetimeMs: ${p.lifetimeMs}, sprite: "${p.sprite}"${extras} },`,
    );
  }
  lines.push("  },");

  console.log("\n── Forged weapon def (paste into src/game/defs/equipment.ts):\n");
  console.log(lines.join("\n"));
  console.log(`
── Wiring checklist:
  1. Add "${id}" to a level's loot.weaponPool (cumulative pools: later maps
     inherit it automatically) — its grade variants unfold on their own.
  2. Name its EXCEPTIONAL/ELITE variants in src/game/defs/grades.ts.
  3. Icon (12×12) in website/scripts/sprite-data/icons.mjs${candidate.projectile ? ` and the
     projectile sprite (8×8) in effects.mjs` : ""}; then \`make assets\` and LOOK.
  4. node scripts/item-forge.mjs check   # the full battery must stay green.`);
  process.exit(0);
}

// ---- gear -------------------------------------------------------------------

const slot = opt("slot");
if (!["head", "chest", "legs", "feet", "charm", "bag"].includes(slot ?? "")) {
  console.error("need --slot head|chest|legs|feet|charm|bag");
  process.exit(1);
}

// Armor is an OUTPUT: fit the per-slot catalog line (armor vs levelReq over
// the authored bases) and read the forged piece's armor off it, so a new
// piece lands ON the slot's curve instead of above it.
const peers = Object.values(GEAR_DEFS).filter(
  (d) => d.slot === slot && (d.armor ?? 0) > 0 && d.levelReq !== undefined,
);
let armor = 0;
if (peers.length >= 2 && slot !== "charm" && slot !== "bag") {
  const n = peers.length;
  const sx = peers.reduce((s, d) => s + d.levelReq, 0);
  const sy = peers.reduce((s, d) => s + d.armor, 0);
  const sxx = peers.reduce((s, d) => s + d.levelReq * d.levelReq, 0);
  const sxy = peers.reduce((s, d) => s + d.levelReq * d.armor, 0);
  const denom = n * sxx - sx * sx;
  const b = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / n;
  armor = Math.max(1, Math.round(a + b * req));
}

const durability = slot === "charm" || slot === "bag" ? undefined : 60;

console.log("\n── Forged gear def (paste into src/game/defs/gear.ts):\n");
console.log(`  ${id}: {
    id: "${id}",
    name: "${name}",
    slot: "${slot}",
    levelReq: ${req},${
      armor > 0
        ? `
    // Forged on the ${slot} slot's catalog armor line (item-forge.mjs).
    armor: ${armor},`
        : ""
    }${
      durability !== undefined
        ? `
    durability: ${durability},`
        : ""
    }
  },`);
console.log(`
── Wiring checklist:
  1. Add "${id}" to a level's loot.gearPool (later maps inherit it).
  2. Grade-variant names in src/game/defs/grades.ts if the slot has them.
  3. Icon (12×12) in website/scripts/sprite-data/icons.mjs; \`make assets\`.
  4. node scripts/item-forge.mjs check   # the full battery must stay green.`);
