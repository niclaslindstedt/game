// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The powerup schema validator. Mirrors `enemy-schema.mjs` / `item-schema.mjs`:
// `validatePowerup(id, def, refs)` returns `{ errors, warnings }` — hard errors
// (a missing field, an unknown kind, a param block that doesn't belong to the
// kind, a sprite id nothing in the atlas answers to) FAIL the build, so a typo
// in `content/powerups.yaml` surfaces at `npm run levels` instead of as a
// crash mid-fight. The `AbilityDef` contract this checks against lives in
// src/game/defs/abilities.ts — keep the two in step when a kind gains a field.

/** Every field a powerup must declare. */
export const REQUIRED_FIELDS = ["name", "kind", "durationMs", "icon"];

/** Optional top-level flags, so an unknown key is caught as a typo. */
const OPTIONAL_FIELDS = new Set(["stackable", "uniqueHeld"]);

/**
 * kind → `{ required, optional }` fields of the param block the kind carries.
 * A powerup MUST carry its own kind's block and MUST NOT carry any other
 * kind's — that pairing is what keeps "what it is" and "what it does" from
 * drifting apart.
 */
export const KIND_BLOCKS = {
  orbit: {
    required: [
      "count",
      "radius",
      "angularSpeed",
      "damage",
      "hitCooldownMs",
      "orbRadius",
      "sprite",
    ],
  },
  storm: { required: ["intervalMs", "damage", "range"] },
  stasis: { required: ["radius", "slowFactor"] },
  nuke: { required: ["radius"] },
  magnet: { required: ["radius", "radiusPerInt", "pullSpeed"] },
  trail: { required: ["dropMs", "patchMs", "radius", "damage", "tickMs"] },
  barrier: { required: ["poolFrac"] },
  rain: { required: ["intervalMs", "count", "radius", "damage", "range"] },
  phase: { required: ["speedMult"] },
  well: { required: ["radius", "damage", "tickMs", "pull", "chase"] },
  surge: { required: ["damageMult", "cooldownMult"] },
  pulse: { required: ["intervalMs", "radius", "damage", "push"] },
  volley: {
    required: [
      "intervalMs",
      "count",
      "spread",
      "speed",
      "radius",
      "damage",
      "lifetimeMs",
      "sprite",
      "range",
    ],
    optional: ["homing", "pierce", "burst"],
  },
  turret: {
    required: [
      "count",
      "radius",
      "intervalMs",
      "damage",
      "range",
      "speed",
      "projectileRadius",
      "sprite",
    ],
  },
  ward: { required: ["floor"] },
};

/** Block fields that name a sprite rather than carry a number. */
const SPRITE_FIELDS = new Set(["sprite"]);

/**
 * Validate one powerup.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping for that powerup.
 * @param {object} refs  `{ sprites }` — a Set<string> of live sprite names, so
 *                        an icon or projectile sprite that isn't in the atlas
 *                        fails the build.
 */
export function validatePowerup(id, def, refs) {
  const errors = [];
  const warnings = [];
  const tag = `powerup "${id}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    err("expected a mapping (an AbilityDef)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    err("id must be lower_snake_case");
  }
  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined) err(`missing required field "${field}"`);
  }
  if (def.name !== undefined && typeof def.name !== "string") {
    err("name must be a string");
  }
  if (
    def.durationMs !== undefined &&
    (typeof def.durationMs !== "number" ||
      !Number.isFinite(def.durationMs) ||
      def.durationMs < 0)
  ) {
    err("durationMs must be a number >= 0");
  }
  for (const flag of OPTIONAL_FIELDS) {
    if (def[flag] !== undefined && typeof def[flag] !== "boolean") {
      err(`${flag} must be a boolean`);
    }
  }
  if (def.icon !== undefined && !refs.sprites.has(def.icon)) {
    err(`icon "${def.icon}" is not a sprite`);
  }

  const kind = def.kind;
  const spec = KIND_BLOCKS[kind];
  if (spec === undefined) {
    err(
      `unknown kind "${kind}" (valid: ${Object.keys(KIND_BLOCKS).join(", ")})`,
    );
    return { errors, warnings };
  }
  // A duration of 0 means "instant" — the power never becomes a running
  // ability. Only the NUKE resolves that way; anything else with a 0 duration
  // would be spent to no effect at all.
  if (def.durationMs === 0 && kind !== "nuke") {
    err(`durationMs 0 is only for the instant "nuke" kind`);
  }

  // Exactly the kind's own block, and no other kind's.
  for (const other of Object.keys(KIND_BLOCKS)) {
    if (other !== kind && def[other] !== undefined) {
      err(`carries a "${other}" block but its kind is "${kind}"`);
    }
  }
  const block = def[kind];
  if (block === undefined || typeof block !== "object") {
    err(`missing the "${kind}" block its kind requires`);
    return { errors, warnings };
  }
  const known = new Set([...spec.required, ...(spec.optional ?? [])]);
  for (const field of spec.required) {
    if (block[field] === undefined) err(`${kind}.${field} is required`);
  }
  for (const [field, value] of Object.entries(block)) {
    if (!known.has(field)) {
      err(`unknown field "${kind}.${field}"`);
      continue;
    }
    if (SPRITE_FIELDS.has(field)) {
      if (typeof value !== "string" || !refs.sprites.has(value)) {
        err(`${kind}.${field} "${value}" is not a sprite`);
      }
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      err(`${kind}.${field} must be a finite number >= 0`);
    }
  }

  // Any key that is neither a documented field nor the kind's block is a typo —
  // it would be silently dropped, taking its balance intent with it.
  for (const key of Object.keys(def)) {
    if (REQUIRED_FIELDS.includes(key)) continue;
    if (OPTIONAL_FIELDS.has(key)) continue;
    if (key === kind) continue;
    if (KIND_BLOCKS[key] !== undefined) continue; // already reported above
    err(`unknown field "${key}"`);
  }

  return { errors, warnings };
}
