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
  };
}

/** The equipped weapon's class colours — the plate behind the weapon slot.
 * Not a binding: it is a PAIR of colours off a catalog, and a binding answers
 * one value. The weapon slot widget reads it directly. */
export function weaponSlotColors(hud: Hud): { bg: string; border: string } {
  return WEAPON_CLASS_COLORS[weaponDef(hud.weaponDefId).class];
}

/**
 * THE ROAD'S DIALS. The drive minigame publishes its own handful of values and
 * nothing else — a drive has no hero, no bag and no horde — so its bindings are
 * built from the wagon rather than from a HUD snapshot.
 *
 * `failing` is the one judgement-shaped entry, and it is deliberately still a
 * read: WHERE the line sits is the Lua script's call (`drive.damage_color`), and
 * this only answers whether the wagon is past the point the engine itself treats
 * as trouble.
 *
 * IT PUBLISHES MORE THAN THE TWO PLATES READ, on purpose. The revs, the gear
 * count and the top end are what a TACHOMETER and a GEARBOX are drawn from, and
 * the shipped dashboard uses none of them — but a dial that had to wait for the
 * app to start publishing its number would be a dial nobody could author. They
 * cost one object per publish.
 */
export type DriveDials = {
  mph: number;
  /** The wagon's authored top end, so a dial can print its own last number. */
  topSpeedMph: number;
  /** Road speed over that top end. */
  speedFrac: number;
  /** The engine's own gear reading, counting from zero. */
  gear: number;
  /** How many gears there are — the gate a gearbox draws. */
  gearCount: number;
  /** How far up THIS gear the wagon is: the revs. */
  rev: number;
  reversing: boolean;
  bodies: number;
  /** 0..1 — how worn the wagon is. */
  wear: number;
  failing: boolean;
  paused: boolean;
};

export function driveBindings(drive: DriveDials): HudValues {
  return {
    "drive.mph": Math.round(drive.mph),
    "drive.topSpeedMph": Math.round(drive.topSpeedMph),
    "drive.speedFrac": Math.max(0, Math.min(1, drive.speedFrac)),
    "drive.gear": drive.gear,
    // The dial counts from one, the engine counts from zero. Done here rather
    // than in the text, so an authored line never has to do arithmetic.
    "drive.gearLabel": drive.gear + 1,
    "drive.gearCount": drive.gearCount,
    "drive.rev": Math.max(0, Math.min(1, drive.rev)),
    "drive.reversing": drive.reversing,
    "drive.bodies": drive.bodies,
    "drive.wear": Math.max(0, Math.min(1, drive.wear)),
    "drive.wearPercent": Math.round(100 * drive.wear),
    "drive.failing": drive.failing,
    "drive.paused": drive.paused,
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
  };
  for (const [key, value] of Object.entries(values)) {
    const dot = key.indexOf(".");
    const group = dot < 0 ? "hud" : key.slice(0, dot);
    const name = dot < 0 ? key : key.slice(dot + 1);
    (groups[group] ??= {})[name] = value;
  }
  return groups;
}
