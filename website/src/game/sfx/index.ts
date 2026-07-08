// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sound design front door. Every effect is synthesized from parameters
// (@ui/lib/synth.ts) — no audio files. The palette is 16-bit console:
// layered oscillators with detune for width, filtered noise for percussion
// and impacts, attack envelopes on soft sounds, and the shared echo bus on
// big moments. Sounds live in domain modules so each area of the game's
// audio can be read (and mixed) as a unit:
//
//   ui.ts       menu/interface sounds (app-owned, not engine events)
//   combat.ts   weapons, damage, kills, destruction
//   world.ts    movement and level furniture (jump, land, doors, dialogue)
//   pickups.ts  loot, equipment, abilities
//   jingles.ts  multi-note fanfares (level-up, boss, victory, defeat)
//
// Mixing rules: volumes live in 0.03–0.09 and playerHurt is the ceiling;
// frequent sounds (shots!) stay the quietest and shortest.

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

import { playCombatSound } from "./combat.ts";
import { playJingle } from "./jingles.ts";
import { playPickupSound } from "./pickups.ts";
import { playWorldSound } from "./world.ts";

export { playUiSound, type UiSound } from "./ui.ts";

/** The fields that pick which sound an event plays. Everything else on an
 * event (positions, ids, damage numbers) never reaches the synth. */
function soundKey(event: GameEvent): string {
  return [
    event.type,
    "weaponClass" in event ? event.weaponClass : "",
    "crit" in event ? event.crit : "",
    "kind" in event ? event.kind : "",
    "tier" in event ? (event.tier ?? "") : "",
  ].join("|");
}

/** Translate one step's engine events into sound. Each domain module gets a
 * look until one claims the event; unclaimed events are silent by design.
 *
 * Events that map to the same sound are played once per step: everything in
 * one step is simultaneous, so an AoE blow reporting five kills would start
 * five sample-aligned copies of the same waveform — not "five kills", just
 * one kill sound at 5× amplitude, driving the mix into the limiter. */
export function playEventSounds(
  synth: Synth,
  events: readonly GameEvent[],
): void {
  const played = new Set<string>();
  for (const event of events) {
    const key = soundKey(event);
    if (played.has(key)) continue;
    played.add(key);
    if (playCombatSound(synth, event)) continue;
    if (playWorldSound(synth, event)) continue;
    if (playPickupSound(synth, event)) continue;
    playJingle(synth, event);
  }
}
