// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent schema validator. Mirrors `powerup-schema.mjs`:
// `validateTalent(id, def, refs)` returns `{ errors, warnings }` — hard errors
// (a missing field, an unknown tree, a slope nothing reads, a proc block that
// carries a field no hook looks at) FAIL the build, so a typo in
// `content/talents.yaml` surfaces at `npm run levels` instead of as a talent
// that silently does nothing for the rest of a campaign.
//
// The `TalentDef` contract this checks against lives in
// src/game/defs/talents/index.ts — keep the two in step when a slope or a proc
// block gains a field. The shared rank ceiling comes in through `refs.maxRank`
// (the engine's `TALENTS.maxRank`), because the cap is ECONOMY: a talent may
// choose a shallower ladder, never a deeper one.

/** Every field a talent must declare. */
export const REQUIRED_FIELDS = ["name", "tree", "kind", "maxRank", "blurb"];

/** Every optional top-level field that is NOT a proc block, so an unknown key
 * is caught as the typo it is. */
const OPTIONAL_FIELDS = new Set(["effect", "icon"]);

/** The three trees, each gated behind (and scaling with) one stat. */
export const TREES = ["melee", "ranged", "magic"];

/** A talent's ROLE — presentational only; the picker groups and tints by it and
 * the engine never branches on it. */
export const KINDS = [
  "damage",
  "tank",
  "control",
  "mobility",
  "survival",
  "offense",
  "defense",
];

/** The per-rank SLOPES an `effect:` bag may carry, each summed as `rank × slope`
 * at the one combat read site that owns its rule. A name not in here would be
 * dropped silently, taking its balance intent with it. */
export const EFFECT_SLOPES = [
  "critChancePerRank",
  "critDamagePerRank",
  "moveSpeedPerRank",
  "dodgePerRank",
  "damageReductionPerRank",
  "magicReductionPerRank",
  "reflectPerRank",
  "maxHpPerRank",
  "berserkPerRank",
];

/** The always-on granted spells a `conjure:` may feed — the same `SpellKind`
 * union a legendary's `spell` affix names, since a conjuration runs through
 * exactly that machinery. */
export const CONJURE_SPELLS = [
  "orbit",
  "storm",
  "stasis",
  "seeker",
  "singularity",
  "immolation",
];

/**
 * proc block name → the fields that block requires.
 *
 * A talent CARRIES the blocks it fires, and the engine finds a block by looking
 * for it rather than by talent id (`talentParry` asks "which trained talent
 * carries `parry:`"). That is the whole reason these numbers live on the def
 * instead of in a config keyed by shipped id: a mod can author a talent that
 * parries, or retune the one that ships, without an engine change. A def may
 * carry several blocks, or none at all — a plain stat modifier is just an
 * `effect:` bag.
 *
 * Every field is a finite number >= 0. Adding a block means one entry here, one
 * optional member on `TalentDef`, and one reader in `talent-effects.ts`.
 */
export const PROC_BLOCKS = {
  cleavingEcho: {
    required: [
      "chancePerRank",
      "chanceCap",
      "extraTargets",
      "bonusTargets",
      "bonusFromRank",
    ],
  },
  twinStrike: {
    required: ["chancePerRank", "chanceCap", "echoDamageFrac", "fullEchoRank"],
  },
  parry: {
    required: ["chancePerRank", "chanceCap", "riposteFrac", "riposteRank"],
  },
  seismic: {
    required: [
      "radius",
      "radiusPerRank",
      "damage",
      "damagePerRank",
      "knockback",
    ],
  },
  piercing: {
    required: ["piercePerRank", "retainBase", "retainPerRank", "retainCap"],
  },
  concussive: {
    required: ["chancePerRank", "chanceCap", "distance", "distancePerRank"],
  },
  crippling: {
    required: [
      "chancePerRank",
      "chanceCap",
      "slowFactor",
      "slowMs",
      "slowMsPerRank",
    ],
  },
  volley: {
    required: [
      "chancePerRank",
      "chanceCap",
      "extra",
      "bonusExtra",
      "bonusFromRank",
      "spreadDeg",
    ],
  },
  springHeels: {
    required: ["velocityPerRank", "jumpCostReduction", "costReductionRank"],
  },
  evasionBurst: { required: ["speedMult", "ms", "rank"] },
  frostNova: {
    required: [
      "radius",
      "radiusPerRank",
      "freezeMs",
      "freezeMsPerRank",
      "slowFactor",
      "cooldownMs",
      "cooldownPerRank",
      "cooldownFloorMs",
    ],
  },
};

/** The picker's glyph for a talent that names no `icon:` of its own. */
export function talentIconName(id, def) {
  return def?.icon ?? `icon_talent_${id}`;
}

/**
 * Validate one talent.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping for that talent.
 * @param {object} refs  `{ sprites, maxRank }` — the live sprite names (so a
 *                        picker glyph nothing answers to fails the build) and
 *                        the engine's shared rank ceiling.
 */
export function validateTalent(id, def, refs) {
  const errors = [];
  const warnings = [];
  const tag = `talent "${id}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping (a TalentDef)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    err("id must be lower_snake_case");
  }
  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }
  for (const field of ["name", "blurb"]) {
    if (def[field] !== undefined && typeof def[field] !== "string") {
      err(`${field} must be a string`);
    }
  }
  if (def.tree !== undefined && !TREES.includes(def.tree)) {
    err(`unknown tree "${def.tree}" (valid: ${TREES.join(", ")})`);
  }
  if (def.kind !== undefined && !KINDS.includes(def.kind)) {
    err(`unknown kind "${def.kind}" (valid: ${KINDS.join(", ")})`);
  }
  // The rank ceiling is ECONOMY, not a per-talent knob: a shallower ladder is a
  // talent's own business, a deeper one would hand its tree points the picker
  // has no milestone for.
  const cap = refs?.maxRank;
  if (def.maxRank !== undefined) {
    if (
      typeof def.maxRank !== "number" ||
      !Number.isInteger(def.maxRank) ||
      def.maxRank < 1
    ) {
      err("maxRank must be an integer >= 1");
    } else if (typeof cap === "number" && def.maxRank > cap) {
      err(`maxRank ${def.maxRank} exceeds the shared cap ${cap}`);
    }
  }
  // The picker draws this glyph beside every rank pip; an id nothing answers to
  // draws an unnamed blank card in the one screen the player picks from.
  const icon = talentIconName(id, def);
  if (def.icon !== undefined && typeof def.icon !== "string") {
    err("icon must be a string");
  } else if (refs?.sprites && !refs.sprites.has(icon)) {
    err(
      def.icon === undefined
        ? `no picker icon — draw sprites/icons/${icon}.yaml, or name an "icon:" that exists`
        : `icon "${icon}" is not a sprite`,
    );
  }

  if (def.effect !== undefined) {
    if (typeof def.effect !== "object" || Array.isArray(def.effect)) {
      err("effect must be a mapping");
    } else {
      for (const [field, value] of Object.entries(def.effect)) {
        if (field === "conjure") {
          if (!CONJURE_SPELLS.includes(value)) {
            err(
              `effect.conjure "${value}" is not a spell ` +
                `(valid: ${CONJURE_SPELLS.join(", ")})`,
            );
          }
          continue;
        }
        if (!EFFECT_SLOPES.includes(field)) {
          err(
            `unknown field "effect.${field}" — nothing reads it ` +
              `(valid: ${EFFECT_SLOPES.join(", ")}, conjure)`,
          );
          continue;
        }
        if (typeof value !== "number" || !Number.isFinite(value)) {
          err(`effect.${field} must be a finite number`);
        }
      }
    }
  }

  for (const [name, spec] of Object.entries(PROC_BLOCKS)) {
    const block = def[name];
    if (block === undefined) continue;
    if (typeof block !== "object" || Array.isArray(block)) {
      err(`the "${name}" block must be a mapping`);
      continue;
    }
    const known = new Set(spec.required);
    for (const field of spec.required) {
      if (block[field] === undefined) err(`${name}.${field} is required`);
    }
    for (const [field, value] of Object.entries(block)) {
      if (!known.has(field)) {
        err(`unknown field "${name}.${field}"`);
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        err(`${name}.${field} must be a finite number >= 0`);
      }
    }
  }

  // A talent that carries neither a slope nor a proc block is a rank pip that
  // buys nothing — the one content bug this format can produce silently.
  const hasEffect =
    def.effect && Object.keys(def.effect).length > 0 ? true : false;
  const hasBlock = Object.keys(PROC_BLOCKS).some(
    (name) => def[name] !== undefined,
  );
  if (!hasEffect && !hasBlock) {
    err(
      "carries neither an `effect:` slope nor a proc block — every rank spent " +
        "on it would buy nothing",
    );
  }

  // Any key that is neither a documented field nor a proc block is a typo — it
  // would be silently dropped, taking its balance intent with it.
  for (const key of Object.keys(def)) {
    if (key === "id") continue;
    if (REQUIRED_FIELDS.includes(key)) continue;
    if (OPTIONAL_FIELDS.has(key)) continue;
    if (PROC_BLOCKS[key] !== undefined) continue;
    err(`unknown field "${key}"`);
  }

  return { errors, warnings };
}

/**
 * The whole-catalog rule: one carrier per proc block.
 *
 * The engine resolves a proc by finding the trained talent that CARRIES its
 * block, so two talents carrying the same block make "which numbers apply" a
 * question about catalog order — which is not a decision anybody made. A
 * conversion that wants its own PARRY ships its own talent and drops the
 * game's; an addon that wants a second one is told here rather than at play
 * time.
 */
export function validateTalentCatalog(talents) {
  const errors = [];
  const carriers = new Map();
  for (const [id, def] of Object.entries(talents)) {
    for (const name of Object.keys(PROC_BLOCKS)) {
      if (def?.[name] === undefined) continue;
      const claimed = carriers.get(name);
      if (claimed) {
        errors.push(
          `talents "${claimed}" and "${id}" both carry the "${name}" proc — ` +
            "one proc, one carrier (the engine reads whichever comes first)",
        );
      } else carriers.set(name, id);
    }
  }
  return { errors, warnings: [] };
}
