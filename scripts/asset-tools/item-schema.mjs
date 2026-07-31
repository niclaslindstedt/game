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

import { STAT_NAMES, validateAffixes } from "./affix.mjs";
import { GLYPHS } from "./font.mjs";

/** The fields a weapon's `fx:` may carry (`UniqueDef.WeaponFx`). `edge`,
 * `afterimages` and `gore` are the MELEE half; `spark` is the shot half. They
 * are not checked against the weapon's class — the class lives on the BASE,
 * which a mod's unique may name without the compiler knowing what it is — so a
 * field for the other half is simply not read. */
const FX_FIELDS = new Set([
  "element",
  "core",
  "edge",
  "spark",
  "glow",
  "particle",
  "weight",
  "afterimages",
  "gore",
]);

/** The speck looks a signature may throw (`ParticleKind` in weapon-fx.ts). */
const PARTICLE_KINDS = new Set([
  "ember",
  "spark",
  "frost",
  "void",
  "mote",
  "blood",
]);

const isHexColor = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

const KINDS = new Set(["weapon", "gear", "unique"]);
/** The rarities a PLAIN base may live under (its quality axis rolls at drop). */
const BASE_RARITIES = new Set(["regular", "trash"]);
/** The rarities a NAMED (hand-authored) item mints at. */
const NAMED_RARITIES = new Set(["set", "unique", "legendary", "artifact"]);

const WEAPON_CLASSES = new Set(["melee", "ranged", "magic"]);
/** Whether a MELEE weapon cuts, crushes or reduces — what a killing blow leaves
 * of the body (`WeaponDef.edge`). Omitted reads as `sharp`, so this is the short
 * list of things that swing without an edge. */
const WEAPON_EDGES = new Set(["sharp", "blunt", "shred"]);
/** HOW a MELEE weapon is worked, for the app to draw (`WeaponDef.motion`).
 * Omitted reads as `swing`, so only the odd tool declares itself. */
const WEAPON_MOTIONS = new Set(["swing", "shake"]);
// The item KINDS gear is authored as. `trinket` is the carried charm — it is
// never worn in a slot, it pays out from the bag; `ring` fills either of the
// hero's two fingers; `bag` and `shield` are the two things the SECOND ARM
// (`EquipSlot.offhand`) holds, and a piece is one or the other, never both.
const GEAR_SLOTS = new Set([
  "head",
  "chest",
  "legs",
  "feet",
  "amulet",
  "ring",
  "trinket",
  "bag",
  "shield",
]);
const EQUIP_SLOTS = new Set(["weapon", ...GEAR_SLOTS]);
const ARMOR_TYPES = new Set(["cloth", "leather", "mail", "plate"]);
const MATERIALS = new Set(["metal", "precious"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard", "nightmare", "jesus"]);
const WORN_STYLES = new Set(["cap", "helm", "visor", "mask"]);

/**
 * How long a base's `quote` (the item card's gold flavor line) may be. The card
 * wraps at `ITEM_CARD_TEXT_REM` (~14rem of pixel font), so this is about three
 * rows on the narrowest phone — past that the line pushes the requirement
 * footer off a card that is floating beside a bag cell.
 */
const QUOTE_MAX_CHARS = 90;

/**
 * Characters the game's own 3×5 pixel font has no cell for. The card's flavor
 * line is drawn with `PixelText`, which renders anything outside `GLYPHS` as a
 * literal `?` and says nothing about it — so a semicolon or a curly quote ships
 * as punctuation nobody typed. Checked here rather than discovered on a
 * screenshot; the fix is either a plainer character or a new glyph (see the
 * `pixel-assets` skill).
 */
function missingGlyphs(text) {
  return [...new Set([...text.toUpperCase()])].filter((ch) => !(ch in GLYPHS));
}

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

  /**
   * A weapon's SIGNATURE LOOK (`UniqueDef.fx`) — the slash crescent it swings or
   * the muzzle flash it fires, in the shared ELEMENT vocabulary
   * (pwa/src/game/weapon-fx.ts). Authored beside the item's numbers, so a mod's
   * legendary flares its own element rather than the plain class look.
   *
   * The element names arrive through `refs.elements` for the same reason the
   * compass regions do: the mod compiler runs where there is no TypeScript to
   * import the kits from, so the names are snapshotted into `mod/catalog.json`
   * and both readers check against the one list.
   */
  const weaponFx = (fx, isWeapon) => {
    if (fx === undefined) return;
    if (typeof fx !== "object" || Array.isArray(fx))
      return err("fx must be a mapping");
    // Armor has no swing and fires nothing, so a look on one draws nowhere.
    if (!isWeapon)
      return err("fx is a WEAPON's signature look; this item is not a weapon");
    if (fx.element !== undefined) {
      if (refs.elements && !refs.elements.has(fx.element))
        err(
          `fx.element "${fx.element}" is not one of the game's elements ` +
            `(${[...refs.elements].join(", ")})`,
        );
    }
    for (const key of Object.keys(fx)) {
      if (!FX_FIELDS.has(key)) err(`unknown fx field "${key}"`);
    }
    for (const channel of ["core", "edge", "spark", "glow"]) {
      const value = fx[channel];
      if (value !== undefined && !isHexColor(value))
        err(`fx.${channel} "${value}" must be a #rrggbb colour`);
    }
    if (fx.particle !== undefined && !PARTICLE_KINDS.has(fx.particle))
      err(
        `fx.particle "${fx.particle}" must be one of ` +
          `${[...PARTICLE_KINDS].join(", ")}`,
      );
    num(fx.weight, "fx.weight");
    if (fx.afterimages !== undefined && !Number.isInteger(fx.afterimages))
      err("fx.afterimages must be a whole number of ghost crescents");
    // An `fx:` that says nothing is a block the author expected to do
    // something.
    if (Object.keys(fx).length === 0) err("fx is empty");
    if (fx.gore !== undefined) {
      if (typeof fx.gore !== "object" || Array.isArray(fx.gore))
        err("fx.gore must be a mapping");
      else {
        if (!isHexColor(fx.gore.color))
          err(`fx.gore.color "${fx.gore.color}" must be a #rrggbb colour`);
        num(fx.gore.count, "fx.gore.count");
        num(fx.gore.spread, "fx.gore.spread");
        if (
          fx.gore.particle !== undefined &&
          !PARTICLE_KINDS.has(fx.gore.particle)
        )
          err(`fx.gore.particle "${fx.gore.particle}" is not a particle kind`);
        for (const key of Object.keys(fx.gore)) {
          if (!["color", "count", "spread", "particle"].includes(key))
            err(`unknown fx.gore field "${key}"`);
        }
      }
    }
  };

  // The affix vocabulary is shared with the SET schema (asset-tools/affix.mjs):
  // a set's tiered bonuses are the same `Affix[]` a unique's are, so a second
  // copy of the kind list would be a second answer to the same question.
  const bonuses = (list) => validateAffixes(list, err);

  if (doc.kind === "weapon" || doc.kind === "gear") {
    oneOf(doc.rarity, BASE_RARITIES, "base-item rarity");
    // Every hand-authored base carries its couple of sentences of lore.
    str(doc.description, "description");
    if (doc.description === undefined)
      err(`missing required field "description"`);
    // FLAVOR TEXT — the optional gold line the item card prints at its foot,
    // mid-run, in the PIXEL FONT and inside a ~14rem column. So it is held to
    // one short line: `description` is the paragraph, and it is a different
    // field for a different reader (the library) precisely so this one can stay
    // the length a tooltip can carry. A NAMED item has no `quote` — its `lore`
    // already IS this line (see `itemQuote`), which is why the check below
    // refuses one rather than letting an author write the same line twice.
    str(doc.quote, "quote");
    if (typeof doc.quote === "string") {
      if (doc.quote.length > QUOTE_MAX_CHARS)
        err(
          `quote is ${doc.quote.length} characters — hold it under ` +
            `${QUOTE_MAX_CHARS}, it is one line at the foot of an item card`,
        );
      const missing = missingGlyphs(doc.quote);
      if (missing.length > 0)
        err(`quote uses ${missing.join(" ")} — the pixel font has no glyph`);
    }
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
    // TWO-HANDED: the weapon claims the SECOND ARM as well, so its wielder
    // carries no shield and no bag (see `WeaponDef.twoHanded`). Forged at the
    // budget's two-handed premium — `weapon-budget.mjs --strict` is what holds
    // that side of the bargain, so all the schema owes is the type.
    if (doc.twoHanded !== undefined && typeof doc.twoHanded !== "boolean")
      err(`twoHanded must be a boolean`);
    if (doc.durability === undefined)
      err(`missing required field "durability"`);
    // MELEE ONLY, and omitted means SHARP (src/game/items/edge.ts). Refused on
    // a ranged or magic weapon rather than ignored: a bullet cannot cleave
    // whatever the file says, and a silently-ignored field is an author who
    // believes they authored something.
    oneOf(doc.edge, WEAPON_EDGES, "weapon edge");
    if (doc.edge !== undefined && doc.class !== "melee")
      err(`edge is melee-only (class "${doc.class}" always lands blunt)`);
    // MOTION (`WeaponDef.motion`): the picture the app draws when it attacks.
    // Melee only — a shot's look is its muzzle flash and its projectile, and
    // neither is a swing to opt out of.
    oneOf(doc.motion, WEAPON_MOTIONS, "weapon motion");
    if (doc.motion !== undefined && doc.class !== "melee")
      err(`motion is melee-only (class "${doc.class}" swings nothing)`);
    // RIGID (`WeaponDef.rigid`): the reach and arc are the TOOL's, not the
    // wielder's — no STR depth, no INT breadth. Melee only, because a shot's
    // reach is its projectile's lifetime rather than a stat-stretched cone.
    if (doc.rigid !== undefined) {
      if (typeof doc.rigid !== "boolean") err(`rigid must be a boolean`);
      if (doc.class !== "melee")
        err(`rigid is melee-only (class "${doc.class}" has no swung reach)`);
    }
    // EXECUTE (`WeaponDef.execute`, src/game/items/execute.ts): the blow is
    // priced in the VICTIM's own healthbars instead of in the weapon's damage,
    // so it kills whatever it reaches short of a boss. Melee only, for the same
    // reason `edge` is — a thing that travels is caught by armor, and the rule
    // deliberately isn't.
    //
    // The `bars` FLOOR is the app's burst ladder, which measures the OVERKILL —
    // the health spent past zero (`game-screen/overkill.ts`) — so a body at full
    // health eats the first whole bar of an execution before any of it counts,
    // and the ELITE cost (2.5 × GIB_BARS 0.4) is a full bar again on top. Two
    // bars is therefore the point below which an executioner still kills
    // everything it touches but leaves plain corpses — a bug wearing a feature's
    // clothes rather than a quieter version of one — and the floor sits a hair
    // above it. Kept as a literal rather than imported: this schema runs in the
    // MOD compiler's main process, which has no app code to reach for.
    if (doc.execute !== undefined) {
      if (doc.class !== "melee")
        err(`execute is melee-only (class "${doc.class}" is caught by armor)`);
      if (typeof doc.execute !== "object") {
        err(`execute must be a mapping`);
      } else {
        num(doc.execute.bars, "execute.bars");
        if (doc.execute.bars === undefined) err(`missing execute.bars`);
        else if (doc.execute.bars < 2.2)
          err(
            `execute.bars must be at least 2.2 — below that an execution stops ` +
              `taking a body apart (a full-health elite eats 2 bars before the ` +
              `burst ladder counts any of it)`,
          );
      }
    }
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
    else {
      num(doc.bonuses.maxHp, "bonuses.maxHp");
      num(doc.bonuses.critChance, "bonuses.critChance");
      // A base's own flat attribute grant — what a ring or amulet is FOR.
      if (doc.bonuses.stats !== undefined) {
        for (const [stat, v] of Object.entries(doc.bonuses.stats)) {
          if (!STAT_NAMES.has(stat))
            err(`bonuses.stats names unknown stat "${stat}"`);
          num(v, `bonuses.stats.${stat}`);
        }
      }
    }
    for (const f of ["levelReq", "armor", "durability", "bagSlots"]) {
      num(doc[f], f);
    }
    oneOf(doc.armorType, ARMOR_TYPES, "armorType");
    oneOf(doc.worn, WORN_STYLES, "worn style");
    // THE SECOND ARM'S TWO KINDS ARE EACH DEFINED BY WHAT THEY PAY, and a piece
    // that pays neither is a slot spent on nothing. A SHIELD is armor — it owes
    // `armor` and the `armorType` that scales it and sets its STRENGTH gate
    // (which is what keeps shields a melee lane, see config `SHIELD`). A BAG is
    // room — it owes `bagSlots`, and may not carry armor, because a bag that
    // protected would make the choice free.
    if (doc.slot === "shield") {
      if (doc.armor === undefined) err(`shield needs an "armor" value`);
      if (doc.armorType === undefined) err(`shield needs an "armorType"`);
      if (doc.bagSlots !== undefined) err(`shield may not carry bagSlots`);
    }
    if (doc.slot === "bag") {
      if (doc.bagSlots === undefined) err(`bag needs a "bagSlots" count`);
      if (doc.armor !== undefined) err(`bag may not carry armor`);
    }
    // A REVIVE item (GearDef.revive): USING it out of the bag wakes the hero's
    // DOWNED companion. Marked on the def rather than named by id in the engine
    // so a MOD's own bottle works; a marker rather than a value, because how
    // far it wakes somebody is the shared `COMPANIONS.saltsHpFraction`.
    if (doc.revive !== undefined) {
      if (typeof doc.revive !== "boolean") err(`revive must be a boolean`);
      // It is USED from the bag and consumed, so it can never be worn: a piece
      // that both protected and revived would be a slot the player is punished
      // for spending correctly, and a shield that vanished when tapped is a bug
      // wearing a feature's clothes.
      if (doc.slot !== "trinket")
        err(
          `revive is for a carried trinket (slot "${doc.slot}" is worn, and ` +
            `using the piece consumes it)`,
        );
      if (doc.armor !== undefined || doc.bagSlots !== undefined)
        err(`a revive item pays no armor and no bag cells — it is spent`);
    }
    // The per-BASE difficulty drop gate (GearDef.minDifficulty): how a whole
    // item kind is held back for the deep ladder — rings from nightmare,
    // amulets from JESUS.
    oneOf(doc.minDifficulty, DIFFICULTIES, "minDifficulty");
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
    // …and the card draws it in the pixel font, so it answers to the same
    // glyph map a base's `quote` does.
    if (typeof doc.lore === "string") {
      const missing = missingGlyphs(doc.lore);
      if (missing.length > 0)
        err(`lore uses ${missing.join(" ")} — the pixel font has no glyph`);
    }
    // A named item's `lore` IS the card's flavor line (`itemQuote`), so a
    // second field for it would be two authored answers to one question — and
    // the card can only print one of them.
    if (doc.quote !== undefined)
      err(`a named item's flavor line is its "lore" — drop the "quote"`);
    oneOf(doc.slot, EQUIP_SLOTS, "slot");
    num(doc.ilvl, "ilvl");
    // The D2 per-item drop weight (maps to UniqueDef.rarity — the YAML calls
    // it dropWeight, same name as a base's TreasureClass knob).
    num(doc.dropWeight, "dropWeight");
    num(doc.bagSlots, "bagSlots");
    if (doc.bagSlots !== undefined && doc.slot !== "bag")
      err(`bagSlots on a ${doc.slot} unique (only a bag carries cells)`);
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
    weaponFx(doc.fx, doc.slot === "weapon");
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
    // ENHANCED DAMAGE (+X% on a weapon's catalog damage). Carried by every
    // MAGIC-or-better tier and by none below it: a white weapon is its catalog
    // damage and nothing more. A band, never a single number — the roll inside
    // it is what makes two copies of one artifact worth comparing.
    const ed = t?.enhancedDamage;
    const enhanced = !["trash", "regular"].includes(id);
    if (enhanced && ed === undefined)
      err(`${id}: missing enhancedDamage (required on magic and better)`);
    if (!enhanced && ed !== undefined)
      err(`${id}: enhancedDamage on a tier below magic`);
    if (ed !== undefined) {
      if (typeof ed.min !== "number" || typeof ed.max !== "number")
        err(`${id}: enhancedDamage needs numeric min and max`);
      else if (ed.min < 0)
        err(`${id}: enhancedDamage.min must not be negative`);
      else if (ed.max < ed.min)
        err(`${id}: enhancedDamage.max (${ed.max}) is under min (${ed.min})`);
    }
  }
  // The bands must CLIMB with the tier — the whole point of the stat is that a
  // rarer weapon hits harder, so a ladder that sags anywhere is a content bug.
  const ladder = TIER_IDS.filter(
    (id) => doc.tiers?.[id]?.enhancedDamage !== undefined,
  );
  for (let i = 1; i < ladder.length; i++) {
    const lo = doc.tiers[ladder[i - 1]].enhancedDamage;
    const hi = doc.tiers[ladder[i]].enhancedDamage;
    if (hi.min < lo.min || hi.max < lo.max)
      err(
        `${ladder[i]}: enhancedDamage must not sit under ${ladder[i - 1]}'s ` +
          `(${hi.min}..${hi.max} vs ${lo.min}..${lo.max})`,
      );
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
