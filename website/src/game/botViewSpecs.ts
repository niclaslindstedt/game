// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BOT VIEW build presets (DEVELOPER → BOT VIEW → BOT SPEC). Each spec is a
// coherent "who is the autopilot playing" bundle across the three axes the
// engine exposes, so one pick decides the whole showcase:
//
//   - build    → the GENERATED loadout's weapon/gear lane (buildBotViewLoadout →
//                buildSeedLoadout): a melee spec arrives with a blade, a ranged
//                one with a gun, a magic one with a wand. BOT VIEW never plays
//                the player's own hero — it mints a fresh arrival hero at the
//                level's entry level (arrivalLevelFor) dressed for this lane.
//   - profile  → the stat-distribution the bot spends its level-ups on
//                (createBot's BotProfile), so a melee spec pours points into the
//                melee lane and the stat-aware auto-equip keeps preferring blades.
//   - strategy → the positioning POSTURE (createBot's BotStrategy): how close it
//                fights — `aggro` closes and holds tight in the pack, `flee` holds
//                far and kites, `balanced` keeps a steady mid distance.
//
// A this-game developer feature (BOT VIEW is dev-only), so it lives app-side; the
// `?bot=`/`?botProfile=` playtest params still drive the same engine knobs.

import type { BotProfile, BotStrategy, StatBuild } from "@game/core";

export type BotViewSpec = {
  /** Stable id, persisted in the settings (`botViewSpec`). */
  id: string;
  /** Right-aligned menu value (the cycled pick). */
  label: string;
  /** One-line menu blurb describing the playstyle. */
  blurb: string;
  /** The generated arrival loadout's weapon/gear lane. */
  build: StatBuild;
  /** The stat-allocation lane the bot spends level-ups on. */
  profile: BotProfile;
  /** The positioning posture (how close it fights the pack). */
  strategy: BotStrategy;
};

/** The BOT VIEW presets, in cycle order. One coherent hero per weapon lane,
 * each with the posture that lane wants: blades in the thick of it, guns held
 * off at range, spells at a steady mid distance. */
export const BOT_VIEW_SPECS: BotViewSpec[] = [
  {
    id: "melee",
    label: "MELEE",
    blurb: "BLADES UP CLOSE - CLOSES ON THE PACK",
    build: "melee",
    profile: "melee",
    strategy: "aggro",
  },
  {
    id: "ranged",
    label: "RANGED",
    blurb: "GUNS AT RANGE - HOLDS THE PACK OFF",
    build: "ranged",
    profile: "ranged",
    strategy: "flee",
  },
  {
    id: "magic",
    label: "MAGIC",
    blurb: "SPELLS AT MID-RANGE - KEEPS ITS DISTANCE",
    build: "magic",
    profile: "magic",
    strategy: "balanced",
  },
];

/** The spec a fresh install lands on. */
export const DEFAULT_BOT_VIEW_SPEC = "ranged";

/** Whether `id` names a known BOT VIEW spec (settings load validation). */
export function isBotViewSpecId(id: unknown): id is string {
  return typeof id === "string" && BOT_VIEW_SPECS.some((s) => s.id === id);
}

/** Resolve a spec id to its preset, falling back to the default for an unknown
 * or stale id. */
export function botViewSpec(id: string): BotViewSpec {
  return (
    BOT_VIEW_SPECS.find((s) => s.id === id) ??
    BOT_VIEW_SPECS.find((s) => s.id === DEFAULT_BOT_VIEW_SPEC)!
  );
}
