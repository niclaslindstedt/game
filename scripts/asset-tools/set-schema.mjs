// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SET schema validator — `validateSet(id, def, refs)` returns
// `{ errors, warnings }`. Mirrors `companion-schema.mjs`: one entry of a
// single-file catalog (`content/sets.yaml`), keyed by id.
//
// A SET is the D2 GREEN tier: a boss's armor kit, themed to one weapon class,
// whose pieces grant extra bonuses as more of them are worn. Almost every check
// here is about the KIT holding together rather than about a field being the
// right type, because that is how a set actually breaks: a piece that belongs to
// two sets, two head pieces in one kit, a 5-piece bonus on a 4-piece set. Every
// one of those compiles fine as data and then pays out something nobody
// designed, or nothing at all.
//
// The member checks need the UNIQUE catalog, so `refs.uniques` is a Map of
// `id → { tier, slot, setId }` — base ∪ mod for a mod, exactly like every other
// cross-reference.

import { validateAffixes } from "./affix.mjs";

const WEAPON_CLASSES = new Set(["melee", "ranged", "magic"]);

/** The four slots a set piece may occupy. A set is ARMOR: the weapon is the
 * boss's own signature drop, not a member, or the kit would be the whole
 * loadout and there would be nothing left to find. */
const ARMOR_SLOTS = new Set(["head", "chest", "legs", "feet"]);

/**
 * Validate one authored set.
 *
 * @param id   the catalog key (stamped into the def by the loader)
 * @param def  the authored entry
 * @param refs `{ uniques: Map<string, { tier, slot, setId }> }`
 */
export function validateSet(id, def, refs) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`set "${id}": ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    return { errors: [`set "${id}": expected a mapping`], warnings };
  }
  if (typeof def.name !== "string" || !def.name.trim())
    err("needs a display name");
  if (!WEAPON_CLASSES.has(def.weaponClass))
    err(
      `weaponClass must be one of ${[...WEAPON_CLASSES].join(", ")}, got ` +
        `"${def.weaponClass}"`,
    );

  // ---- the members ---------------------------------------------------------
  const members = def.members;
  if (!Array.isArray(members) || members.length < 2) {
    err("members must list at least two unique ids");
    return { errors, warnings };
  }
  if (members.length > ARMOR_SLOTS.size)
    err(
      `has ${members.length} members but there are only ${ARMOR_SLOTS.size} ` +
        "armor slots to wear them in",
    );

  const slots = new Set();
  const seen = new Set();
  for (const memberId of members) {
    if (seen.has(memberId)) {
      err(`lists "${memberId}" twice`);
      continue;
    }
    seen.add(memberId);
    const member = refs.uniques?.get(memberId);
    if (!member) {
      err(`unknown member "${memberId}" — no such named item`);
      continue;
    }
    // A member that is not `rarity: set` would be minted at its own tier and
    // coloured as one, while quietly paying a set bonus nothing on its card
    // explains.
    if (member.tier !== "set")
      err(`member "${memberId}" is rarity ${member.tier ?? "unique"}, not set`);
    if (!ARMOR_SLOTS.has(member.slot))
      err(`member "${memberId}" is a ${member.slot}, and a set is armor`);
    // Two head pieces means the kit can never be completed: only one of them
    // can be worn, so the top threshold is unreachable.
    if (slots.has(member.slot))
      err(`has two "${member.slot}" pieces — one of them can never be worn`);
    slots.add(member.slot);
    // The back-reference is what an item CARD reads to draw its set block, so a
    // mismatch is a piece that pays bonuses while claiming to belong elsewhere.
    if (member.setId !== id)
      err(
        `member "${memberId}" points at set "${member.setId ?? "(none)"}" — ` +
          "a piece and its set must agree",
      );
  }

  // ---- the tiered bonuses --------------------------------------------------
  const bonuses = def.bonuses;
  if (!Array.isArray(bonuses) || bonuses.length === 0) {
    err(
      "bonuses must list at least one threshold — a set with none is just " +
        "four items that happen to match",
    );
    return { errors, warnings };
  }
  let prev = 1;
  for (const tier of bonuses) {
    if (!tier || typeof tier !== "object") {
      err("each bonus threshold must be a mapping of pieces/bonuses");
      continue;
    }
    const where = `${tier.pieces}-piece bonus`;
    if (!Number.isInteger(tier.pieces) || tier.pieces <= prev)
      err(
        `threshold ${tier.pieces} is out of order — thresholds ascend and ` +
          "start at 2 (a 1-piece bonus is the piece's own)",
      );
    else if (tier.pieces > members.length)
      err(
        `${where} needs ${tier.pieces} pieces but the set has ` +
          `${members.length} — it can never be earned`,
      );
    else prev = tier.pieces;
    if (!Array.isArray(tier.bonuses) || tier.bonuses.length === 0)
      err(`${where} grants nothing`);
    validateAffixes(tier.bonuses, err, where);
  }
  // The full kit is the reward the whole tier exists for; a set whose top
  // threshold is short of its size means the last piece a player hunts down
  // does nothing at all.
  if (prev < members.length)
    warnings.push(
      `set "${id}": nothing happens at the full ${members.length} pieces — ` +
        `the deepest threshold is ${prev}`,
    );

  return { errors, warnings };
}
