// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ARTIFACTS — the level-99 endgame roster, the very top of the loot ladder
// above legendary. These are the Rift dredging Earth's whole myth-history to
// the surface: the named relics of legend, minted at the `"artifact"` tier
// (red card, densest pickup blaze) and dropped ONLY at the level cap — the
// artifact tier is gated shut until the hero reaches `LEVELING.maxLevel` (99,
// reachable only on JESUS's endgame grind; see `rollTier`). Every artifact's
// EQUIP requirement is `min(maxLevel, ilvl)` = 99 for the whole roster
// (`itemLevelReq`), so a relic is worn exactly where it drops — never a
// low-level hand. The item-level FLOOR still retires everything lighter at 99.
//
// They span a VAST power ladder ON PURPOSE, and the rarity is DERIVED from that
// power: `uniqueDropWeight` scales an artifact's drop odds by
// `(rarityBudgetRef / budget)^rarityBudgetExp`, so the strong ones are
// exponentially rarer — a modest artifact drops at the flat weight, an apex
// god-roll (DURENDAL) is ~170× rarer than it. Authored from solid keepers near
// the reference budget (GLEIPNIR, GÁNDIVA) up to the two apex weapons (DURENDAL,
// RUYI JINGU) at several times it. Budgets/ilvls are the checker's answer
// (`weapon-ilvl.mjs --suggest`), not free-hand numbers; artifacts are exempt
// from the equip-gate budget cap (they pay for power in ODDS, not the gate).
//
// No table wiring: like legendaries, artifacts drop globally via the rarity
// roll, never from a boss/level table. No new art — every relic reuses an
// existing catalog base (see the `base` on each).

import type { UniqueDef } from "./uniques.ts";

export const ARTIFACT_UNIQUES: UniqueDef[] = [
  // ── Weapons: melee ──────────────────────────────────────────────────────
  // DURENDAL — the apex. Roland's holy sword that could not be broken and
  // could not be dulled: it never whiffs, answers every blow with a bolt, and
  // grows with the arm that swings it. The rarest thing in the game.
  {
    id: "durendal",
    name: "DURENDAL",
    base: "starfall_brand",
    slot: "weapon",
    tier: "artifact",
    ilvl: 236,
    bonuses: [
      { kind: "sureStrike" },
      { kind: "statPct", stat: "strength", value: 0.02 },
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.35, rank: 5 },
      { kind: "stat", stat: "strength", value: 50 },
      { kind: "stat", stat: "stamina", value: 25 },
      { kind: "maxHp", value: 240 },
      { kind: "crit", value: 0.12 },
      { kind: "damagePct", value: 0.8 },
    ],
    lore: "IT DID NOT BREAK ON THE STONE. THE STONE BROKE.",
  },
  // GRAM — Sigurd's dragon-slaying sword, reforged from the shards of a god's
  // blade. Every cleave blooms into ruin — and HURLS the struck back (the rare
  // knockback signature on the great sweeping blade).
  {
    id: "gram",
    name: "GRAM",
    base: "glorious_axe",
    slot: "weapon",
    tier: "artifact",
    ilvl: 149,
    bonuses: [
      { kind: "knockback" },
      { kind: "proc", trigger: "hit", spell: "nova", chance: 0.25, rank: 3 },
      { kind: "stat", stat: "strength", value: 22 },
      { kind: "damagePct", value: 0.7 },
      { kind: "crit", value: 0.1 },
      { kind: "stat", stat: "stamina", value: 10 },
    ],
    lore: "IT WAS BROKEN ONCE, AND REMADE HUNGRIER. IT REMEMBERS THE DRAGON.",
  },
  // MURAMASA — the cursed katana that thirsts: it cuts deeper than anything,
  // but drinks from its wielder to do it (a maxHp downside buys the edge).
  {
    id: "muramasa",
    name: "MURAMASA",
    base: "falcata",
    slot: "weapon",
    tier: "artifact",
    ilvl: 121,
    bonuses: [
      { kind: "damagePct", value: 1.2 },
      { kind: "crit", value: 0.2 },
      { kind: "stat", stat: "strength", value: 24 },
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.35, rank: 4 },
      { kind: "maxHp", value: -150 },
    ],
    lore: "IT DEMANDS BLOOD. IT DOES NOT CARE WHOSE. USUALLY IT IS SATISFIED.",
  },
  // ── Weapons: ranged ─────────────────────────────────────────────────────
  // FAIL-NOT — Tristan's bow that could not miss. The ranged APEX: a
  // single-shot bow (siege_bow, the hardest-hitting ranged base) that never
  // whiffs and drives each true arrow home for crushing single-target damage —
  // the marksman's answer to DURENDAL, the boss-killer a ranged endgame is
  // built around. Its whole budget used to buy utility (never-miss, a spark
  // proc, DEX) with no raw damage, so the rarest ranged relic hit softest; the
  // heavy `damagePct` makes the apex finally strike like one.
  {
    id: "fail_not",
    name: "FAIL-NOT",
    base: "siege_bow",
    slot: "weapon",
    tier: "artifact",
    ilvl: 166,
    bonuses: [
      { kind: "sureStrike" },
      { kind: "damagePct", value: 1.0 },
      { kind: "statPct", stat: "dexterity", value: 0.02 },
      { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.3, rank: 5 },
      { kind: "stat", stat: "dexterity", value: 30 },
      { kind: "crit", value: 0.15 },
    ],
    lore: "IT HAS LOOSED TEN THOUSAND ARROWS. NONE HAVE LANDED ANYWHERE BUT HOME.",
  },
  // SHARANGA — Vishnu's celestial bow, a storm strung on a stave. Its arrows
  // burst where they strike, and the burst HURLS the struck back (the rare
  // knockback signature — the one ranged relic that shoves).
  {
    id: "sharanga",
    name: "SHARANGA",
    base: "railstorm_repeater",
    slot: "weapon",
    tier: "artifact",
    ilvl: 148,
    bonuses: [
      { kind: "knockback" },
      { kind: "proc", trigger: "hit", spell: "nova", chance: 0.25, rank: 3 },
      { kind: "stat", stat: "dexterity", value: 25 },
      { kind: "crit", value: 0.12 },
      { kind: "damagePct", value: 0.6 },
      { kind: "stat", stat: "speed", value: 6 },
    ],
    lore: "THE BOW OF THE PRESERVER. IT ENDS THINGS SO OTHER THINGS MAY GO ON.",
  },
  // GÁNDIVA — Arjuna's divine bow with the inexhaustible quiver. A clean,
  // fast, tremendous staple — the artifact you find first and keep.
  {
    id: "gandiva",
    name: "GÁNDIVA",
    base: "nova_peacemaker",
    slot: "weapon",
    tier: "artifact",
    ilvl: 129,
    bonuses: [
      { kind: "stat", stat: "dexterity", value: 26 },
      { kind: "crit", value: 0.14 },
      { kind: "damagePct", value: 0.7 },
      { kind: "stat", stat: "speed", value: 6 },
    ],
    lore: "THE QUIVER NEVER EMPTIED. NEITHER, IN THE END, DID THE FIELD OF THE DEAD.",
  },
  // ── Weapons: magic ──────────────────────────────────────────────────────
  // RUYI JINGU — the Monkey King's staff that could grow to prop the sky. The
  // second apex: a permanent storm, a nova on every hit, and INT to feed both.
  {
    id: "ruyi_jingu",
    name: "RUYI JINGU",
    base: "solar_wand",
    slot: "weapon",
    tier: "artifact",
    ilvl: 216,
    bonuses: [
      { kind: "spell", spell: "storm", rank: 5 },
      { kind: "statPct", stat: "intelligence", value: 0.02 },
      { kind: "stat", stat: "intelligence", value: 42 },
      { kind: "proc", trigger: "hit", spell: "nova", chance: 0.3, rank: 4 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "AS-YOU-WISH. IT WEIGHED NOTHING, OR IT HELD UP HEAVEN. THE BEARER DECIDED.",
  },
  // THYRSUS — Dionysus's fennel staff wreathed in living fire, circling the
  // one who raises it.
  {
    id: "thyrsus",
    name: "THYRSUS",
    base: "horizon_maw",
    slot: "weapon",
    tier: "artifact",
    ilvl: 138,
    bonuses: [
      { kind: "spell", spell: "orbit", rank: 3 },
      { kind: "stat", stat: "intelligence", value: 22 },
      { kind: "damagePct", value: 0.5 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "PINE-CROWNED, VINE-WOUND. WHAT IT TOUCHES REMEMBERS IT WAS ONCE ON FIRE.",
  },
  // SEIÐR STAFF — the völva's distaff of Norse sorcery, that stills the world
  // to a crawl around its caster.
  {
    id: "seidr_staff",
    name: "SEIÐR STAFF",
    base: "basilisk_sprayer",
    slot: "weapon",
    tier: "artifact",
    ilvl: 135,
    bonuses: [
      { kind: "spell", spell: "stasis", rank: 2 },
      { kind: "stat", stat: "intelligence", value: 22 },
      { kind: "damagePct", value: 0.4 },
      { kind: "crit", value: 0.08 },
    ],
    lore: "SHE SANG THE FATES A LITTLE SLOWER. THEY DID NOT NOTICE UNTIL TOO LATE.",
  },
  // ── Head ────────────────────────────────────────────────────────────────
  // TARNHELM — the Nibelung helm that hid its wearer and let them slip aside.
  // A keeper: it grows the dexterity it rewards.
  {
    id: "tarnhelm",
    name: "TARNHELM",
    base: "cortex_visor",
    slot: "head",
    tier: "artifact",
    ilvl: 115,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "dexterity", value: 0.02 },
      { kind: "stat", stat: "dexterity", value: 15 },
      { kind: "stat", stat: "speed", value: 6 },
      { kind: "crit", value: 0.06 },
    ],
    lore: "PUT IT ON AND BE ELSEWHERE. THE BLOW FALLS WHERE YOU WERE STANDING.",
  },
  // HELM OF DARKNESS — Hades' cap of invisibility, worn to the war of gods.
  // Struck in the dark, it answers with a burst of the dark.
  {
    id: "helm_of_darkness",
    name: "HELM OF DARKNESS",
    // MAIL helm — a bruiser's piece (STR-gated), so its raw stat is STRENGTH,
    // not the caster INTELLIGENCE it once granted.
    base: "templars_helm",
    slot: "head",
    tier: "artifact",
    ilvl: 129,
    bonuses: [
      { kind: "proc", trigger: "struck", spell: "nova", chance: 0.2, rank: 3 },
      { kind: "stat", stat: "strength", value: 18 },
      { kind: "maxHp", value: 120 },
      { kind: "stat", stat: "stamina", value: 8 },
    ],
    lore: "THE HELM OF THE UNSEEN LORD. WHAT WEARS IT IS NOT THERE TO BE STRUCK.",
  },
  // ÆGISHJÁLMR — the Helm of Awe, worn on Fafnir's brow, that turned terror
  // outward. Struck, it detonates the fear it holds.
  {
    id: "aegishjalmr",
    name: "ÆGISHJÁLMR",
    base: "deadeye_visor",
    slot: "head",
    tier: "artifact",
    ilvl: 164,
    bonuses: [
      { kind: "proc", trigger: "struck", spell: "nova", chance: 0.25, rank: 4 },
      { kind: "maxHpPct", value: 0.02 },
      { kind: "stat", stat: "strength", value: 20 },
      { kind: "stat", stat: "stamina", value: 15 },
      { kind: "maxHp", value: 150 },
    ],
    lore: "BETWEEN THE EYES, THE SIGN OF AWE. ALL WHO LOOK UPON IT FORGET THEIR COURAGE.",
  },
  // ── Chest ───────────────────────────────────────────────────────────────
  // GOLDEN FLEECE — the healing pelt sought across the world. A keeper: the
  // more life it guards, the more it grows.
  {
    id: "golden_fleece",
    name: "GOLDEN FLEECE",
    base: "femtoweave_plate",
    slot: "chest",
    tier: "artifact",
    ilvl: 108,
    keeper: true,
    bonuses: [
      { kind: "maxHpPct", value: 0.02 },
      { kind: "stat", stat: "stamina", value: 15 },
      { kind: "maxHp", value: 150 },
      { kind: "armor", value: 60 },
    ],
    lore: "KINGS SENT ARMIES FOR IT. IT ONLY EVER WANTED SOMETHING WARM TO KEEP.",
  },
  // BABR-E BAYAN — Rostam's pelt of the water-tiger, proof against fire, iron,
  // and drowning. It answers a blow with a burst.
  {
    id: "babr_e_bayan",
    name: "BABR-E BAYAN",
    base: "tigulated_mail",
    slot: "chest",
    tier: "artifact",
    ilvl: 144,
    bonuses: [
      { kind: "proc", trigger: "struck", spell: "nova", chance: 0.2, rank: 3 },
      { kind: "stat", stat: "strength", value: 18 },
      { kind: "stat", stat: "stamina", value: 12 },
      { kind: "maxHp", value: 150 },
      { kind: "armor", value: 100 },
    ],
    lore: "NEITHER FLAME NOR FLOOD NOR BLADE MARKED IT. THE HERO WORE THE RIVER'S HIDE.",
  },
  // ACHILLEAN PLATE — the god-forged armor of Achilles, near-invulnerable, its
  // one flaw not in the plate. Struck, it grounds the blow in lightning.
  {
    id: "achillean_plate",
    name: "ACHILLEAN PLATE",
    base: "elder_scale_cloak",
    slot: "chest",
    tier: "artifact",
    ilvl: 183,
    bonuses: [
      { kind: "proc", trigger: "struck", spell: "bolt", chance: 0.25, rank: 4 },
      { kind: "maxHpPct", value: 0.02 },
      { kind: "stat", stat: "strength", value: 24 },
      { kind: "stat", stat: "stamina", value: 20 },
      { kind: "maxHp", value: 220 },
      { kind: "armor", value: 140 },
    ],
    lore: "FORGED ON OLYMPUS, PROOF AGAINST ALL. THE FLAW WAS NEVER IN THE ARMOR.",
  },
  // ── Legs ────────────────────────────────────────────────────────────────
  // MEGINGJÖRÐ — Thor's girdle of might that doubled the strength of the
  // strongest god. A keeper, and the point of it is the growth.
  {
    id: "megingjord",
    name: "MEGINGJÖRÐ",
    base: "double_mail_chausses",
    slot: "legs",
    tier: "artifact",
    ilvl: 156,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "strength", value: 0.02 },
      { kind: "stat", stat: "strength", value: 28 },
      { kind: "stat", stat: "stamina", value: 15 },
      { kind: "damagePct", value: 0.5 },
      { kind: "maxHp", value: 120 },
    ],
    lore: "THE STRONGEST THING ALIVE BUCKLED IT ON WHEN HE NEEDED TO BE STRONGER.",
  },
  // JÖTUNN GREAVES — greaves cut for a giant's stride, plated to match.
  {
    id: "jotunn_greaves",
    name: "JÖTUNN GREAVES",
    base: "mirrored_greaves",
    slot: "legs",
    tier: "artifact",
    ilvl: 135,
    bonuses: [
      { kind: "stat", stat: "strength", value: 20 },
      { kind: "stat", stat: "stamina", value: 14 },
      { kind: "maxHp", value: 150 },
      { kind: "armor", value: 80 },
    ],
    lore: "MADE FOR LEGS THAT STEP OVER MOUNTAINS. THEY FIT YOU. GROW INTO THEM.",
  },
  // GLEIPNIR CHAUSSES — woven of the six impossible things, the binding that
  // held the wolf. Footing that never slips. A solid staple.
  {
    id: "gleipnir_chausses",
    name: "GLEIPNIR CHAUSSES",
    base: "basilisk_chaps",
    slot: "legs",
    tier: "artifact",
    ilvl: 131,
    bonuses: [
      { kind: "stat", stat: "stamina", value: 16 },
      { kind: "stat", stat: "strength", value: 12 },
      { kind: "maxHp", value: 120 },
      { kind: "stat", stat: "speed", value: 5 },
    ],
    lore: "SOFT AS SILK, AND NOTHING HAS EVER TORN IT. NOT EVEN THE WOLF.",
  },
  // ── Feet ────────────────────────────────────────────────────────────────
  // WINDRUNNERS — the boots the wind could not outpace. A keeper for speed.
  {
    id: "windrunners",
    name: "WINDRUNNERS",
    base: "grav_anchor_boots",
    slot: "feet",
    tier: "artifact",
    ilvl: 129,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "speed", value: 0.02 },
      { kind: "stat", stat: "speed", value: 10 },
      // MAIL boots — the raw combat stat is a bruiser's STRENGTH, not DEXTERITY.
      { kind: "stat", stat: "strength", value: 12 },
      { kind: "stat", stat: "stamina", value: 10 },
    ],
    lore: "THE WIND SET OUT TO RACE THEM. THE WIND IS STILL RUNNING.",
  },
  // SLEIPNIR'S SHOES — shod from the eight-legged steed that outran the world.
  {
    id: "sleipnirs_shoes",
    name: "SLEIPNIR'S SHOES",
    base: "myrmidon_sabatons",
    slot: "feet",
    tier: "artifact",
    ilvl: 142,
    bonuses: [
      { kind: "stat", stat: "speed", value: 12 },
      // MAIL sabatons — a bruiser's boots: STRENGTH over the ranged DEXTERITY.
      { kind: "stat", stat: "strength", value: 15 },
      { kind: "stat", stat: "stamina", value: 12 },
      { kind: "maxHp", value: 120 },
      { kind: "armor", value: 60 },
    ],
    lore: "EIGHT LEGS, NINE WORLDS, ONE NIGHT. THE GREY HORSE NEVER TIRED.",
  },
  // VÍÐARR'S BOOT — the thick boot heaped from every scrap of leather, that
  // braced open the wolf's jaw at the end of the world. Struck, it strikes.
  {
    id: "vidarrs_boot",
    name: "VÍÐARR'S BOOT",
    base: "afterburner_spurs",
    slot: "feet",
    tier: "artifact",
    ilvl: 163,
    bonuses: [
      { kind: "proc", trigger: "struck", spell: "bolt", chance: 0.2, rank: 4 },
      { kind: "stat", stat: "strength", value: 20 },
      { kind: "stat", stat: "stamina", value: 16 },
      { kind: "maxHp", value: 150 },
      { kind: "stat", stat: "speed", value: 8 },
      { kind: "armor", value: 80 },
    ],
    lore: "SAVED FROM EVERY COBBLER'S SCRAP FOR THIS ONE STEP ONTO THE WOLF'S JAW.",
  },
  // ── Charms ──────────────────────────────────────────────────────────────
  // DRAUPNIR — Odin's ring that dripped eight more of itself every ninth
  // night. Wealth, luck, and the fortune to find more. A keeper.
  {
    id: "draupnir",
    name: "DRAUPNIR",
    base: "enchanted_ring",
    slot: "charm",
    tier: "artifact",
    ilvl: 103,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.02 },
      { kind: "stat", stat: "luck", value: 34 },
      { kind: "maxHp", value: 180 },
      { kind: "crit", value: 0.1 },
      { kind: "stat", stat: "stamina", value: 14 },
    ],
    lore: "EVERY NINTH NIGHT, EIGHT MORE. THE GOD OF THE HANGED NEVER WANTED FOR GOLD.",
  },
  // SAMPO — the mill of the north that ground out salt, grain, and gold from
  // nothing. Fortune itself, worn at the belt. A keeper.
  {
    id: "sampo",
    name: "SAMPO",
    base: "grimoire",
    slot: "charm",
    tier: "artifact",
    ilvl: 102,
    keeper: true,
    bonuses: [
      { kind: "statPct", stat: "luck", value: 0.02 },
      { kind: "stat", stat: "luck", value: 22 },
      { kind: "stat", stat: "intelligence", value: 18 },
      { kind: "maxHp", value: 180 },
      { kind: "stat", stat: "stamina", value: 12 },
    ],
    lore: "IT GROUND OUT WHATEVER WAS ASKED. THREE PEOPLES WENT TO WAR TO OWN IT.",
  },
  // ── Bag ─────────────────────────────────────────────────────────────────
  // CORNUCOPIA — the horn of plenty that never empties. The endgame carryall:
  // six extra cells, and fortune besides.
  {
    id: "cornucopia",
    name: "CORNUCOPIA",
    base: "bag",
    slot: "bag",
    tier: "artifact",
    ilvl: 103,
    bagSlots: 6,
    bonuses: [
      { kind: "stat", stat: "luck", value: 22 },
      { kind: "stat", stat: "stamina", value: 18 },
      { kind: "maxHp", value: 240 },
      { kind: "stat", stat: "strength", value: 12 },
      { kind: "stat", stat: "dexterity", value: 12 },
      { kind: "stat", stat: "intelligence", value: 10 },
    ],
    lore: "THE HORN THAT BROKE FROM THE GOAT THAT SUCKLED A GOD. IT HAS NEVER RUN DRY.",
  },
];
