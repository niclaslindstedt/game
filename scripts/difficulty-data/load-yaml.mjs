// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DIFFICULTY VOICE loader — a mod's `difficulties.yaml`.
//
// The one loader in this family with no shipped tree behind it, and that is the
// point rather than an omission: the game's rungs ARE their numbers (mob
// multipliers, xp rates, mercy curves, the stamina ladders), which live in
// `engine/game/defs/difficulties.ts` as engine tuning and are priced against
// `content/ladder.yaml`. What a mod may replace is what the ladder SAYS — the
// label and the one-line blurb under it — so that a conversion's difficulty
// screen speaks in its own register instead of this game's.
//
// Layout — a single FILE at the mod's root, like `companions.yaml`:
//   difficulties.yaml   a `difficulties:` mapping of rung id → { name, tagline }
//
// It still takes a base directory, and still returns `{ voices, entries }`, so
// it reads and validates exactly like every other catalog here.

import { existsSync, readFileSync } from "node:fs";

import { parse } from "yaml";

/**
 * Load a difficulty-voice catalog.
 *
 * @param baseDir  the tree holding `difficulties.yaml` (a mod's root).
 * @returns `{ voices, entries }` — `voices` is `{ rung → { name?, tagline? } }`;
 *          `entries` is `[{ id, def }]` in file order for the schema. Throws on
 *          a structural error (a file that isn't a mapping, or no
 *          `difficulties:` key).
 */
export function loadDifficultyVoices(baseDir) {
  const voices = {};
  const entries = [];
  const source = `${baseDir}/difficulties.yaml`;

  // Almost no mod ships one; an absent file is an empty catalog.
  if (!existsSync(source)) return { voices, entries };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("difficulties.yaml: expected a YAML mapping");
  }
  const catalog = doc.difficulties;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(
      'difficulties.yaml: expected a "difficulties:" mapping of rung → ' +
        "{ name, tagline }",
    );
  }

  for (const [id, def] of Object.entries(catalog)) {
    if (id in voices) throw new Error(`duplicate difficulty "${id}"`);
    voices[id] = def;
    entries.push({ id, def });
  }
  return { voices, entries };
}
