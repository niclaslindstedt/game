// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A PRESS DOES — the verbs an authored button may carry, dispatched by
// name.
//
// The whole reason this is a registry rather than a handler written beside each
// button: a mod's own element gets the same verbs the shipped ones have. A HUD
// addon that puts a second, bigger bag button in the corner where its author
// likes it is `kind: button` + `press: { action: openBag }`, and it works
// because openBag is a name rather than a closure.
//
// THE ORDER INSIDE A PRESS IS FIXED, and it is the order the hand-written HUD
// used: stand the switcher down first (every slot it unrolls across is one it
// would otherwise paint over), then run the verb, then make the noise. A verb
// that refuses still makes the noise — the press happened, and a silent button
// reads as a broken one.

import { fieldLive } from "../local-seat.ts";
import type { HudContext } from "./context.ts";
import { playHudPress } from "./sounds.ts";
import type { HudEvent, HudPress } from "./types.ts";

/** Run one authored press. Unknown verbs are impossible in the shipped tree
 * (the schema refuses them) and silent from a mod compiled against a newer
 * game — never a crashed frame in the middle of a fight. */
export function runHudPress(
  press: HudPress,
  ctx: HudContext,
  opts: {
    /** The ROW this press was drawn in, for a press inside a list — a voice
     * card's seat. */
    arg?: string | number | boolean;
    /** What this press sounds like when the content named no sound of its own,
     * decided by the OUTCOME rather than by the button: muting somebody and
     * letting them back in are one press and two answers, and the player wants
     * to hear which one they gave. An authored `press.sound` still wins. */
    event?: HudEvent;
  } = {},
): void {
  if (press.close) ctx.actions.toggleWeaponMenu?.(false);
  if (press.action !== "none") {
    // The verb is looked up by NAME, which is what lets a mod's own button
    // carry one. A screen that does not supply this verb (the road has no bag)
    // is a press that does nothing but make its noise.
    //
    // THE ROW WINS OVER THE AUTHORED ARGUMENT, and it has to: a press drawn
    // once per speaker means the seat, and an author who typed one in would
    // have every card muting the same person.
    ctx.actions[press.action]?.(opts.arg ?? press.arg);
  }
  playHudPress(press.sound, opts.event);
}

/**
 * May this press land at all?
 *
 * One gate for every authored button, and it is the field-live rule the HUD's
 * own visibility already obeys: a press that arrived while the hero is behind a
 * screen (their bag, the map, a conversation) is a press meant for that screen.
 * `toggleWeaponMenu` and `none` are exempt — closing the switcher must work
 * whatever else is up, or a stuck panel is unclosable.
 */
export function hudPressAllowed(press: HudPress, ctx: HudContext): boolean {
  if (press.action === "none" || press.action === "toggleWeaponMenu")
    return true;
  // A MENU'S OWN BUTTON IS THE EXCEPTION THAT PROVES THE RULE. The gate below
  // refuses a press that arrived while the hero is behind a screen, because
  // such a press was meant for that screen — and a menu row IS that screen, so
  // the same rule would refuse every button on the pause menu.
  if (ctx.inMenu === true) return true;
  // The road has no such rule: a drive is never behind a hero's own screen.
  if (ctx.surface !== "field") return true;
  return fieldLive(ctx.state);
}
