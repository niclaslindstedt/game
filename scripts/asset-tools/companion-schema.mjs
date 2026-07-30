// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COMPANION schema validator. Mirrors `powerup-schema.mjs` /
// `story-schema.mjs`: `validateCompanion` returns `{ errors, warnings }`, hard
// errors FAIL the build, so a companion whose sprite nothing answers to, whose
// signature weapon does not exist, or whose power grows a kit it hasn't got
// surfaces at `npm run levels` rather than as an invisible ally swinging nothing.
//
// The contract checked here is `CompanionDef` in `src/game/defs/companions.ts` —
// keep the two in step when a field is added.

/**
 * The per-rank growth fields, and what each one needs the def to already have.
 *
 * This table is the whole reason the check exists. A power's growth is applied
 * ON TOP of a base kit, and two of the six need that base to be there at all:
 * `companionNovaRadius` returns 0 for a def with no `nova`, so a nova-growing
 * power on an axeman with no nova ranks up forever and does NOTHING. The other
 * four are grants in their own right — `companionProjectileBonus` adds chain
 * arcs to a weapon with no base chain, and `companionAuraMagicFind` sums a bare
 * `magicFindPerRank` with no `aura` — so they are legal alone.
 */
const RANK_FIELDS = {
  pelletsPerRank: null,
  chainPerRank: null,
  piercePerRank: null,
  novaRadiusPerRank: "nova",
  novaDamagePerRank: "nova",
  magicFindPerRank: null,
};

/** Everything a `power:` block may carry. */
const POWER_KEYS = [
  "name",
  "blurb",
  "everyLevels",
  ...Object.keys(RANK_FIELDS),
];

const COMPANION_KEYS = [
  "id",
  "name",
  "sprite",
  "hp",
  "speed",
  "radius",
  "weapon",
  "aura",
  "nova",
  "power",
  "joinWords",
  "killQuotes",
];

/** The nova block's required numbers, and the range each must sit in. */
const NOVA_FIELDS = {
  everyMs: { min: 1 },
  radius: { min: 1 },
  damage: { min: 0 },
  chillMs: { min: 0 },
  chillFactor: { min: 0, max: 1 },
};

/**
 * THE LENGTH BUDGET IS PER PAGE, NOT PER LINE. An authored line is a
 * PARAGRAPH: the overlay flows it into the column the box really has on the
 * device it is being read on (`wrapPage` + `useTextColumn`), so how many
 * characters fit on a ROW is the renderer's business and not the author's.
 * What the author still owns is how much of a thought lands on ONE SCREENFUL
 * before the box makes the player scroll for the rest — three rows of the
 * narrowest box the game supports, a portrait phone, which is about this many
 * characters. A longer page still reads; it just arrives in two taps.
 */
const PAGE_WARN_CHARS = 120;

/**
 * How many EXPLICIT line breaks a page may carry before it stops being
 * sparing. A second entry in a page's list is a deliberate held beat — a
 * punchline, a second hand on the same note, a pause the punctuation cannot
 * carry — and the whole shipped campaign spends five of them. A page cut into
 * four is the old fixed-box habit coming back, and it prints a ragged column.
 */
const MAX_PAGE_LINES = 2;

/** The longest kill quote the floating banter reads cleanly at. It hovers over a
 * body mid-fight rather than sitting in a box, so it has less room than a line
 * of dialogue, not more. */
const QUOTE_WARN_CHARS = 40;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isMapping = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Validate one companion.
 *
 * @param {string} id    the catalog key (which becomes the def's `id`).
 * @param {object} def   the parsed YAML mapping.
 * @param {object} refs  `{ sprites, weapons }` — a Set of live sprite names (the
 *                        companion is drawn from a two-frame family, so a name
 *                        nothing answers to is an ally the renderer silently
 *                        skips) and a Set of weapon ids (its signature piece is
 *                        minted at the join, and an unknown id throws there).
 */
export function validateCompanion(id, def, refs) {
  const errors = [];
  const warnings = [];
  const tag = `companion "${id}"`;
  const err = (m) => errors.push(`${tag}: ${m}`);
  const warn = (m) => warnings.push(`${tag}: ${m}`);

  if (!isMapping(def)) {
    err("expected a mapping (a CompanionDef)");
    return { errors, warnings };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) err("id must be lower_snake_case");
  if (def.id !== undefined && def.id !== id) {
    err(
      `id is "${def.id}" but its catalog key is "${id}" — drop the field, the key is the id`,
    );
  }
  if (typeof def.name !== "string" || def.name.trim() === "") {
    err(
      "name is required — the join toast, the party panel and the banter header",
    );
  }

  // The sprite names a FAMILY: the renderer walks `<sprite>_0`/`_1` as it moves.
  if (typeof def.sprite !== "string" || def.sprite === "") {
    err("sprite is required — the two-frame family the renderer walks");
  } else if (refs?.sprites && !refs.sprites.has(`${def.sprite}_0`)) {
    err(
      `sprite "${def.sprite}" has no frames — expected at least ` +
        `"${def.sprite}_0"`,
    );
  }

  // The body. Authored on the HERO's scale rather than the horde's (see the
  // CompanionDef docs), but the schema only cares that they are real and > 0.
  for (const field of ["hp", "speed", "radius"]) {
    if (!isNum(def[field]) || def[field] <= 0) {
      err(`${field} must be a number > 0`);
    }
  }

  // The signature weapon, minted unbreakable at the join — an unknown id throws
  // out of `mintWeapon` the moment the figure falls in beside the hero.
  if (typeof def.weapon !== "string" || def.weapon === "") {
    err("weapon is required — the piece it fought the hero with");
  } else if (refs?.weapons && !refs.weapons.has(def.weapon)) {
    err(`weapon "${def.weapon}" is not a weapon`);
  }

  checkAura(def.aura, err);
  checkNova(def.nova, err);
  checkPower(def.power, def, err);

  // The joining scene, played through the ordinary dialogue box.
  if (def.joinWords !== undefined) {
    if (!Array.isArray(def.joinWords) || def.joinWords.length === 0) {
      err("joinWords must be a non-empty list of pages");
    } else {
      def.joinWords.forEach((page, i) =>
        checkLines(page, `joinWords[${i}]`, err, warn),
      );
    }
  }

  // The banter. Required, because a companion that kills in silence is the one
  // thing the system is for: the fight is where the player spends the time.
  if (!Array.isArray(def.killQuotes) || def.killQuotes.length === 0) {
    err("killQuotes must be a non-empty list of lines it floats over a kill");
  } else {
    for (const quote of def.killQuotes) {
      if (typeof quote !== "string" || quote.trim() === "") {
        err("killQuotes has a line that is not text");
      } else if (quote.length > QUOTE_WARN_CHARS) {
        warn(
          `killQuote is ${quote.length} chars — over ${QUOTE_WARN_CHARS} it ` +
            `crowds the body it hovers over: "${quote}"`,
        );
      }
    }
  }

  for (const key of Object.keys(def)) {
    if (!COMPANION_KEYS.includes(key)) err(`unknown field "${key}"`);
  }
  return { errors, warnings };
}

/** The party-wide aura. One kind today; more land here as companions do. */
function checkAura(aura, err) {
  if (aura === undefined) return;
  if (!isMapping(aura)) {
    err("aura must be a mapping");
    return;
  }
  if (aura.magicFind !== undefined) {
    if (!isNum(aura.magicFind) || aura.magicFind < 0) {
      err("aura.magicFind must be a number >= 0 (0.5 = +50% magic find)");
    }
  }
  for (const key of Object.keys(aura)) {
    if (key !== "magicFind") err(`unknown field "aura.${key}"`);
  }
  if (Object.keys(aura).length === 0) {
    err("aura is empty — drop it, or give it a kind (magicFind)");
  }
}

/** The FROST NOVA block: every field required, because a pulse with a radius
 * and no cadence never fires and one with no radius catches nobody. */
function checkNova(nova, err) {
  if (nova === undefined) return;
  if (!isMapping(nova)) {
    err("nova must be a mapping");
    return;
  }
  for (const [field, range] of Object.entries(NOVA_FIELDS)) {
    const value = nova[field];
    if (!isNum(value)) {
      err(`nova.${field} is required and must be a number`);
      continue;
    }
    if (value < range.min) err(`nova.${field} must be >= ${range.min}`);
    if (range.max !== undefined && value > range.max) {
      err(`nova.${field} must be <= ${range.max}`);
    }
  }
  for (const key of Object.keys(nova)) {
    if (!(key in NOVA_FIELDS)) err(`unknown field "nova.${key}"`);
  }
}

/**
 * The signature power — and the check that makes the block worth having.
 *
 * A power is pure GROWTH on top of a base kit, so a rank-up that names an effect
 * the def hasn't got is a companion who levels forever and gains nothing. That
 * is invisible at play time (there is no error — the number is simply added to a
 * nova that never pulses), so it is caught here where there is still a field to
 * blame. Same reasoning as the weapon `sfx` check in the mod compiler.
 */
function checkPower(power, def, err) {
  if (power === undefined) return;
  if (!isMapping(power)) {
    err("power must be a mapping");
    return;
  }
  for (const field of ["name", "blurb"]) {
    if (typeof power[field] !== "string" || power[field].trim() === "") {
      err(`power.${field} is required — it is read in the companion panel`);
    }
  }
  // No length bound on `blurb`: unlike `joinWords` it is not drawn in a fixed
  // box — the companion panel shows the power's NAME and its rank — so a
  // threshold here would be inventing a constraint the renderer hasn't got.
  if (!Number.isInteger(power.everyLevels) || power.everyLevels < 1) {
    err("power.everyLevels must be an integer >= 1 (levels between rank-ups)");
  }

  const grown = [];
  for (const [field, needs] of Object.entries(RANK_FIELDS)) {
    const value = power[field];
    if (value === undefined) continue;
    if (!isNum(value) || value <= 0) {
      err(`power.${field} must be a number > 0 — it is added once per rank`);
      continue;
    }
    grown.push(field);
    if (needs && def[needs] === undefined) {
      err(
        `power.${field} grows a \`${needs}:\` this companion has not got, so ` +
          `every rank would add nothing — give it a \`${needs}:\` block or ` +
          `drop the field`,
      );
    }
  }
  if (grown.length === 0) {
    err(
      "power grows nothing — add one of " +
        `${Object.keys(RANK_FIELDS).join(", ")}, or drop the block (a ` +
        "companion with no power still trains hp and damage)",
    );
  }

  for (const key of Object.keys(power)) {
    if (!POWER_KEYS.includes(key)) err(`unknown field "power.${key}"`);
  }
}

/**
 * A page: a non-empty list of authored lines, each one a paragraph the box
 * flows into its own width. See PAGE_WARN_CHARS / MAX_PAGE_LINES.
 */
function checkLines(lines, what, err, warn) {
  if (!Array.isArray(lines) || lines.length === 0) {
    err(`${what} must be a non-empty list of lines`);
    return;
  }
  for (const line of lines) {
    if (typeof line !== "string" || line.trim() === "") {
      err(`${what} has a line that is not text`);
    }
  }
  if (lines.length > MAX_PAGE_LINES) {
    warn(
      `${what} is cut into ${lines.length} lines — a line break is an ` +
        `explicit held beat, not a way to fit a box (the box wraps for you)`,
    );
  }
  const chars = lines.join(" ").length;
  if (chars > PAGE_WARN_CHARS) {
    warn(
      `${what} is ${chars} chars — over ${PAGE_WARN_CHARS} it needs a second ` +
        `tap to read on a phone; consider splitting the PAGE`,
    );
  }
}
