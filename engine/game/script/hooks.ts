// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HOOK CATALOG — the one list of every rule the engine hands to a script,
// which script file owns it, and what it is for. IMPORT-FREE on purpose: this
// is the module `mod/tools/catalog.mjs` enumerates so `mod/catalog.json` can
// carry the hook names a mod may implement, and the mod compiler runs in a
// process with no TypeScript and no engine to import.
//
// **A hook is a FORMULA, never a frame.** Every entry below is called at most
// once per kill, per drop, per spawn, per swing or per ding — never per entity
// per frame. That is a design rule and not an accident: a tree-walking VM at
// horde scale in the step pipeline would be a frame-rate cliff a modder could
// not see coming, and the fix (a bytecode VM) would buy a hook nothing it does
// not already have. Anything that would run per-entity-per-frame stays in
// TypeScript, and the shipped scripts stay small enough to read in one screen.
//
// **Adding a hook is four edits, and the drift test enforces the set:**
//   1. an entry here,
//   2. the shipped implementation in `content/scripts/<script>.lua`,
//   3. the typed call site in `bindings.ts`,
//   4. `make mod-catalog`, so a mod may name it.

/** Every hook the engine will look for, in the file that owns it. */
export const HOOKS = [
  // ---- progression.lua — the shape of a character's growth ----------------
  {
    script: "progression",
    hook: "xp_to_level_up",
    what: "The XP that crossing out of a level costs. Reads the authored curve row and applies the endgame wall and the per-tier cost.",
  },
  {
    script: "progression",
    hook: "mob_xp",
    what: "What one kill of a monster of a given level pays a hero of a given level, level-difference bonus and penalty included.",
  },
  {
    script: "progression",
    hook: "xp_cap_multiplier",
    what: "How much of an XP grant a hero still collects once past a map's soft level cap.",
  },
  {
    script: "progression",
    hook: "stat_diminish",
    what: "The diminishing-returns curve every effective-stat read runs through: linear to the cap, tapering past it.",
  },
  // ---- menace.lua — how hard the world pushes back ------------------------
  {
    script: "menace",
    hook: "mob_hp_level_factor",
    what: "The hp multiplier a monster's own level buys it — the single per-level hp shape mob hp, the crowd's toughness and ability scaling all read.",
  },
  {
    script: "menace",
    hook: "mob_level",
    what: "The monster level the horde fields against a hero of a given level on a given difficulty.",
  },
  {
    script: "menace",
    hook: "overkill_efficiency",
    what: "What a killing blow is worth when it lands for several times the victim's health — the anti-farming curve on kill XP and minion drops.",
  },
  // ---- loot.lua — the rain -----------------------------------------------
  {
    script: "loot",
    hook: "drop_chance",
    what: "The chance a rank-and-file monster drops anything at all, after LUCK and the difficulty's bonus.",
  },
  {
    script: "loot",
    hook: "tier_chance",
    what: "The D2-style rarity roll's per-tier CHANCE. The engine still walks the tiers best-first and spends the run's own seeded draws; this decides what each draw is measured against.",
  },
  {
    script: "loot",
    hook: "magic_find_factor",
    what: "How MAGIC FIND multiplies a tier's odds — linear on magic, saturating on the rarer tiers.",
  },
  // ---- combat.lua — what a blow is worth ----------------------------------
  {
    script: "combat",
    hook: "weapon_damage",
    what: "A weapon instance's per-hit damage for its wielder: the catalog number, the governing stat, the item's own rolls and any running surge.",
  },
  {
    script: "combat",
    hook: "mob_armor_reduction",
    what: "The fraction of a physical blow a monster shrugs off, by its level and its difficulty's armor bonus.",
  },
] as const;

/** A hook's name as a script spells it. */
export type HookName = (typeof HOOKS)[number]["hook"];

/** A shipped script's id — its file stem under `content/scripts/`. */
export type ScriptId = (typeof HOOKS)[number]["script"];

/** Every script file the engine looks for, in catalog order. */
export const SCRIPT_IDS: readonly string[] = [
  ...new Set(HOOKS.map((h) => h.script)),
];

/** Which script owns a hook — the file a mod overrides to change it. */
export function scriptForHook(hook: string): string | undefined {
  return HOOKS.find((h) => h.hook === hook)?.script;
}
