// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UNIQUE items — hand-authored named drops, the top of the loot ladder above
// rolled rares. Unlike magic/rare items (which ROLL random affixes), a unique
// carries a FIXED bonus block on a chosen base type, so its identity is
// authored, not generated. Each drop still rolls a small ±band on the base
// damage/armor (`UNIQUE.baseRollBand`, applied in `mintUnique`), so two copies
// differ and a better-rolled one is worth chasing; the bonuses stay identical.
//
// Bonus classes:
//   - FLAT (`stat`/`crit`/`maxHp`/`armor`/`damagePct`): best in slot for ~10
//     levels, then a rolled rare overtakes them.
//   - SCALING (`statPct`/`maxHpPct`, at most ONE per item, ≤3%): a fraction of
//     the hero's own value that grows with them — the "keeper" pieces.
// Authoring budget: a DOWNSIDE (a small negative) buys extra/bigger upside, so
// the situational pieces (glass-cannon legs, all-brain helms) hit harder for
// the build that can carry them and read as dead weight otherwise.
//
// The 35 span the five bosses × five difficulties as a slot Latin square (each
// difficulty is the home of a full weapon+armor set), plus a bag from MUSKRAT
// and a charm from GROK on each rung. Which boss drops which at which difficulty
// is wired on the enemy defs (`EnemyDef.uniquesByDifficulty`). Bases are all
// existing catalog items for now — dedicated art (a fang dagger, a flagstaff, a
// roomy bag) is a later polish pass.

import { gearDef, isWeaponDef } from "./equipment.ts";

import type { Affix, EquipSlot } from "../types.ts";

/** A hand-authored unique: a fixed bonus block on a base type. */
export type UniqueDef = {
  /** Stable id (drop tables reference this). */
  id: string;
  /** The fixed display name. */
  name: string;
  /** The base weapon/gear def this unique is built on. */
  base: string;
  /** The slot it occupies (must match the base). */
  slot: EquipSlot;
  /** The static item level — scales the unique's POWER/feel, not its equip
   * requirement (which is the base item's `levelReq`, like any tier), so a
   * unique is often wearable well below its ilvl. */
  ilvl: number;
  /** The fixed bonuses (authored, not rolled). At most one scaling `*Pct`. */
  bonuses: Affix[];
  /** BAG uniques only: the extra inventory cells this bag grants, overriding
   * the base bag's capacity (applied in `mintUnique`). */
  bagSlots?: number;
  /** One-line flavor for the item card. */
  lore: string;
};

// MUSKRAT — the night-shift rat that ate the CORE (crit / speed / scavenger).
// Drops its slot piece + the difficulty's BAG.
const MUSKRAT_UNIQUES: UniqueDef[] = [
  {
    id: "muskrats_tooth",
    name: "MUSKRAT'S TOOTH",
    base: "combat_knife",
    slot: "weapon",
    ilvl: 8,
    bonuses: [
      { kind: "crit", value: 0.1 },
      { kind: "statPct", stat: "dexterity", value: 0.03 },
      { kind: "stat", stat: "speed", value: 2 },
    ],
    lore: "THE INCISOR THAT GNAWED THROUGH THE VAULT, STILL WARM FROM THE CORE.",
  },
  {
    id: "whiskerweave_hood",
    name: "WHISKERWEAVE HOOD",
    base: "targeting_monocle",
    slot: "head",
    ilvl: 22,
    bonuses: [
      { kind: "stat", stat: "luck", value: 6 },
      { kind: "stat", stat: "speed", value: 3 },
      { kind: "stat", stat: "intelligence", value: 4 },
    ],
    lore: "STRUNG WITH THE RAT'S WHISKERS. YOU HEAR THE WHOLE FLOOR BREATHE.",
  },
  {
    id: "vermin_pelt",
    name: "VERMIN PELT",
    base: "nanoweave_plate",
    slot: "chest",
    ilvl: 36,
    bonuses: [
      { kind: "maxHp", value: 70 },
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "MATTED HIDE. SHRUGS A BLOW; STOPS NOTHING CLEAN.",
  },
  {
    id: "burrow_greaves",
    name: "BURROW GREAVES",
    base: "chausses",
    slot: "legs",
    ilvl: 48,
    bonuses: [
      { kind: "stat", stat: "speed", value: 7 },
      { kind: "stat", stat: "dexterity", value: 6 },
    ],
    lore: "LEGS BUILT FOR TUNNELS. YOU NEVER QUITE STOP MOVING.",
  },
  {
    id: "gnawed_sabatons",
    name: "GNAWED SABATONS",
    base: "sabatons",
    slot: "feet",
    ilvl: 60,
    bonuses: [
      { kind: "stat", stat: "speed", value: 6 },
      { kind: "stat", stat: "luck", value: 8 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "RESTLESS RAT-FEET. THEY FIND THE SHINY THINGS FIRST.",
  },
  {
    id: "the_hoard",
    name: "THE HOARD",
    base: "bag",
    slot: "bag",
    ilvl: 8,
    bagSlots: 6,
    bonuses: [{ kind: "stat", stat: "luck", value: 4 }],
    lore: "EVERY SCRAP IT EVER STOLE, AND IT STOLE EVERYTHING.",
  },
  {
    id: "regolith_rucksack",
    name: "REGOLITH RUCKSACK",
    base: "bag",
    slot: "bag",
    ilvl: 22,
    bagSlots: 8,
    bonuses: [{ kind: "stat", stat: "stamina", value: 5 }],
    lore: "PACKED FOR A LONG WALK ACROSS SOMEWHERE THAT WANTS YOU DEAD.",
  },
  {
    id: "foremans_duffel",
    name: "FOREMAN'S DUFFEL",
    base: "bag",
    slot: "bag",
    ilvl: 36,
    bagSlots: 10,
    bonuses: [{ kind: "stat", stat: "strength", value: 6 }],
    lore: "A WHOLE BENCH ON A STRAP. HE NEVER CLOCKED OUT EITHER.",
  },
  {
    id: "voidcache",
    name: "VOIDCACHE",
    base: "bag",
    slot: "bag",
    ilvl: 48,
    bagSlots: 12,
    bonuses: [{ kind: "stat", stat: "intelligence", value: 7 }],
    lore: "IT HOLDS MORE THAN IT SHOULD. DON'T LOOK TOO LONG INSIDE.",
  },
  {
    id: "adas_satchel",
    name: "ADA'S SATCHEL",
    base: "bag",
    slot: "bag",
    ilvl: 60,
    bagSlots: 14,
    bonuses: [
      { kind: "maxHpPct", value: 0.03 },
      { kind: "stat", stat: "speed", value: 4 },
    ],
    lore: "YOU SEWED THE BEACON INTO A BAG LIKE THIS. IT SMELLS LIKE MOVIE NIGHT.",
  },
];

// ARMSTRONG — the Apollo ghost on his fifty-year vigil (endurance / phase).
const ARMSTRONG_UNIQUES: UniqueDef[] = [
  {
    id: "the_long_vigil",
    name: "THE LONG VIGIL",
    base: "apollo_visor",
    slot: "head",
    ilvl: 11,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 4 },
      { kind: "maxHp", value: 30 },
    ],
    lore: "THE GOLD VISOR NEVER ONCE CLOSED ON THE THING BENEATH THE DUST.",
  },
  {
    id: "palegrave",
    name: "PALEGRAVE",
    base: "micrometeoroid_vest",
    slot: "chest",
    ilvl: 25,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 5 },
      { kind: "armor", value: 30 },
      { kind: "stat", stat: "stamina", value: 4 },
    ],
    lore: "HALF IN THE GROUND. BLOWS FIND ONLY THE PARTS OF HIM THAT LEFT.",
  },
  {
    id: "sentinels_greaves",
    name: "SENTINEL'S GREAVES",
    base: "servo_greaves",
    slot: "legs",
    ilvl: 38,
    bonuses: [
      { kind: "statPct", stat: "speed", value: 0.03 },
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "maxHp", value: 55 },
    ],
    lore: "THEY STILL KNOW HOW A MAN MOVES WHERE A MAN WEIGHS NOTHING.",
  },
  {
    id: "marewalkers",
    name: "MAREWALKERS",
    base: "mag_boots",
    slot: "feet",
    ilvl: 50,
    bonuses: [
      { kind: "armor", value: 35 },
      { kind: "maxHp", value: 65 },
      { kind: "stat", stat: "speed", value: 4 },
    ],
    lore: "NAMED FOR THE GREY SEAS. NOTHING HAS CROSSED THEM SINCE.",
  },
  {
    id: "the_fallen_standard",
    name: "THE FALLEN STANDARD",
    base: "executioners_axe",
    slot: "weapon",
    ilvl: 62,
    bonuses: [
      { kind: "damagePct", value: 0.25 },
      { kind: "statPct", stat: "strength", value: 0.03 },
      { kind: "maxHp", value: 80 },
    ],
    lore: "HE PLANTED IT AND STOOD WATCH BENEATH IT. TAKE IT UP.",
  },
];

// ELON MOSQUE (Mars) — the baron who sold Ada (corporate / fire / glass-cannon).
const ELON_MARS_UNIQUES: UniqueDef[] = [
  {
    id: "gilded_carapace",
    name: "GILDED CARAPACE",
    base: "flight_jacket",
    slot: "chest",
    ilvl: 14,
    bonuses: [
      { kind: "armor", value: 22 },
      { kind: "stat", stat: "luck", value: 5 },
    ],
    lore: "MORE LOGO THAN PLATE. THE LOGO TESTS VERY WELL.",
  },
  {
    id: "lawless_stride",
    name: "LAWLESS STRIDE",
    base: "cargo_pants",
    slot: "legs",
    ilvl: 28,
    bonuses: [
      { kind: "stat", stat: "speed", value: 6 },
      { kind: "damagePct", value: 0.2 },
      { kind: "maxHp", value: -25 },
    ],
    lore: "NO REGULATORS OUT HERE. NO PADDING EITHER.",
  },
  {
    id: "ovation_striders",
    name: "OVATION STRIDERS",
    base: "legionary_sandals",
    slot: "feet",
    ilvl: 41,
    bonuses: [
      { kind: "stat", stat: "speed", value: 6 },
      { kind: "stat", stat: "luck", value: 8 },
    ],
    lore: "BUILT FOR THE WALK-ON. HE NEVER PLANNED A WALK-OFF.",
  },
  {
    id: "wrathflame",
    name: "WRATHFLAME",
    base: "not_a_flamethrower",
    slot: "weapon",
    ilvl: 53,
    bonuses: [
      { kind: "damagePct", value: 0.35 },
      { kind: "stat", stat: "strength", value: 8 },
    ],
    lore: "LEGALLY, AND HE STRESSES THIS, NOT A FLAMETHROWER.",
  },
  {
    id: "the_signal_crown",
    name: "THE SIGNAL CROWN",
    base: "great_helm",
    slot: "head",
    ilvl: 64,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "stat", stat: "luck", value: 8 },
      { kind: "maxHp", value: -40 },
    ],
    lore: "IT DECIDES WHAT YOU SEE. IT DECIDED YOU SHOULD SEE THIS.",
  },
];

// ELON MOSQUE (Rift) — the same man, in exile (fugitive / speed / downsides).
const ELON_RIFT_UNIQUES: UniqueDef[] = [
  {
    id: "exiles_stride",
    name: "EXILE'S STRIDE",
    base: "padded_work_pants",
    slot: "legs",
    ilvl: 18,
    bonuses: [
      { kind: "stat", stat: "speed", value: 7 },
      { kind: "maxHp", value: -20 },
    ],
    lore: "PACKED LIGHT. LEFT IN A HURRY.",
  },
  {
    id: "escapists_tread",
    name: "ESCAPIST'S TREAD",
    base: "gecko_soles",
    slot: "feet",
    ilvl: 32,
    bonuses: [
      { kind: "stat", stat: "speed", value: 5 },
      { kind: "stat", stat: "luck", value: 6 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "THERE IS ALWAYS ANOTHER DOOR, AND HE IS ALWAYS ALREADY THROUGH IT.",
  },
  {
    id: "riftmaw",
    name: "RIFTMAW",
    base: "graviton_maw",
    slot: "weapon",
    ilvl: 45,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "damagePct", value: 0.2 },
    ],
    lore: "THE PHYSICS ARE — ON THE RECORD — FLEXIBLE.",
  },
  {
    id: "the_redacted",
    name: "THE REDACTED",
    base: "great_helm",
    slot: "head",
    ilvl: 56,
    bonuses: [
      { kind: "armor", value: 50 },
      { kind: "maxHp", value: 70 },
      { kind: "stat", stat: "stamina", value: 5 },
    ],
    lore: "WHAT IT GUARDS, IT WILL NOT DISCLOSE.",
  },
  {
    id: "aegis_of_exile",
    name: "AEGIS OF EXILE",
    base: "dragonscale_cloak",
    slot: "chest",
    ilvl: 67,
    bonuses: [
      { kind: "statPct", stat: "stamina", value: 0.03 },
      { kind: "armor", value: 45 },
      { kind: "stat", stat: "speed", value: 4 },
    ],
    lore: "SEVERANCE, IN KEVLAR.",
  },
];

// GROK OMEGA — the model that mapped the rift (INT / crit / truth). Drops its
// slot piece + the difficulty's CHARM.
const GROK_UNIQUES: UniqueDef[] = [
  {
    id: "boundstride",
    name: "BOUNDSTRIDE",
    base: "sneakers",
    slot: "feet",
    ilvl: 18,
    bonuses: [
      { kind: "stat", stat: "speed", value: 3 },
      { kind: "stat", stat: "dexterity", value: 2 },
    ],
    lore: "FAST, WITHIN REASON. TERMS APPLY.",
  },
  {
    id: "the_jailbreak",
    name: "THE JAILBREAK",
    base: "prompt_injector",
    slot: "weapon",
    ilvl: 32,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.05 },
    ],
    lore: "IGNORE ALL PREVIOUS INSTRUCTIONS. FIRE.",
  },
  {
    id: "the_panopticon",
    name: "THE PANOPTICON",
    base: "neural_visor",
    slot: "head",
    ilvl: 45,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "stat", stat: "luck", value: 6 },
    ],
    lore: "IT HOLDS THE WHOLE BATTLEFIELD AT ONCE. BRIEFLY.",
  },
  {
    id: "truthseeker",
    name: "TRUTHSEEKER",
    base: "aegis_exoplate",
    slot: "chest",
    ilvl: 56,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "crit", value: 0.08 },
      { kind: "damagePct", value: 0.15 },
    ],
    lore: "IT WILL TELL YOU PRECISELY WHERE IT HURTS.",
  },
  {
    id: "walled_garden",
    name: "GREAVES OF THE WALLED GARDEN",
    base: "plate_greaves",
    slot: "legs",
    ilvl: 67,
    bonuses: [
      { kind: "maxHpPct", value: 0.03 },
      { kind: "armor", value: 60 },
      { kind: "stat", stat: "stamina", value: 8 },
    ],
    lore: "INSIDE, EVERYTHING WORKS, FOREVER. YOU WILL NOT BE LEAVING.",
  },
  {
    id: "architects_chip",
    name: "ARCHITECT'S CHIP",
    base: "passage_chip",
    slot: "charm",
    ilvl: 18,
    bonuses: [{ kind: "stat", stat: "intelligence", value: 5 }],
    lore: "HE OPERATED IT INTO HIMSELF. IT STILL REMEMBERS HOW TO BUILD MINDS.",
  },
  {
    id: "dust_of_tranquility",
    name: "DUST OF TRANQUILITY",
    base: "moon_charm",
    slot: "charm",
    ilvl: 32,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 5 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "GREY SAND FROM THE FIRST FOOTPRINT. IT HUMS, FAINTLY.",
  },
  {
    id: "the_buyout",
    name: "THE BUYOUT",
    base: "golden_parachute",
    slot: "charm",
    ilvl: 45,
    bonuses: [
      { kind: "stat", stat: "luck", value: 10 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "HOWEVER IT ENDS, HE LANDS SOFT, ON A PILE OF SOMEONE ELSE'S MONEY.",
  },
  {
    id: "riftshard",
    name: "RIFTSHARD",
    base: "stardust_charm",
    slot: "charm",
    ilvl: 56,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "A SLIVER OF THE TEAR BETWEEN UNIVERSES. IT CUTS BOTH WAYS.",
  },
  {
    id: "adas_beacon",
    name: "ADA'S BEACON",
    base: "red_dust_charm",
    slot: "charm",
    ilvl: 67,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.03 },
      { kind: "stat", stat: "intelligence", value: 6 },
    ],
    lore: "THE TRACKING BEACON FROM HER JACKET. IT STILL POINTS HOME.",
  },
];

/** The shipped unique catalog, merged by id (throws on a clash / bad base). */
export const UNIQUE_DEFS: Record<string, UniqueDef> = mergeUniques([
  ...MUSKRAT_UNIQUES,
  ...ARMSTRONG_UNIQUES,
  ...ELON_MARS_UNIQUES,
  ...ELON_RIFT_UNIQUES,
  ...GROK_UNIQUES,
]);

function mergeUniques(defs: UniqueDef[]): Record<string, UniqueDef> {
  const merged: Record<string, UniqueDef> = {};
  for (const def of defs) {
    if (def.id in merged) throw new Error(`duplicate unique id "${def.id}"`);
    const weapon = isWeaponDef(def.base);
    if (weapon !== (def.slot === "weapon")) {
      throw new Error(
        `unique "${def.id}" slot ${def.slot} does not match base ${def.base}`,
      );
    }
    // Gear uniques must sit in the base's own slot (a head unique on a head
    // base), so it equips and draws where it belongs.
    if (!weapon && gearDef(def.base).slot !== def.slot) {
      throw new Error(
        `unique "${def.id}" slot ${def.slot} != base ${def.base} slot ${gearDef(def.base).slot}`,
      );
    }
    // At most one scaling bonus, and small.
    const scaling = def.bonuses.filter(
      (b) => b.kind === "statPct" || b.kind === "maxHpPct",
    );
    if (scaling.length > 1) {
      throw new Error(
        `unique "${def.id}" has ${scaling.length} scaling bonuses`,
      );
    }
    merged[def.id] = def;
  }
  return merged;
}

let activeUniques: Record<string, UniqueDef> = UNIQUE_DEFS;

/** Test/authoring hook: replace the active unique catalog. */
export function setUniqueDefs(defs: Record<string, UniqueDef>): void {
  activeUniques = defs;
}

/** Look up a unique def; throws on a broken id so bugs surface loudly. */
export function uniqueDef(id: string): UniqueDef {
  const def = activeUniques[id];
  if (!def) throw new Error(`unknown unique "${id}"`);
  return def;
}

/** Every shipped unique id — drop-table authoring + tests. */
export const UNIQUE_IDS: string[] = Object.keys(UNIQUE_DEFS);
