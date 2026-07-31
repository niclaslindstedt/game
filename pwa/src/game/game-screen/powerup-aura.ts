// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The powerups' SCREEN-SPACE half: the sustained full-screen treatment a
// running power puts over the whole frame, and the one-shot washes the loud
// moments throw. The world-anchored halves are render/powerups.ts (sustained)
// and render/powerup-bursts.ts (bursts) — between them, a power reads both on
// the field and on the glass, the same split the NUKE uses (createNukeFx).
//
// SUSTAINED. A running power that changes how the WORLD looks gets a class on
// the aura layer for exactly as long as it runs: the PALE SHROUD drains the
// colour out of everything (the hero is half out of the world), REACTOR SURGE
// runs the edges hot, the EVENT HORIZON darkens and bends the corners in, the
// BLAST SHIELD frosts the frame blue, the CONTINUITY PROTOCOL gilds it, and
// the STASIS FIELD ices it over. The set is recomputed each frame from the
// engine's own `player.abilities`, so an aura can never outlive its power.
//
// ONE-SHOT. `flash(kind)` throws a single wash (a wave, a shatter, a save) —
// appended, animated, self-removing, the same imperative shape as createTapFx.
// Driven from the sim loop's event pass, never through React.

import type { RefObject } from "react";

import { abilityBlocks, abilityDef, type GameState } from "@game/core";

/** Effect BLOCK → the aura class it wears while it runs. A block that isn't
 * here changes nothing about the frame (its whole read is on the field), which
 * is most of them. Keyed by block rather than by the def's `kind` label so a
 * COMPOSED power wears an aura for every effect it carries — a power that both
 * phases and shields frosts the frame and drains it, the way running the two
 * pickups together already does. */
const AURA_FOR_BLOCK: Record<string, string> = {
  phase: "aura-phase",
  surge: "aura-surge",
  barrier: "aura-barrier",
  ward: "aura-ward",
  stasis: "aura-stasis",
  well: "aura-void",
};

/** The one-shot washes, and how long each lives before it is pulled (ms — keep
 * in step with the matching CSS animation). */
const FLASH_LIFE_MS: Record<string, number> = {
  "powerup-wave": 700,
  "powerup-shatter": 620,
  "powerup-save": 1000,
  "powerup-quake": 420,
};

export type PowerupAura = {
  /** Re-sync the sustained aura classes from the run's live state. Cheap
   * enough for every frame: it only touches the DOM when the set changed. */
  sync: (state: GameState) => void;
  /** Throw a one-shot wash over the frame. */
  flash: (kind: keyof typeof FLASH_LIFE_MS | string) => void;
  /** Drop every aura and clear pending removals (run teardown). */
  dispose: () => void;
};

/**
 * Powerup aura factory over the FX layer element. Mirrors createNukeFx: the
 * caller owns the ref, this owns everything that happens inside it.
 */
export function createPowerupAura(
  layerRef: RefObject<HTMLDivElement | null>,
): PowerupAura {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // What is currently on the layer, so a steady state costs no DOM writes.
  let applied = "";

  const sync = (state: GameState) => {
    const layer = layerRef.current;
    if (!layer) return;
    // A well's aura only belongs to the ANCHORED one (the EVENT HORIZON warps
    // the frame because it is a hole in the world); a DUST DEVIL is weather and
    // stays on the field, so it is filtered out here by its own `chase`.
    const classes = new Set<string>();
    for (const ability of state.players[0].abilities) {
      const def = abilityDef(ability.defId);
      for (const block of abilityBlocks(def)) {
        const aura = AURA_FOR_BLOCK[block];
        if (!aura) continue;
        if (block === "well" && (def.well?.chase ?? 0) > 0) continue;
        classes.add(aura);
      }
    }
    const next = [...classes].sort().join(" ");
    if (next === applied) return;
    applied = next;
    layer.className = next
      ? `powerup-aura-layer ${next}`
      : "powerup-aura-layer";
  };

  const flash = (kind: string) => {
    const layer = layerRef.current;
    if (!layer) return;
    const node = document.createElement("div");
    node.className = `powerup-flash ${kind}`;
    layer.appendChild(node);
    const life = FLASH_LIFE_MS[kind] ?? 600;
    const done = setTimeout(() => {
      timers.delete(done);
      node.remove();
    }, life);
    timers.add(done);
  };

  return {
    sync,
    flash,
    dispose: () => {
      timers.forEach(clearTimeout);
      timers.clear();
      const layer = layerRef.current;
      if (layer) layer.className = "powerup-aura-layer";
      applied = "";
    },
  };
}
