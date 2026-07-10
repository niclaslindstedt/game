#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon damage-budget calculator (see the `weapon-system` skill): the tool
// that answers "what should this weapon's damage BE". Every weapon owes an
// EFFECTIVE DPS set by its level requirement; the model then works backwards
// to a per-hit damage:
//
//   effective dps = per-target dps × assumed targets × crit lift
//   assumed targets: single = 1, cone AoE = 4, full AoE = 5 (melee reads its
//     cleave cap; volleys their pellets, pierce its line, chain its leaps)
//     — so 40 eff dps means 10 dps per target on a cone or 8 on a full circle
//   crit lift = 1 + REF_CRIT × (critMult − 1), where critMult follows cadence
//     (fast 1.6 / medium 2.0 / slow 2.5 — quick blades crit light, slow
//     heavy hitters crit hard)
//   damage = budget(levelReq) × cooldown/1000 ÷ targets ÷ critLift
//
// Prints every weapon's current vs suggested damage and flags anything
// outside ±TOLERANCE. Starters and the fallback blaster are exempt (the
// difficulty ladder is calibrated on them); specials carry a premium.
//
//   node scripts/weapon-budget.mjs [--strict]   # --strict: exit 1 on drift

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { WEAPON_DEFS, weaponAssumedTargets, weaponCritMult } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { DIFFICULTY_DEFS } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);

// ---- The budget knobs — tune the whole arsenal from here -------------------

/** Effective DPS owed at levelReq L: BASE at L1, +PER_LEVEL per level. */
const BASE = 40;
const PER_LEVEL = 4;
/** Signatures/trophies (guaranteed story drops) run this much hot. */
const SPECIAL_PREMIUM = 1.15;
/** The reference crit chance the lift is priced at (a mid-build's). */
const REF_CRIT = 0.15;
/** Allowed drift from the suggestion before the checker complains. */
const TOLERANCE = 0.12;

// ---- Model ------------------------------------------------------------------

const budgetFor = (levelReq, special) =>
  (BASE + PER_LEVEL * (levelReq - 1)) * (special ? SPECIAL_PREMIUM : 1);

const critLift = (def) => 1 + REF_CRIT * (weaponCritMult(def) - 1);

const suggestedDamage = (def, special) =>
  (budgetFor(def.levelReq, special) * (def.cooldownMs / 1000)) /
  weaponAssumedTargets(def) /
  critLift(def);

const effectiveDps = (def) =>
  ((def.damage * 1000) / def.cooldownMs) *
  weaponAssumedTargets(def) *
  critLift(def);

// ---- Roster classification ----------------------------------------------------

const pooled = new Set();
for (const levelId of LEVEL_ORDER) {
  for (const id of LEVELS[levelId]?.loot.weaponPool ?? []) pooled.add(id);
}
// Grade variants (defs/grades.ts) ride their base's pool membership: pools
// author normal bases only and the engine expands the family at roll time,
// so an exceptional/elite version of a pooled base is pooled, not special.
const pooledOrBase = (def) => pooled.has(def.gradeBase ?? def.id);
// Exempt: the difficulty ladder's wall weapons (its calibration), the
// engine's unbreakable fallback sidearm (deliberately under budget), and the
// TRASH class — MOSQUE's zero-damage joke drops, which owe the budget
// nothing on purpose (they only mint via his scripted Eastworld estate).
const exempt = new Set([
  "blaster",
  "soggy_cardboard_sword",
  "busted_flamethrower",
  "cybervan_wiper",
  ...Object.values(DIFFICULTY_DEFS).map((d) => d.startingWeapon),
]);

// ---- Report -------------------------------------------------------------------

const warnings = [];
const fmt = (n, w) => String(n).padStart(w);
console.log("  req  eff-dps  budget  targets  crit  dmg  suggested   weapon");
const defs = Object.values(WEAPON_DEFS).sort(
  (a, b) => a.levelReq - b.levelReq || a.id.localeCompare(b.id),
);
for (const def of defs) {
  if (exempt.has(def.id)) {
    console.log(
      `  ${fmt(def.levelReq, 3)}  ${fmt(effectiveDps(def).toFixed(0), 7)}       —        —     —  ${fmt(def.damage, 3)}          —   ${def.id} (exempt: starter/fallback)`,
    );
    continue;
  }
  const special = !pooledOrBase(def);
  const budget = budgetFor(def.levelReq, special);
  const suggested = suggestedDamage(def, special);
  const lo = suggested * (1 - TOLERANCE);
  const hi = suggested * (1 + TOLERANCE);
  const eff = effectiveDps(def);
  const inRange = def.damage >= lo && def.damage <= hi;
  console.log(
    `  ${fmt(def.levelReq, 3)}  ${fmt(eff.toFixed(0), 7)}  ${fmt(budget.toFixed(0), 6)}  ${fmt(weaponAssumedTargets(def).toFixed(1), 7)}  ${fmt(weaponCritMult(def).toFixed(1), 4)}  ${fmt(def.damage, 3)}  ${fmt(Math.round(lo), 4)}-${String(Math.round(hi)).padEnd(4)}  ${inRange ? " " : "!"} ${def.id}${special ? " (special)" : ""}`,
  );
  if (!inRange) {
    warnings.push(
      `${def.id}: damage ${def.damage} outside budget range ${Math.round(lo)}–${Math.round(hi)} (eff ${eff.toFixed(0)} vs budget ${budget.toFixed(0)})`,
    );
  }
}

if (warnings.length === 0) {
  console.log("\nOK — every weapon sits on its damage budget.");
} else {
  console.log(`\n${warnings.length} weapon(s) off budget:`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (process.argv.includes("--strict")) process.exit(1);
}
