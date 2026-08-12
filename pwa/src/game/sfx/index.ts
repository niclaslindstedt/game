// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sound design front door. Every effect is synthesized from parameters
// (@ui/lib/synth.ts) — no audio files, except the ones a MOD ships to replace
// them with (see ./samples.ts). The palette is 16-bit console:
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
  GENERATED_CUE_KEYS,
  GENERATED_SOUNDS,
  GENERATED_SOUND_KEYS,
} from "../../generated/sounds.ts";

import { resetCarEngine } from "./car-engine.ts";
import { playCombatSound } from "./combat.ts";
import { playJingle } from "./jingles.ts";
import { clearListener } from "./listener.ts";
import { playPickupSound } from "./pickups.ts";
import { playPowerupSound } from "./powerups.ts";
import { playSound, stopSound } from "./play.ts";
import { stopAllLoops } from "./samples.ts";
import type { PlayContext, SoundCatalog } from "./types.ts";
import { playWorldSound } from "./world.ts";

export { setListener, clearListener } from "./listener.ts";
export { playCue, resetCues, setCueCatalog, type Cue } from "./cues.ts";

// ---------------------------------------------------------------------------
// THE SOUND BANK IS CONTENT (content/sounds/*.yaml), compiled into
// GENERATED_SOUNDS. This is the live catalog: the shipped sounds, plus whatever
// a mod merged on top — the same arrangement the sprite record uses, and for
// the same reason (the renderer, and here the synth, must not be able to tell
// a mod's sound from a shipped one).
// ---------------------------------------------------------------------------
let catalog: SoundCatalog = GENERATED_SOUNDS;
let keys: Record<string, string> = GENERATED_SOUND_KEYS;

/**
 * Which sustained sounds an event type ENDS, derived from the live bank's
 * `stopOn:` fields.
 *
 * Derived rather than compiled because it is a reverse index of the catalog
 * and a mod may add, retarget or drop a loop — one place that rebuilds it from
 * whatever bank is live cannot fall out of step with that bank, and a compiled
 * table would have to be merged by the mod loader as a fourth thing that can
 * disagree with the other three.
 */
let stoppers = stopIndex(GENERATED_SOUNDS);

function stopIndex(sounds: SoundCatalog): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const def of Object.values(sounds)) {
    if (!def.loop || !def.stopOn) continue;
    const list = out.get(def.stopOn);
    if (list) list.push(def.id);
    else out.set(def.stopOn, [def.id]);
  }
  return out;
}

/** Replace the live bank. Called by the mod loader on either side of a modded
 * run; `restoreSounds` puts the shipped bank back. */
export function setSoundCatalog(
  sounds: SoundCatalog,
  eventKeys: Record<string, string>,
): void {
  // Anything sustained from the outgoing bank stops with it: a conversion's
  // weather must not outlive the conversion, and a loop whose def just left
  // the catalog has nothing that could ever stop it again.
  stopAllLoops();
  catalog = sounds;
  keys = eventKeys;
  stoppers = stopIndex(sounds);
}

/** End every sustained sound — the run is over, or the app left the field. */
export function stopRunSounds(): void {
  stopAllLoops();
  clearListener();
  // The car's engine is a BED rather than a loop — one grain per cue, with the
  // grain before it remembered so the note can glide (`sfx/car-engine.ts`).
  // Nothing is playing that needs stopping, but the memory has to go, or the
  // first grain of the next run glides away from the last one's last.
  resetCarEngine();
}

/** The shipped bank, for the mod loader to merge onto and to restore. */
export const SHIPPED_SOUNDS = GENERATED_SOUNDS;
export const SHIPPED_SOUND_KEYS = GENERATED_SOUND_KEYS;
export const SHIPPED_CUE_KEYS = GENERATED_CUE_KEYS;

// NOTE: `ui.ts` is deliberately NOT re-exported here. Menu code imports
// `sfx/ui.ts` directly, because this module statically pulls every domain
// module in — the run's whole sound palette — and a title screen that wanted one
// button click used to download the combat, world, pickup, powerup and jingle
// banks with it (see pwa/scripts/check-seo.mjs's critical-path budget). This
// barrel is the RUN's event bus; `sfx/ui.ts` is the interface's.

/**
 * Fire one of the ROAD's sounds by id (`content/sounds/drive_*.yaml`).
 *
 * BY ID RATHER THAN BY EVENT, because the drive is not a run: it emits
 * `DriveEvent`s off its own clock and never touches `state.events`, so there is
 * no `GameEvent` for the key table to match. It still reads the LIVE bank, so a
 * mod that reskins the road's sounds is heard on the road exactly as it is
 * heard in a fight.
 */
export function playDriveSound(
  synth: Synth,
  id: string,
  pos?: { x: number; y: number },
): void {
  playSound(
    synth,
    catalog,
    id,
    pos ? { pos, spatial: true } : undefined,
    GENERATED_SOUNDS,
  );
}

/**
 * The fields that pick WHICH SOUND an event plays. Everything else on an event
 * (positions, ids, damage numbers) never reaches the synth.
 *
 * THIS IS THE GENERATOR'S KEY, FIELD FOR FIELD — `matchKey` in
 * scripts/generate-sounds.mjs and `soundMatchKey` in mod/tools/build.mjs build
 * the same string from an `on:` block, and `MATCHABLE` in the sound schema is
 * the same five names. All four move together or a sound is compiled, shipped,
 * and never played. (They drifted once, and it was invisible: an extra field
 * here made every lookup miss, the imperative fallbacks below carried on
 * playing the byte-identical sound they were recorded from, and the only
 * casualty was every mod's `on:`-routed replacement — which nothing in the
 * shipped game exercises. Hence `catalog_routing_test.ts`, which asserts
 * through this function rather than restating it.)
 */
function routeKey(event: GameEvent): string {
  return routeFields(event).join("|");
}

function routeFields(event: GameEvent): string[] {
  return [
    String(event.type),
    "weaponClass" in event ? String(event.weaponClass) : "",
    "crit" in event ? String(event.crit) : "",
    "kind" in event ? String(event.kind) : "",
    "tier" in event ? String(event.tier ?? "") : "",
  ];
}

/**
 * THE SPECIFICITY LADDER: every key this event could be answered by, most
 * specific first.
 *
 * A sound may leave a discriminator OFF, and then it answers every value of it
 * — `on: { type: enemyTelegraph }` is the sound of a wind-up, whichever of the
 * twenty telegraph kinds is winding up, while `on: { type: enemyTelegraph,
 * kind: charge }` beside it still takes the charge.
 *
 * This is not a nicety. Without it, an `on:` block naming only a `type` builds
 * the key `enemyTelegraph||||` while the event builds
 * `enemyTelegraph|||charge|`, and the sound is compiled, shipped, and never
 * once played — with no error anywhere, because both halves are individually
 * correct. Authors reach for the general case first and should get it.
 *
 * The rungs drop discriminators RIGHT TO LEFT (tier, then kind, then crit, then
 * weaponClass) because that is their order of specificity: a tier is a variant
 * of a kind, a kind a variant of the event. Exact matches are unaffected —
 * they are rung one.
 */
function routeLadder(event: GameEvent): string[] {
  const fields = routeFields(event);
  const out = [fields.join("|")];
  for (let drop = fields.length - 1; drop >= 1; drop--) {
    if (fields[drop] === "") continue; // already blank — same key, no new rung
    fields[drop] = "";
    out.push(fields.join("|"));
  }
  return out;
}

/** The fields that decide two events in one step are THE SAME NOISE, and so
 * want playing once. The route key plus the event's own `sfx`, which is NOT a
 * routing field (no `on:` block may match on it) but is a distinguishing one:
 * two powers — or two blades — throwing the same event in one step play
 * different sounds, and collapsing them by route alone would silence one. */
function dedupeKey(event: GameEvent): string {
  return `${routeKey(event)}|${"sfx" in event ? event.sfx : ""}`;
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
    // ENDING a sustained sound is not a sound, so it happens before the dedupe
    // and outside it: the event that stops the weather may well be one that
    // also plays something, and it may repeat within a step.
    for (const id of stoppers.get(event.type) ?? []) stopSound(catalog, id);

    const seen = dedupeKey(event);
    if (played.has(seen)) continue;
    played.add(seen);
    // WHERE it happened, for a `spatial:` sound. Read off the event's own
    // position — every event that describes a thing in the world carries one,
    // and one that does not (a level-up, a quest turned in) is the player's
    // own moment and plays centred.
    const ctx: PlayContext | undefined =
      "pos" in event && event.pos ? { pos: event.pos } : undefined;
    // The catalog answers first, and answers almost everything.
    //
    // `sfx` is a WEAPON's or a POWERUP's own sound id, carried on the event: a
    // mod's blade can sound like itself rather than like every other blade, and
    // a mod's power like itself rather than like whichever shipped power
    // happens to throw the same event. It is tried before the event key so
    // naming one overrides the default, and falls through when the id names
    // nothing — a mod that ships a power and forgets its sound gets the
    // ordinary one, not silence.
    if (
      "sfx" in event &&
      playSound(synth, catalog, event.sfx, ctx, GENERATED_SOUNDS)
    ) {
      continue;
    }
    let routed = false;
    for (const key of routeLadder(event)) {
      if (playSound(synth, catalog, keys[key], ctx, GENERATED_SOUNDS)) {
        routed = true;
        break;
      }
    }
    if (routed) continue;

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
