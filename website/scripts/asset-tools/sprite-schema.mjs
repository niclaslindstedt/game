// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Schema validator for the YAML sprite format (see docs/sprite-yaml-plan.md,
// Phase 1). `make assets` fails on any hard error so a malformed file never
// reaches the atlas; the `size` guard in particular neutralizes the YAML
// block-scalar trailing-space footgun (an editor that strips trailing
// whitespace would otherwise silently narrow a sprite — here the row width no
// longer matches `size` and the build stops).

/** A palette key is one `A-Za-z0-9` char; `.` is reserved for transparent. */
const KEY_RE = /^[A-Za-z0-9]$/;
/** `#rgb`, `#rrggbb`, or `#rrggbbaa`, case-insensitive. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Validate a char → hex palette map. `label` names the source for errors.
 * @returns array of error strings (empty when valid).
 */
export function validatePalette(label, palette) {
  const errors = [];
  for (const [key, hex] of Object.entries(palette ?? {})) {
    if (key === ".") {
      errors.push(
        `${label}: "." is the reserved transparent key, never a palette key`,
      );
    } else if (!KEY_RE.test(key)) {
      errors.push(`${label}: palette key "${key}" must match [A-Za-z0-9]`);
    }
    if (typeof hex !== "string" || !HEX_RE.test(hex.trim())) {
      errors.push(
        `${label}: color for "${key}" is not a valid hex color: ${JSON.stringify(hex)}`,
      );
    }
  }
  return errors;
}

/**
 * Split a `grid` block scalar into rows (dropping the trailing newline the
 * literal block carries). Transparent trailing pixels are `.`, never spaces.
 */
export function gridRows(block) {
  const rows = String(block).split("\n");
  if (rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/**
 * Validate one parsed sprite file against the schema. Enforces: a `[w,h]`
 * integer size; a valid palette (keys + hex); a grid whose row count and every
 * row's width match `size`; and every painted char present in the palette.
 *
 * @returns `{ errors, warnings }` — `errors` fail the build; `warnings` (an
 *          empty `description`, the acceptance target) are advisory.
 */
export function validateSprite(sprite) {
  const errors = [];
  const warnings = [];
  const name = sprite?.name ?? "(unnamed)";

  const size = sprite?.size;
  const sizeOk =
    Array.isArray(size) &&
    size.length === 2 &&
    size.every((n) => Number.isInteger(n) && n > 0);
  if (!sizeOk) errors.push(`${name}: size must be [w, h] positive integers`);

  errors.push(...validatePalette(name, sprite?.palette));
  const palette = sprite?.palette ?? {};

  if (typeof sprite?.grid !== "string") {
    errors.push(`${name}: grid is missing or not a block scalar`);
  } else if (sizeOk) {
    const [w, h] = size;
    const rows = gridRows(sprite.grid);
    if (rows.length !== h) {
      errors.push(`${name}: grid has ${rows.length} rows, size says ${h}`);
    }
    rows.forEach((row, y) => {
      if (row.length !== w) {
        errors.push(`${name} row ${y}: width ${row.length}, size says ${w}`);
      }
      for (const char of row) {
        if (char !== "." && !(char in palette)) {
          errors.push(`${name} row ${y}: char "${char}" not in palette`);
        }
      }
    });
  }

  if (!sprite?.description || String(sprite.description).trim() === "") {
    warnings.push(
      `${name}: empty description (the acceptance target — backfill in Phase 3.1)`,
    );
  }

  return { errors, warnings };
}
