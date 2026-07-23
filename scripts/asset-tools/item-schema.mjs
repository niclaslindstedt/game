// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The item schema validator (see the `weapon-system` skill). Mirrors
// `enemy-schema.mjs`: `validateItem(doc, refs)` returns `{ errors, warnings }`
// — hard errors (a missing required field, a bad kind/rarity, an unknown
// sprite or base id) FAIL the build; soft issues only warn. `refs` is the set
// of live ids the generator harvests (the item tree itself, its grade-variant
// ids, and the sprite stems under content/sprites/), so a typo in an item
// YAML surfaces at `npm run levels`, not at runtime. The contracts this
// checks against are `WeaponDef`/`GearDef` (defs/equipment.ts, defs/gear.ts)
// and `UniqueDef` (defs/uniques.ts); the quality/rarity knob files get their
// own validators below.

const KINDS = new Set(["weapon", "gear", "unique"]);
/** The rarities a PLAIN base may live under (its quality axis rolls at drop). */
const BASE_RARITIES = new Set(["regular", "trash"]);
/** The rarities a NAMED (hand-authored) item mints at. */
const NAMED_RARITIES = new Set(["set", "unique", "legendary", "artifact"]);

const WEAPON_CLASSES = new Set(["melee", "ranged", "magic"]);
const GEAR_SLOTS = new Set(["head", "chest", "legs", "feet", "charm", "bag"]);
const EQUIP_SLOTS = new Set(["weapon", ...GEAR_SLOTS]);
const ARMOR_TYPES = new Set(["cloth", "leather", "mail", "plate"]);
const MATERIALS = new Set(["metal", "precious"]);
const WORN_STYLES = new Set(["cap", "helm", "visor", "mask"]);
const STAT_NAMES = new Set([
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "speed",
  "luck",
  "spirit",
]);
const AFFIX_KINDS = new Set([
  "damagePct",
  "maxHp",
  "crit",
  "armor",
  "armorPen",
  "stat",
  "statPct",
  "maxHpPct",
  "spell",
  "proc",
  "sureStrike",
  "knockback",
]);
/** The scaling "keeper" bonus kinds a unique may carry at most ONE of. */
const SCALING_KINDS = new Set(["statPct", "maxHpPct"]);

/** The five make qualities, worst to best (src/game/types.ts `Quality`). */
export const QUALITY_IDS = ["broken", "crude", "normal", "superior", "perfect"];

/** The full tier ladder, worst to best (src/game/types.ts `Tier`). */
export const TIER_IDS = [
  "trash",
  "regular",
  "magic",
  "rare",
  "set",
  "unique",
  "legendary",
  "artifact",
];

/**
 * Validate one item YAML doc against the live ref catalogs.
 *
 * @param {object} doc   the parsed item YAML.
 * @param {object} refs  `{ weapons, gear, sprites }` — Sets of live ids:
 *                        `weapons`/`gear` are the plain base ids INCLUDING
 *                        their grade-variant ids (what a unique's `base` may
 *                        name), `sprites` the content/sprites file stems
 *                        (what `icon` / `projectile.sprite` may name).
 */
export function validateItem(doc, refs) {
  const errors = [];
  const warnings = [];
  const tag = doc?.id ? `item "${doc.id}"` : "item";
  const err = (m) => errors.push(`${tag}: ${m}`);

  const num = (v, name) => {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v)))
      err(`${name} must be a finite number`);
  };
  const str = (v, name) => {
    if (v !== undefined && (typeof v !== "string" || v.length === 0))
      err(`${name} must be a non-empty string`);
  };
  const oneOf = (v, set, name) => {
    if (v !== undefined && !set.has(v))
      err(`unknown ${name} "${v}" (valid: ${[...set].join(", ")})`);
  };
  const sprite = (v, name) => {
    if (v !== undefined && !refs.sprites.has(v))
      err(`unknown ${name} sprite "${v}" (no content/sprites/*/${v}.yaml)`);
  };

  for (const field of ["id", "kind", "rarity", "name"]) {
    if (doc[field] === undefined) err(`missing required field "${field}"`);
  }
  oneOf(doc.kind, KINDS, "kind");

  const bonuses = (list) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) return err(`bonuses must be a list of affixes`);
    let scaling = 0;
    for (const b of list) {
      if (!b || typeof b !== "object") {
        err(`bonuses entries must be mappings`);
        continue;
      }
      oneOf(b.kind, AFFIX_KINDS, "bonus kind");
      if (SCALING_KINDS.has(b.kind)) scaling++;
      if (
        (b.kind === "stat" || b.kind === "statPct") &&
        !STAT_NAMES.has(b.stat)
      )
        err(`bonus "${b.kind}" names unknown stat "${b.stat}"`);
    }
    // At most one scaling bonus, the keeper rule (mirrors mergeUniques).
    if (scaling > 1) err(`has ${scaling} scaling (*Pct) bonuses (max 1)`);
  };

  if (doc.kind === "weapon" || doc.kind === "gear") {
    oneOf(doc.rarity, BASE_RARITIES, "base-item rarity");
    // Every hand-authored base carries its couple of sentences of lore.
    str(doc.description, "description");
    if (doc.description === undefined)
      err(`missing required field "description"`);
    if (doc.icon === undefined) err(`missing required field "icon"`);
    sprite(doc.icon, "icon");
    oneOf(doc.material, MATERIALS, "material");
    num(doc.dropWeight, "dropWeight");
    if (doc.grades !== undefined) {
      for (const grade of ["exceptional", "elite"]) {
        const g = doc.grades[grade];
        if (!g || typeof g.id !== "string" || typeof g.name !== "string")
          err(`grades.${grade} needs { id, name }`);
      }
    }
  }

  if (doc.kind === "weapon") {
    for (const f of ["class", "damage", "cooldownMs", "range", "levelReq"]) {
      if (doc[f] === undefined) err(`missing required field "${f}"`);
    }
    oneOf(doc.class, WEAPON_CLASSES, "weapon class");
    for (const f of [
      "damage",
      "damageVariance",
      "cooldownMs",
      "range",
      "levelReq",
      "durability",
      "sweepDeg",
    ]) {
      num(doc[f], f);
    }
    if (doc.durability === undefined)
      err(`missing required field "durability"`);
    if (doc.projectile !== undefined) {
      const p = doc.projectile;
      if (typeof p !== "object") {
        err(`projectile must be a mapping`);
      } else {
        for (const f of ["speed", "radius", "lifetimeMs"]) {
          if (p[f] === undefined) err(`missing projectile.${f}`);
          num(p[f], `projectile.${f}`);
        }
        for (const f of ["count", "spreadDeg", "pierce", "homing", "chain"]) {
          num(p[f], `projectile.${f}`);
        }
        if (p.sprite === undefined) err(`missing projectile.sprite`);
        sprite(p.sprite, "projectile");
      }
    } else if (doc.class !== "melee") {
      err(`class "${doc.class}" needs a projectile block`);
    }
  }

  if (doc.kind === "gear") {
    oneOf(doc.slot, GEAR_SLOTS, "gear slot");
    if (doc.slot === undefined) err(`missing required field "slot"`);
    if (doc.bonuses === undefined || typeof doc.bonuses !== "object")
      err(`missing "bonuses" mapping (may be empty: {})`);
    for (const f of ["levelReq", "armor", "durability", "bagSlots"]) {
      num(doc[f], f);
    }
    oneOf(doc.armorType, ARMOR_TYPES, "armorType");
    oneOf(doc.worn, WORN_STYLES, "worn style");
    if (doc.passive !== undefined) {
      for (const [stat, v] of Object.entries(doc.passive)) {
        if (!STAT_NAMES.has(stat)) err(`passive names unknown stat "${stat}"`);
        num(v, `passive.${stat}`);
      }
    }
  }

  if (doc.kind === "unique") {
    oneOf(doc.rarity, NAMED_RARITIES, "named-item rarity");
    for (const f of ["base", "slot", "ilvl", "bonuses", "lore"]) {
      if (doc[f] === undefined) err(`missing required field "${f}"`);
    }
    str(doc.lore, "lore");
    oneOf(doc.slot, EQUIP_SLOTS, "slot");
    num(doc.ilvl, "ilvl");
    // The D2 per-item drop weight (maps to UniqueDef.rarity — the YAML calls
    // it dropWeight, same name as a base's TreasureClass knob).
    num(doc.dropWeight, "dropWeight");
    num(doc.bagSlots, "bagSlots");
    for (const f of ["world", "keeper"]) {
      if (doc[f] !== undefined && typeof doc[f] !== "boolean")
        err(`${f} must be a boolean`);
    }
    bonuses(doc.bonuses);
    // The base must exist, and its family must match the slot: a weapon-slot
    // unique rides a weapon base, everything else a gear base. (The gear
    // base's own slot is re-checked with the real defs in mergeUniques.)
    const isWeaponBase = refs.weapons.has(doc.base);
    const isGearBase = refs.gear.has(doc.base);
    if (!isWeaponBase && !isGearBase) err(`unknown base "${doc.base}"`);
    else if (isWeaponBase !== (doc.slot === "weapon"))
      err(`slot ${doc.slot} does not match base "${doc.base}"`);
    if (doc.setId !== undefined && doc.rarity !== "set")
      err(`setId on a non-set item (rarity "${doc.rarity}")`);
    if (doc.rarity === "set" && doc.setId === undefined)
      err(`set piece missing its setId`);
  }

  return { errors, warnings };
}

/** Validate content/item_quality.yaml: exactly the five qualities, each with
 * prefix/mult/range/weights, plus the `highMlvl` lerp anchor. */
export function validateQuality(doc) {
  const errors = [];
  const err = (m) => errors.push(`item_quality.yaml: ${m}`);
  const ids = Object.keys(doc.qualities ?? {});
  if (ids.join(",") !== QUALITY_IDS.join(","))
    err(
      `qualities must be exactly [${QUALITY_IDS.join(", ")}] in ladder order, got [${ids.join(", ")}]`,
    );
  for (const [id, q] of Object.entries(doc.qualities ?? {})) {
    if (typeof q?.prefix !== "string") err(`${id}: prefix must be a string`);
    for (const f of ["mult", "weightLow", "weightHigh"]) {
      if (typeof q?.[f] !== "number") err(`${id}: ${f} must be a number`);
    }
    if (
      typeof q?.range?.min !== "number" ||
      typeof q?.range?.max !== "number" ||
      q.range.min > q.range.max
    )
      err(`${id}: range needs numeric { min, max } with min <= max`);
  }
  if (typeof doc.highMlvl !== "number") err(`highMlvl must be a number`);
  return { errors, warnings: [] };
}

/** Validate content/item_rarity.yaml: exactly the eight tiers in ladder
 * order, the per-tier knob shapes, and a rollOrder of rollable tiers. */
export function validateRarity(doc) {
  const errors = [];
  const err = (m) => errors.push(`item_rarity.yaml: ${m}`);
  const ids = Object.keys(doc.tiers ?? {});
  if (ids.join(",") !== TIER_IDS.join(","))
    err(
      `tiers must be exactly [${TIER_IDS.join(", ")}] in ladder order, got [${ids.join(", ")}]`,
    );
  for (const [id, t] of Object.entries(doc.tiers ?? {})) {
    if (typeof t?.prefix !== "string") err(`${id}: prefix must be a string`);
    if (typeof t?.affixCount !== "number")
      err(`${id}: affixCount must be a number`);
    for (const f of [
      "unlockMlvl",
      "rollChance",
      "rollSlope",
      "mfSaturation",
      "eliteBonus",
      "bossBonus",
    ]) {
      if (t?.[f] !== undefined && typeof t[f] !== "number")
        err(`${id}: ${f} must be a number`);
    }
    // The engine types pin the knob key sets (src/generated/items.ts): every
    // tier except regular carries the unlock gate, and exactly the ROLLABLE
    // tiers (magic/rare/unique/legendary/artifact — never trash/regular/set,
    // which the rarity roll can't land) carry rollChance + rollSlope.
    if (id !== "regular" && t?.unlockMlvl === undefined)
      err(`${id}: missing unlockMlvl (required on every tier except regular)`);
    const rollable = !["trash", "regular", "set"].includes(id);
    for (const f of ["rollChance", "rollSlope"]) {
      if (rollable && t?.[f] === undefined)
        err(`${id}: missing ${f} (required on a rollable tier)`);
      if (!rollable && t?.[f] !== undefined)
        err(`${id}: ${f} on a non-rollable tier`);
    }
  }
  if (!Array.isArray(doc.rollOrder) || doc.rollOrder.length === 0) {
    err(`rollOrder must be a non-empty list`);
  } else {
    for (const id of doc.rollOrder) {
      if (doc.tiers?.[id]?.rollChance === undefined)
        err(`rollOrder tier "${id}" has no rollChance`);
    }
  }
  for (const f of ["minionNamedMult", "rarityChanceMax"]) {
    if (typeof doc[f] !== "number") err(`${f} must be a number`);
  }
  return { errors, warnings: [] };
}
