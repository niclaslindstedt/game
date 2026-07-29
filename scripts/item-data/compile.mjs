// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Cooking an item tree into the catalogs the engine reads — shared by the
// SHIPPED pipeline (`scripts/generate-items.mjs`, which emits TypeScript) and
// the MOD compiler (`mod/tools/build.mjs`, which emits JSON for one mod).
//
// It is one module for the same reason there is one schema: a mod's weapon is
// a `content/items/<rarity>/<id>.yaml` file, and if the two sides cooked it
// differently then "it works in my mod" and "it works in the game" would stop
// meaning the same thing — quietly, in the shape of a field the mod path
// forgot to strip.
//
// What is NOT here is the quality/rarity economy (`item_quality.yaml`,
// `item_rarity.yaml`). Those are cooked by the shipped pipeline alone, because
// they are the loot economy itself rather than an item: a mod that re-tuned
// the tier ladder would be rebalancing the game rather than adding to it.

/** Shed the named YAML-only bookkeeping fields off a doc. */
function omit(doc, fields) {
  const def = { ...doc };
  for (const f of fields) delete def[f];
  return def;
}

/** A weapon/gear doc → its engine def: shed the tree bookkeeping (kind,
 * rarity, grades — the grade names ship as their own catalogs). */
export function baseDef(doc) {
  return omit(doc, ["kind", "rarity", "grades"]);
}

/** A unique doc → its engine UniqueDef: the directory rarity IS the minted
 * tier, and the YAML's `dropWeight` is UniqueDef.rarity (the D2 per-item drop
 * weight — renamed in YAML to match the base items' knob). */
export function uniqueDef(doc) {
  return {
    ...omit(doc, ["kind", "rarity", "dropWeight"]),
    tier: doc.rarity,
    ...(doc.dropWeight !== undefined && { rarity: doc.dropWeight }),
  };
}

/** Split a loaded item tree by `kind`. */
export function splitItems(entries) {
  return {
    weapons: entries.filter((e) => e.doc.kind === "weapon"),
    gear: entries.filter((e) => e.doc.kind === "gear"),
    uniques: entries.filter((e) => e.doc.kind === "unique"),
  };
}

/** Every id a base's `grades:` block mints. A unique's `base` may name one of
 * these as readily as an authored id — `defs/grades.ts` mints them at engine
 * load — so the cross-ref sets have to include them. */
export function gradeIds(list) {
  return list.flatMap((e) =>
    e.doc.grades ? [e.doc.grades.exceptional?.id, e.doc.grades.elite?.id] : [],
  );
}

/** `{ id → def }` from a list of entries, cooked by `cook`. */
export function toRecord(list, cook) {
  return Object.fromEntries(list.map((e) => [e.id, cook(e.doc)]));
}

/** `{ base id → its grades block }`, for the bases that declare one. */
export function gradeNames(list) {
  return Object.fromEntries(
    list.filter((e) => e.doc.grades).map((e) => [e.id, e.doc.grades]),
  );
}

/**
 * A grade-variant id must not collide with an authored item's id — they merge
 * into one flat catalog at engine load, so a collision is a silently shadowed
 * item rather than an error anywhere.
 */
export function gradeCollisions(entries, weapons, gear) {
  const authored = new Set(entries.map((e) => e.id));
  const errors = [];
  for (const id of [...gradeIds(weapons), ...gradeIds(gear)]) {
    if (id !== undefined && authored.has(id)) {
      errors.push(`grade variant id "${id}" collides with an authored item`);
    }
  }
  return errors;
}
