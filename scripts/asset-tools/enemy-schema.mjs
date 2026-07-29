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
/** The difficulty rungs an ability's `minDifficulty` gate may name. */
const DIFFICULTIES = new Set(["easy", "medium", "hard", "nightmare", "jesus"]);
/**
 * The BOSS ABILITY CATALOG, mirrored from `BossAbility` in
 * src/game/defs/enemies/abilities.ts: ability id → the fields it requires
 * BEYOND the universal `windupMs` / `cooldownMs`. Keep the two in step — a new
 * ability adds its row here, and the build then refuses a boss that authors it
 * half-written.
 */
const ABILITY_FIELDS = {
  laser_eyes: [
    "range",
    "sweepDeg",
    "sweepMs",
    "beamWidth",
    "damageFrac",
    "hitIntervalMs",
    "scorchMs",
    "scorchDamageFrac",
    "scorchTickMs",
    "scorchRadius",
  ],
  flag_plant: ["defId", "distance", "lifeMs"],
  coin_cannon: [
    "count",
    "spreadDeg",
    "range",
    "speed",
    "lifetimeMs",
    "damageFrac",
    "bounces",
  ],
  bait_drop: [
    "count",
    "spread",
    "armMs",
    "lifeMs",
    "triggerRadius",
    "blastRadius",
    "damageFrac",
  ],
  airstrike: ["count", "spread", "fallMs", "blastRadius", "damageFrac"],
  call_horde: ["waves", "waveGapMs"],
  recompile: ["defId", "distance", "lifeMs", "healFracPerSec"],
  lockdown: [
    "radius",
    "segments",
    "gapDeg",
    "durationMs",
    "sprite",
    "segmentRadius",
  ],
};
const GORES = new Set(["blood", "ecto", "sparks"]);
const RARITIES = new Set(["rare", "unique"]);
const LOCOMOTIONS = new Set(["legs", "float", "wheels"]);

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
  if (def.locomotion !== undefined && !LOCOMOTIONS.has(def.locomotion))
    err(
      `unknown locomotion "${def.locomotion}" (valid: ${[...LOCOMOTIONS].join(", ")})`,
    );

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

  // ---- the BOSS ABILITY CATALOG (defs/enemies/abilities.ts) -----------------
  // Every authored ability is checked here rather than trusted, because the
  // whole catalog is data: a typo in an id, a missing number, or a gate naming
  // a rung that does not exist would otherwise be a silent no-op at runtime —
  // a boss that simply never uses its signature move, with every test green.
  const checkAbilities = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list)) {
      err(`${where} must be a list`);
      return;
    }
    for (const ability of list) {
      if (!ability || typeof ability !== "object") {
        err(`${where} entry must be a mapping`);
        continue;
      }
      const id = ability.id;
      if (!ABILITY_FIELDS[id]) {
        err(
          `${where}: unknown ability "${id}" ` +
            `(valid: ${Object.keys(ABILITY_FIELDS).join(", ")})`,
        );
        continue;
      }
      // Every ability telegraphs and every ability has a gap between casts —
      // there is no such thing as a catalog entry without these two.
      for (const field of ["windupMs", "cooldownMs", ...ABILITY_FIELDS[id]]) {
        if (ability[field] === undefined) {
          err(`${where} "${id}": missing required field "${field}"`);
        } else if (
          field !== "defId" &&
          field !== "sprite" &&
          (typeof ability[field] !== "number" ||
            !Number.isFinite(ability[field]))
        ) {
          err(`${where} "${id}": ${field} must be a finite number`);
        }
      }
      if (
        ability.minDifficulty !== undefined &&
        !DIFFICULTIES.has(ability.minDifficulty)
      ) {
        err(
          `${where} "${id}": unknown minDifficulty ` +
            `"${ability.minDifficulty}" (valid: ${[...DIFFICULTIES].join(", ")})`,
        );
      }
      // A tell shorter than a reaction is not a tell: the floor may only ever
      // SHORTEN the authored windup, never lengthen it into a lie.
      if (
        ability.windupFloorMs !== undefined &&
        ability.windupFloorMs > ability.windupMs
      ) {
        err(
          `${where} "${id}": windupFloorMs (${ability.windupFloorMs}) is above ` +
            `windupMs (${ability.windupMs}) — the floor may only shorten a windup`,
        );
      }
      if (id === "flag_plant") ref(refs.enemies, ability.defId, "planted body");
      if (id === "recompile") ref(refs.enemies, ability.defId, "repair node");
      // A LOCKDOWN with no way out is a damage window, not a mechanic.
      if (id === "lockdown" && ability.gapDeg !== undefined) {
        if (ability.gapDeg <= 0) {
          err(`${where} "lockdown": gapDeg must leave a way out`);
        }
      }
      // What a pod delivers is optional, but a named breed must exist — a typo
      // here would land an empty crater with every check green.
      if (id === "airstrike" && ability.hatch !== undefined) {
        ref(refs.enemies, ability.hatch, "pod payload");
        if (
          ability.hatchCount === undefined ||
          typeof ability.hatchCount !== "number"
        ) {
          err(`${where} "airstrike": hatch needs a numeric hatchCount`);
        }
      }
    }
  };
  checkAbilities(def.mechanics?.abilities, "mechanics.abilities");
  for (const phase of def.phases ?? [])
    checkAbilities(phase.mechanics?.abilities, "phase mechanics.abilities");
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
