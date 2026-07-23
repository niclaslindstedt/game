// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy schema validator (see the `enemy-design` skill). Mirrors
// `level-schema.mjs` / `sprite-schema.mjs`: `validateEnemy(def, refs)` returns
// `{ errors, warnings }` — hard errors (a missing required field, a bad role,
// an unknown cross-referenced id) FAIL the build; soft issues only warn. `refs`
// is the set of live def ids the generator harvests from the engine catalogs
// PLUS the enemy set itself, so a typo in an enemy YAML surfaces at
// `npm run levels`, not at runtime. The `EnemyDef` contract this checks against
// is src/game/defs/enemies/types.ts.

/** Scalar fields every enemy must declare (a missing one is a hard error). */
export const REQUIRED_FIELDS = [
  "id",
  "name",
  "role",
  "sprite",
  "hp",
  "speed",
  "radius",
  "contactDamage",
  "critChance",
  "contactCooldownMs",
];

const ROLES = new Set(["minion", "elite", "boss"]);
const GORES = new Set(["blood", "ecto", "sparks"]);
const RARITIES = new Set(["rare", "unique"]);

/**
 * Validate one EnemyDef against the engine's live id catalogs.
 *
 * @param {object} def   the parsed enemy YAML (a full EnemyDef).
 * @param {object} refs  `{ enemies, companions, uniques, storyItems, items }` —
 *                        each a Set<string> of live ids (`items` = weapons ∪
 *                        gear, the pool `loot.items` may name; `enemies` = every
 *                        enemy id, for `summon.defId` / `shieldedBy`).
 */
export function validateEnemy(def, refs) {
  const errors = [];
  const warnings = [];
  const tag = def?.id ? `enemy "${def.id}"` : "enemy";
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }

  if (def.role !== undefined && !ROLES.has(def.role))
    err(`unknown role "${def.role}" (valid: ${[...ROLES].join(", ")})`);
  if (def.gore !== undefined && !GORES.has(def.gore))
    err(`unknown gore "${def.gore}" (valid: ${[...GORES].join(", ")})`);
  if (def.rarity !== undefined && !RARITIES.has(def.rarity))
    err(`unknown rarity "${def.rarity}" (valid: ${[...RARITIES].join(", ")})`);

  const num = (v, name) => {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v)))
      err(`${name} must be a finite number`);
  };
  for (const f of [
    "hp",
    "speed",
    "radius",
    "contactDamage",
    "critChance",
    "contactCooldownMs",
    "levelBonus",
    "xp",
    "xpMobMult",
    "dodgeChance",
  ]) {
    num(def[f], f);
  }

  if (def.ai === undefined || typeof def.ai !== "object") {
    err(`missing "ai" block (needs at least aggroRadius)`);
  } else {
    num(def.ai.aggroRadius, "ai.aggroRadius");
    if (def.ai.aggroRadius === undefined) err(`ai.aggroRadius is required`);
  }

  // ---- cross-references against the live catalogs ---------------------------
  const ref = (set, id, where) => {
    if (id !== undefined && !set.has(id)) err(`unknown ${where} "${id}"`);
  };

  ref(refs.enemies, def.mechanics?.summon?.defId, "summon enemy");
  for (const phase of def.phases ?? [])
    ref(refs.enemies, phase.mechanics?.summon?.defId, "phase summon enemy");
  for (const id of def.shieldedBy ?? []) ref(refs.enemies, id, "shieldedBy");
  ref(refs.companions, def.spareable?.companion, "companion");

  for (const item of def.loot?.items ?? []) {
    const id = typeof item === "string" ? item : item?.defId;
    ref(refs.items, id, "loot item");
  }
  for (const id of def.loot?.storyItems ?? [])
    ref(refs.storyItems, id, "loot story item");
  for (const id of def.loot?.uniqueItems ?? [])
    ref(refs.uniques, id, "loot unique");
  for (const list of Object.values(def.uniquesByDifficulty ?? {}))
    for (const id of list ?? []) ref(refs.uniques, id, "difficulty unique");

  // Soft: an apparition can't die, so death-only fields read as author error.
  if (def.apparition && (def.loot || def.lastWords))
    warn(`apparition carries loot/lastWords, which never fire`);

  return { errors, warnings };
}
