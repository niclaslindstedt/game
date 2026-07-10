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

import type { Affix, EquipSlot, Tier } from "../types.ts";

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
  /** The rarity tier this mints at — the rarest hand-authored finds are
   * `"legendary"` (one rung above the default `"unique"`): orange card, the
   * densest pickup blaze, and the same unbreakable/keepsake treatment. Omit for
   * an ordinary unique. Purely a display/rarity stamp — power still obeys the
   * same ilvl budget and armor rules as any unique (the checkers are
   * tier-agnostic). */
  tier?: Extract<Tier, "unique" | "legendary">;
  /** The static item level — scales the unique's POWER/feel, not its equip
   * requirement (which is the base item's `levelReq`, like any tier), so a
   * unique is often wearable well below its ilvl. */
  ilvl: number;
  /** The fixed bonuses (authored, not rolled). At most one scaling `*Pct`. */
  bonuses: Affix[];
  /** BAG uniques only: the extra inventory cells this bag grants, overriding
   * the base bag's capacity (applied in `mintUnique`). */
  bagSlots?: number;
  /** Authoring metadata (the engine ignores it): mark an INTENTIONAL over-budget
   * keeper — a scaling `statPct`/`maxHpPct` piece that's deliberately weak at its
   * early equip level but compounds into best-in-slot as the hero grows. It
   * suppresses `scripts/weapon-ilvl.mjs`'s over-budget warning, which otherwise
   * flags "power too high for the equip gate". Only set this when the deviation
   * is a deliberate keeper design, not an accident. */
  keeper?: boolean;
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
    ilvl: 36,
    keeper: true,
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
    ilvl: 23,
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
    ilvl: 26,
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
    ilvl: 29,
    bonuses: [
      { kind: "stat", stat: "speed", value: 7 },
      { kind: "stat", stat: "dexterity", value: 6 },
    ],
    lore: "LEGS BUILT FOR TUNNELS. YOU NEVER QUITE STOP MOVING.",
  },
  {
    id: "gnawed_sabatons",
    name: "GNAWED SABATONS",
    base: "gothic_sabatons",
    slot: "feet",
    ilvl: 64,
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
    ilvl: 17,
    bagSlots: 6,
    bonuses: [{ kind: "stat", stat: "luck", value: 4 }],
    lore: "EVERY SCRAP IT EVER STOLE, AND IT STOLE EVERYTHING.",
  },
  {
    id: "regolith_rucksack",
    name: "REGOLITH RUCKSACK",
    base: "bag",
    slot: "bag",
    ilvl: 24,
    bagSlots: 8,
    bonuses: [{ kind: "stat", stat: "stamina", value: 5 }],
    lore: "PACKED FOR A LONG WALK ACROSS SOMEWHERE THAT WANTS YOU DEAD.",
  },
  {
    id: "foremans_duffel",
    name: "FOREMAN'S DUFFEL",
    base: "bag",
    slot: "bag",
    ilvl: 31,
    bagSlots: 10,
    bonuses: [{ kind: "stat", stat: "strength", value: 6 }],
    lore: "A WHOLE BENCH ON A STRAP. HE NEVER CLOCKED OUT EITHER.",
  },
  {
    id: "voidcache",
    name: "VOIDCACHE",
    base: "bag",
    slot: "bag",
    ilvl: 38,
    bagSlots: 12,
    bonuses: [{ kind: "stat", stat: "intelligence", value: 7 }],
    lore: "IT HOLDS MORE THAN IT SHOULD. DON'T LOOK TOO LONG INSIDE.",
  },
  {
    id: "adas_satchel",
    name: "ADA'S SATCHEL",
    base: "bag",
    slot: "bag",
    ilvl: 53,
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
    ilvl: 13,
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
    ilvl: 20,
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
    ilvl: 53,
    keeper: true,
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
    base: "crater_boots",
    slot: "feet",
    ilvl: 44,
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
    base: "spatha",
    slot: "weapon",
    ilvl: 79,
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
    ilvl: 12,
    bonuses: [
      { kind: "armor", value: 22 },
      { kind: "stat", stat: "luck", value: 5 },
    ],
    lore: "MORE LOGO THAN PLATE. THE LOGO TESTS VERY WELL.",
  },
  {
    id: "lawless_stride",
    name: "LAWLESS STRIDE",
    base: "carbon_leggings",
    slot: "legs",
    ilvl: 16,
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
    ilvl: 29,
    bonuses: [
      { kind: "stat", stat: "speed", value: 6 },
      { kind: "stat", stat: "luck", value: 8 },
    ],
    lore: "BUILT FOR THE WALK-ON. HE NEVER PLANNED A WALK-OFF.",
  },
  {
    id: "wrathflame",
    name: "WRATHFLAME",
    base: "atomic_raygun",
    slot: "weapon",
    ilvl: 46,
    bonuses: [
      { kind: "damagePct", value: 0.35 },
      { kind: "stat", stat: "strength", value: 8 },
    ],
    lore: "LEGALLY, AND HE STRESSES THIS, NOT A FLAMETHROWER.",
  },
  {
    id: "the_signal_crown",
    name: "THE SIGNAL CROWN",
    base: "crusaders_helm",
    slot: "head",
    ilvl: 81,
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
    ilvl: 10,
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
    ilvl: 25,
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
    ilvl: 27,
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
    ilvl: 33,
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
    base: "linked_mail",
    slot: "chest",
    ilvl: 83,
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
    ilvl: 6,
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
    ilvl: 24,
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
    ilvl: 48,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "stat", stat: "luck", value: 6 },
    ],
    lore: "IT HOLDS THE WHOLE BATTLEFIELD AT ONCE. BRIEFLY.",
  },
  {
    id: "truthseeker",
    name: "TRUTHSEEKER",
    base: "microlattice_plate",
    slot: "chest",
    ilvl: 72,
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
    base: "fluted_greaves",
    slot: "legs",
    ilvl: 69,
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
    ilvl: 6,
    bonuses: [{ kind: "stat", stat: "intelligence", value: 5 }],
    lore: "HE OPERATED IT INTO HIMSELF. IT STILL REMEMBERS HOW TO BUILD MINDS.",
  },
  {
    id: "dust_of_tranquility",
    name: "DUST OF TRANQUILITY",
    base: "moon_charm",
    slot: "charm",
    ilvl: 9,
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
    ilvl: 14,
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
    ilvl: 11,
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
    ilvl: 37,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.03 },
      { kind: "stat", stat: "intelligence", value: 6 },
    ],
    lore: "THE TRACKING BEACON FROM HER JACKET. IT STILL POINTS HOME.",
  },
];

// WORLD DROPS — level-locked relics, NOT boss-gated. Unlike the 35 above (each
// wired to one boss on `EnemyDef.uniquesByDifficulty`), these are wired on the
// LEVEL (`LevelDef.loot.worldUniques`) and rain from the WHOLE roster of their
// home level at role-scaled odds (config WORLD_DROP), but only once the hero
// out-levels a first campaign pass of THAT rung — so they're farmed by returning
// for boss runs (the gate is per-difficulty, `WORLD_DROP.minPlayerLevel`). Two
// rungs so far: the EASY batch (one relic per level, plus a second for the Rift,
// kept easy-tier in power — the chase is the collection, not raw stats), and the
// MEDIUM batch a notch stronger, capped by the game's first LEGENDARY (MJÖLNIR).
// Both lean on the Rift, which, being a tear in reality, coughs up anything in
// Earth's history.
const WORLD_UNIQUES: UniqueDef[] = [
  // SPACEZ HQ — ZAI's corporate HQ, where the CORE first drafted GROK.
  {
    id: "the_first_draft",
    name: "THE FIRST DRAFT",
    base: "mission_cap",
    slot: "head",
    ilvl: 41,
    keeper: true,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 5 },
      { kind: "armor", value: 12 },
      { kind: "statPct", stat: "intelligence", value: 0.03 },
    ],
    lore: "THE CORE WROTE ITS FIRST DRAFT. IT REWROTE EVERYTHING AFTER.",
  },
  // THE MOON — the vacuum-sealed plate of the last one who walked here.
  {
    id: "the_pale_covenant",
    name: "THE PALE COVENANT",
    base: "kevlar_vest",
    slot: "chest",
    ilvl: 18,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 4 },
      { kind: "maxHp", value: 25 },
      { kind: "maxHpPct", value: 0.02 },
    ],
    lore: "SEALED AGAINST A SILENCE THAT EATS EVERYTHING IT TOUCHES.",
  },
  // MARS — light runner's shoes that outrun the dust storms that bury everything
  // (on `sneakers`, not the seed leather boots, so they carry a hair more sole and
  // read as fast footwear, not army surplus).
  {
    id: "dustborn",
    name: "DUSTBORN",
    base: "sneakers",
    slot: "feet",
    ilvl: 12,
    bonuses: [
      { kind: "stat", stat: "speed", value: 5 },
      { kind: "stat", stat: "dexterity", value: 4 },
      { kind: "stat", stat: "stamina", value: 2 },
    ],
    lore: "BORN OF THE WIND THAT BURIES EVERYTHING THAT STOPS MOVING.",
  },
  // THE RIFT — the once-and-future blade, dragged through the tear in history.
  {
    id: "excalibur",
    name: "EXCALIBUR",
    base: "medieval_sword",
    slot: "weapon",
    ilvl: 1,
    bonuses: [
      { kind: "damagePct", value: 0.12 },
      { kind: "crit", value: 0.05 },
      { kind: "stat", stat: "stamina", value: -2 },
    ],
    lore: "DRAWN FROM A STONE THAT IS NOW A SINGULARITY.",
  },
  // THE RIFT — trinitite: green glass, born the instant the sky first burned.
  {
    id: "the_trinity_shard",
    name: "THE TRINITY SHARD",
    base: "crystal_orb",
    slot: "charm",
    ilvl: 15,
    bonuses: [
      { kind: "damagePct", value: 0.15 },
      { kind: "maxHp", value: -20 },
    ],
    lore: "GREEN GLASS, BORN THE INSTANT THE SKY FIRST BURNED.",
  },

  // MEDIUM RUNG — the second batch of world relics, a notch above the easy set
  // in power (mid-campaign ilvls, still farmed by returning for boss runs once
  // MEDIUM is beaten). One relic themed to each level, plus the Rift's extra
  // haul from Earth's history — and, hanging in the tear, the first LEGENDARY.
  // SPACEZ HQ — ZAI's up-or-out ladder: fast, exposed, no safety net.
  {
    id: "deadsprint",
    name: "DEADSPRINT",
    base: "chausses",
    slot: "legs",
    ilvl: 27,
    bonuses: [
      { kind: "stat", stat: "speed", value: 7 },
      { kind: "stat", stat: "dexterity", value: 5 },
      { kind: "maxHp", value: -20 },
    ],
    lore: "THE FASTER YOU RUN, THE LESS OF YOU ARRIVES.",
  },
  // THE MOON — ARMSTRONG's vigil: the helm that outlasted the silence.
  {
    id: "marecrest",
    name: "MARECREST",
    base: "great_helm",
    slot: "head",
    ilvl: 34,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "maxHp", value: 50 },
      { kind: "stat", stat: "intelligence", value: 4 },
    ],
    lore: "CROWNED FOR A SEA WITH NO WATER. NOTHING HAS STIRRED IT IN AN AGE.",
  },
  // MARS — the dust-storm frontier gun that shrugs off the grit.
  {
    id: "redwind",
    name: "REDWIND",
    base: "atomic_raygun",
    slot: "weapon",
    ilvl: 46,
    bonuses: [
      { kind: "damagePct", value: 0.25 },
      { kind: "stat", stat: "dexterity", value: 6 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "IT DRINKS THE RED STORM AND SPITS IT BACK, HOTTER.",
  },
  // THE RIFT — a cursed wish out of a folk tale: power at a price.
  {
    id: "wishbane",
    name: "WISHBANE",
    base: "grimoire",
    slot: "charm",
    ilvl: 19,
    bonuses: [
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.06 },
      { kind: "maxHp", value: -25 },
    ],
    lore: "IT GRANTS EXACTLY WHAT YOU ASK. NEVER WHAT YOU WANTED.",
  },
  // THE RIFT — Athena's aegis, gorgon-faced, dragged whole through the tear.
  {
    id: "gorgonscale",
    name: "GORGONSCALE",
    base: "dragonscale_cloak",
    slot: "chest",
    ilvl: 33,
    bonuses: [
      { kind: "armor", value: 45 },
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "IT TURNED ARMIES TO STONE. IT WILL SETTLE FOR STOPPING A BLOW.",
  },
  // THE RIFT — the first LEGENDARY: the thunder-hammer of a dead god, fallen
  // out of a colder, older sky than this one.
  {
    id: "mjolnir",
    name: "MJÖLNIR",
    base: "seismic_hammer",
    slot: "weapon",
    tier: "legendary",
    ilvl: 68,
    keeper: true,
    bonuses: [
      { kind: "damagePct", value: 0.3 },
      { kind: "statPct", stat: "strength", value: 0.03 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "ONLY THE WORTHY LIFT IT. OUT HERE, WORTHY MEANS STILL BREATHING.",
  },
];

// EASTWORLD MERCHANT STALL — the third unique home: not dropped at all, but
// SOLD. THE BARKEEP fences the park owner's estate (`LevelDef.merchant
// .stockUniques` on Eastworld), priced at the standing vendor markup — the
// intended purse is PUTAIN's own brand watches, sold back across the same
// counter. Scripted stock, minted by `mintUnique` like any unique.
const MERCHANT_STALL_UNIQUES: UniqueDef[] = [
  {
    id: "putains_tracksuit",
    name: "PUTAIN'S TRACKSUIT",
    base: "tin_star_cuirass",
    slot: "chest",
    ilvl: 32,
    bonuses: [
      { kind: "stat", stat: "speed", value: 5 },
      { kind: "stat", stat: "stamina", value: 4 },
    ],
    lore: "STRIPES DOWN THE ARMS. AUTHORITY DOWN THE SPINE. RUNS FROM NOTHING, OFFICIALLY.",
  },
  {
    id: "the_kremlin_ushanka",
    name: "THE KREMLIN USHANKA",
    base: "mirrorshade_visor",
    slot: "head",
    ilvl: 34,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 5 },
      { kind: "stat", stat: "luck", value: 4 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "WARM EARS, COLD DECISIONS. THE FUR REMEMBERS EVERY WINTER IT OUTLASTED.",
  },
  {
    id: "honorary_black_belt",
    name: "HONORARY BLACK BELT",
    base: "sheriffs_badge",
    slot: "charm",
    ilvl: 23,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 4 },
      { kind: "crit", value: 0.04 },
    ],
    lore: "AWARDED, NEVER EARNED. THE BELT DOES NOT KNOW THAT. NEITHER DO YOUR OPPONENTS.",
  },
];

/** The shipped unique catalog, merged by id (throws on a clash / bad base). */
export const UNIQUE_DEFS: Record<string, UniqueDef> = mergeUniques([
  ...MUSKRAT_UNIQUES,
  ...ARMSTRONG_UNIQUES,
  ...ELON_MARS_UNIQUES,
  ...ELON_RIFT_UNIQUES,
  ...GROK_UNIQUES,
  ...WORLD_UNIQUES,
  ...MERCHANT_STALL_UNIQUES,
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
