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
//   powerups.ts the beats a RUNNING power throws (rocks landing, waves,
//               a shield shattering, a ward holding)
//   jingles.ts  multi-note fanfares (level-up, boss, victory, defeat)
//
// Mixing rules: volumes live in 0.03–0.09 and playerHurt is the ceiling;
// frequent sounds (shots!) stay the quietest and shortest.

import type { GameEvent } from "@game/menu";

import type { Synth } from "@ui/lib/synth.ts";

import {
  GENERATED_SOUNDS,
  GENERATED_SOUND_KEYS,
} from "../../generated/sounds.ts";

import { playCombatSound } from "./combat.ts";
import { playJingle } from "./jingles.ts";
import { playPickupSound } from "./pickups.ts";
import { playPowerupSound } from "./powerups.ts";
import { playSound } from "./play.ts";
import type { SoundCatalog } from "./types.ts";
import { playWorldSound } from "./world.ts";

// ---------------------------------------------------------------------------
// THE SOUND BANK IS CONTENT (content/sounds/*.yaml), compiled into
// GENERATED_SOUNDS. This is the live catalog: the shipped sounds, plus whatever
// a mod merged on top — the same arrangement the sprite record uses, and for
// the same reason (the renderer, and here the synth, must not be able to tell
// a mod's sound from a shipped one).
// ---------------------------------------------------------------------------
let catalog: SoundCatalog = GENERATED_SOUNDS;
let keys: Record<string, string> = GENERATED_SOUND_KEYS;

/** Replace the live bank. Called by the mod loader on either side of a modded
 * run; `restoreSounds` puts the shipped bank back. */
export function setSoundCatalog(
  sounds: SoundCatalog,
  eventKeys: Record<string, string>,
): void {
  catalog = sounds;
  keys = eventKeys;
}

/** The shipped bank, for the mod loader to merge onto and to restore. */
export const SHIPPED_SOUNDS = GENERATED_SOUNDS;
export const SHIPPED_SOUND_KEYS = GENERATED_SOUND_KEYS;

// NOTE: `ui.ts` is deliberately NOT re-exported here. Menu code imports
// `sfx/ui.ts` directly, because this module statically pulls every domain
// module in — the run's whole sound palette — and a title screen that wanted one
// button click used to download the combat, world, pickup, powerup and jingle
// banks with it (see pwa/scripts/check-seo.mjs's critical-path budget). This
// barrel is the RUN's event bus; `sfx/ui.ts` is the interface's.

/** The fields that pick which sound an event plays. Everything else on an
 * event (positions, ids, damage numbers) never reaches the synth. */
function soundKey(event: GameEvent): string {
  return [
    event.type,
    // A mod's own sound id is part of the key: two powers (or two blades)
    // throwing the same event in one step play DIFFERENT sounds, so collapsing
    // them by event type alone would silence one of them.
    "sfx" in event ? event.sfx : "",
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
    // The catalog answers first, and answers almost everything.
    //
    // `sfx` is a WEAPON's or a POWERUP's own sound id, carried on the event: a
    // mod's blade can sound like itself rather than like every other blade, and
    // a mod's power like itself rather than like whichever shipped power
    // happens to throw the same event. It is tried before the event key so
    // naming one overrides the default, and falls through when the id names
    // nothing — a mod that ships a power and forgets its sound gets the
    // ordinary one, not silence.
    if ("sfx" in event && playSound(synth, catalog, event.sfx)) continue;
    if (playSound(synth, catalog, keys[key])) continue;

    // What the catalog cannot hold: sounds whose shape rides a CONTINUOUS
    // parameter (a sandstorm's intensity, a stampede's distance). A static
    // entry would freeze them at one value, so they keep their code.
    if (playCombatSound(synth, event)) continue;
    if (playWorldSound(synth, event)) continue;
    if (playPickupSound(synth, event)) continue;
    if (playPowerupSound(synth, event)) continue;
    playJingle(synth, event);
  }
}
