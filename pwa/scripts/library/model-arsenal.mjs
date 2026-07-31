// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARSENAL's page model: every base item and every named chase item, folded
// into the shape a page wants to be rendered from — plus the index of WHERE
// each one comes from, which is what turns the arsenal into a graph rather
// than a shelf.
//
// Facts only, the same rule the bestiary model follows: every number here came
// back from ./catalogs.mjs, either read off a compiled catalog or returned by
// the engine. The sentences are ./prose-arsenal.mjs; the markup is
// ./render-arsenal.mjs.

import {
  ABILITY_DEFS,
  ARMOR_TYPES,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  LOOT,
  QUALITY,
  QUALITY_ORDER,
  QUALITY_PREFIX,
  SET_DEFS,
  SIDEARM_DEF_ID,
  TIERS,
  UNIQUE_DEFS,
  UNIQUE_TUNING,
  WEAPON_DEFS,
  affixLine,
  armorTypeOf,
  baseCritMult,
  baseLore,
  baseItemDefs,
  equipmentDropWeight,
  equipmentLevelReq,
  gearDropArmor,
  gearStatRequirement,
  gradeVariantIds,
  qualityOdds,
  weaponAssumedTargets,
  weaponDamageVariance,
  weaponDropCadence,
  weaponDropDamage,
  weaponDropDps,
  weaponDropRange,
  weaponEdge,
} from "./catalogs.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. Same contract as
 * the bestiary's `ENEMY_FIELDS` (see ./model.mjs for why it exists): the
 * library has no hand-written pages, so the quiet failure is a new field
 * landing in the item YAML that no generator knows about, and two hundred and
 * sixty pages going on looking complete while silently omitting it.
 */
export const WEAPON_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  // Lifted OFF the shipped def into its own generated module (`baseLore`) so 9 KB
  // of prose stays out of the app's startup chunk; still declared here because a
  // MOD's base carries its own, and it still reaches a page either way.
  description: "the lore paragraph",
  class: "the class chip, the opening line, and which stat scales it",
  damage: "the DAMAGE and DPS rows, through the engine's own reference figures",
  damageVariance: "the width of the DAMAGE band, and the WILD/PRECISE note",
  cooldownMs: "the SPEED row",
  range: "the REACH row",
  levelReq: "the REQUIRES LEVEL row, and the two-way gate note",
  dropWeight: "the COMMON/SCARCE note",
  durability: "the DURABILITY row",
  grade: "the grade ladder on the ancestor's page",
  gradeBase: "the grade ladder on the ancestor's page",
  material: "the SALVAGE note",
  sweepDeg: "the ARC row and the cleave note",
  rigid: "the FIXED REACH note — that no stat grows its reach or its arc",
  motion: "the NOT SWUNG note — a tool leaned into a body rather than swung",
  execute: "the EXECUTES note — that it takes a body rather than damaging it",
  burn: "the BURNS note — that what it kills is burned up rather than left",
  edge: "the EDGE row — whether the weapon cuts a body open or bursts it",
  twoHanded: "the BOTH HANDS note, and the empty off-hand slot it implies",
  projectile: "the shot section",
  quote: "the flavor line under the stat block",
  icon: "the portrait",
  sfx: "not reader-facing: the sound the app fires for it in place of its class's — a page cannot be listened to",
};

export const GEAR_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  description:
    "the lore paragraph (see WEAPON_FIELDS — read through `baseLore`)",
  quote: "the flavor line under the stat block",
  revive: "the WAKES A FRIEND note — what USING it out of the bag does",
  slot: "the slot chip and the opening line",
  levelReq: "the REQUIRES LEVEL row",
  dropWeight: "the COMMON/SCARCE note",
  bonuses: "the stat rows",
  armor: "the ARMOR row, through the engine's own worn figure",
  armorType: "the MATERIAL row and the material note",
  durability: "the DURABILITY row",
  passive: "the CARRIED note",
  minDifficulty: "the FOUND FROM note",
  bagSlots: "the BAG SLOTS row",
  material: "the SALVAGE note",
  grade: "the grade ladder on the ancestor's page",
  gradeBase: "the grade ladder on the ancestor's page",
  icon: "the portrait",
  worn: "not reader-facing: which silhouette the paper doll draws it as",
  wornChar: "not reader-facing: the palette char the worn overlay re-hues from",
};

export const UNIQUE_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  base: "the BUILT ON row, linked to the page that base is written up on — its ancestor's, when the base is a grade variant with no page of its own",
  slot: "the slot chip",
  tier: "the tier chip, the card's glow, and the drop-odds note",
  setId: "the set section",
  ilvl: "the ITEM LEVEL row",
  rarity: "the drop-odds note",
  bonuses: "the card's bonus lines",
  bagSlots: "the BAG SLOTS row",
  keeper: "the KEEPER note",
  world: "the world-relic note and the per-venue drop tables",
  lore: "the card's flavor line",
  fx: "the SIGNATURE chip — which element its swing or its shot flares in",
};

/**
 * A BASE's `bonuses` block, sub-key by sub-key. Declared separately because
 * the top-level check below can only see that `bonuses` exists — a NEW sub-key
 * (this is exactly how `stats` arrived) would otherwise be applied by the
 * engine and silently missing from every page.
 */
const GEAR_BONUS_FIELDS = {
  maxHp: "the +MAX HP row",
  critChance: "the +CRIT row",
  stats: "one +STAT row per attribute the base grants",
};

/** Fail the build when an item carries something no page would show. */
function assertItemFieldsCovered(def, fields, what) {
  const unknown = Object.keys(def).filter((key) => !(key in fields));
  if (unknown.length > 0) {
    throw new Error(
      `library: ${what} "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/) and declare it in the field map — ` +
        `the pages are never edited by hand, so an unrendered field would silently vanish.`,
    );
  }
  // A base's `bonuses` is a MAPPING, so the walk above only proves the block
  // exists. Check inside it too.
  if (def.bonuses && !Array.isArray(def.bonuses)) {
    const unknownBonus = Object.keys(def.bonuses).filter(
      (key) => !(key in GEAR_BONUS_FIELDS),
    );
    if (unknownBonus.length > 0) {
      throw new Error(
        `library: ${what} "${def.id}" carries bonuses.${unknownBonus.join(", bonuses.")}, ` +
          `which no library page renders. Add it to the generator and declare it in ` +
          `GEAR_BONUS_FIELDS — an unrendered bonus is power the reader never sees.`,
      );
    }
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route an arsenal page lives at, relative to `/library/`. */
export const itemPath = (id) => `arsenal/${slugFor(id)}`;

/** The route a mission page lives at — needed here for the drop cross-links. */
const missionPath = (id) => `missions/${slugFor(id)}`;

/** The route a bestiary page lives at — likewise. */
const enemyPathOf = (id) => `bestiary/${slugFor(id)}`;

// ---- where an item comes from ------------------------------------------------

const link = (id, name, path) => ({ id, name, path });

/**
 * WHERE EVERY ITEM COMES FROM, gathered once for the whole catalog. This is the
 * half of the arsenal that makes it worth reading: a stat block is a row, but
 * "THE FLAGBEARER hands this over on hard and above, and the moon scatters it from
 * level 34" is an answer.
 *
 * Eight ways an id can reach a player's hands, all of them authored:
 *   - an enemy's guaranteed `loot.items` / `loot.uniqueItems`,
 *   - an enemy's per-rung `uniquesByDifficulty` relic table,
 *   - a level's rolled `weaponPool` / `gearPool` (which the engine expands
 *     through `gradeVariantIds`, so a base's pool entry carries its grades),
 *   - a level's per-rung `worldUniques` relics,
 *   - a level's scripted `earlyDrops` and its all-clear trophy,
 *   - a hand-placed item on the map,
 *   - the level merchant's stall,
 *   - a travel gate's key.
 *
 * `enemyName` is the bestiary's own answer to "what do I call this monster when
 * its name is travelling alone" (`nameApart` in model.mjs). A drop line is
 * exactly that case — "THE FOUNDER always hands it over" is three different
 * bosses on three different maps — so the caller passes the resolver rather
 * than this file re-deriving which names are shared.
 */
export function itemSources(enemyName = (_id, name) => name) {
  const found = new Map();
  const add = (id, source) => {
    if (id == null) return;
    if (!found.has(id)) found.set(id, []);
    found.get(id).push(source);
  };

  for (const def of Object.values(ENEMY_DEFS)) {
    const from = link(def.id, enemyName(def.id, def.name), enemyPathOf(def.id));
    for (const entry of def.loot?.items ?? []) {
      const id = typeof entry === "string" ? entry : entry.defId;
      add(id, { kind: "kill", from, requiresClear: entry.requiresClear });
    }
    for (const id of def.loot?.uniqueItems ?? []) {
      add(id, { kind: "kill", from, named: true });
    }
    for (const [difficulty, ids] of Object.entries(
      def.uniquesByDifficulty ?? {},
    )) {
      for (const id of ids) {
        add(id, {
          kind: "relicTable",
          from,
          difficulty,
          rung: DIFFICULTY_DEFS[difficulty]?.name ?? difficulty.toUpperCase(),
        });
      }
    }
  }

  for (const level of Object.values(LEVELS)) {
    const from = link(level.id, level.name, missionPath(level.id));
    for (const id of level.loot?.weaponPool ?? []) {
      add(id, { kind: "pool", from, family: "weapon" });
      // A pool entry carries its exceptional/elite versions with it — the
      // engine expands every entry through `gradeVariantIds` at roll time — so
      // the venue that pays a base pays its whole ladder.
      for (const variant of gradeVariantIds(id)) {
        add(variant, { kind: "pool", from, family: "weapon", viaGrade: id });
      }
    }
    for (const id of level.loot?.gearPool ?? []) {
      add(id, { kind: "pool", from, family: "gear" });
      for (const variant of gradeVariantIds(id)) {
        add(variant, { kind: "pool", from, family: "gear", viaGrade: id });
      }
    }
    for (const [difficulty, ids] of Object.entries(
      level.loot?.worldUniques ?? {},
    )) {
      for (const id of ids) {
        add(id, {
          kind: "worldRelic",
          from,
          difficulty,
          rung: DIFFICULTY_DEFS[difficulty]?.name ?? difficulty.toUpperCase(),
        });
      }
    }
    for (const drop of level.loot?.earlyDrops ?? []) {
      add(drop.weapon, { kind: "scripted", from, atKills: drop.atKills });
    }
    add(level.loot?.allClearWeapon, { kind: "allClear", from });
    for (const placed of level.placedItems ?? []) {
      if (placed.kind === "equipment")
        add(placed.defId, { kind: "placed", from });
    }
    for (const id of level.merchant?.stockUniques ?? []) {
      add(id, { kind: "merchant", from });
    }
    for (const gate of level.gates ?? []) {
      add(gate.opensWith, { kind: "gateKey", from, to: gate.to });
    }
  }

  return found;
}

// ---- the make-quality table ---------------------------------------------------

/**
 * WHAT BROKEN THROUGH PERFECT DO TO A BASE. Every plain drop of a weapon or a
 * piece of armor rolls a craftsmanship band on top of the catalog numbers, and
 * the odds slide with the level of whatever dropped it — so the same base is a
 * different item early and late. That is the whole reason a plain base deserves
 * a page rather than a row.
 *
 * The bands and the odds are both the engine's (`QUALITY.ranges`,
 * `qualityOdds`), and the low/high columns are the two ends the odds are
 * authored between: a level-1 killer, and the monster level the lerp tops out
 * at (`QUALITY.highMlvl`, set to where a full campaign actually lands).
 */
export function qualityLadder(headline) {
  const low = qualityOdds(1);
  const high = qualityOdds(QUALITY.highMlvl);
  return {
    highMlvl: QUALITY.highMlvl,
    rows: QUALITY_ORDER.map((quality) => {
      const band = QUALITY.ranges[quality];
      return {
        quality,
        prefix: QUALITY_PREFIX[quality].trim(),
        band: [band.min, band.max],
        mult: QUALITY.mults[quality],
        oddsLow: low[quality],
        oddsHigh: high[quality],
        // The headline stat this make actually lands on, so the table reads as
        // damage (or armor) rather than as multipliers a reader has to apply.
        value:
          headline == null
            ? null
            : [
                Math.round(headline * band.min),
                Math.round(headline * band.max),
              ],
      };
    }),
  };
}

// ---- one item ------------------------------------------------------------------

/** The catalog id an arsenal page's own YAML lives under. */
function itemSourceFiles(id, tier) {
  if (id === SIDEARM_DEF_ID) return ["src/game/defs/equipment.ts"];
  const dir = tier === "regular" ? "*" : tier;
  return [`content/items/${dir}/${id}.yaml`];
}

/** A weapon's or gear piece's numbers, as the item card prints them. */
function baseStats(family, def) {
  if (family === "weapon") {
    const damage = weaponDropDamage(def.id);
    return {
      damage,
      dps: weaponDropDps(def.id),
      cadenceSec: weaponDropCadence(def.id),
      reach: weaponDropRange(def.id),
      variance: weaponDamageVariance(def),
      sweepDeg: def.sweepDeg ?? null,
      // Melee only, and the engine's own default (omitted = an edge) rather
      // than the raw authored field — a page must say what the game does.
      edge: def.class === "melee" ? weaponEdge(def.id) : null,
      twoHanded: def.twoHanded === true,
      // The two rules that make a weapon a TOOL rather than a swing: a shape
      // no stat grows, and a blow priced in the victim's health instead of in
      // this weapon's own damage figure.
      rigid: def.rigid === true,
      executeBars: def.execute?.bars ?? null,
      // Whether the weapon is FIRE — what it LEAVES of what it kills, beside
      // `edge` below rather than among the numbers, because it moves none.
      burn: def.burn === true,
      // How it is WORKED — omitted reads as a swing, which is all but one of
      // them, so only the odd tool has anything to say here.
      motion: def.motion ?? null,
      durability: def.durability,
      projectile: def.projectile ?? null,
      // The budget model's own reading of the weapon's shape: how much of the
      // crowd one trigger pull is priced at, and what its class crits for.
      targets: weaponAssumedTargets(def),
      critMult: baseCritMult(def),
      weaponClass: def.class,
    };
  }
  const material = armorTypeOf(def.id);
  return {
    armor: def.armor === undefined ? null : gearDropArmor(def.id),
    armorType: def.armor === undefined ? null : material,
    armorMult: def.armor === undefined ? null : ARMOR_TYPES[material].armorMult,
    materialGate: ARMOR_TYPES[material]?.minDifficulty ?? null,
    // The BASE's own difficulty gate (GearDef.minDifficulty) — how a whole
    // item kind is held back for the deep ladder (rings, amulets). Distinct
    // from `materialGate`, which gates a MATERIAL (plate).
    baseGate: def.minDifficulty ?? null,
    statRequirement: gearStatRequirement(def.id),
    bonuses: def.bonuses ?? {},
    durability: def.durability ?? null,
    passive: def.passive ?? null,
    bagSlots: def.bagSlots ?? null,
    revive: def.revive ?? false,
    slot: def.slot,
  };
}

/** One plain base's page: the piece, what it becomes, and who is built on it. */
function baseModel(family, def, sources) {
  assertItemFieldsCovered(
    def,
    family === "weapon" ? WEAPON_FIELDS : GEAR_FIELDS,
    family,
  );
  const stats = baseStats(family, def);
  const catalog = family === "weapon" ? WEAPON_DEFS : GEAR_DEFS;

  // The exceptional and elite identities this base upgrades into — same look,
  // higher requirement, numbers re-priced onto the curve at it. They are the
  // "what does it become later" half of the spread, so they live HERE rather
  // than on 150 pages of their own.
  // This base and every grade generated from it: one shape, and the only page
  // any of them is written up on is this one.
  const shapeFamily = new Set([def.id, ...gradeVariantIds(def.id)]);

  const ladder = gradeVariantIds(def.id)
    .map((id) => catalog[id])
    .filter(Boolean)
    .map((variant) => ({
      id: variant.id,
      name: variant.name,
      grade: variant.grade,
      levelReq: equipmentLevelReq(variant.id),
      stats: baseStats(family, variant),
    }));

  return {
    kind: "base",
    family,
    id: def.id,
    slug: slugFor(def.id),
    path: itemPath(def.id),
    name: def.name,
    tier: "regular",
    icon: def.icon,
    slot: family === "weapon" ? "weapon" : def.slot,
    weaponClass: family === "weapon" ? def.class : null,
    levelReq: equipmentLevelReq(def.id),
    dropWeight: equipmentDropWeight(def.id),
    material: def.material ?? null,
    description: baseLore(def.id) ?? def.description ?? null,
    // The one-line FLAVOR the item card prints in gold mid-run (`GearDef.quote`
    // / `WeaponDef.quote`). It renders here in the same blockquote a NAMED
    // item's `lore` gets, because on the card they are literally the same line
    // — see `itemQuote`. Distinct from `description` above it, which is the
    // library-only paragraph the running game never shows.
    quote: def.quote ?? null,
    sidearm: def.id === SIDEARM_DEF_ID,
    stats,
    ladder,
    // A plain base rolls make quality; a charm or a bag never does (the D2
    // rule — craftsmanship and magic are exclusive, and a trinket has neither).
    quality:
      family === "weapon"
        ? qualityLadder(
            stats.damage.min + (stats.damage.max - stats.damage.min) / 2,
          )
        : stats.armor != null
          ? qualityLadder(stats.armor)
          : null,
    // The whole FAMILY's relics, not just this rung's. A grade variant has no
    // page, so a relic built on one was listed by nobody — which is why the
    // named chase items, the pages a reader is likeliest to search for by name,
    // were reaching the crawler through the arsenal index alone.
    namedOnIt: Object.values(UNIQUE_DEFS)
      .filter((unique) => shapeFamily.has(unique.base))
      .map((unique) => ({
        ...link(unique.id, unique.name, itemPath(unique.id)),
        tier: unique.tier ?? "unique",
        // Which rung of the ladder it is actually built on, so a page listing
        // relics from three different grades can say so rather than implying
        // they all wear the numbers shown above.
        via: unique.base === def.id ? null : unique.base,
      })),
    sources: sources.get(def.id) ?? [],
    // A grade variant reaches a player through its ancestor's pool entry, so
    // the base page speaks for the whole family.
    ladderSources: ladder.flatMap((rung) => sources.get(rung.id) ?? []),
    sourceFiles: itemSourceFiles(def.id, "regular"),
  };
}

/** One named chase item's page. */
function namedModel(def, sources) {
  assertItemFieldsCovered(def, UNIQUE_FIELDS, "unique");
  const tier = def.tier ?? "unique";
  const weapon = def.slot === "weapon";
  const base = weapon ? WEAPON_DEFS[def.base] : GEAR_DEFS[def.base];
  const set = def.setId ? SET_DEFS[def.setId] : null;
  // A GRADE VARIANT HAS NO PAGE — it is described on the ancestor it was
  // generated from — and roughly half the named relics are built on one, so
  // linking `itemPath(base.id)` pointed sixty-six of the site's most searched
  // pages at a 404 and cost each of those relics the inbound link from the
  // shape it wears. The name stays the base's own (SEISMIC HAMMER is what the
  // relic is built on); the link goes where that base is actually written up.
  const basePage = base.gradeBase ?? base.id;

  return {
    kind: "named",
    family: "named",
    id: def.id,
    slug: slugFor(def.id),
    path: itemPath(def.id),
    name: def.name,
    tier,
    icon: base.icon,
    slot: def.slot,
    weaponClass: weapon ? base.class : null,
    // A named item is worn at its BASE's requirement, not at its item level —
    // which is why so many of them are wearable long before they look it.
    levelReq: equipmentLevelReq(def.base),
    ilvl: def.ilvl,
    lore: def.lore,
    world: !!def.world,
    keeper: !!def.keeper,
    // The element its signature look flares in (`UniqueDef.fx`). A weapon
    // without one swings the plain look of its class, so there is nothing to
    // say; a weapon whose signature is only a tweaked channel has no element
    // to name either, and says nothing rather than "CUSTOM".
    signature: def.fx?.element ?? null,
    bagSlots: def.bagSlots ?? null,
    base: {
      ...link(base.id, base.name, itemPath(basePage)),
      grade: base.grade ?? null,
      description: baseLore(base.id) ?? base.description ?? null,
    },
    stats: baseStats(weapon ? "weapon" : "gear", base),
    // Authored, never rolled: the same block on every copy. Only the base's
    // damage/armor moves, by a small per-drop band.
    bonuses: def.bonuses.map((affix) => ({ line: affixLine(affix), affix })),
    baseRollBand: UNIQUE_TUNING.baseRollBand,
    set: set
      ? {
          id: set.id,
          name: set.name,
          weaponClass: set.weaponClass,
          members: set.members.map((id) => ({
            ...link(id, UNIQUE_DEFS[id].name, itemPath(id)),
            self: id === def.id,
          })),
          bonuses: set.bonuses.map((tierBonus) => ({
            pieces: tierBonus.pieces,
            lines: tierBonus.bonuses.map(affixLine),
          })),
        }
      : null,
    // The rarity roll's own weighting: how likely this name is the one picked
    // once a roll lands its tier for its slot.
    rarity: def.rarity ?? UNIQUE_TUNING.defaultRarity,
    // The rarity economy for this tier, as `content/item_rarity.yaml` authors
    // it and the engine reads it: the monster level it unlocks at, the base
    // chance there, and what a set-piece kill adds. SET is absent from all of
    // it by design — a green piece never falls out of a rarity roll, it is
    // minted only from its boss's own table.
    tierOdds:
      LOOT.rarityBase[tier] == null
        ? null
        : {
            unlockMlvl: LOOT.tierUnlockMlvl[tier],
            rollChance: LOOT.rarityBase[tier],
            rollSlope: LOOT.raritySlope[tier],
            eliteBonus: LOOT.eliteRarityBonus[tier] ?? null,
            bossBonus: LOOT.bossRarityBonus[tier] ?? null,
            minionMult: LOOT.minionNamedMult,
            affixCount: TIERS[tier]?.affixCount ?? null,
          },
    sources: sources.get(def.id) ?? [],
    sourceFiles: itemSourceFiles(def.id, tier),
    // The base-page halves a named item does not have, present and empty so
    // both kinds of item share one shape and the renderer needs no guards.
    // A named drop mints unbreakable and always at normal make (craftsmanship
    // and magic are exclusive, the D2 rule), so there is no quality ladder and
    // no grade ladder to show — its base's page carries both.
    description: null,
    material: base.material ?? null,
    dropWeight: null,
    sidearm: false,
    ladder: [],
    ladderSources: [],
    quality: null,
    namedOnIt: [],
  };
}

// ---- the catalog -----------------------------------------------------------------

/** Every arsenal page, sorted the way an index wants to list them. */
export function arsenalModel(enemyName) {
  const sources = itemSources(enemyName);
  const bases = baseItemDefs().map(({ family, def }) =>
    baseModel(family, def, sources),
  );
  const named = Object.values(UNIQUE_DEFS).map((def) =>
    namedModel(def, sources),
  );
  const items = [...bases, ...named].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { items, bases, named, sources };
}

/**
 * The POWERS a level's loot pool can pay out. Still not an ARSENAL page — a
 * powerup is a timed effect rather than a thing you carry, so every column an
 * item page is built out of (slot, requirement, make quality, durability) would
 * read "—" — but they have a section of their own now (./model-powers.mjs), and
 * a mission page names the two its venue introduces, so the model resolves them.
 */
export function abilityModel(id) {
  const def = ABILITY_DEFS[id];
  if (!def) return null;
  return {
    id,
    name: def.name,
    kind: def.kind,
    icon: def.icon,
    durationMs: def.durationMs ?? null,
    stackable: !!def.stackable,
  };
}
