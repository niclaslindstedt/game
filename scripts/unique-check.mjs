#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UNIQUE item authoring checker (see the `weapon-system` skill, "Unique items").
// Uniques are hand-authored named drops (`src/game/defs/uniques.ts`): a FIXED
// bonus block on a REAL catalog base. The one mistake that bites hardest while
// authoring is naming a base that doesn't exist — the generated grade variants
// (`grades.ts`) live in the runtime records but NOT in source, so a grep lies —
// and the def then throws only at mint/test time, far from where you wrote it.
// This script catches that (and the other silent authoring slips) up front, and
// doubles as the base PICKER (`--bases`) and re-base pass (`--suggest`) so you
// never have to guess a base id.
//
// Checks (ERROR = broken, WARN = smell):
//   - every `base` resolves in the runtime weapon/gear catalog; slot agrees with
//     the base (weapon uniques on weapon bases, gear uniques in the base's slot);
//   - at most ONE scaling bonus (statPct/maxHpPct) per item, and each within the
//     engine mint clamp (config UNIQUE.scalingPctCap);
//   - the equip level (the base's `levelReq`) sits ~EQUIP_GAP below the ilvl —
//     never above, and not so far below the base under-armors the ilvl;
//   - within a GEAR slot, base armor climbs with ilvl, so a higher-ilvl unique
//     never feels weaker than a lower one (weapons are class-dependent, so they
//     get an eyeball ladder, not a hard check);
//   - the boss drop tables (`EnemyDef.uniquesByDifficulty`) place every shipped
//     unique exactly once, each rung carries a full set, and the set pieces
//     form a slot Latin square (each difficulty = one of every gear slot).
//
// Runs on plain `node` via type stripping — the defs import only types/values,
// no DOM.
//
//   node scripts/unique-check.mjs            # full report, exit 1 on ERROR
//   node scripts/unique-check.mjs --strict   # exit 1 on WARN too
//   node scripts/unique-check.mjs --bases [slot]     # base picker (real ids)
//   node scripts/unique-check.mjs --suggest [slot]   # req≈ilvl−20 pick per unique

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { WEAPON_DEFS, GEAR_DEFS, isWeaponDef } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);
const { UNIQUE_DEFS, UNIQUE_IDS } = await import(
  path.join(root, "src/game/defs/uniques.ts")
);
const { ENEMY_DEFS } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);
const { LEVELS } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { WORLD_DROP } = await import(path.join(root, "src/game/config.ts"));
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);
const { UNIQUE } = await import(path.join(root, "src/game/config.ts"));
// The ilvl model is OWNED by weapon-ilvl.mjs (ilvl = levelReq + bonusBudget, each
// bonus priced off the LIVE combat constants). We reference it here rather than
// re-deriving ilvl, so the two scripts can never disagree on what a unique's ilvl
// is or whether it's over-powered for its equip gate.
const { ilvlOf } = await import(path.join(root, "scripts/weapon-ilvl.mjs"));

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");

// Set pieces sit in the weapon+armor Latin square; bags/charms ride along as
// the rung's trinket (MUSKRAT's bag, GROK's charm).
const SET_SLOTS = ["weapon", "head", "chest", "legs", "feet"];
const TRINKET_SLOTS = ["bag", "charm"];

// ---- Tuning knobs (the repeatable base-selection math) ----------------------
// A unique equips ~EQUIP_GAP levels below its ilvl: pick a base whose levelReq ≈
// ilvl − EQUIP_GAP. That single rule sets BOTH the equip gate and the armor,
// because a higher-req base is a higher grade (more armor / budget dps). The
// gap check warns only when a base is more than GAP_SLACK below that target
// (equips absurdly early AND under-armors the ilvl); a looser gap is fine.
const EQUIP_GAP = 20;
const GAP_SLACK = 15;
// Trinkets carry no armor and their bases top out at req ~20, so charms and bags
// legitimately gate low — exempt them from the equip-gap rule.
const GAP_EXEMPT = new Set(TRINKET_SLOTS);
// Starter/fallback/street-clothes bases stay out of suggestions — they're the
// seed stock and the unbreakable sidearm, not unique material (a low-ilvl
// unique may still be hand-authored onto one, e.g. a fang dagger on combat_knife).
const SEED_BASES = new Set([
  "blaster",
  "stick",
  "brass_knuckles",
  "box_cutter",
  "medieval_sword",
  "hairy_potters_wand",
  "combat_knife",
  "security_baton",
  "t_shirt",
  "jeans",
  "leather_boots",
  "baseball_cap",
  "bag",
]);

const levelReqOf = (base) =>
  (isWeaponDef(base) ? WEAPON_DEFS[base] : GEAR_DEFS[base])?.levelReq ?? 1;
// Gear armor is fixed by the base (uniques don't grow armor with ilvl), so a
// higher-ilvl gear unique on a lower-armor base is strictly weaker — that's the
// monotonicity we hold. Weapons aren't comparable this way (an AoE flamethrower
// deals less per hit than a single-target maul BY DESIGN — see weapon-budget),
// so weapons get a printed ladder to eyeball, not a warn.
const armorOf = (base) => GEAR_DEFS[base]?.armor ?? 0;
const dpsOf = (base) => {
  const w = WEAPON_DEFS[base];
  return w ? Math.round((w.damage * 1000) / w.cooldownMs) : 0;
};
const powerStr = (slot, base) =>
  slot === "weapon" ? `${dpsOf(base)}dps` : `${armorOf(base)}armor`;

// Every real base in a slot (grade variants included), minus the seed stock.
const basesInSlot = (slot) => {
  const src =
    slot === "weapon"
      ? Object.values(WEAPON_DEFS).map((d) => ({
          id: d.id,
          slot: "weapon",
          req: d.levelReq ?? 1,
        }))
      : Object.values(GEAR_DEFS).map((d) => ({
          id: d.id,
          slot: d.slot,
          req: d.levelReq ?? 1,
        }));
  return src.filter((b) => b.slot === slot && !SEED_BASES.has(b.id));
};

// The repeatable base-selection math: the in-slot bases closest to the target
// levelReq (ilvl − EQUIP_GAP), best-armor/dps first on ties. The caller picks
// the on-theme one among the top few (weapon fantasy often trumps a rung of req).
const suggestBases = (slot, ilvl, n = 4) => {
  const target = Math.max(1, ilvl - EQUIP_GAP);
  const power = (b) => (slot === "weapon" ? dpsOf(b.id) : armorOf(b.id));
  return basesInSlot(slot)
    .map((b) => ({ ...b, d: Math.abs(b.req - target) }))
    .sort((a, b) => a.d - b.d || power(b) - power(a))
    .slice(0, n);
};

// ---- The base picker (authoring aid) ---------------------------------------

if (argv.includes("--bases")) {
  const only = argv.find((a) => !a.startsWith("--"));
  const rows = [];
  for (const [id, d] of Object.entries(WEAPON_DEFS))
    rows.push({
      slot: "weapon",
      id,
      req: d.levelReq ?? 1,
      power: d.damage ?? 0,
      unit: "dmg",
    });
  for (const [id, d] of Object.entries(GEAR_DEFS))
    rows.push({
      slot: d.slot,
      id,
      req: d.levelReq ?? 1,
      power: d.armor ?? 0,
      unit: d.slot === "bag" ? `bag+${d.bagSlots ?? 0}` : "armor",
    });
  const slots = only
    ? [only]
    : ["weapon", ...SET_SLOTS.slice(1), "charm", "bag"];
  console.log("REAL bases — author uniques on these ids only:\n");
  for (const slot of [...new Set(slots)]) {
    const inSlot = rows
      .filter((r) => r.slot === slot)
      .sort((a, b) => a.req - b.req);
    if (!inSlot.length) continue;
    console.log(`  ${slot.toUpperCase()}`);
    for (const r of inSlot)
      console.log(
        `    req${String(r.req).padStart(3)}  ${r.id.padEnd(22)} ${r.unit} ${r.power}`,
      );
    console.log("");
  }
  console.log(
    `Pick a base whose req ≈ ilvl−${EQUIP_GAP} (uniques equip ~${EQUIP_GAP} levels below\n` +
      "ilvl); higher-ilvl uniques take higher-grade (higher-req) bases so they feel\n" +
      "stronger. `--suggest` does this pick for every unique.",
  );
  process.exit(0);
}

// ---- Suggest bases for every unique (the repeatable re-base pass) -----------

if (argv.includes("--suggest")) {
  const only = argv.find((a) => !a.startsWith("--"));
  console.log(
    `Suggested bases (req ≈ ilvl−${EQUIP_GAP}); pick the on-theme candidate:\n`,
  );
  for (const id of UNIQUE_IDS) {
    const u = UNIQUE_DEFS[id];
    if (only && u.slot !== only) continue;
    if (GAP_EXEMPT.has(u.slot)) continue; // trinkets gate at 1 by design
    const cands = suggestBases(u.slot, u.ilvl)
      .map((b) => `${b.id}(r${b.req},${powerStr(u.slot, b.id)})`)
      .join("  ");
    const curReq = levelReqOf(u.base);
    const flag =
      curReq < u.ilvl - EQUIP_GAP - GAP_SLACK ? " ⚠ under-grade" : "";
    console.log(
      `  ${id.padEnd(20)} ${u.slot.padEnd(6)} ilvl${String(u.ilvl).padStart(3)}  ` +
        `now=${u.base}(r${curReq},${powerStr(u.slot, u.base)})${flag}`,
    );
    console.log(`      → ${cands}`);
  }
  process.exit(0);
}

// ---- The checks -------------------------------------------------------------

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// 1) Base integrity + slot agreement + bonus discipline + equip gap.
for (const id of UNIQUE_IDS) {
  const u = UNIQUE_DEFS[id];
  const base = u.base;
  const known = base in WEAPON_DEFS || base in GEAR_DEFS;
  if (!known) {
    err(
      `${id}: base "${base}" does not exist — pick a real id (--bases ${u.slot}).`,
    );
    continue;
  }
  const weapon = isWeaponDef(base);
  if (weapon !== (u.slot === "weapon"))
    err(
      `${id}: slot "${u.slot}" disagrees with base "${base}" (${weapon ? "a weapon" : "gear"}).`,
    );
  if (!weapon && GEAR_DEFS[base].slot !== u.slot)
    err(
      `${id}: slot "${u.slot}" ≠ base "${base}" slot "${GEAR_DEFS[base].slot}".`,
    );

  const scaling = u.bonuses.filter(
    (b) => b.kind === "statPct" || b.kind === "maxHpPct",
  );
  if (scaling.length > 1)
    err(
      `${id}: ${scaling.length} scaling bonuses — at most ONE statPct/maxHpPct per unique.`,
    );
  for (const s of scaling)
    if (s.value > UNIQUE.scalingPctCap) {
      err(
        `${id}: scaling bonus ${s.value} > ${UNIQUE.scalingPctCap} cap (UNIQUE.scalingPctCap).`,
      );
    }

  // ilvl integrity + power budget — DELEGATED to the shared model in
  // weapon-ilvl.mjs (the source of truth for what ilvl means). It prices every
  // bonus off the LIVE combat constants, so this one call catches both a unique
  // whose authored ilvl drifted from its computed value AND one whose bonus
  // budget is over-powered for the equip gate its base sets. The equip-gap
  // heuristic this replaced (req ≈ ilvl − 20) is now the base picker's job only.
  const m = ilvlOf(u);
  if (m.drift !== 0)
    warn(
      `${id}: authored ilvl ${u.ilvl} ≠ computed ${m.computed} — re-author it (weapon-ilvl.mjs --suggest).`,
    );
  if (m.overBudget)
    warn(
      `${id}: bonus budget ${m.budget.toFixed(1)} > cap ${m.cap.toFixed(1)} for req ${m.req} ` +
        `— over-powered for its equip gate (weapon-ilvl.mjs --check).`,
    );
}

// 2) Armor monotonicity per gear slot: sort by ilvl, base armor must not step
//    down (fixed-armor uniques get strictly worse otherwise).
const bySlot = {};
for (const id of UNIQUE_IDS) (bySlot[UNIQUE_DEFS[id].slot] ??= []).push(id);
for (const slot of ["head", "chest", "legs", "feet"]) {
  const rows = (bySlot[slot] ?? [])
    // Keepers are exempt: their computed ilvl is inflated by a SCALING stat, not
    // armor, so a keeper legitimately carries less armor than a lower-ilvl piece
    // (comparing them on armor is meaningless — that's the point of a keeper).
    .filter((id) => !UNIQUE_DEFS[id].keeper)
    .map((id) => ({
      id,
      ilvl: ilvlOf(UNIQUE_DEFS[id]).computed, // the derived ilvl, not the authored one
      armor: armorOf(UNIQUE_DEFS[id].base),
    }))
    .sort((a, b) => a.ilvl - b.ilvl);
  for (let i = 1; i < rows.length; i++)
    if (rows[i].armor < rows[i - 1].armor)
      warn(
        `${slot}: ${rows[i].id} (ilvl ${rows[i].ilvl}, ${rows[i].armor} armor) is weaker than ` +
          `lower-ilvl ${rows[i - 1].id} (ilvl ${rows[i - 1].ilvl}, ${rows[i - 1].armor} armor) ` +
          `— give it a higher-grade base.`,
      );
}

// 3) Drop-table coverage: every unique placed once, full set per rung, Latin
//    square over the set pieces.
const placements = [];
for (const def of Object.values(ENEMY_DEFS)) {
  const table = def.uniquesByDifficulty;
  if (!table) continue;
  for (const [diff, ids] of Object.entries(table)) {
    if (!DIFFICULTY_ORDER.includes(diff))
      err(`boss "${def.id}": "${diff}" is not a real difficulty rung.`);
    for (const id of ids ?? []) {
      if (!(id in UNIQUE_DEFS))
        err(`boss "${def.id}" [${diff}]: wires unknown unique "${id}".`);
      placements.push({ boss: def.id, diff, id, slot: UNIQUE_DEFS[id]?.slot });
    }
  }
}
// World-drop placements: uniques wired on a LEVEL (`loot.worldUniques`) instead
// of a boss. A relic lives in exactly ONE home — either a boss table OR a level
// world table, never both — so both universes count toward "placed once".
const worldPlacements = [];
for (const def of Object.values(LEVELS)) {
  const table = def.loot.worldUniques;
  if (!table) continue;
  for (const [diff, ids] of Object.entries(table)) {
    if (!DIFFICULTY_ORDER.includes(diff))
      err(`level "${def.id}": "${diff}" is not a real difficulty rung.`);
    for (const id of ids ?? []) {
      if (!(id in UNIQUE_DEFS))
        err(`level "${def.id}" [${diff}]: wires unknown world unique "${id}".`);
      worldPlacements.push({
        level: def.id,
        diff,
        id,
        slot: UNIQUE_DEFS[id]?.slot,
      });
    }
  }
}

// Merchant-stall placements: uniques a level's trader SELLS instead of any
// mob dropping them (`LevelDef.merchant.stockUniques` — Eastworld's PUTAIN
// estate). The third home kind; still exactly one home per unique.
const stallPlacements = [];
for (const def of Object.values(LEVELS)) {
  for (const id of def.merchant?.stockUniques ?? []) {
    if (!(id in UNIQUE_DEFS))
      err(`level "${def.id}" stall: wires unknown unique "${id}".`);
    stallPlacements.push({ level: def.id, id, slot: UNIQUE_DEFS[id]?.slot });
  }
}

// Every unique has exactly ONE primary home (a boss table, its world-drop
// level, or a merchant stall). A WORLD unique may ALSO be re-listed by other
// levels as extra WORLD homes — the FARM-VENUE rule: the bunker deliberately
// re-lists earlier relics at sweetened odds so it reads as the endgame farm
// (see its worldUniques comment). Boss and stall homes never repeat.
const primaryCount = {};
for (const p of [...placements, ...stallPlacements])
  primaryCount[p.id] = (primaryCount[p.id] ?? 0) + 1;
const worldCount = {};
for (const p of worldPlacements)
  worldCount[p.id] = (worldCount[p.id] ?? 0) + 1;
for (const id of UNIQUE_IDS) {
  const primary = primaryCount[id] ?? 0;
  const world = worldCount[id] ?? 0;
  if (primary + world === 0)
    err(
      `${id}: shipped but wired to no boss, level, or stall — it can never drop.`,
    );
  else if (primary > 1)
    err(
      `${id}: wired to ${primary} boss/stall homes — those never repeat (farm venues are world tables only).`,
    );
  else if (primary === 1 && world > 0)
    err(
      `${id}: wired to a boss/stall home AND ${world} world table(s) — pick one kind.`,
    );
}

// Latin square: each difficulty column must be a permutation of the 5 set slots.
const grid = {}; // boss -> diff -> slot (set pieces only)
for (const p of placements) {
  if (!SET_SLOTS.includes(p.slot)) continue;
  (grid[p.boss] ??= {})[p.diff] ??= p.slot;
}
for (const diff of DIFFICULTY_ORDER) {
  const slots = Object.values(grid)
    .map((row) => row[diff])
    .filter(Boolean);
  const missing = SET_SLOTS.filter((s) => !slots.includes(s));
  if (slots.length && missing.length)
    warn(
      `rung "${diff}": set is missing slot(s) ${missing.join(", ")} — not a full boss set.`,
    );
}

// ---- Report -----------------------------------------------------------------

// Coverage grid: bosses × difficulties, showing each cell's slot piece(s).
const bosses = [...new Set(placements.map((p) => p.boss))];
console.log("Boss unique drop grid (set piece + trinket per rung):\n");
const cell = (boss, diff) => {
  const here = placements.filter((p) => p.boss === boss && p.diff === diff);
  const set = here.find((p) => SET_SLOTS.includes(p.slot));
  const trink = here.find((p) => TRINKET_SLOTS.includes(p.slot));
  return [set?.slot ?? "—", trink ? `+${trink.slot}` : ""].join(" ").trim();
};
const head = [
  "boss".padEnd(18),
  ...DIFFICULTY_ORDER.map((d) => d.padEnd(14)),
].join("");
console.log("  " + head);
for (const boss of bosses)
  console.log(
    "  " +
      [
        boss.padEnd(18),
        ...DIFFICULTY_ORDER.map((d) => cell(boss, d).padEnd(14)),
      ].join(""),
  );

// World-drop grid: level × difficulty, the level-locked relics any enemy on the
// level can drop (config WORLD_DROP), farmed by returning for boss runs.
if (worldPlacements.length) {
  const wr = WORLD_DROP.chanceByRole;
  console.log(
    `\nWorld-drop uniques (level-locked; minion ${(wr.minion * 100).toFixed(3)}% / ` +
      `elite ${(wr.elite * 100).toFixed(1)}% / boss ${(wr.boss * 100).toFixed(0)}% per kill, ` +
      `gate lvl ${Object.entries(WORLD_DROP.minPlayerLevel)
        .map(([d, l]) => `${d} ${l}`)
        .join(" / ")}):\n`,
  );
  const levels = [...new Set(worldPlacements.map((p) => p.level))];
  const wcell = (level, diff) =>
    worldPlacements
      .filter((p) => p.level === level && p.diff === diff)
      .map((p) => p.id)
      .join(", ") || "—";
  console.log(
    "  " +
      ["level".padEnd(14), ...DIFFICULTY_ORDER.map((d) => d.padEnd(20))].join(
        "",
      ),
  );
  for (const level of levels)
    console.log(
      "  " +
        [
          level.padEnd(14),
          ...DIFFICULTY_ORDER.map((d) => wcell(level, d).padEnd(20)),
        ].join(""),
    );
}

// Weapon ladder — informational (weapon power is class-dependent; eyeball it
// against the weapon-budget model rather than assume raw DPS must climb).
const weaponRows = (bySlot.weapon ?? [])
  .map((id) => ({ id, ilvl: UNIQUE_DEFS[id].ilvl, base: UNIQUE_DEFS[id].base }))
  .sort((a, b) => a.ilvl - b.ilvl);
if (weaponRows.length) {
  console.log(
    "\nWeapon uniques (ilvl → base → DPS, class-dependent — eyeball vs weapon-budget):",
  );
  for (const r of weaponRows)
    console.log(
      `  ilvl${String(r.ilvl).padStart(3)}  ${r.id.padEnd(20)} ${r.base.padEnd(20)} ` +
        `req${levelReqOf(r.base)} ${dpsOf(r.base)} dps`,
    );
}

console.log(
  `\n${UNIQUE_IDS.length} uniques · ${placements.length} boss + ` +
    `${worldPlacements.length} world placements · ` +
    `boss home-rung drop ≈ ${(UNIQUE.dropChance * 100).toFixed(0)}% (cap ${(UNIQUE.dropChanceCap * 100).toFixed(0)}%).\n`,
);

if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const m of errors) console.log("  ✗ " + m);
}
if (warns.length) {
  console.log(`WARNINGS (${warns.length}):`);
  for (const m of warns) console.log("  ! " + m);
}
if (!errors.length && !warns.length)
  console.log("All unique authoring checks pass. ✓");

process.exit(errors.length || (strict && warns.length) ? 1 : 0);
