// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BINDINGS — every live value a HUD element may read, and nothing else.
//
// A binding is a READ, never a computation: it turns the HUD snapshot and the
// app's own view state into one flat table of numbers, flags, words and sprite
// names. Anything that has to DECIDE — what colour "nearly out" is, whether a
// row is worth the space — is a Lua judgement in `content/hud/scripts/`, and
// that split is what keeps this file boring and keeps a mod's HUD from needing
// a code change to say something new.
//
// The names are the schema's (`scripts/asset-tools/hud-schema.mjs`), and
// `tests/content/hud_catalog_test.ts` pins the two together — a binding the
// schema accepts and this file does not answer is `undefined` printed into a
// bar, discovered on a phone.
//
// FRACTIONS ARE CLAMPED HERE, once. A bar that is handed 1.4 draws past its
// track and a bar handed NaN draws nothing at all, and both are the kind of
// thing that arrives from a max of zero on the first frame of a run.

import { weaponDef, type GameState } from "@game/core";

import { WEAPON_CLASS_COLORS } from "../tiers.ts";
import type { Hud } from "../game-screen/hud-model.ts";

/** The app's own view state — the half of the HUD's world that is not the run.
 * Small on purpose: every entry here is something an element genuinely has to
 * gate on, and each one a mod can read. */
export type HudUiState = {
  /** Key caps are shown on the slots (desktop keyboard controls on). */
  keyHints: boolean;
  /** The quick-draw switcher is unrolled — the slots it crosses stand aside. */
  weaponMenuOpen: boolean;
  /** The player asked for SWIPE BARS instead of the fixed docks. */
  swipeBars: boolean;
  /** A wide viewport (a tablet or a desktop), which the docks lay out for. */
  wide: boolean;
  /** The autopilot's engine meter is running. */
  autopilot: boolean;
  /** The SHOW SCORES key is held (or the board was raised by hand) — the
   * session scoreboard is up over the field. */
  scoreboard: boolean;
  /** This device takes touch at all (`any-pointer: coarse`). Gates the chrome
   * that only exists because a thumb has no key to press instead — the
   * SHUTTER. Not `!keyHints`: that is a setting about the keyboard steering,
   * and a touch laptop answers yes to both. */
  touch: boolean;
};

/** What a binding can answer with. */
export type HudValue = string | number | boolean;

/** Every binding, keyed exactly as an element names it (`hud.hpFrac`). */
export type HudValues = Record<string, HudValue>;

const frac = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
};

/**
 * Read every binding off the live run.
 *
 * Built once per HUD resolve (which happens when the snapshot PUBLISHES, not
 * per frame) and handed whole to every element and every script, so no two
 * readers can disagree about what the run said this instant.
 */
export function hudBindings(
  hud: Hud,
  state: GameState,
  ui: HudUiState,
): HudValues {
  const weapon = weaponDef(hud.weaponDefId);
  const gauge = hud.ammo
    ? frac(hud.ammo.count, hud.ammo.cap)
    : hud.weaponWear === null
      ? 1
      : Math.max(0, Math.min(1, hud.weaponWear));
  return {
    "hud.hp": hud.hp,
    "hud.maxHp": hud.maxHp,
    "hud.hpFrac": frac(hud.hp, hud.maxHp),
    "hud.stamina": hud.stamina,
    "hud.maxStamina": hud.maxStamina,
    "hud.staminaFrac": frac(hud.stamina, hud.maxStamina),
    "hud.xp": hud.xp,
    "hud.xpToNext": hud.xpToNext,
    "hud.xpFrac": frac(hud.xp, hud.xpToNext),
    "hud.level": hud.level,
    "hud.kills": hud.stats.kills,
    "hud.combatMs": hud.stats.combatMs,
    "hud.enemiesLeft": hud.enemiesLeft,
    "hud.menaceStage": hud.menaceStage,
    "hud.coins": hud.coins,
    "hud.bagFree": hud.bagFree,
    "hud.bagIcon": hud.bagIcon,
    "hud.bagFullHint": hud.bagFullHint,
    "hud.questAlert": hud.questLog === "alert",
    "hud.pointsWaiting": hud.pointsWaiting,
    "hud.fieldLive": hud.fieldLive,
    "hud.downed": hud.downed,
    "hud.weaponDefId": hud.weaponDefId,
    // BARE HANDS is the one weapon def that ships without an icon, because
    // there is nothing in the hand to draw — so the binding answers "" and the
    // slot renders iconless, exactly as it did before it was content.
    "hud.weaponIcon": weapon.icon ?? "",
    "hud.weaponGauge": gauge,
    // "Does this weapon have anything to run out OF" — false for an
    // unbreakable unique and for bare hands, which is what makes the ring read
    // a calm full teal instead of a stage of the low-ammo ladder.
    "hud.hasWeaponGauge": hud.ammo !== null || hud.weaponWear !== null,
    "hud.ammoCount": hud.ammo?.count ?? 0,
    "hud.ammoCap": hud.ammo?.cap ?? 0,
    "hud.hasAmmo": hud.ammo !== null,
    "hud.companionCount": hud.companions.length,
    "hud.partyCount": hud.partyFrames.length,
    "hud.tradeAskCount": hud.tradeRequests.length,
    "hud.medkitTier": hud.medkitTier,
    "hud.medkitCount": hud.medkitCount,
    "hud.staminaPotions": hud.staminaPotions,
    "hud.repairKits": hud.repairKits,
    "hud.abilityCount": hud.heldAbilities.length,
    "ui.keyHints": ui.keyHints,
    "ui.weaponMenuOpen": ui.weaponMenuOpen,
    "ui.swipeBars": ui.swipeBars,
    "ui.wide": ui.wide,
    "ui.autopilot": ui.autopilot || state.autopilot.active,
    "ui.scoreboard": ui.scoreboard,
    "ui.touch": ui.touch,
  };
}

/** The equipped weapon's class colours — the plate behind the weapon slot.
 * Not a binding: it is a PAIR of colours off a catalog, and a binding answers
 * one value. The weapon slot widget reads it directly. */
export function weaponSlotColors(hud: Hud): { bg: string; border: string } {
  return WEAPON_CLASS_COLORS[weaponDef(hud.weaponDefId).class];
}

/**
 * VOICE CHAT's session-wide half — what the player's own microphone is doing
 * and how many people are on the rail.
 *
 * A session fact rather than a run fact: the engine's state knows nothing about
 * who is talking, and `GameScreen` owns the link. Every value is answered even
 * when there is no voice at all, so an element that reads one on a solo run
 * gets "off" rather than nothing — a mod's MIC LIVE pip must not need its own
 * gate to stay off in single player.
 */
export function voiceBindings(
  voice: {
    live: boolean;
    transmitting: boolean;
    level: number;
    speakerCount: number;
    fault: string;
  } | null,
): HudValues {
  return {
    "voice.live": voice?.live === true,
    "voice.transmitting": voice?.transmitting === true,
    "voice.level": Math.max(0, Math.min(1, voice?.level ?? 0)),
    "voice.speakerCount": voice?.speakerCount ?? 0,
    "voice.faulted": (voice?.fault ?? "") !== "",
    "voice.fault": voice?.fault ?? "",
  };
}

/**
 * ONE ROW of the voice rail — the values a card's parts are resolved against.
 *
 * A row's bindings live in their own group (`speaker.*`) and are merged OVER
 * the run's for the length of one card, which is what lets an authored part say
 * "this one is shouting" without the layout knowing how many cards there are.
 * The same shape is what a unit frame, a threat list or a raid grid would use.
 */
export function speakerBindings(speaker: {
  seat: number;
  name: string;
  level: number;
  peak: number;
  muted: boolean;
  unheard: boolean;
  talking: boolean;
  self: boolean;
}): HudValues {
  return {
    "speaker.seat": speaker.seat,
    "speaker.name": speaker.name,
    "speaker.level": Math.max(0, Math.min(1, speaker.level)),
    "speaker.peak": Math.max(0, Math.min(1, speaker.peak)),
    "speaker.muted": speaker.muted,
    "speaker.unheard": speaker.unheard,
    "speaker.talking": speaker.talking,
    "speaker.self": speaker.self,
  };
}

/**
 * The table a Lua judgement is called with: the bindings, split back into their
 * groups with the prefixes dropped — `state.hud.bagFree`, `state.ui.keyHints`,
 * `state.drive.wear`.
 *
 * ONE argument rather than a positional list, because the groups grow: the road
 * added a third, and a script written against `f(hud, ui)` would have had to be
 * rewritten to see it. Every group is present whether or not this surface fills
 * it, so a script that reads a group its screen does not have gets an empty
 * table rather than an error out of the middle of a fight.
 */
export function scriptState(
  values: HudValues,
): Record<string, Record<string, HudValue>> {
  const groups: Record<string, Record<string, HudValue>> = {
    hud: {},
    ui: {},
    drive: {},
    // The flight's mission control (`rocket-screen/dials.ts`).
    rocket: {},
    voice: {},
    // The IN-GAME MENUS' own group (`../menus/bindings.ts`) — which window the
    // player is standing behind, and what is stacked over it.
    menu: {},
    // The ROW group, empty everywhere but inside a list's own parts — present
    // regardless so a script that reads it off the wrong surface gets an empty
    // table rather than an error out of the middle of a fight.
    speaker: {},
  };
  for (const [key, value] of Object.entries(values)) {
    const dot = key.indexOf(".");
    const group = dot < 0 ? "hud" : key.slice(0, dot);
    const name = dot < 0 ? key : key.slice(dot + 1);
    (groups[group] ??= {})[name] = value;
  }
  return groups;
}
