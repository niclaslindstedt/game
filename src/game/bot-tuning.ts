// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOT TUNING — the autopilot's positioning knobs, one neutral default per lever,
// with per-level overrides. This is the engine-side half of the `bot.yaml`
// pipeline (see the `bot-improvement` skill): `website/scripts/bot.yaml` is the
// hand-authored source of truth, compiled to `src/generated/botTuning.ts` by
// `website/scripts/generate-bot-tuning.mjs` (run inside `npm run levels`), and
// `bot.ts` resolves a per-level `BotTuning` off it every tick via
// `botTuningFor()` — so a knob can be retuned globally OR bent for one map
// without touching the bot's decision code.
//
// This module is a LEAF: it deliberately does NOT import the generated
// overrides (the resolver takes them as an argument). That keeps the generator
// free to import `BOT_TUNING_DEFAULTS` here to validate the YAML's knob keys
// without triggering the bootstrap cycle it would hit importing the file it is
// about to write (mirrors how generate-levels.mjs avoids the level registry).
//
// The DEFAULTS reproduce the bot's shipped constants EXACTLY, so a run with no
// override in `bot.yaml` plays identically to before the pipeline existed. New
// knobs migrate here one at a time as the bot is iterated — keep the set to the
// levers actually READ by `bot.ts`, never a knob the decision code ignores.

/** The three survival POSTURES and how each weights safety against kills — the
 * playstyle axis `survive()` reads (`aggro`/`balanced`/`flee`). */
export type PostureTuning = {
  /** Scales both the danger bubble and the reach-aware engage hold (>1 fights
   * further out, peeling off the pack earlier; <1 presses in tighter). */
  standoffMul: number;
  /** HP fraction below which the hero breaks contact to heal/reset. */
  fleeHp: number;
  /** Packed-foe count that (with encirclement) triggers a punch-out. */
  surround: number;
};

/** The autopilot's positioning tunables. Distances are world px; fractions are
 * of the relevant span. One neutral default each, matching the bot's shipped
 * constants. */
export type BotTuning = {
  /** The standoff HELD from the nearest body — just beyond a foe's ~34px grasp.
   * The floor every reach-aware hold is clamped to, so a hold never creeps
   * inside a bite. */
  graspStandoff: number;
  /** RANGED/MAGIC engage distance as a fraction of the weapon's own range: the
   * hero holds at `range * engageRangeFrac` (floored at `graspStandoff`) so he
   * kills from near max reach instead of hugging the front line. Melee, which
   * can't reach that far, holds at its own range regardless. */
  engageRangeFrac: number;
  /** While DISARMED (a scripted opening), the standoff the hero approaches the
   * nearest foe to and HOLDS — close enough to trip the level's first-sight
   * beat and let the scripted vanguard rush in and draw the blade, but outside
   * the pack so he doesn't barge into the middle unarmed. */
  armApproachStandoff: number;
  /** Max bodies packed within the surround ring the hero will still MARCH the
   * macro goal straight through; above it he holds at reach and thins the front
   * line first instead of walking into a thick field. */
  pushThroughMax: number;
  /** CIRCLE-STRAFE arc (radians) the hero advances around a target he's holding
   * at weapon range — the tangential lead that turns a static weapon-range hold
   * into a moving orbit, so enemy shots aimed at his current spot slip past
   * while his auto-aimed weapon keeps hitting. 0 = stand still (the old hold). */
  orbitStep: number;
  /** The three posture rows (aggro/balanced/flee). */
  postures: Record<"aggro" | "balanced" | "flee", PostureTuning>;
};

/** The shipped baseline — every value is the bot's historical constant, so an
 * un-overridden level plays exactly as it did before the tuning pipeline. */
export const BOT_TUNING_DEFAULTS: BotTuning = {
  graspStandoff: 72,
  engageRangeFrac: 0.8,
  armApproachStandoff: 140,
  pushThroughMax: 2,
  orbitStep: 0.6,
  postures: {
    // Trades safety for kills: fights up close, tolerates a denser ring.
    aggro: { standoffMul: 0.65, fleeHp: 0.28, surround: 7 },
    // The classic survivor — the shared anchors.
    balanced: { standoffMul: 1, fleeHp: 0.4, surround: 5 },
    // Trades kills for safety: holds well out of reach, disengages early.
    flee: { standoffMul: 1.7, fleeHp: 0.6, surround: 4 },
  },
};

/** A DEEP-partial tuning override: any subset of the flat knobs, plus any subset
 * of the posture rows each with any subset of its fields. This is what an author
 * writes in `bot.yaml` — a level bends only the knobs it needs. */
export type BotTuningPatch = Omit<Partial<BotTuning>, "postures"> & {
  postures?: Partial<
    Record<"aggro" | "balanced" | "flee", Partial<PostureTuning>>
  >;
};

/** The shape the generated `src/generated/botTuning.ts` exports: the global
 * `default` layer plus per-level overrides keyed by level id. */
export type BotTuningOverrides = {
  default: BotTuningPatch;
  byLevel: Record<string, BotTuningPatch>;
};

/** Merge a partial posture map over a full one (per-row, per-field). */
function mergePostures(
  base: BotTuning["postures"],
  patch: BotTuningPatch["postures"],
): BotTuning["postures"] {
  if (!patch) return base;
  const out = { ...base };
  for (const key of ["aggro", "balanced", "flee"] as const) {
    const row = patch[key];
    if (row) out[key] = { ...base[key], ...row };
  }
  return out;
}

/** Apply one partial layer (flat knobs + the nested posture rows) over a full
 * tuning, returning a fresh object. Non-posture keys copy straight across. */
function applyLayer(base: BotTuning, patch: BotTuningPatch): BotTuning {
  const { postures, ...flat } = patch;
  return {
    ...base,
    ...flat,
    postures: mergePostures(base.postures, postures),
  };
}

/**
 * Resolve the effective {@link BotTuning} for a level: the shipped defaults, the
 * generated `default` layer, then the level's own overrides on top — a pure
 * function of its arguments (no module state, no clock/rng), so a botted run
 * stays deterministic. `bot.ts` passes the generated `BOT_TUNING_OVERRIDES` and
 * `state.level.id`.
 */
export function resolveBotTuning(
  overrides: BotTuningOverrides,
  levelId: string,
): BotTuning {
  let tune = applyLayer(BOT_TUNING_DEFAULTS, overrides.default ?? {});
  const perLevel = overrides.byLevel[levelId];
  if (perLevel) tune = applyLayer(tune, perLevel);
  return tune;
}
