#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UNIQUE item ilvl calculator + power-budget check (see the `weapon-system`
// skill, "Unique items"). This is the source of truth for what a unique's
// `ilvl` MEANS; `unique-check.mjs` imports the model from here rather than
// duplicating it.
//
// A unique/legendary weapon (or any unique gear piece) carries a FIXED bonus
// block on a REAL catalog base (`src/game/defs/uniques.ts`). Its `ilvl` is a
// hand-authored number that scales the item's POWER/feel and its drop odds
// (`UNIQUE.dropChance × mlvl/ilvl`) — NOT its equip gate (that's the base's
// `levelReq`). Authored by hand, those ilvls drift. This script gives ilvl a
// DEFINITION, priced in STAT POINTS (rolled affixes scale by ilvl-gated
// BRACKETS — `AFFIX_POOLS[..].brackets` in equipment.ts — but the unique
// budget keeps the simple 1-stat-=-1-ilvl anchor below):
//
//     ilvl = base.levelReq + bonusBudget
//     bonusBudget = Σ  value(bonus) / PER_ILVL[bonus.kind]     (signed)
//
// i.e. the item's power is the grade it sits on (levelReq, which already sets
// its armor/dps) PLUS the ilvl-worth of the fixed bonuses stacked on top. A
// DOWNSIDE (negative value) subtracts, so a glass-cannon piece nets a lower
// ilvl for the same headline number — exactly the "a downside buys upside" rule.
//
// ┌── PER_ILVL IS DERIVED FROM THE LIVE COMBAT/ITEM CONSTANTS, NOT HARD-CODED ──┐
// │ Each bonus kind is priced against its GOVERNING STAT — and 1 stat point is │
// │ 1 ilvl by definition — using the SAME constant combat reads. So when you   │
// │ rebalance the combat/item math (buff STR's damage, change crit scaling, the│
// │ armor curve, stamina's HP), the ilvl valuations move with it and this      │
// │ script RE-FLAGS the uniques that just became over- or under-powered. That  │
// │ live coupling is the whole point — do not paste balance numbers in here.   │
// └────────────────────────────────────────────────────────────────────────────┘
//
//   - stat      : +1 point = 1 ilvl                              (the anchor / unit)
//   - damagePct : priced vs the damage stat — a STR point adds
//                 `STATS.damageBonusPerPoint.strength` to the SAME additive
//                 multiplier a damagePct affix does, so +that% dmg = 1 ilvl
//                 (this is why % damage is "cheap": STR floods it, and it fades)
//   - crit      : priced vs the crit stat — `STATS.critChancePerStat` of crit = 1 ilvl
//   - maxHp     : priced vs stamina's HP — `STAMINA.hpPerPoint` HP per point, then
//                 DISCOUNTED by FLAT_HP_FRACTION (flat HP is worth less than the HP
//                 a stat grants, since a stamina point also buys sprint pool/regen)
//   - armor     : priced vs flat HP by its effective-HP value under the armor
//                 curve `armor/(armor+kBase+kPerLevel·lvl)` at a reference fight
//   - statPct / maxHpPct : SCALING keepers (a fraction of the hero's own value that
//                 grows forever) — a design premium (SCALING_PREMIUM), HP-discounted
//                 for maxHpPct like flat HP. No live combat constant governs these.
//
// The deviation rule (`ilvl − levelReq`, the bonusBudget) is CAPPED, and the cap
// GROWS with levelReq: a low-req unique must keep its budget small (it can't
// smuggle late-game power in behind an early equip gate), a high-req end-game
// piece may deviate a lot. Trinkets (charm/bag) gate at req ~1 by design (their
// bases top out low), so they're exempt from the cap — their ilvl is still shown.
//
// Legendaries are a rolled TIER, not named drops — their ilvl is derived from the
// monster level at drop time (`rollEquipment`), never authored — so there is
// nothing to compute for them here; this covers the authored UNIQUE arsenal.
//
// Runs on plain `node` via type stripping (defs/config import only types/values).
//
//   node scripts/weapon-ilvl.mjs            # ilvl table for the whole arsenal
//   node scripts/weapon-ilvl.mjs --check    # + deviation-cap report, exit 1 on over-budget
//   node scripts/weapon-ilvl.mjs --strict   # exit 1 on any authored≠computed drift too
//   node scripts/weapon-ilvl.mjs --suggest  # print the canonical ilvl to author per unique

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { WEAPON_DEFS, GEAR_DEFS, isWeaponDef } = await import(
  path.join(root, "src/game/defs/equipment.ts")
);
const { UNIQUE_DEFS, UNIQUE_IDS } = await import(
  path.join(root, "src/game/defs/uniques.ts")
);
// The LIVE combat/item constants — the numbers combat itself reads. Pricing the
// bonuses off these (not copies) is what makes this script warn on balance drift.
// THE PRICING MODEL lives in the ENGINE (src/game/item-budget.ts) — the same
// table the runtime reads to derive a legendary's drop rarity from its power,
// so authoring checks and live odds can never drift apart. This script only
// adds the authoring-side layers (the deviation cap, bag-capacity pricing).
const { PER_ILVL, bonusIlvlPoints } = await import(
  path.join(root, "src/game/item-budget.ts")
);

// A BAG's real power is capacity, not an affix: value each cell it grants ABOVE
// the base bag at BAG_SLOT_ILVL (else every bag computes a near-zero budget).
const BAG_SLOT_ILVL = 3;

export { PER_ILVL };

// The deviation cap: the most bonus budget (ilvl − levelReq) a unique may carry,
// as a function of its base's levelReq — grows with levelReq. cap = DEV_FLOOR +
// DEV_SLOPE × levelReq.
const DEV_FLOOR = 12;
const DEV_SLOPE = 0.6;
export const devCap = (req) => DEV_FLOOR + DEV_SLOPE * req;

// Trinkets gate at req ~1 by design (charm/bag bases top out low), so a high-power
// end-game trinket unavoidably deviates far above its equip level — exempt from
// the cap (the same call unique-check makes for its equip-gap rule).
export const TRINKET_SLOTS = new Set(["charm", "bag"]);

const baseBagSlots = GEAR_DEFS.bag?.bagSlots ?? 2;

const levelReqOf = (base) =>
  (isWeaponDef(base) ? WEAPON_DEFS[base] : GEAR_DEFS[base])?.levelReq ?? 1;

// One bonus → its ilvl worth (signed) — the engine's pricing, verbatim.
export function bonusIlvl(b) {
  return bonusIlvlPoints(b);
}

// The whole model for one unique: budget, computed ilvl, deviation vs authored.
export function ilvlOf(u) {
  const req = levelReqOf(u.base);
  let budget = u.bonuses.reduce((s, b) => s + bonusIlvl(b), 0);
  // A bag's capacity over the base bag is its headline power (see BAG_SLOT_ILVL).
  if (u.slot === "bag" && u.bagSlots != null)
    budget += (u.bagSlots - baseBagSlots) * BAG_SLOT_ILVL;
  const computed = Math.round(req + budget);
  // Trinkets gate at req ~1 by design; a `keeper` is a hand-declared intentional
  // over-cap piece (a scaling stat that grows into best-in-slot); and a
  // LEGENDARY pays for its power in RARITY, not in the equip-gate cap — the
  // roster is deliberately authored across a vast power range and the drop
  // weight falls off as a power law of the budget (UNIQUE.rarityBudgetExp,
  // see pickUniqueForDrop). All exempt from the over-budget flag, but stay
  // visible (their ilvl is still computed).
  const exempt =
    TRINKET_SLOTS.has(u.slot) || u.keeper === true || u.tier === "legendary";
  return {
    req,
    budget, // signed ilvl worth of the fixed bonuses (= computed − req)
    computed, // the canonical ilvl to author
    authored: u.ilvl,
    drift: u.ilvl - computed, // authored − computed
    cap: devCap(req),
    keeper: u.keeper === true,
    overBudget: !exempt && budget > devCap(req),
  };
}

// Every unique with its model, sorted by computed ilvl. The shared entry point.
export function computeAll() {
  return UNIQUE_IDS.map((id) => ({
    id,
    u: UNIQUE_DEFS[id],
    ...ilvlOf(UNIQUE_DEFS[id]),
  })).sort((a, b) => a.computed - b.computed);
}

// ---- CLI (skipped when imported, e.g. by unique-check.mjs) -------------------

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check") || argv.includes("--strict");
  const strict = argv.includes("--strict");
  const suggest = argv.includes("--suggest");
  const rows = computeAll();

  if (suggest) {
    console.log("Canonical ilvl per unique (ilvl = levelReq + bonusBudget):\n");
    for (const r of rows) {
      const mark = r.drift === 0 ? "" : `   (was ${r.authored})`;
      console.log(
        `  ${r.id.padEnd(22)} ilvl ${String(r.computed).padStart(3)}${mark}`,
      );
    }
    process.exit(0);
  }

  console.log(
    "PER_ILVL (derived from live combat/item constants — 1 stat = 1 ilvl):",
  );
  for (const [k, v] of Object.entries(PER_ILVL))
    console.log(`  ${k.padEnd(10)} ${Number(v.toFixed(4))} value = 1 ilvl`);
  console.log(
    "\nUnique arsenal ilvl (ilvl = levelReq + bonusBudget; budget = signed Σ bonus/PER_ILVL):\n",
  );
  console.log(
    "  " +
      [
        "unique".padEnd(22),
        "slot".padEnd(7),
        "base".padEnd(20),
        "req".padStart(4),
        "budget".padStart(8),
        "ilvl".padStart(6),
        "was".padStart(5),
        "cap".padStart(6),
      ].join(" "),
  );
  for (const r of rows) {
    const flag = r.overBudget
      ? "  ⚠ over-budget"
      : r.keeper
        ? `  ★ keeper (budget ${r.budget.toFixed(0)} > cap ${r.cap.toFixed(0)}, intentional)`
        : r.drift !== 0
          ? `  Δ${r.drift > 0 ? "+" : ""}${r.drift}`
          : "";
    console.log(
      "  " +
        [
          r.id.padEnd(22),
          r.u.slot.padEnd(7),
          r.u.base.padEnd(20),
          String(r.req).padStart(4),
          r.budget.toFixed(1).padStart(8),
          String(r.computed).padStart(6),
          String(r.authored).padStart(5),
          r.cap.toFixed(0).padStart(6),
        ].join(" ") +
        flag,
    );
  }

  const over = rows.filter((r) => r.overBudget);
  const drifted = rows.filter((r) => r.drift !== 0);
  const keepers = rows.filter((r) => r.keeper);
  if (keepers.length)
    console.log(
      `\nKEEPERS (${keepers.length}, exempt from the cap by design — scaling stats that grow into best-in-slot): ` +
        keepers.map((r) => r.id).join(", "),
    );

  if (over.length) {
    console.log(
      `\nOVER-BUDGET (${over.length}) — bonus budget exceeds what the base's req should carry;\n` +
        "these low/mid-req uniques deviate too far above their equip gate. Trim a bonus,\n" +
        "add a downside, or move to a higher-grade base (higher req raises the cap):",
    );
    for (const r of over)
      console.log(
        `  ✗ ${r.id.padEnd(22)} req ${String(r.req).padStart(3)}  budget ${r.budget.toFixed(1)} > cap ${r.cap.toFixed(1)}`,
      );
  }
  if (drifted.length) {
    console.log(
      `\nAUTHORED ≠ COMPUTED (${drifted.length}) — run \`--suggest\` and update the def's \`ilvl\`:`,
    );
    for (const r of drifted)
      console.log(
        `  ! ${r.id.padEnd(22)} authored ${String(r.authored).padStart(3)} vs computed ${String(r.computed).padStart(3)}  (Δ${r.drift > 0 ? "+" : ""}${r.drift})`,
      );
  }
  console.log(
    `\n${UNIQUE_IDS.length} uniques · ${over.length} over-budget · ${drifted.length} drifted from computed ilvl.` +
      (check
        ? ""
        : "  (run --check for the deviation report; --suggest for canonical ilvls)"),
  );
  if (check && !over.length && (!strict || !drifted.length))
    console.log("All ilvl checks pass. ✓");

  process.exit((check && over.length) || (strict && drifted.length) ? 1 : 0);
}
