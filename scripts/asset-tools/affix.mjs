// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AFFIXES, in one place — the bonus vocabulary every authored bonus list is
// checked against.
//
// A unique's `bonuses:` and a SET's tiered `bonuses:` are the same thing (an
// `Affix[]` the loadout folds in), so they have to be checked by the same code.
// They were not, for as long as sets were TypeScript and only items were
// authored — and the moment a mod can author both, a second copy of this list
// is a second answer to "is `armorPen` a real bonus", one of which is wrong
// within a release.
//
// The lists mirror the engine's `Affix` union (src/game/types/) and its
// `StatName`. Keep them in step when a kind is added — the compile step for
// items and sets both read from here, so there is exactly one edit.

/** The five hero stats a `stat`/`statPct` bonus may name. */
export const STAT_NAMES = new Set([
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "luck",
]);

/** Every `Affix.kind` an authored bonus may be. */
export const AFFIX_KINDS = new Set([
  "damagePct",
  "maxHp",
  "crit",
  "armor",
  "armorPen",
  "stat",
  "statPct",
  "maxHpPct",
  "spell",
  "proc",
  "sureStrike",
  "knockback",
]);

/** The scaling "keeper" bonus kinds a single list may carry at most ONE of —
 * two multiplicative scalers on one piece stack into a number nobody tuned. */
export const SCALING_KINDS = new Set(["statPct", "maxHpPct"]);

/** The spells a GRANTED `spell` bonus may name (the engine's `SpellKind`). */
export const SPELL_KINDS = new Set([
  "orbit",
  "storm",
  "stasis",
  "seeker",
  "singularity",
  "immolation",
]);

/**
 * The spells a `proc` may FIRE (`ProcSpell`) — a strictly NARROWER set than the
 * granted ones, because a proc has to be one instantaneous blow.
 *
 * The narrowing is load-bearing rather than tidy: `PROC_RANK_ILVL`
 * (src/game/item-budget.ts) prices only these two, so a proc naming any other
 * spell budgets to NaN — and an item whose whole ilvl model has gone quiet
 * passes every check while being worth nothing the balance model can see.
 */
export const PROC_SPELLS = new Set(["bolt", "nova"]);

/** What a `proc` may fire ON. */
export const PROC_TRIGGERS = new Set(["hit", "kill", "struck"]);

/**
 * Validate one authored bonus list, reporting through the caller's own `err`.
 *
 * @param list  the authored `bonuses:` value (undefined is fine — an item with
 *              no bonuses is a legal item)
 * @param err   the caller's finding sink, so a message lands with that
 *              schema's own file/id prefix
 * @param what  what to call the list in a message ("bonuses", "2-piece bonus")
 */
export function validateAffixes(list, err, what = "bonuses") {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    err(`${what} must be a list of affixes`);
    return;
  }
  let scaling = 0;
  for (const b of list) {
    if (!b || typeof b !== "object") {
      err(`${what} entries must be mappings`);
      continue;
    }
    if (!AFFIX_KINDS.has(b.kind))
      err(
        `unknown bonus kind "${b.kind}" in ${what} ` +
          `(valid: ${[...AFFIX_KINDS].join(", ")})`,
      );
    if (SCALING_KINDS.has(b.kind)) scaling++;
    if ((b.kind === "stat" || b.kind === "statPct") && !STAT_NAMES.has(b.stat))
      err(`bonus "${b.kind}" names unknown stat "${b.stat}" in ${what}`);
    if (b.kind === "spell" && !SPELL_KINDS.has(b.spell))
      err(
        `bonus "spell" grants unknown spell "${b.spell}" in ${what} ` +
          `(valid: ${[...SPELL_KINDS].join(", ")})`,
      );
    if (b.kind === "proc") {
      if (!PROC_SPELLS.has(b.spell))
        err(
          `bonus "proc" fires unknown spell "${b.spell}" in ${what} ` +
            `(valid: ${[...PROC_SPELLS].join(", ")})`,
        );
      if (!PROC_TRIGGERS.has(b.trigger))
        err(
          `bonus "proc" has unknown trigger "${b.trigger}" in ${what} ` +
            `(valid: ${[...PROC_TRIGGERS].join(", ")})`,
        );
    }
  }
  if (scaling > 1) err(`${what} has ${scaling} scaling (*Pct) bonuses (max 1)`);
}
