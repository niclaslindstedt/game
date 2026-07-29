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

/** Optional top-level BOOLEAN flags. */
const BOOLEAN_FLAGS = ["stackable", "uniqueHeld"];

/** Every optional top-level field, so an unknown key is caught as a typo. */
const OPTIONAL_FIELDS = new Set([...BOOLEAN_FLAGS, "sfx", "look"]);

/** The colour channels a `look:` kit must carry, each an `r, g, b` triple. */
const LOOK_COLORS = ["core", "hot", "deep", "spark"];

/** The one shape choice a kit makes (read by the `well` block). */
const WELL_LOOKS = ["void", "grit"];

/** An `r, g, b` triple — three 0..255 integers, no alpha, so the draw code can
 * dial the alpha per layer. */
function isRgbTriple(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(",").map((p) => p.trim());
  if (parts.length !== 3) return false;
  return parts.every(
    (p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255,
  );
}

/**
 * kind → `{ required, optional }` fields of that EFFECT BLOCK.
 *
 * A powerup MUST carry its own `kind`'s block, and MAY carry any number of
 * others — a power is a COMPOSITION of effects, and `kind` names the one it
 * leads with (the label the dock, the bot's valuation and the loot rules read).
 * Nothing dispatches on it: the engine steps and the app draws whichever blocks
 * are PRESENT (`if (def.orbit)`, `if (def.well)`, …), so a def carrying `orbit`
 * and `pulse` orbits and pulses without either side learning a new kind. That
 * is what lets a mod build a power the shipped catalog has no equivalent of
 * without the engine growing a member per idea.
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
    optional: ["gunSprite"],
  },
  ward: { required: ["floor"] },
  singularity: {
    required: ["intervalMs", "radius", "damage", "pull", "range"],
  },
  immolation: { required: ["radius", "damage", "tickMs"] },
};

/** Block fields that name a sprite rather than carry a number. */
const SPRITE_FIELDS = new Set(["sprite", "gunSprite"]);

/**
 * Validate one powerup.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping for that powerup.
 * @param {object} refs  `{ sprites, sounds }` — Sets of live sprite and sound
 *                        names, so an icon, projectile sprite or `sfx` id that
 *                        nothing answers to fails the build.
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
  for (const flag of BOOLEAN_FLAGS) {
    if (def[flag] !== undefined && typeof def[flag] !== "boolean") {
      err(`${flag} must be a boolean`);
    }
  }
  if (def.icon !== undefined && !refs.sprites.has(def.icon)) {
    err(`icon "${def.icon}" is not a sprite`);
  }
  // A power naming its own sound must name one that EXISTS: a typo would fall
  // silently back to the event's sound, which is exactly the drift the field
  // was added to remove.
  if (def.sfx !== undefined) {
    if (typeof def.sfx !== "string") err("sfx must be a string");
    else if (refs.sounds && !refs.sounds.has(def.sfx)) {
      err(`sfx "${def.sfx}" is not a sound`);
    }
  }
  if (def.look !== undefined) {
    if (typeof def.look !== "object" || Array.isArray(def.look)) {
      err("look must be a mapping");
    } else {
      for (const channel of LOOK_COLORS) {
        const value = def.look[channel];
        if (value === undefined) err(`look.${channel} is required`);
        else if (!isRgbTriple(value)) {
          err(`look.${channel} "${value}" must be an "r, g, b" triple`);
        }
      }
      if (
        def.look.wellLook !== undefined &&
        !WELL_LOOKS.includes(def.look.wellLook)
      ) {
        err(
          `look.wellLook "${def.look.wellLook}" (valid: ${WELL_LOOKS.join(", ")})`,
        );
      }
      for (const key of Object.keys(def.look)) {
        if (LOOK_COLORS.includes(key) || key === "wellLook") continue;
        err(`unknown field "look.${key}"`);
      }
    }
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
  // ability, so its blocks get exactly one tick to resolve in. Only `nuke`
  // does; any timed block riding along would be spent to no effect at all.
  if (def.durationMs === 0) {
    if (def.nuke === undefined) {
      err(`durationMs 0 is only for the instant "nuke" block`);
    }
    for (const other of Object.keys(KIND_BLOCKS)) {
      if (other !== "nuke" && def[other] !== undefined) {
        err(`durationMs 0 cannot carry the timed "${other}" block`);
      }
    }
  }

  // The kind's own block is mandatory; every OTHER block present is optional
  // and validated identically, so a composed power is held to the same bar for
  // every effect it carries.
  if (def[kind] === undefined) {
    err(`missing the "${kind}" block its kind requires`);
  }
  for (const [name, blockSpec] of Object.entries(KIND_BLOCKS)) {
    const block = def[name];
    if (block === undefined) continue;
    if (typeof block !== "object" || Array.isArray(block)) {
      err(`the "${name}" block must be a mapping`);
      continue;
    }
    const known = new Set([
      ...blockSpec.required,
      ...(blockSpec.optional ?? []),
    ]);
    for (const field of blockSpec.required) {
      if (block[field] === undefined) err(`${name}.${field} is required`);
    }
    for (const [field, value] of Object.entries(block)) {
      if (!known.has(field)) {
        err(`unknown field "${name}.${field}"`);
        continue;
      }
      if (SPRITE_FIELDS.has(field)) {
        if (typeof value !== "string" || !refs.sprites.has(value)) {
          err(`${name}.${field} "${value}" is not a sprite`);
        }
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        err(`${name}.${field} must be a finite number >= 0`);
      }
    }
  }

  // Any key that is neither a documented field nor an effect block is a typo —
  // it would be silently dropped, taking its balance intent with it.
  for (const key of Object.keys(def)) {
    if (REQUIRED_FIELDS.includes(key)) continue;
    if (OPTIONAL_FIELDS.has(key)) continue;
    if (KIND_BLOCKS[key] !== undefined) continue;
    err(`unknown field "${key}"`);
  }

  return { errors, warnings };
}
