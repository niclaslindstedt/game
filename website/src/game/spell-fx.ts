// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cast-FX catalog for player spells (defs/spells.ts) — the app-side
// flourish that makes a cast look MARVELLOUS. It sits ON TOP of the shared
// engine cues (a bolt's `lightning`, a nova's `nova`, a heal float, a ward
// ring): every cast blooms an element-tinted "spellcast" effect at the hero,
// shaped by the spell's school. The engine knows nothing of this — it's pure
// presentation keyed off `SpellDef.element` / `.category`, so a new spell's
// look comes for free from its theme (author bespoke entries here later, the
// way weapon-fx.ts grows one signature at a time).
//
// Tune and eyeball these with `website/scripts/spell-preview.mjs` (the spell
// analog of the weapon-swing preview).

import type { SpellDef } from "@game/core";

import type { Effect } from "./render.ts";
import { spellColor } from "./spellVisuals.ts";

/** How long the cast bloom plays (ms). */
const CAST_BLOOM_MS = 460;

/** The bloom radius for a spell — an area spell blooms out to its real reach so
 * the flourish matches the damage zone; a single-target/defensive cast blooms a
 * tight flare at the caster. */
function bloomRadius(def: SpellDef): number {
  const e = def.effect;
  if (e.kind === "nova") return Math.max(48, e.radius);
  if (e.kind === "slow") return Math.max(48, e.radius);
  if (e.kind === "shield") return 40;
  if (e.kind === "heal") return 36;
  // A ranged volley (`rain`) lands its burst on a distant cluster (the engine's
  // `nova` cue draws it there); the bloom at the hero is just a tight muzzle
  // flash as the shots loose. A self-`buff` blooms a tight aura at the hero.
  if (e.kind === "rain") return 40;
  if (e.kind === "buff") return 38;
  return 44; // bolt
}

/**
 * The cast effects for one spell going off at `pos` (the hero) at `timeMs` —
 * the element-tinted bloom (and room to add per-spell signature flourishes
 * later). Returned as render `Effect`s the GameScreen pushes onto its list.
 */
export function spellCastEffects(
  def: SpellDef,
  pos: { x: number; y: number },
  timeMs: number,
): Effect[] {
  return [
    {
      kind: "spellcast",
      pos: { ...pos },
      color: spellColor(def.element),
      category: def.category,
      radius: bloomRadius(def),
      untilMs: timeMs + CAST_BLOOM_MS,
      durationMs: CAST_BLOOM_MS,
    },
  ];
}
