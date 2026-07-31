// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHETHER THERE IS ANY GORE RIGHT NOW, AND OF WHICH KIND — the one gate every
// part of the gore system asks, and the only module that reads the switches.
//
// THREE AUTHORITIES FOLD INTO ONE ANSWER, in this order:
//
//   1. THE DEVICE.  iOS Settings → <app> → MATURE CONTENT, the guardian's own
//      switch (app/device-policy.ts). It outranks everything below it — a
//      control the game can offer to turn back on is not a control — and it
//      FAILS OPEN: an unmanaged device (a browser, an Android build, a
//      malformed payload) plays the whole game.
//   2. THE PLAYER.  SETTINGS → VIDEO → GORE: one switch per kind, because "is
//      this too much" is not one question. Somebody who does not want to watch a
//      PERSON come apart is not asking for a rover to stop throwing sparks, and
//      before this page there was no way to say so.
//   3. THE DEVELOPER.  The DEVELOPER → VISUALS BLOOD amount, which is a
//      MULTIPLIER rather than a switch and exists to get a clean field for a
//      screenshot. Zero is different in kind from the two above: it lands the
//      blow DRY rather than falling back to the plain splash (see `splashOnly`).
//
// THE GATE IS ASKED WHERE THE EFFECT IS DECIDED, NEVER AT THE DRAW CALL. That
// is the rule the whole system rests on: `off` has to mean nothing is RECORDED
// as well as nothing drawn, or the floor's saturation grid, the hero's soak and
// his trail all quietly fill up behind a shut switch and the player is handed
// the lot the moment it comes back.

import { nsfwAllowed } from "../../app/device-policy.ts";
import { getSettings, type GoreSwitchKey } from "../settings.ts";

import type { GoreFamilyId } from "./gore.ts";

/** Which switch owns each kind of body. One row of this table per gore family,
 * which is what keeps adding a fifth family a row in `gore.ts` plus a row here
 * rather than an edit to the spray, the burst, the cleave and the floor. */
const FAMILY_SWITCH: Record<GoreFamilyId, GoreSwitchKey> = {
  blood: "goreBlood",
  ecto: "goreEcto",
  sparks: "goreSparks",
  cosmic: "goreCosmic",
};

/** The two ways a body can come apart, and the switch that permits each. They
 * cross every family on purpose: a machine cut in two is still a body cut in
 * two, and a player who turned CLEAVES off did not mean "only for people". */
const KIND_SWITCH = {
  cleave: "goreCleaves",
  gib: "goreGibs",
} as const satisfies Record<string, GoreSwitchKey>;

/** How a body comes apart, as `overkill.ts` classifies it. */
export type DismemberKind = keyof typeof KIND_SWITCH;

/**
 * How hard to price this family's mess — the multiplier everything that spills
 * is scaled by, or `null` for "there is nothing of this kind in the game right
 * now".
 *
 * Read by `bloodBlow` (the spray and what it wets), by the death presentation
 * (whether a body comes apart at all), by `hero-soak.ts` and by
 * `render/blood-tracks.ts`, each at the point its own effect is decided.
 */
export function goreAmount(family: GoreFamilyId): number | null {
  if (!nsfwAllowed()) return null;
  const settings = getSettings();
  if (settings[FAMILY_SWITCH[family]] !== "on") return null;
  return settings.blood > 0 ? settings.blood : null;
}

/**
 * Whether a blow on this kind of body should fall back to the plain two-frame
 * splash — the horde's original hit marker, which is all a censored or
 * switched-off blow gets.
 *
 * Deliberately NOT the negation of `goreAmount`: a blow refused because the
 * DEVELOPER amount is at zero lands completely dry, because that knob exists to
 * clear the field for a screenshot rather than to make the game gentler. Only
 * the device's switch and the player's own answer buy the splash back.
 */
export function splashOnly(family: GoreFamilyId): boolean {
  return !nsfwAllowed() || getSettings()[FAMILY_SWITCH[family]] !== "on";
}

/**
 * Whether a body may come apart this way at all.
 *
 * The family's own switch is checked separately (`goreAmount`), so BOTH have to
 * say yes: turning ROBOTIC GORE off stops a rover bursting even with GIBS on, and
 * turning GIBS off stops everything bursting whatever family it belongs to.
 * What a refusal falls back to is the ORDINARY death — punt and topple — never
 * the other kind of dismemberment and never a body that ceases to exist.
 */
export function dismemberAllowed(kind: DismemberKind): boolean {
  return getSettings()[KIND_SWITCH[kind]] === "on";
}

/**
 * How much of what sprays back stays ON the hero — his gear, his face, the
 * shield he was holding it all off with (game-screen/hero-soak.ts).
 *
 * HUMAN GORE's own switch as well as its own: the coat is blood art in blood's
 * colours, so there is no such thing as a hero soaked in a machine's oil to
 * turn on or off. Its row on the GORE page is shown LOCKED rather than hidden
 * when HUMAN GORE is off, so the player can see where it went.
 */
export function heroSoakAmount(): number | null {
  if (getSettings().goreSoak !== "on") return null;
  return goreAmount("blood");
}

/** How much his boots carry out of it onto clean ground
 * (render/blood-tracks.ts). Rides HUMAN GORE for the same reason the soak does. */
export function bloodTrackAmount(): number | null {
  if (getSettings().goreTracks !== "on") return null;
  return goreAmount("blood");
}
