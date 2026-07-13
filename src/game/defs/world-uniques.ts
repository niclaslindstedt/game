// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WORLD-DROP uniques & legendaries — the level-locked relics and the named
// LEGENDARIES, split out of `uniques.ts` (which stays under the file-size cap).
// Wired on the LEVEL (`LevelDef.loot.worldUniques`) for plain uniques; the
// legendaries drop GLOBALLY via the rarity roll (HARD+, role-scaled — see
// `pickUniqueForDrop`), so they carry no table home. Same def shape, same
// `mintUnique`, same ±band. Merged into the catalog by `uniques.ts`.

import type { UniqueDef } from "./uniques.ts";

export const WORLD_UNIQUES: UniqueDef[] = [
  // SPACEZ HQ — ZAI's corporate HQ, where the CORE first drafted GROK.
  {
    id: "the_first_draft",
    name: "THE FIRST DRAFT",
    base: "mission_cap",
    slot: "head",
    ilvl: 16,
    keeper: true,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 1 },
      { kind: "statPct", stat: "intelligence", value: 0.01 },
    ],
    lore: "THE CORE WROTE ITS FIRST DRAFT. IT REWROTE EVERYTHING AFTER.",
  },
  // THE MOON — the vacuum-sealed plate of the last one who walked here.
  {
    id: "the_pale_covenant",
    name: "THE PALE COVENANT",
    base: "micrometeoroid_vest",
    slot: "chest",
    ilvl: 22,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 4 },
      { kind: "maxHp", value: 75 },
      { kind: "maxHpPct", value: 0.01 },
    ],
    lore: "SEALED AGAINST A SILENCE THAT EATS EVERYTHING IT TOUCHES.",
  },
  // MARS — light runner's shoes that outrun the dust storms that bury everything
  // (on `sneakers`, not the seed leather boots, so they carry a hair more sole and
  // read as fast footwear, not army surplus).
  {
    id: "dustborn",
    name: "DUSTBORN",
    base: "gecko_soles",
    slot: "feet",
    ilvl: 29,
    bonuses: [
      { kind: "stat", stat: "speed", value: 8 },
      { kind: "stat", stat: "dexterity", value: 6 },
      { kind: "stat", stat: "stamina", value: 4 },
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
    base: "thermal_leggings",
    slot: "legs",
    ilvl: 16,
    bonuses: [
      { kind: "stat", stat: "speed", value: 7 },
      { kind: "stat", stat: "dexterity", value: 5 },
      { kind: "maxHp", value: -30 },
    ],
    lore: "THE FASTER YOU RUN, THE LESS OF YOU ARRIVES.",
  },
  // THE MOON — ARMSTRONG's vigil: the helm that outlasted the silence.
  {
    id: "marecrest",
    name: "MARECREST",
    base: "viking_helm",
    slot: "head",
    ilvl: 22,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "stat", stat: "intelligence", value: 1 },
    ],
    lore: "CROWNED FOR A SEA WITH NO WATER. NOTHING HAS STIRRED IT IN AN AGE.",
  },
  // MARS — the dust-storm frontier gun that shrugs off the grit.
  {
    id: "redwind",
    name: "REDWIND",
    base: "blunderbuss",
    slot: "weapon",
    ilvl: 29,
    bonuses: [
      { kind: "damagePct", value: 1.0 },
      { kind: "stat", stat: "dexterity", value: 3 },
      { kind: "stat", stat: "speed", value: 2 },
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
    ilvl: 35,
    bonuses: [
      { kind: "armor", value: 55 },
      { kind: "stat", stat: "stamina", value: 6 },
      { kind: "maxHp", value: 60 },
    ],
    lore: "IT TURNED ARMIES TO STONE. IT WILL SETTLE FOR STOPPING A BLOW.",
  },
  // THE MOON — the collapsed heart of a dead pulsar, still keeping its
  // impossible beat: the EASY rung's magic build finally gets its relic.
  {
    id: "deadstar",
    name: "DEADSTAR",
    base: "pulsar_rod",
    slot: "weapon",
    ilvl: 22,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 6 },
      { kind: "damagePct", value: 0.4 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "THE HEART OF A STAR THAT DIED SCREAMING. IT STILL KEEPS TIME.",
  },
  // EASTWORLD — the pale horseman's sidearm, holstered on the park's own
  // stage-prop revolver: the EASY rung's ranged build relic.
  {
    id: "pale_rider",
    name: "PALE RIDER",
    base: "magnum_revolver",
    slot: "weapon",
    ilvl: 40,
    bonuses: [
      { kind: "crit", value: 0.08 },
      { kind: "stat", stat: "dexterity", value: 5 },
      { kind: "damagePct", value: 0.6 },
    ],
    lore: "I LOOKED, AND BEHELD A PALE HORSE. HELL FOLLOWED AT A CANTER.",
  },
  // EASTWORLD (MEDIUM) — the cattle bench's master brand: one searing thrust
  // that ends the argument. A melee choice that isn't a once-a-campaign
  // legendary.
  {
    id: "herdbreaker",
    name: "HERDBREAKER",
    base: "branding_iron",
    slot: "weapon",
    ilvl: 40,
    bonuses: [
      { kind: "damagePct", value: 2.2 },
      { kind: "stat", stat: "strength", value: 10 },
      { kind: "maxHp", value: -15 },
    ],
    lore: "IT BRANDED A THOUSAND HEAD. NONE OF THEM WERE CATTLE.",
  },
  // EASTWORLD (MEDIUM) — the wrangler's monowire noose, thrown wide: the
  // crowd-sweep melee choice, and INT makes the loop bigger.
  {
    id: "the_last_roundup",
    name: "THE LAST ROUNDUP",
    base: "mono_wire_lariat",
    slot: "weapon",
    ilvl: 40,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "stat", stat: "dexterity", value: 6 },
      { kind: "damagePct", value: 1.6 },
    ],
    lore: "ONE THROW TOOK THE WHOLE HERD. THE HERD DID NOT GET UP.",
  },
  // THE RIFT — the first LEGENDARY: the thunder-hammer of a dead god, fallen
  // out of a colder, older sky than this one.
  {
    id: "mjolnir",
    name: "MJÖLNIR",
    base: "seismic_hammer",
    slot: "weapon",
    tier: "legendary",
    ilvl: 53,
    keeper: true,
    bonuses: [
      { kind: "damagePct", value: 1.0 },
      { kind: "statPct", stat: "strength", value: 0.01 },
      { kind: "crit", value: 0.2 },
    ],
    lore: "ONLY THE WORTHY LIFT IT. OUT HERE, WORTHY MEANS STILL BREATHING.",
  },

  // HARD RUNG — the third batch of world relics (docs/item-plan.md, phase 2):
  // per-spec coverage for the hard climb. The rung's boss set already fields
  // a magic weapon (RIFTMAW) and a full armor loadout, so this batch adds the
  // MELEE and RANGED weapons, one spec-leaning piece each, and the rung's
  // one LEGENDARY. Farmed like every world relic: elites/bosses during the
  // campaign, the minion lottery once the hero out-levels the rung (gate 46).
  // SPACEZ HQ — the compound's marksman post: the rifle that watched the
  // perimeter for fifty years and never once blinked.
  {
    id: "longwatch",
    name: "LONGWATCH",
    base: "surplus_carbine",
    slot: "weapon",
    ilvl: 16,
    bonuses: [
      { kind: "crit", value: 0.08 },
      { kind: "stat", stat: "dexterity", value: 5 },
    ],
    lore: "THE WATCH ENDS WHEN THE MARK FALLS. THE WATCH HAS NOT ENDED.",
  },
  // THE MOON — the huntress the old world named this ground after; her visor
  // still marks what cannot be outrun.
  {
    id: "huntsmans_cowl",
    name: "HUNTSMAN'S COWL",
    base: "targeting_monocle",
    slot: "head",
    ilvl: 22,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 7 },
      { kind: "crit", value: 0.08 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "THE HUNTRESS OF THE OLD MOON WORE IT. NOTHING SHE MARKED OUTRAN THE NIGHT.",
  },
  // MARS — plating cut for the terraforming colossi that raised mountains;
  // a wall of a chestpiece that trades a step of speed for it.
  {
    id: "colossus_plate",
    name: "COLOSSUS PLATE",
    base: "chainmail_hauberk",
    slot: "chest",
    ilvl: 29,
    bonuses: [
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "maxHp", value: 45 },
      { kind: "armor", value: 18 },
      { kind: "stat", stat: "speed", value: -2 },
    ],
    lore: "CUT FOR THE MACHINES THAT RAISED MOUNTAINS. IT DOES NOT MOVE FOR LESS.",
  },
  // EASTWORLD — the last honest lawman's blade, sworn to the edge of a
  // molecule: the hard rung's melee anchor.
  {
    id: "oathbrand",
    name: "OATHBRAND",
    base: "ceramic_cutter",
    slot: "weapon",
    ilvl: 40,
    bonuses: [
      { kind: "damagePct", value: 1.2 },
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "SWORN TO AN EDGE ONE MOLECULE WIDE. IT HAS NEVER BEEN FORSWORN.",
  },
  // THE RIFT — the hard rung's LEGENDARY: the pistol fate itself aims. It
  // has never missed (sure strike), and the sky answers every landed shot
  // (on-hit lightning) — the first legendary built on the forever powers.
  {
    id: "the_inevitable",
    name: "THE INEVITABLE",
    base: "genius_pistol",
    slot: "weapon",
    tier: "legendary",
    ilvl: 55,
    keeper: true,
    bonuses: [
      { kind: "sureStrike" },
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.2, rank: 2 },
      { kind: "statPct", stat: "dexterity", value: 0.01 },
    ],
    lore: "EVERY SHOT IT EVER FIRED IS STILL ON ITS WAY TO SOMETHING.",
  },

  // NIGHTMARE RUNG — the fourth batch of world relics (docs/item-plan.md,
  // phase 3): the SECOND set per spec for the climb where the horde matches
  // the hero level for level. Five weapons (two melee, one ranged, two
  // magic — WRATHFLAME's boss set already fields a ranged one), four
  // spec-leaning armor pieces, and the rung's three LEGENDARIES — one per
  // spec, each carrying a forever power. Gate: minion lottery at lvl 57.
  // SPACEZ HQ — the storm, broken to harness in a ZAI lab.
  {
    id: "stormlash",
    name: "STORMLASH",
    base: "storm_projector",
    slot: "weapon",
    ilvl: 53,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 7 },
      { kind: "crit", value: 0.06 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "THE STORM, BROKEN TO HARNESS. IT STILL PULLS.",
  },
  // SPACEZ HQ — flight-weight composite cut for the dive.
  {
    id: "falconmail",
    name: "FALCONMAIL",
    base: "composite_vest",
    slot: "chest",
    ilvl: 60,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 6 },
      { kind: "stat", stat: "speed", value: 3 },
    ],
    lore: "CUT FOR THE DIVE. WHAT IT GIVES UP IN WEIGHT IT TAKES BACK IN SPEED.",
  },
  // THE MOON — the vigil's inheritance: sight that arrives before the blow.
  {
    id: "omensight",
    name: "OMENSIGHT",
    base: "synaptic_visor",
    slot: "head",
    ilvl: 50,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 7 },
      { kind: "stat", stat: "luck", value: 5 },
    ],
    lore: "IT SHOWS WHAT COMES NEXT. IT DOES NOT SHOW HOW TO STOP IT.",
  },
  // THE MOON — boots that cross the floor the way night does.
  {
    id: "veilwalkers",
    name: "VEILWALKERS",
    base: "flux_boots",
    slot: "feet",
    ilvl: 55,
    bonuses: [
      { kind: "stat", stat: "speed", value: 5 },
      { kind: "stat", stat: "dexterity", value: 5 },
      { kind: "stat", stat: "intelligence", value: 4 },
    ],
    lore: "THEY CROSS THE FLOOR THE WAY NIGHT CROSSES IT. NOTHING HEARS.",
  },
  // MARS — a wand still warm from the forge-heart of the red desert.
  {
    id: "pyrelight",
    name: "PYRELIGHT",
    base: "inferno_wand",
    slot: "weapon",
    ilvl: 59,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.05 },
    ],
    lore: "LIT ONCE AND NEVER SINCE PUT OUT. IT REMEMBERS BEING A STAR.",
  },
  // MARS — greaves planted like the terraformers that would not move.
  {
    id: "ironroot_greaves",
    name: "IRONROOT GREAVES",
    base: "riveted_chausses",
    slot: "legs",
    ilvl: 55,
    bonuses: [
      { kind: "stat", stat: "strength", value: 7 },
      { kind: "stat", stat: "stamina", value: 5 },
    ],
    lore: "STAND WHERE THEY ARE PLANTED AND NOTHING MOVES YOU. NOTHING HAS.",
  },
  // THE RIFT — the maul that buries what it fells.
  {
    id: "gravemaker",
    name: "GRAVEMAKER",
    base: "neutron_maul",
    slot: "weapon",
    ilvl: 57,
    bonuses: [
      { kind: "damagePct", value: 0.3 },
      { kind: "stat", stat: "strength", value: 10 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "WHAT IT FELLS STAYS FELLED. THE GROUND REMEMBERS EVERY BLOW.",
  },
  // EASTWORLD — the axe made for too many.
  {
    id: "hordebane",
    name: "HORDEBANE",
    base: "berserker_axe",
    slot: "weapon",
    ilvl: 60,
    bonuses: [
      { kind: "damagePct", value: 0.25 },
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "IT WAS MADE FOR TOO MANY. THERE HAVE NEVER BEEN TOO MANY.",
  },
  // EASTWORLD — a mouthful of fire off the park's monster-of-legend rack.
  {
    id: "dragons_breath",
    name: "DRAGON'S BREATH",
    base: "dragon_blunderbuss",
    slot: "weapon",
    ilvl: 60,
    bonuses: [
      { kind: "damagePct", value: 0.25 },
      { kind: "stat", stat: "dexterity", value: 8 },
      { kind: "stat", stat: "stamina", value: 4 },
    ],
    lore: "A MOUTHFUL OF FIRE FROM SOMETHING THAT NEVER EXISTED. THE BURNS EXIST.",
  },
  // THE RIFT — the nightmare rung's melee LEGENDARY: the cursed blade that
  // collects. It never whiffs, it answers every blow taken with lightning
  // (the game's first WHEN-STRUCK proc), and it takes its price in blood.
  {
    id: "the_reckoning",
    name: "THE RECKONING",
    base: "fusion_brand",
    slot: "weapon",
    tier: "legendary",
    ilvl: 68,
    bonuses: [
      { kind: "sureStrike" },
      { kind: "proc", trigger: "struck", spell: "bolt", chance: 0.25, rank: 2 },
      { kind: "statPct", stat: "strength", value: 0.01 },
      { kind: "damagePct", value: 0.6 },
      { kind: "maxHp", value: -60 },
    ],
    lore: "EVERY DEBT COMES DUE. THIS IS HOW.",
  },
  // EASTWORLD — the nightmare rung's ranged LEGENDARY: the revolver that
  // tears the sky open with every landed round.
  {
    id: "skybreaker",
    name: "SKYBREAKER",
    base: "ion_peacemaker",
    slot: "weapon",
    tier: "legendary",
    ilvl: 67,
    bonuses: [
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.25, rank: 2 },
      { kind: "statPct", stat: "dexterity", value: 0.01 },
      { kind: "crit", value: 0.08 },
      { kind: "damagePct", value: 0.4 },
    ],
    lore: "EVERY SHOT TEARS THE SKY, AND THE SKY ANSWERS.",
  },
  // THE RIFT — the nightmare rung's magic LEGENDARY: the burning crown of a
  // star that refused to die, ringing its bearer in forever fire (the first
  // granted-orbit showcase).
  {
    id: "sunwreath",
    name: "SUNWREATH",
    base: "magnetar_rod",
    slot: "weapon",
    tier: "legendary",
    ilvl: 58,
    bonuses: [
      { kind: "spell", spell: "orbit", rank: 2 },
      { kind: "damagePct", value: 0.8 },
    ],
    lore: "THE CROWN OF A STAR THAT REFUSED TO DIE. IT BURNS FOR ITS BEARER NOW.",
  },

  // JESUS RUNG (pre-99) — the fifth batch of world relics (docs/item-plan.md,
  // phase 4): the THIRD set per spec for the rung where the horde runs two
  // levels above the hero and mercy is absolute zero. Eight weapons, seven
  // armor pieces, a charm — and the rung's six pre-99 LEGENDARIES, every one
  // carrying a forever power. Gate: minion lottery at lvl 60; the 99+ roster
  // (phase 5) sits above these on higher-req bases. Ilvls ~67–96.
  // THE MOON — the hammer that made the craters' little brothers.
  {
    id: "worldsplitter",
    name: "WORLDSPLITTER",
    base: "meteor_hammer",
    slot: "weapon",
    ilvl: 75,
    bonuses: [
      { kind: "damagePct", value: 0.3 },
      { kind: "stat", stat: "strength", value: 10 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "THE CRATERS HAVE OLDER SIBLINGS. THIS MADE THEM.",
  },
  // THE MOON — greaves stridden out of a titan's cast-off frame.
  {
    id: "titanstride",
    name: "TITANSTRIDE",
    base: "exo_greaves",
    slot: "legs",
    ilvl: 88,
    bonuses: [
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "stat", stat: "stamina", value: 6 },
    ],
    lore: "LEGS FROM A FRAME THAT CARRIED MOUNTAINS. THEY HAVE NOT NOTICED YOU YET.",
  },
  // THE MOON — mail that has not stirred in an age, and will not start now.
  {
    id: "the_immovable",
    name: "THE IMMOVABLE",
    base: "double_mail_chausses",
    slot: "legs",
    ilvl: 94,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 8 },
      { kind: "maxHp", value: 60 },
      { kind: "armor", value: 50 },
      { kind: "stat", stat: "speed", value: -3 },
    ],
    lore: "IT HAS NEVER TAKEN A STEP BACK. IT RARELY TAKES ONE FORWARD.",
  },
  // THE MOON — boots that hold their ground where ground barely holds.
  {
    id: "earthfast",
    name: "EARTHFAST",
    base: "grav_anchor_boots",
    slot: "feet",
    ilvl: 90,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 7 },
      { kind: "stat", stat: "strength", value: 5 },
      { kind: "armor", value: 25 },
    ],
    lore: "WHEREVER THEY STAND IS, FOR THE MOMENT, EARTH.",
  },
  // MARS — the driver that throws hills. Ammunition is a formality.
  {
    id: "meteorfall",
    name: "METEORFALL",
    base: "mass_driver",
    slot: "weapon",
    ilvl: 86,
    bonuses: [
      { kind: "damagePct", value: 0.3 },
      { kind: "stat", stat: "dexterity", value: 8 },
      { kind: "maxHp", value: 40 },
    ],
    lore: "IT DOES NOT FIRE ROUNDS. IT SCHEDULES IMPACTS.",
  },
  // MARS — the sun's own spear, thrown over a desert with no shade.
  {
    id: "sunspear",
    name: "SUNSPEAR",
    base: "cosmic_raygun",
    slot: "weapon",
    ilvl: 78,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 9 },
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "NOON, SHARPENED TO A POINT.",
  },
  // MARS — the helm of whatever the terraformers dug too deep to name.
  {
    id: "crown_of_ruin",
    name: "CROWN OF RUIN",
    base: "monocoque_helm",
    slot: "head",
    ilvl: 91,
    bonuses: [
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "maxHp", value: 60 },
      { kind: "armor", value: 40 },
    ],
    lore: "WHOEVER WORE IT LAST RULED SOMETHING. NOTHING OF IT REMAINS TO RULE.",
  },
  // MARS — the wanderer's star, sewn into a ring that always points on.
  {
    id: "the_pilgrim_star",
    name: "THE PILGRIM STAR",
    base: "enchanted_ring",
    slot: "charm",
    ilvl: 40,
    bonuses: [
      { kind: "stat", stat: "luck", value: 10 },
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "IT POINTS NOWHERE YOU KNOW. IT HAS NEVER ONCE POINTED WRONG.",
  },
  // THE RIFT — the claymore quenched in the dark between universes.
  {
    id: "nightfall",
    name: "NIGHTFALL",
    base: "plasma_claymore",
    slot: "weapon",
    ilvl: 84,
    bonuses: [
      { kind: "damagePct", value: 0.3 },
      { kind: "crit", value: 0.08 },
      { kind: "stat", stat: "strength", value: 8 },
    ],
    lore: "QUENCHED IN THE DARK BETWEEN UNIVERSES. IT NEVER QUITE CAME BACK OUT.",
  },
  // THE RIFT — the whole storm, projected through one aperture.
  {
    id: "maelstrom",
    name: "MAELSTROM",
    base: "tempest_projector",
    slot: "weapon",
    ilvl: 90,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 10 },
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "THE WHOLE STORM, THROUGH ONE NARROW DOOR.",
  },
  // THE RIFT — plate hammered on the anvil where stars are struck.
  {
    id: "starforge_plate",
    name: "STARFORGE PLATE",
    base: "femtoweave_plate",
    slot: "chest",
    ilvl: 87,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 8 },
      { kind: "maxHp", value: 60 },
      { kind: "armor", value: 50 },
    ],
    lore: "HAMMERED WHERE STARS ARE STRUCK. IT STILL HOLDS THE HEAT.",
  },
  // SPACEZ HQ — the rod that binds light itself to the wielder's will.
  {
    id: "lightbinder",
    name: "LIGHTBINDER",
    base: "quasar_rod",
    slot: "weapon",
    ilvl: 83,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 10 },
      { kind: "damagePct", value: 0.25 },
    ],
    lore: "LIGHT OBEYS IT. LIGHT DID NOT GET A CHOICE.",
  },
  // SPACEZ HQ — the visor that reads the field by starlight alone.
  {
    id: "starsight",
    name: "STARSIGHT",
    base: "orion_visor",
    slot: "head",
    ilvl: 70,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 7 },
      { kind: "stat", stat: "luck", value: 4 },
    ],
    lore: "IT SEES BY LIGHT THAT LEFT ITS STAR BEFORE ANYTHING HERE HAD EYES.",
  },
  // SPACEZ HQ — the plate every blow has already been tried against.
  {
    id: "the_anvil",
    name: "THE ANVIL",
    base: "debris_shield_vest",
    slot: "chest",
    ilvl: 77,
    bonuses: [
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "maxHp", value: 70 },
      { kind: "armor", value: 45 },
      { kind: "stat", stat: "speed", value: -2 },
    ],
    lore: "EVERYTHING BREAKS ON IT. THAT IS WHAT IT IS FOR.",
  },
  // EASTWORLD — the revolver that ends the argument, correctly.
  {
    id: "the_verdict",
    name: "THE VERDICT",
    base: "ranger_revolver",
    slot: "weapon",
    ilvl: 67,
    bonuses: [
      { kind: "crit", value: 0.1 },
      { kind: "stat", stat: "dexterity", value: 8 },
      { kind: "damagePct", value: 0.15 },
    ],
    lore: "IT HEARS BOTH SIDES. THEN IT RULES.",
  },
  // EASTWORLD — the rifle zeroed on the line where the world ends.
  {
    id: "horizons_end",
    name: "HORIZON'S END",
    base: "marksman_rifle",
    slot: "weapon",
    ilvl: 77,
    bonuses: [
      { kind: "crit", value: 0.1 },
      { kind: "stat", stat: "dexterity", value: 9 },
      { kind: "damagePct", value: 0.2 },
    ],
    lore: "NOTHING ON THIS SIDE OF THE HORIZON IS OUT OF ITS REACH.",
  },

  // THE JESUS PRE-99 LEGENDARIES — six, one anchor per spec plus three
  // armor/trinket pieces, every one carrying a forever power. The 99+ roster
  // (phase 5) climbs from here on the rarity power law.
  // EASTWORLD — the regicide blade: it has unmade kings, and it answers
  // every landed blow with a burst of ruin.
  {
    id: "kingsbane",
    name: "KINGSBANE",
    base: "falcata",
    slot: "weapon",
    tier: "legendary",
    ilvl: 99,
    bonuses: [
      { kind: "sureStrike" },
      { kind: "proc", trigger: "hit", spell: "nova", chance: 0.2, rank: 2 },
      { kind: "damagePct", value: 0.6 },
      { kind: "crit", value: 0.12 },
      { kind: "stat", stat: "strength", value: 3 },
    ],
    lore: "CROWNS DO NOT STOP IT. CROWNS NEVER HAVE.",
  },
  // EASTWORLD — the pistol that speaks once per life, softly.
  {
    id: "the_long_silence",
    name: "THE LONG SILENCE",
    base: "oracle_pistol",
    slot: "weapon",
    tier: "legendary",
    ilvl: 86,
    bonuses: [
      { kind: "proc", trigger: "kill", spell: "nova", chance: 0.25, rank: 2 },
      { kind: "crit", value: 0.12 },
      { kind: "stat", stat: "dexterity", value: 7 },
      { kind: "damagePct", value: 0.6 },
    ],
    lore: "AFTER IT SPEAKS, NOTHING ELSE DOES.",
  },
  // THE RIFT — the lance of falling starlight: every kill comes down as a
  // burst of sky.
  {
    id: "starfall",
    name: "STARFALL",
    base: "maser_lance",
    slot: "weapon",
    tier: "legendary",
    ilvl: 76,
    bonuses: [
      { kind: "proc", trigger: "kill", spell: "nova", chance: 0.3, rank: 3 },
      { kind: "damagePct", value: 0.8 },
      { kind: "stat", stat: "intelligence", value: 3 },
    ],
    lore: "EVERY FALLEN FOE PULLS A PIECE OF THE SKY DOWN WITH IT.",
  },
  // THE MOON — the ward of the great stillness: the sea of tranquility,
  // worn as a shell that slows the world around its bearer.
  {
    id: "the_stillward",
    name: "THE STILLWARD",
    base: "graphene_shell",
    slot: "chest",
    tier: "legendary",
    ilvl: 86,
    keeper: true,
    bonuses: [
      { kind: "spell", spell: "stasis", rank: 2 },
      { kind: "maxHpPct", value: 0.01 },
      { kind: "stat", stat: "stamina", value: 4 },
    ],
    lore: "THE GREAT STILLNESS, CUT TO FIT. THE WORLD SLOWS TO MATCH IT.",
  },
  // EASTWORLD — the spurs of the rider the wind could not keep up with.
  {
    id: "windgrave",
    name: "WINDGRAVE",
    base: "thruster_spurs",
    slot: "feet",
    tier: "legendary",
    ilvl: 69,
    bonuses: [
      { kind: "statPct", stat: "speed", value: 0.01 },
      { kind: "stat", stat: "speed", value: 8 },
      { kind: "stat", stat: "dexterity", value: 2 },
    ],
    lore: "THE WIND CHASED THE RIDER. HERE IS WHERE THE WIND GAVE UP.",
  },
  // THE RIFT — the burning heart: a core of forever fire that rings any
  // bearer, whatever they fight with.
  {
    id: "emberheart",
    name: "EMBERHEART",
    base: "crystal_orb",
    slot: "charm",
    tier: "legendary",
    ilvl: 36,
    bonuses: [
      { kind: "spell", spell: "orbit", rank: 2 },
      { kind: "stat", stat: "intelligence", value: 2 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "A HEART THAT NEVER COOLED. IT BEATS IN FIRE, FOR WHOEVER CARRIES IT.",
  },

  // ── THE 60→99 ENDGAME UNIQUES ────────────────────────────────────────────
  // Twelve relics that fill the ilvl 80–99 chase window between the campaign's
  // last uniques and the level-99 ARTIFACT roster — weighted to the slots the
  // endgame left empty (charm & bag had NO drop above ilvl 53/49; head/legs/
  // feet were thin). Wired onto the JESUS rungs so they farm in the Rift → the
  // Bunker loop. ilvls are the computed values (weapon-ilvl.mjs); trinkets gate
  // low by design (charms carry one scaling keeper + flat; bags run a big flat
  // block off the req-1 base), landing a notch under the artifact trinkets.

  // EASTWORLD — the bet the frontier's house could never cover.
  {
    id: "the_last_ante",
    name: "THE LAST ANTE",
    base: "crystal_orb",
    slot: "charm",
    ilvl: 86,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.02 },
      { kind: "stat", stat: "luck", value: 18 },
      { kind: "maxHp", value: 120 },
      { kind: "crit", value: 0.06 },
      { kind: "stat", stat: "stamina", value: 12 },
      { kind: "stat", stat: "intelligence", value: 10 },
    ],
    lore: "EVERYTHING ON ONE CARD. THE HOUSE COULD NOT COVER THE CALL.",
  },
  // THE RIFT — the one place in all the noise that will not move.
  {
    id: "the_still_point",
    name: "THE STILL POINT",
    base: "grimoire",
    slot: "charm",
    ilvl: 91,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.02 },
      { kind: "stat", stat: "intelligence", value: 20 },
      { kind: "maxHp", value: 140 },
      { kind: "crit", value: 0.06 },
      { kind: "stat", stat: "stamina", value: 14 },
      { kind: "stat", stat: "luck", value: 8 },
    ],
    lore: "EVERYTHING IN HERE DRIFTS. HOLD THIS, AND YOU DO NOT.",
  },
  // MARS — the red hour the terraformers dug down into and woke.
  {
    id: "the_ember_hour",
    name: "THE EMBER HOUR",
    base: "enchanted_ring",
    slot: "charm",
    ilvl: 96,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "strength", value: 0.02 },
      { kind: "stat", stat: "strength", value: 20 },
      { kind: "maxHp", value: 160 },
      { kind: "crit", value: 0.06 },
      { kind: "stat", stat: "stamina", value: 16 },
      { kind: "stat", stat: "dexterity", value: 8 },
    ],
    lore: "THE HOUR THE RED WORLD BURNS HOTTEST. IT NEVER QUITE ENDS.",
  },
  // THE RIFT — the star that hangs fixed while every other falls.
  {
    id: "the_fixed_star",
    name: "THE FIXED STAR",
    base: "enchanted_ring",
    slot: "charm",
    ilvl: 99,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.02 },
      { kind: "stat", stat: "luck", value: 26 },
      { kind: "maxHp", value: 200 },
      { kind: "crit", value: 0.08 },
      { kind: "stat", stat: "intelligence", value: 18 },
    ],
    lore: "NIGHTFALL DROPS. STARFALL DROPS. THIS ONE NEVER HAS.",
  },
  // SPACEZ HQ — everything the machine ever owed you, collected at last.
  {
    id: "the_severance",
    name: "THE SEVERANCE",
    base: "bag",
    slot: "bag",
    ilvl: 95,
    bagSlots: 4,
    bonuses: [
      { kind: "stat", stat: "luck", value: 16 },
      { kind: "stat", stat: "stamina", value: 18 },
      { kind: "maxHp", value: 210 },
      { kind: "stat", stat: "intelligence", value: 14 },
      { kind: "stat", stat: "strength", value: 14 },
      { kind: "stat", stat: "dexterity", value: 12 },
    ],
    lore: "EVERYTHING THEY OWED THE ONES THEY LAID OFF. PAID OUT AT LAST.",
  },
  // MARS — the strike the whole dust bowl was dug looking for.
  {
    id: "the_motherlode",
    name: "THE MOTHERLODE",
    base: "bag",
    slot: "bag",
    ilvl: 79,
    bagSlots: 5,
    bonuses: [
      { kind: "stat", stat: "strength", value: 16 },
      { kind: "stat", stat: "stamina", value: 16 },
      { kind: "maxHp", value: 170 },
      { kind: "stat", stat: "luck", value: 14 },
      { kind: "stat", stat: "dexterity", value: 12 },
    ],
    lore: "EVERY PROSPECTOR ON MARS DIED LOOKING FOR IT. YOU TRIPPED OVER IT.",
  },
  // EASTWORLD — enough to buy back a throne, with room to spare.
  {
    id: "the_kings_ransom",
    name: "THE KING'S RANSOM",
    base: "bag",
    slot: "bag",
    ilvl: 93,
    bagSlots: 5,
    bonuses: [
      { kind: "stat", stat: "luck", value: 18 },
      { kind: "stat", stat: "stamina", value: 16 },
      { kind: "maxHp", value: 200 },
      { kind: "stat", stat: "strength", value: 14 },
      { kind: "stat", stat: "dexterity", value: 12 },
      { kind: "stat", stat: "intelligence", value: 10 },
    ],
    lore: "ENOUGH TO BUY BACK A CROWN. THE CROWN WAS NEVER WORTH IT.",
  },
  // SPACEZ HQ — the CORE's final ruling, worn where thoughts are read.
  {
    id: "the_last_word",
    name: "THE LAST WORD",
    base: "cortex_visor",
    slot: "head",
    ilvl: 87,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 8 },
      { kind: "maxHp", value: 60 },
      { kind: "armor", value: 30 },
      { kind: "crit", value: 0.04 },
    ],
    lore: "IT HAS ALREADY DECIDED WHAT YOU WERE GOING TO SAY.",
  },
  // MARS — the line the legion held, that nothing has yet crossed.
  {
    id: "the_bulwark",
    name: "THE BULWARK",
    base: "praetorian_cuirass",
    slot: "chest",
    ilvl: 92,
    bonuses: [
      { kind: "stat", stat: "strength", value: 8 },
      { kind: "maxHp", value: 70 },
      { kind: "armor", value: 45 },
      { kind: "stat", stat: "speed", value: -2 },
    ],
    lore: "THE LINE HAS NOT BROKEN. IT HAS NOT EVEN BENT.",
  },
  // THE MOON — plate poured from the crust of a world that already died.
  {
    id: "the_worldshell",
    name: "THE WORLDSHELL",
    base: "paladin_exoplate",
    slot: "chest",
    ilvl: 94,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 8 },
      { kind: "maxHp", value: 70 },
      { kind: "armor", value: 45 },
    ],
    lore: "A DEAD WORLD'S CRUST, CUT TO FIT A LIVING BACK.",
  },
  // THE MOON — greaves that outwalked the war they were forged for.
  {
    id: "the_long_march",
    name: "THE LONG MARCH",
    base: "exo_greaves",
    slot: "legs",
    ilvl: 89,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 8 },
      { kind: "stat", stat: "strength", value: 6 },
      { kind: "armor", value: 20 },
    ],
    lore: "THEY HAVE WALKED FARTHER THAN THE WAR THAT MADE THEM.",
  },
  // THE RIFT — boots that land where no foot has ever fallen.
  {
    id: "the_far_shore",
    name: "THE FAR SHORE",
    base: "gilded_caligae",
    slot: "feet",
    ilvl: 88,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 6 },
      { kind: "stat", stat: "stamina", value: 3 },
      { kind: "armor", value: 8 },
    ],
    lore: "EVERY STEP LANDS SOMEWHERE THAT HAS NEVER HELD A FOOT.",
  },
];
