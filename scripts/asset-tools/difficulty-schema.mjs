// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DIFFICULTY VOICE schema — `validateDifficultyVoice(id, def, refs)`.
//
// A mod may rename the game's difficulty rungs and rewrite their taglines, and
// that is ALL it may do to them. The split is deliberate and worth stating
// plainly, because the obvious next request is "let a mod tune the numbers too":
//
//   THE VOICE is the mod's. "JESUS CHRIST!" / "THEY NEVER STOP COMING" is this
//   game's register, and a conversion set in a hospital, a courtroom or a
//   different century reads as somebody else's game the moment the ladder speaks
//   in it. There is nothing to balance in a label.
//
//   THE NUMBERS are the game's. A rung's mob multipliers, xp rates, mercy
//   curves, stamina ladders and starting weapon are one economy with
//   `content/ladder.yaml`, which prices every venue — the shipped ones included
//   — against them. A mod that moved them would be rebalancing the campaign it
//   is adding to, not adding to it. That is the same line `item_rarity.yaml` and
//   the `ramps` catalog are on.
//
// So a mod's entry carries two strings, the rungs it may name are the five the
// game ships, and everything else about the rung stands.

import { glyphProblem } from "./glyphs.mjs";

/** Both strings are drawn on the CHOOSE YOUR NIGHTMARE ladder, which measures
 * and shrinks to fit; past these an entry is unreadable rather than overflowing.
 * Sized off the shipped longest ("JESUS CHRIST!", "THEY NEVER STOP COMING")
 * with room to spare. */
const NAME_MAX = 24;
const TAGLINE_MAX = 44;

const ALLOWED = new Set(["name", "tagline"]);

/**
 * Validate one authored difficulty voice.
 *
 * @param id   the rung being renamed (`easy` … `jesus`)
 * @param def  the authored entry
 * @param refs `{ difficulties: Set<string>, glyphs?: string }`
 */
export function validateDifficultyVoice(id, def, refs) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`difficulty "${id}": ${m}`);

  if (!refs.difficulties?.has(id)) {
    // A mod cannot ADD a rung: the ladder's length is baked into the unlock
    // chain, the per-map ladder cells and the four-tuple every level compiles
    // its ramps into. An unknown key here is a typo that would otherwise do
    // nothing at all.
    return {
      errors: [
        `difficulty "${id}" is not one of the game's rungs ` +
          `(${[...(refs.difficulties ?? [])].join(", ")}) — a mod renames the ` +
          "ladder's rungs, it does not add to them",
      ],
      warnings,
    };
  }
  if (!def || typeof def !== "object" || Array.isArray(def)) {
    return { errors: [`difficulty "${id}": expected a mapping`], warnings };
  }

  for (const key of Object.keys(def)) {
    if (!ALLOWED.has(key))
      err(
        `unknown field "${key}" — a mod may rewrite \`name\` and \`tagline\`, ` +
          "and nothing else about a rung (the numbers are the game's economy)",
      );
  }

  if (def.name === undefined && def.tagline === undefined)
    err("sets neither name nor tagline, so it changes nothing");

  for (const [field, max] of [
    ["name", NAME_MAX],
    ["tagline", TAGLINE_MAX],
  ]) {
    const text = def[field];
    if (text === undefined) continue;
    if (typeof text !== "string" || !text.trim()) {
      err(`${field} must be a non-empty string`);
      continue;
    }
    if (text.length > max)
      err(`${field} is ${text.length} characters — keep it to ${max}`);
    const problem = glyphProblem(text, refs.glyphs, field);
    if (problem) err(problem);
  }

  return { errors, warnings };
}
