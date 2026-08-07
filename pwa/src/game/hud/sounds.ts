// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HUD SOUNDS LIKE — the one funnel every interface noise the playing
// HUD makes goes through.
//
// Two ways in, and between them they are the whole of it:
//
//   playHudEvent(moment)   a moment the APP raises — a trade ask arriving, a
//                          weapon landing in the hand. Answered by
//                          `content/hud/events.yaml`.
//   playHudSound(id)       a PRESS, which names its own sound on the element
//                          that carries it (`press.sound`), because a button's
//                          click belongs to the button.
//
// Both resolve to a SOUND ID, and a sound id is content: the same
// `content/sounds/<id>.yaml` a mod may replace with its own synthesis or with a
// recorded `.wav`. So there are two independent ways to change what a HUD press
// sounds like — re-point the moment, or replace the sound — and neither needs
// the other.
//
// THE FUNNEL IS THE POINT. Before this, `playUiSound(synth, "confirm")` was
// written out at twenty call sites, and a mod could no more change the HUD's
// click than it could change its layout. Nothing in the playing HUD calls the
// interface bank directly any more.

import { synth } from "../audio.ts";
import { playSound } from "../sfx/play.ts";
import { SHIPPED_UI_SOUNDS, uiSoundCatalog } from "../sfx/ui.ts";
import { hudLayout } from "./layout.ts";
import type { HudEvent } from "./types.ts";

/**
 * Play a sound by id.
 *
 * The interface bank is the one consulted — a HUD sound is the player's, never
 * the world's, so it is never spatial and never positioned. `SHIPPED_UI_SOUNDS`
 * rides along as the fail-open fallback for the same reason it does in
 * `playUiSound`: a mod whose recorded click will not decode gets ours rather
 * than a dead HUD.
 */
export function playHudSound(id: string | undefined): void {
  if (!id) return;
  playSound(synth, uiSoundCatalog(), id, undefined, SHIPPED_UI_SOUNDS);
}

/** Play whatever the HUD's own catalog says this moment sounds like. Silent
 * when nothing answers it, which is a legitimate authored answer. */
export function playHudEvent(event: HudEvent): void {
  playHudSound(hudLayout().events[event]);
}

/**
 * What a press sounds like: the sound the element named, or — when it named
 * none — the moment its OUTCOME belongs to, falling back to the generic HUD
 * press.
 *
 * The outcome matters for exactly one shape of button, and it is a shape the
 * HUD will keep growing: one press with two answers (mute / unmute, follow /
 * unfollow, pin / unpin). Authoring two sounds on one element could not express
 * it, and hard-coding them in the widget is the thing this whole seam exists to
 * prevent.
 *
 * `none` is SILENCE said out loud, and is not what omitting the field means —
 * omitting takes the default above. It is for the press whose noise belongs to
 * what it started rather than to the button: the SHUTTER's own picture already
 * plays the camera, and a click in front of it is one sound arriving twice.
 */
export function playHudPress(
  sound: string | undefined,
  event: HudEvent = "hud.press",
): void {
  if (sound === "none") return;
  playHudSound(
    sound ?? hudLayout().events[event] ?? hudLayout().events["hud.press"],
  );
}
