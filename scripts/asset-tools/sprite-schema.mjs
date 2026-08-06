// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Schema validator for the YAML sprite format (see the `pixel-assets` skill).
// `make assets` fails on any hard error so a malformed file never
// reaches the atlas; the `size` guard in particular neutralizes the YAML
// block-scalar trailing-space footgun (an editor that strips trailing
// whitespace would otherwise silently narrow a sprite — here the row width no
// longer matches `size` and the build stops).

/** A palette key is one `A-Za-z0-9` char; `.` is reserved for transparent. */
const KEY_RE = /^[A-Za-z0-9]$/;
/** `#rgb`, `#rrggbb`, or `#rrggbbaa`, case-insensitive. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * WHICH PLANE THE ART IS DRAWN ON — the one thing a sprite has to say about
 * itself for the world projection to put it on screen correctly (see
 * `pwa/src/game/render/tilt.ts`).
 *
 * `upright` (the default, so every sprite that says nothing keeps the look it
 * has) is a thing with a SIDE to it: a rock, a house front, a body. It is
 * anchored at its projected spot and then drawn standing at full size, because
 * squashing it would just be a distorted picture of the same top-down game.
 *
 * `floor` is art drawn in PLAN — a painted lane marking, a hatch, a hole in the
 * ground, a crate seen from above. It belongs to the floor and has to take the
 * projection whole, exactly as the ground tiles under it do; standing it up
 * leaves it taller than the grid it sits on, and under a yaw a straight run of
 * them reads as a flight of stairs instead of a run of anything.
 *
 * `wall` is art drawn in PLAN that is not FLAT — a wall panel, a parapet, a low
 * barrier. Its footprint belongs to the floor exactly as `floor`'s does, but the
 * thing standing on that footprint has a HEIGHT, and drawn flat it reads as a
 * paving slab: turn the camera and a room's walls become a slightly darker path
 * across the floor you would walk over rather than something you cannot see past.
 * So the renderer EXTRUDES it — the same plan art, projected once and stacked
 * `rise` px of screen height, cap on top — which needs no second piece of art and
 * comes out right at every pitch and yaw. See `render/plane.ts`.
 */
export const SPRITE_PLANES = new Set(["upright", "floor", "wall"]);

/** The plane a sprite that names none is drawn on. */
export const DEFAULT_SPRITE_PLANE = "upright";

/**
 * HOW FAR A `plane: wall` PIECE RISES OFF ITS FOOTPRINT, in world px — which is
 * screen px, a standing thing being drawn at full size.
 *
 * The default is the art's OWN height, so a square plan panel extrudes into a
 * cube: a 16×16 wall tile becomes a 16-px wall, which is a hero tall and reads
 * as one. `rise:` overrides it for a piece that is deliberately lower than it is
 * deep (a parapet, a kerb, a crash barrier).
 */
export function wallRise(sprite) {
  const authored = sprite?.rise;
  if (Number.isInteger(authored) && authored > 0) return authored;
  const h = Array.isArray(sprite?.size) ? sprite.size[1] : 0;
  return Number.isInteger(h) && h > 0 ? h : 1;
}

/**
 * WHERE THE ART BELONGS — inside a building, or out in the world.
 *
 * It is a fact about the OBJECT rather than about any one map: a cactus is an
 * outdoor thing on every map in the game and a server rack is an indoor one, and
 * saying so once here is what lets the map compiler refuse a palette entry that
 * could scatter either into the wrong half of a venue
 * (`MapObject.space` / `MapArea.space`). Before this, "don't put the office
 * furniture on the lawn" was an authoring discipline enforced by nobody, and the
 * failure was silent on every seed but the one somebody happened to render.
 *
 * Most sprites declare NOTHING, and that is the honest answer for most of them —
 * a crate, a puddle of blood, a corpse and a bullet hole belong wherever they
 * turn up. Only art that would read as a mistake on the other side of a wall
 * needs to say so.
 */
export const SPRITE_SPACES = new Set(["inside", "outside"]);

/**
 * ART THAT RUNS ONE WAY — `directional: true` on a `plane: floor` sprite.
 *
 * Most plan art has no bearing: a stain, a hatch, a pool of oil looks the same
 * whichever way round it lies. A conveyor belt does not. Its side rails run
 * along the belt, its rollers cross it, and its animation frames march the
 * pattern one way — so a run of belts laid EAST that is drawn with the art's own
 * NORTH-SOUTH picture is a machine visibly carrying its cargo sideways.
 *
 * The bearing is not the art's to know: a `propLine` runs whichever way the
 * chamber it was laid in is longest (`buildRows`, src/game/mapgen/place.ts), so
 * the same belt is east-west in one bay and north-south in the next. So the art
 * declares that it HAS a direction, the placement supplies WHICH (`Decor.facing`
 * — the line's own bearing), and the renderer turns the piece to match before it
 * projects it. The convention is that directional art is authored running
 * SOUTH — down the grid, the way a sprite's rows already read.
 *
 * Invisible at yaw 0 for the same reason everything else on this page is: with
 * the camera square-on a belt drawn across its run still shows rails and rollers
 * along the screen's own axes, and the eye forgives it. Turn the camera and it
 * is the only thing on the floor moving at 45° to itself.
 */
export const DIRECTIONAL_AUTHORED_BEARING = "south";

/**
 * The closed vocabulary of `subject:` slots (kept in step with `SUBJECT_KEYS`
 * in `prompt.mjs`). A structured subject is optional, but if present it must use
 * only these keys — a typo'd slot silently drops signal from the prompt, so it
 * fails the build rather than passing unnoticed.
 */
const SUBJECT_KEYS = new Set([
  "kind",
  "name",
  "build",
  "attire",
  "features",
  "accent",
  "pose",
  "flavor",
]);

/**
 * Validate an optional structured `subject` map: a plain object whose keys are
 * all recognized slots and whose values are strings. `label` names the source.
 * @returns array of error strings (empty when absent or valid).
 */
export function validateSubject(label, subject) {
  if (subject === undefined || subject === null) return [];
  const errors = [];
  if (typeof subject !== "object" || Array.isArray(subject)) {
    errors.push(`${label}: subject must be a map of slots`);
    return errors;
  }
  for (const [key, value] of Object.entries(subject)) {
    if (!SUBJECT_KEYS.has(key)) {
      errors.push(
        `${label}: unknown subject slot "${key}" (allowed: ${[...SUBJECT_KEYS].join(", ")})`,
      );
    }
    if (typeof value !== "string") {
      errors.push(`${label}: subject "${key}" must be a string`);
    }
  }
  return errors;
}

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
  errors.push(...validateSubject(name, sprite?.subject));

  const plane = sprite?.plane;
  if (plane !== undefined && !SPRITE_PLANES.has(plane)) {
    errors.push(
      `${name}: plane must be one of ${[...SPRITE_PLANES].join(", ")} (got ${JSON.stringify(plane)})`,
    );
  }

  // `rise` is the wall plane's own knob and means nothing anywhere else — a
  // `rise` on an upright rock is an authoring mistake that would otherwise sit
  // in the file looking load-bearing.
  const rise = sprite?.rise;
  if (rise !== undefined) {
    if (plane !== "wall") {
      errors.push(`${name}: rise is only meaningful with plane: wall`);
    } else if (!Number.isInteger(rise) || rise <= 0 || rise > 64) {
      errors.push(
        `${name}: rise must be a positive integer up to 64 (got ${JSON.stringify(rise)})`,
      );
    }
  }

  // …and `directional` is the FLOOR plane's, for art whose picture runs one way
  // down the ground (see the constant's own note). A standing body faces the
  // camera by construction, so it has no bearing to be told about.
  const directional = sprite?.directional;
  if (directional !== undefined) {
    if (typeof directional !== "boolean") {
      errors.push(
        `${name}: directional must be true or false (got ${JSON.stringify(directional)})`,
      );
    } else if (directional && plane !== "floor") {
      errors.push(`${name}: directional is only meaningful with plane: floor`);
    }
  }

  const space = sprite?.space;
  if (space !== undefined && !SPRITE_SPACES.has(space)) {
    errors.push(
      `${name}: space must be one of ${[...SPRITE_SPACES].join(", ")} (got ${JSON.stringify(space)})`,
    );
  }

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

  // The acceptance target is the free-prose description OR a structured
  // subject; warn only when a sprite carries neither.
  const hasSubjectTarget =
    sprite?.subject &&
    typeof sprite.subject === "object" &&
    Object.values(sprite.subject).some(
      (v) => typeof v === "string" && v.trim() !== "",
    );
  const hasDescription =
    sprite?.description && String(sprite.description).trim() !== "";
  if (!hasDescription && !hasSubjectTarget) {
    warnings.push(
      `${name}: empty description (the acceptance target — fill it in, or add a subject)`,
    );
  }

  return { errors, warnings };
}
